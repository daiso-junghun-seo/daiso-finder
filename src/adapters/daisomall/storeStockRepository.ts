// src/adapters/daisomall/storeStockRepository.ts
// StoreStockRepository (B6) over the internal /api/availability proxy. Validates + maps; never talks to daisomall.
import { type NetworkOutcome, publishNetwork } from '../../diagnostics/bus';
import { NoCatalogMatchError } from '../../domain/errors';
import type { StoreStockRepository } from '../../domain/ports';
import type { AvailabilityAnswer } from '../../domain/types';
import { mapStoreObservation } from './mapStoreObservation';
import { parseRawObservation } from './rawObservation';

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

// How many identical availability reads race per lookup, first SUCCESS winning. The owner chose 3 after
// being told it triples the load this app puts on a third-party API (§B30-18). The read is contractually
// side-effect-free (CLAUDE.md §4 — this repo never mutates stock or transactions), so duplicating it can
// cost the vendor requests but cannot corrupt anything. Deliberately ONE constant in ONE place: the
// per-attempt diagnostics this slice adds may well show that 2 suffices, and then this is the only line
// that changes.
export const AVAILABILITY_ATTEMPTS = 3;

// Per-attempt deadline, so that one hung read cannot hold the race open while its siblings could still
// win, and so that "did a network timeout occur" is answerable per request instead of arriving as one
// blind cancellation.
//
// The window for this number is CRAMPED, and that is a finding rather than a preference. Real-device
// ?debug=1 runs measured SUCCESSFUL /api/availability responses at 442–1445ms (one session: 1445, 1239,
// 977, 442, 1190), so the floor is 1445ms plus headroom. The ceiling is createQueryRunner's 2000ms abort
// (src/infra/query-cache.ts), which is Bible-owned — Engineering/availability-check.md §5's dependency
// table states a flat 2s store/stock timeout and is NOT hypothesis-labeled — and therefore not this
// repo's to raise (CLAUDE.md §3; the Bible requires explicit owner approval). 1800ms is what fits:
// ~1.25x the measured maximum, and 200ms under the runner's cap so an attempt timeout is what gets
// REPORTED rather than being masked by the runner's blind abort (the observed `error · 2002ms`).
// Generous headroom is NOT achievable under that cap — see docs/notes/open-questions.md §B30-18, which
// records this as the escalation the owner has to settle.
//
// These two numbers are COUPLED. If the 2000ms runner cap ever moves, this must move with it: left at
// 1800ms under a larger cap it becomes the binding deadline and starts aborting reads that would have
// succeeded.
export const AVAILABILITY_ATTEMPT_TIMEOUT_MS = 1800;

// Cap on a failed response's body kept for the diagnostics panel. The body comes from our own proxy, which
// answers with fixed tags (`{"error":"upstream_unavailable"}`) and no secrets — but the cap does not
// assume that, because a panel line gets copied into notes and an upstream error page can contain
// anything.
export const ERROR_BODY_MAX_CHARS = 200;

// FetchLike deliberately declares no text(): several test doubles across this repo implement exactly
// { ok, status, json }, and widening the type would break every one of them. This structural probe reads a
// body when the runtime object actually has one (production hands over a real Response) and reports
// nothing when it does not — no cast, no `as unknown as`, no interface change. `'text' in res` is what
// narrows the `object` parameter, which is what makes `typeof res.text` legal without a cast.
function hasTextBody(res: object): res is { text(): Promise<string> } {
  return 'text' in res && typeof res.text === 'function';
}

// Read on FAILED responses only — and only where json() is never read, so one body is read once.
// Whitespace is flattened because the panel joins entries with '\n': a body carrying a newline would
// otherwise inject counterfeit network lines into a report that gets copied into notes.
async function readErrorBody(res: object): Promise<string | undefined> {
  if (!hasTextBody(res)) return undefined;
  try {
    const flat = (await res.text()).replace(/\s+/g, ' ').trim();
    if (flat === '') return undefined; // nothing observed — never an empty-string stand-in
    return flat.length > ERROR_BODY_MAX_CHARS ? `${flat.slice(0, ERROR_BODY_MAX_CHARS)}…` : flat;
  } catch {
    return undefined; // an unreadable body is not an observation, and must not fail the lookup
  }
}

// A vendor answer AND a definitive `noMatch` are both WINS.
//
// `noMatch` is a statement about the KEYWORD, not about the store: the proxy derives it from SearchGoods
// alone (functions/api/availability.ts hands searchGoods no strCd), so it means "the keyword matched no
// catalog product" — exactly what NoCatalogMatchError in domain/errors.ts says. Re-reading the same keyword
// against the same catalogue is not expected to answer differently, which is what justifies ENDING the race
// rather than losing it (§B30-18 ⑥). Honest limit: that rests on one upstream response shape — a 200 whose
// body is not the expected search envelope also reduces to noMatch, and a re-read would not fix it either.
// Modelling it as a fulfilment (the single-shot code threw) is what buys the short-circuit:
// Promise.any short-circuits on the first fulfilment, so one noMatch cancels its siblings and is
// re-thrown as NoCatalogMatchError below, preserving the NO_MATCH → Empty path unchanged. Had it stayed a
// rejection, Promise.any would have collected three of them and rejected with an AggregateError — which
// createQueryRunner's `err instanceof NoCatalogMatchError` check does not match, silently converting a
// correct "not carried" into a spurious 질의 실패.
type AttemptWin =
  | { kind: 'answer'; index: number; answer: AvailabilityAnswer }
  | { kind: 'noMatch'; index: number };

// Why an attempt's controller was aborted. Once fetch has rejected, a timeout and a cancelled duplicate
// are indistinguishable — both surface the same AbortError — so this is the ONLY thing that keeps them
// apart, and getting it wrong would publish a race loser as the very kind of error this log exists to
// count.
type AbortReason = 'timeout' | 'loser' | 'caller';

export function createDaisoStoreStockRepository(
  deps: {
    endpoint?: string;
    fetchImpl?: FetchLike;
    // attempts/timeoutMs are test seams, mirroring createQueryRunner's existing `timeoutMs?` pattern.
    // Production never passes them — the exported constants above are the single source of both values.
    attempts?: number;
    timeoutMs?: number;
    now?: () => number;
  } = {},
): StoreStockRepository {
  const endpoint = deps.endpoint ?? '/api/availability';
  const doFetch: FetchLike = deps.fetchImpl ?? ((url, init) => fetch(url, init));
  const total = deps.attempts ?? AVAILABILITY_ATTEMPTS;
  const timeoutMs = deps.timeoutMs ?? AVAILABILITY_ATTEMPT_TIMEOUT_MS;
  const now = deps.now ?? Date.now;

  return {
    async query(store, term, signal) {
      const body = JSON.stringify({ strCd: store.strCd, keyword: term.keyword, pdNo: term.pdNo });
      // Each attempt needs its OWN controller: cancelling the losers must not abort the caller's signal
      // (the surface shares it), while the caller aborting must still reach all of them. One controller
      // per attempt, chained off the caller's signal, gives both directions.
      const controllers: AbortController[] = [];
      const reasons: Array<AbortReason | null> = [];

      const attempt = async (index: number): Promise<AttemptWin> => {
        const ctrl = new AbortController();
        controllers[index] = ctrl;
        reasons[index] = null;
        const onCallerAbort = () => {
          reasons[index] ??= 'caller';
          ctrl.abort();
        };
        if (signal?.aborted) onCallerAbort();
        else signal?.addEventListener('abort', onCallerAbort);
        const timer = setTimeout(() => {
          reasons[index] ??= 'timeout';
          ctrl.abort();
        }, timeoutMs);

        const started = now();
        let published = false;
        // ONE entry per attempt, enforced HERE rather than at each call site. The per-attempt timer and the
        // caller-abort listener stay armed across the body read, so an attempt that has already published an
        // observed response can still be aborted mid-body (`json()` on a real Response rejects when its
        // stream is errored) and reach the catch below. Whichever outcome was observed FIRST is the one that
        // states a fact; a second entry would make one `#i/total` appear twice and break the partition the
        // panel and bus.ts's NETWORK_LIMIT arithmetic both read.
        const publish = (
          status: number | 'error',
          outcome: NetworkOutcome,
          errorBody?: string,
        ): void => {
          if (published) return;
          published = true;
          publishNetwork({
            path: endpoint,
            status,
            ms: now() - started,
            attempt: { index: index + 1, total },
            outcome,
            errorBody,
          });
        };

        try {
          const res = await doFetch(endpoint, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body,
            signal: ctrl.signal,
          });
          if (!res.ok) {
            publish(res.status, 'httpError', await readErrorBody(res));
            throw new Error(`availability ${res.status}`); // → FAILURE path
          }
          // Published here, BEFORE the body is parsed: a response arriving is the network fact, and it is
          // true regardless of what the body later turns out to contain. A mapping failure below is not a
          // transport failure and must not be re-published as one.
          publish(res.status, 'ok');
          const json = (await res.json()) as { noMatch?: boolean; data?: unknown };
          if (json?.noMatch) return { kind: 'noMatch', index };
          return {
            kind: 'answer',
            index,
            answer: mapStoreObservation(parseRawObservation(json?.data)),
          };
        } catch (err) {
          const reason = reasons[index];
          if (reason === 'timeout') publish('error', 'timeout');
          // A cancelled duplicate — a race loser, or the caller cancelling the surface. Published so the
          // race stays VISIBLE, and NEVER as an error. Its `ms` is the time to CANCELLATION, not this
          // attempt's own vendor latency: all attempts capture `started` in the same synchronous tick and
          // the losers are aborted only after the winner has settled, so the number is the winner's latency
          // plus parse plus a few microtask hops — which is why real panel lines show the losers a couple of
          // ms BEHIND the winner. It says nothing about how fast this attempt would have been.
          else if (reason) publish('error', 'aborted');
          // Nothing has been published yet, so the transport itself failed. When something HAS been
          // published — a non-ok status, or an ok response whose body then failed to arrive, parse or map —
          // that entry already states the observed fact, and blaming the transport on top of it would
          // misclassify the attempt. publish's own guard is what makes the second entry impossible; this
          // condition keeps the classification explicit at the branch that would get it wrong.
          else if (!published) publish('error', 'networkError');
          throw err;
        } finally {
          clearTimeout(timer);
          signal?.removeEventListener('abort', onCallerAbort);
        }
      };

      let win: AttemptWin;
      try {
        win = await Promise.any(Array.from({ length: total }, (_unused, index) => attempt(index)));
      } catch (err) {
        // Promise.any rejects only once EVERY attempt has failed — the FAILURE path, unchanged. It wraps
        // the reasons in an AggregateError, which neither createQueryRunner's NoCatalogMatchError check
        // nor the UnmappableAnswerError contract recognises, so the first ORIGINAL reason is re-thrown
        // instead of the wrapper. All attempts are identical, so any of them is representative.
        if (err instanceof AggregateError) {
          const reasons2: unknown[] = err.errors;
          const [first] = reasons2;
          throw first ?? err;
        }
        throw err;
      }

      // The race is decided — cancel every duplicate still in flight. The winner is skipped: its response
      // already arrived, so aborting it would publish a cancellation that never happened.
      for (const [index, ctrl] of controllers.entries()) {
        if (index === win.index || ctrl.signal.aborted) continue;
        reasons[index] ??= 'loser';
        ctrl.abort();
      }

      if (win.kind === 'noMatch') throw new NoCatalogMatchError([]); // → NO_MATCH → Empty
      return win.answer;
    },
  };
}
