// src/adapters/daisomall/storeStockRepository.ts
// StoreStockRepository (B6) over the internal /api/availability proxy. Validates + maps; never talks to daisomall.
import { type NetworkOutcome, publishNetwork } from '../../diagnostics/bus';
import { type UpstreamTiming, readServerTiming } from '../../diagnostics/serverTiming';
import { NoCatalogMatchError } from '../../domain/errors';
import type { StoreStockRepository } from '../../domain/ports';
import type { AvailabilityAnswer } from '../../domain/types';
import { mapStoreObservation } from './mapStoreObservation';
import { parseRawObservation } from './rawObservation';

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

// A lookup is a SEQUENCE of attempts, not a race (owner decision 2026-11-27, §B56).
//
// The parallel race these constants used to describe stays retired at 1 (§B34): identical requests fired
// in the same tick share one fate, so racing them tripled vendor load for no measured gain. What the
// 2026-11-27 production measurement added is different in kind — a COLD read is slow for a reason the
// next read does not share. The proxy caches the vendor handshake for 5 minutes
// (functions/_lib/daisoAuth.ts AUTH_TTL_MS); after that idle window the first /api/availability measured
// 2.06s end to end against the 2.0s client cap, while the immediate re-read measured 0.33s. The shopper
// saw a failure that one more tap fixed. The proxy does not abort upstream work when the client
// disconnects, so a timed-out first attempt still WARMS the server's auth cache and the retry is fast.
//
// So: attempt, and only on a failure a fresh attempt could plausibly fix (timeout, transport error,
// 5xx, 429), attempt again. A `noMatch` and any 4xx are definitive and end the lookup immediately — so
// do mapping failures, which describe the payload rather than the transport. Deadlines shrink because
// the retry is expected to be fast; the worst case is their sum (~5s), and the slow hint
// (LOADING_DELAY_LINE, already on screen from 1.2s) explains the wait the whole time.
export const AVAILABILITY_ATTEMPT_TIMEOUTS_MS = [2000, 1500, 1500] as const;
export const AVAILABILITY_ATTEMPTS = AVAILABILITY_ATTEMPT_TIMEOUTS_MS.length;

// A failed attempt, classified by whether re-reading could answer differently. Everything else the
// attempt can throw (SyntaxError from a body that will not parse, UnmappableAnswerError from a payload
// that maps to no honest answer) describes what the vendor SENT, so a second read would repeat it.
class AvailabilityAttemptError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'AvailabilityAttemptError';
  }
}

// 5xx and 429 are the proxy's own transient failures (upstream unavailable, rate limited). 4xx is a
// statement about the request — retrying it would send the same wrong request again.
function isRetryableStatus(status: number): boolean {
  return status >= 500 || status === 429;
}

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

// A vendor answer AND a definitive `noMatch` are both WINS — and both END the lookup: a win returns,
// a `noMatch` throws NoCatalogMatchError, and in neither case does a further attempt run.
//
// `noMatch` is a statement about the KEYWORD, not about the store: the proxy derives it from SearchGoods
// alone (functions/api/availability.ts hands searchGoods no strCd), so it means "the keyword matched no
// catalog product" — exactly what NoCatalogMatchError in domain/errors.ts says. Re-reading the same keyword
// against the same catalogue is not expected to answer differently, which is what justifies ending the
// lookup on it (§B30-18 ⑥). Honest limit: that rests on one upstream response shape — a 200 whose body is
// not the expected search envelope also reduces to noMatch, and a re-read would not fix it either.
//
// It is modelled as a RETURN rather than an error so the retry loop can tell it apart from a failure: a
// failure would be retried, a definitive answer must not be. NoCatalogMatchError is thrown only after the
// loop decides to stop, preserving the NO_MATCH → Empty path unchanged.
type AttemptWin = { kind: 'answer'; answer: AvailabilityAnswer } | { kind: 'noMatch' };

// Why an attempt's controller was aborted. Once fetch has rejected, a timeout and a caller cancellation
// are indistinguishable — both surface the same AbortError — so this is the ONLY thing that keeps them
// apart, and getting it wrong would publish a shopper's navigation as a network timeout.
type AbortReason = 'timeout' | 'caller';

export function createDaisoStoreStockRepository(
  deps: {
    endpoint?: string;
    fetchImpl?: FetchLike;
    // attempts/timeoutMs are test seams, mirroring createQueryRunner's existing `timeoutMs?` pattern.
    // Production never passes them — the exported constants above are the single source of both values.
    attempts?: number;
    // A single value applies to every attempt; a list gives each attempt its own deadline (the shipped
    // shape, so the retry can be given less rope than the first read).
    timeoutMs?: number | readonly number[];
    now?: () => number;
  } = {},
): StoreStockRepository {
  const endpoint = deps.endpoint ?? '/api/availability';
  const doFetch: FetchLike = deps.fetchImpl ?? ((url, init) => fetch(url, init));
  const total = deps.attempts ?? AVAILABILITY_ATTEMPTS;
  const timeouts = deps.timeoutMs ?? AVAILABILITY_ATTEMPT_TIMEOUTS_MS;
  const now = deps.now ?? Date.now;

  const deadlineFor = (index: number): number => {
    if (typeof timeouts === 'number') return timeouts;
    // A list shorter than the attempt count repeats its last value rather than inventing one; the
    // production lists are always the same length as the count (both derive from the same constant).
    return timeouts[index] ?? timeouts[timeouts.length - 1] ?? AVAILABILITY_ATTEMPT_TIMEOUTS_MS[0];
  };

  return {
    async query(store, term, signal) {
      const body = JSON.stringify({ strCd: store.strCd, keyword: term.keyword, pdNo: term.pdNo });

      const attempt = async (index: number): Promise<AttemptWin> => {
        const ctrl = new AbortController();
        // One controller per attempt, chained off the caller's signal: the caller aborting must reach
        // whichever attempt is running, and each attempt's own deadline must not touch the shared signal.
        const reason: { value: AbortReason | null } = { value: null };
        const onCallerAbort = () => {
          reason.value ??= 'caller';
          ctrl.abort();
        };
        if (signal?.aborted) onCallerAbort();
        else signal?.addEventListener('abort', onCallerAbort);
        const timer = setTimeout(() => {
          reason.value ??= 'timeout';
          ctrl.abort();
        }, deadlineFor(index));

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
          upstream?: UpstreamTiming,
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
            upstream,
          });
        };

        try {
          const res = await doFetch(endpoint, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body,
            signal: ctrl.signal,
          });
          // Read ONCE, before either publish: both paths report the same response, and reading the
          // header twice would be two probes of the same fact.
          const upstream = readServerTiming(res) ?? undefined;
          if (!res.ok) {
            publish(res.status, 'httpError', await readErrorBody(res), upstream);
            throw new AvailabilityAttemptError(
              `availability ${res.status}`,
              isRetryableStatus(res.status),
            );
          }
          // Published here, BEFORE the body is parsed: a response arriving is the network fact, and it is
          // true regardless of what the body later turns out to contain. A mapping failure below is not a
          // transport failure and must not be re-published as one.
          publish(res.status, 'ok', undefined, upstream);
          const json = (await res.json()) as { noMatch?: boolean; data?: unknown };
          if (json?.noMatch) return { kind: 'noMatch' };
          return {
            kind: 'answer',
            answer: mapStoreObservation(parseRawObservation(json?.data)),
          };
        } catch (err) {
          if (reason.value === 'timeout') {
            // A timeout produced no HTTP response, so it must not claim a status code — the publish
            // guard also leaves an already-observed 200 standing rather than overwriting it.
            publish('error', 'timeout');
            throw new AvailabilityAttemptError('availability timeout', true);
          }
          if (reason.value === 'caller') {
            // The shopper navigated away (or a newer run superseded this one). Published so the
            // cancellation stays VISIBLE, and never as an error: it says nothing about the vendor.
            publish('error', 'aborted');
            throw new AvailabilityAttemptError('availability cancelled', false);
          }
          // Nothing has been published yet, so the transport itself failed (offline, DNS, TLS). When
          // something HAS been published — a non-ok status, or an ok response whose body then failed to
          // arrive, parse or map — that entry already states the observed fact, and blaming the transport
          // on top of it would misclassify the attempt.
          if (!published) {
            publish('error', 'networkError');
            // The original message is kept: it is the only description of the transport failure anyone has.
            throw new AvailabilityAttemptError(
              err instanceof Error ? err.message : 'availability network error',
              true,
            );
          }
          // A 200 whose body would not parse or map: the request succeeded and a re-read would send the
          // same request to the same payload. Not retryable, and the original error is what the caller
          // routes on (SyntaxError, UnmappableAnswerError).
          throw err;
        } finally {
          clearTimeout(timer);
          signal?.removeEventListener('abort', onCallerAbort);
        }
      };

      let lastFailure: unknown;
      for (let index = 0; index < total; index += 1) {
        try {
          const win = await attempt(index);
          if (win.kind === 'noMatch') throw new NoCatalogMatchError([]); // → NO_MATCH → Empty
          return win.answer;
        } catch (err) {
          if (err instanceof NoCatalogMatchError) throw err;
          lastFailure = err;
          // Only a failure a fresh read could plausibly fix earns another attempt. A 4xx, a mapping
          // failure, or the caller's own cancellation ends the lookup on its first occurrence.
          const retryable = err instanceof AvailabilityAttemptError && err.retryable;
          if (!retryable || index === total - 1) throw err;
        }
      }
      // `total` is 3 in production; a seam could set 0, in which case there is no observation at all.
      throw lastFailure ?? new Error('availability: no attempt ran');
    },
  };
}
