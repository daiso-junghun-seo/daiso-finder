const flag = vi.hoisted(() => ({ enabled: true }));
vi.mock('../../diagnostics/enabled', () => ({ isDiagnosticsEnabled: () => flag.enabled }));

import { getSnapshot, resetDiagnostics } from '../../diagnostics/bus';
import { NoCatalogMatchError, UnmappableAnswerError } from '../../domain/errors';
import { mockAnswers } from '../mock/fixtures';
import { observationFixtures } from './observationFixtures';
import {
  AVAILABILITY_ATTEMPTS,
  AVAILABILITY_ATTEMPT_TIMEOUT_MS,
  ERROR_BODY_MAX_CHARS,
  type FetchLike,
  createDaisoStoreStockRepository,
} from './storeStockRepository';
// This module's own source text, via Vite's ?raw — the same guard pattern zxingFrameDecoder.test.ts uses.
// The error body is read through a structural probe rather than a widened type, and that discipline is
// invisible to a behavioural test: an escape hatch would compile and every test above would still pass.
import repositorySource from './storeStockRepository.ts?raw';

const store = { strCd: '10803', strNm: '명동역점' };
const ok = (body: unknown): ReturnType<FetchLike> =>
  Promise.resolve({ ok: true, status: 200, json: async () => body });

// Like ok(), but with the headers a real Response carries. ok() deliberately has none, which is what
// most doubles in this file look like — and that shape is itself covered by the third test below.
const okTimed = (body: unknown, timing: string): ReturnType<FetchLike> =>
  Promise.resolve({
    ok: true,
    status: 200,
    headers: { get: (name: string) => (name === 'server-timing' ? timing : null) },
    json: async () => body,
  });

beforeEach(() => {
  flag.enabled = true;
  resetDiagnostics();
});

// ---------------------------------------------------------------------------------------------------
// Race harness
// ---------------------------------------------------------------------------------------------------

type Settled = { ok: boolean; status: number; json(): Promise<unknown> };

interface ParkedAttempt {
  body: string;
  signal?: AbortSignal;
  resolve(value: Settled): void;
  reject(reason: unknown): void;
}

function abortError(): Error {
  const err = new Error('The operation was aborted.');
  err.name = 'AbortError';
  return err;
}

// A per-attempt controllable fetch: every call parks until the test settles it, so the test drives the
// race's ordering directly instead of hoping a real clock cooperates. Aborting a parked call rejects it
// exactly as a real fetch does, which is what makes the loser/timeout/caller paths reachable at all.
function racingFetch(): { attempts: ParkedAttempt[]; fetchImpl: FetchLike } {
  const attempts: ParkedAttempt[] = [];
  const fetchImpl: FetchLike = (_url, init) =>
    new Promise<Settled>((resolve, reject) => {
      let done = false;
      const settleWith =
        <T>(sink: (value: T) => void) =>
        (value: T) => {
          if (done) return;
          done = true;
          sink(value);
        };
      const settleResolve = settleWith(resolve);
      const settleReject = settleWith(reject);
      attempts.push({
        body: init.body,
        signal: init.signal,
        resolve: settleResolve,
        reject: settleReject,
      });
      // A real fetch rejects immediately when handed an ALREADY-aborted signal; an `abort` listener alone
      // would never fire for it and the call would park forever, which is not a failure mode fetch has.
      if (init.signal?.aborted) settleReject(abortError());
      else init.signal?.addEventListener('abort', () => settleReject(abortError()));
    });
  return { attempts, fetchImpl };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const okSettled = (body: unknown): Settled => ({ ok: true, status: 200, json: async () => body });
const inStockSettled = () => okSettled({ data: observationFixtures.inStock });

// A response whose HEADERS have arrived but whose BODY never settles on its own — what a real Response is
// while its body stream is still streaming. Aborting a real Response errors that stream per spec, so
// json() rejects; this double reproduces exactly that, which is the only way to reach the window between
// the `ok` publish and the parse. Every other double in this file detaches json() from the signal
// (`json: async () => body`), so that window is invisible to them.
const stallingBody = (signal: AbortSignal | undefined): Settled => ({
  ok: true,
  status: 200,
  json: () =>
    new Promise<unknown>((_resolve, reject) => {
      if (signal?.aborted) reject(abortError());
      else signal?.addEventListener('abort', () => reject(abortError()));
    }),
});

// The `now` seam, scripted. The repository calls now() exactly TWICE per attempt — once for `started`
// (synchronously, in index order, before the first await) and once inside publish — so a fixed reading
// list pins each attempt's elapsed window to a number chosen here. A call past the end yields NaN rather
// than repeating the last reading: a changed call pattern has to surface as a failure, not as a
// plausible-looking duration.
function scriptedClock(readings: number[]): () => number {
  let i = 0;
  return () => readings[i++] ?? Number.NaN;
}

// ---------------------------------------------------------------------------------------------------
// Existing single-answer contract (must survive the race unchanged)
// ---------------------------------------------------------------------------------------------------

test('a { data } observation is validated and mapped to the domain answer', async () => {
  const fetchImpl: FetchLike = async (_url, init) => {
    expect(JSON.parse(init.body)).toEqual({ strCd: '10803', keyword: '밀폐용기' });
    return ok({ data: observationFixtures.inStock });
  };
  const repo = createDaisoStoreStockRepository({ fetchImpl });
  expect(await repo.query(store, { keyword: '밀폐용기' })).toEqual(mockAnswers.inStock);
});

test('a pdNo term is forwarded on the POST body (candidate-tap re-query)', async () => {
  const fetchImpl: FetchLike = async (_url, init) => {
    expect(JSON.parse(init.body)).toEqual({
      strCd: '10803',
      keyword: '리빙 밀폐용기 1.2L',
      pdNo: '19987',
    });
    return ok({ data: observationFixtures.inStock });
  };
  const repo = createDaisoStoreStockRepository({ fetchImpl });
  expect(await repo.query(store, { keyword: '리빙 밀폐용기 1.2L', pdNo: '19987' })).toEqual(
    mockAnswers.inStock,
  );
});

test('{ noMatch: true } → NoCatalogMatchError (→ NO_MATCH → Empty)', async () => {
  const repo = createDaisoStoreStockRepository({ fetchImpl: async () => ok({ noMatch: true }) });
  await expect(repo.query(store, { keyword: '없는상품' })).rejects.toBeInstanceOf(
    NoCatalogMatchError,
  );
});

test('a non-ok response throws (→ FAILURE path)', async () => {
  const repo = createDaisoStoreStockRepository({
    fetchImpl: async () => ({ ok: false, status: 502, json: async () => ({}) }),
  });
  await expect(repo.query(store, { keyword: '밀폐용기' })).rejects.toThrow();
});

test('a malformed observation → UnmappableAnswerError (safe fallback, no fabrication)', async () => {
  const repo = createDaisoStoreStockRepository({
    fetchImpl: async () => ok({ data: { strCd: 1 } }),
  });
  await expect(repo.query(store, { keyword: '밀폐용기' })).rejects.toBeInstanceOf(
    UnmappableAnswerError,
  );
});

// ---------------------------------------------------------------------------------------------------
// The race itself (§B30-18)
// ---------------------------------------------------------------------------------------------------

test('a lookup issues AVAILABILITY_ATTEMPTS identical requests in parallel', async () => {
  const { attempts, fetchImpl } = racingFetch();
  const repo = createDaisoStoreStockRepository({ fetchImpl });
  const pending = repo.query(store, { keyword: '밀폐용기' });
  await tick();

  expect(attempts).toHaveLength(AVAILABILITY_ATTEMPTS);
  // Identical: the whole point is that any one of them is an acceptable answer.
  const bodies = new Set(attempts.map((a) => a.body));
  expect(bodies.size).toBe(1);
  expect(JSON.parse(attempts[0]?.body ?? '{}')).toEqual({ strCd: '10803', keyword: '밀폐용기' });

  attempts[0]?.resolve(inStockSettled());
  await expect(pending).resolves.toEqual(mockAnswers.inStock);
});

// The owner's call, made after being told it triples this app's load on a third-party API (§B30-18).
// Pinned so the number cannot drift silently — and it lives in ONE place so tuning it is one line.
test('the parallel attempt count is 3 (owner decision, §B30-18)', () => {
  expect(AVAILABILITY_ATTEMPTS).toBe(3);
});

test('the first SUCCESS wins; every loser is aborted and the winner is not', async () => {
  const { attempts, fetchImpl } = racingFetch();
  const repo = createDaisoStoreStockRepository({ fetchImpl });
  const pending = repo.query(store, { keyword: '밀폐용기' });
  await tick();

  attempts[1]?.resolve(inStockSettled()); // the middle attempt wins
  await expect(pending).resolves.toEqual(mockAnswers.inStock);

  expect(attempts[0]?.signal?.aborted).toBe(true);
  expect(attempts[2]?.signal?.aborted).toBe(true);
  // The winner's response already arrived; aborting it would publish a cancellation that never happened.
  expect(attempts[1]?.signal?.aborted).toBe(false);
});

// First SUCCESS, not first settle. A loser that fails must leave the race running.
test('a losing attempt failing does not end the race — a later success still wins', async () => {
  const { attempts, fetchImpl } = racingFetch();
  const repo = createDaisoStoreStockRepository({ fetchImpl });
  const pending = repo.query(store, { keyword: '밀폐용기' });
  await tick();

  attempts[0]?.resolve({ ok: false, status: 502, json: async () => ({}) });
  attempts[1]?.reject(new Error('offline'));
  await tick();

  attempts[2]?.resolve(inStockSettled());
  await expect(pending).resolves.toEqual(mockAnswers.inStock);
});

test('only when ALL attempts fail does the lookup fail (→ FAILURE path)', async () => {
  const { attempts, fetchImpl } = racingFetch();
  const repo = createDaisoStoreStockRepository({ fetchImpl });
  const pending = repo.query(store, { keyword: '밀폐용기' });
  await tick();

  for (const attempt of attempts)
    attempt.resolve({ ok: false, status: 502, json: async () => ({}) });
  // The original reason survives — never an AggregateError, which createQueryRunner cannot route on.
  await expect(pending).rejects.toThrow('availability 502');
});

// A definitive answer, not a transport failure: re-reading cannot make "not carried" untrue. Treating it
// as a loser would let Promise.any collect three of them and reject with an AggregateError, which
// createQueryRunner's `err instanceof NoCatalogMatchError` check does not match — turning a correct
// Empty into a spurious 질의 실패.
test('a noMatch from ONE attempt wins the race, cancels the rest, and still yields NO_MATCH', async () => {
  const { attempts, fetchImpl } = racingFetch();
  const repo = createDaisoStoreStockRepository({ fetchImpl });
  const pending = repo.query(store, { keyword: '없는상품' });
  await tick();

  attempts[2]?.resolve(okSettled({ noMatch: true }));
  await expect(pending).rejects.toBeInstanceOf(NoCatalogMatchError);

  expect(attempts[0]?.signal?.aborted).toBe(true);
  expect(attempts[1]?.signal?.aborted).toBe(true);
});

// timeoutMs is pushed far out on purpose. With the production 1800ms deadline this test passed even with
// the caller's signal UNCHAINED — the per-attempt timers aborted the attempts a second later and the
// assertions could not tell which mechanism had fired. Only the caller can abort within one tick here.
test('the caller aborting aborts every attempt promptly, as a cancellation not a timeout', async () => {
  const { attempts, fetchImpl } = racingFetch();
  const repo = createDaisoStoreStockRepository({ fetchImpl, timeoutMs: 60_000 });
  const ctrl = new AbortController();
  const pending = repo.query(store, { keyword: '밀폐용기' }, ctrl.signal);
  // Same reason as createQueryRunner's side .catch (query-cache.ts): `pending` rejects during the tick
  // below, before the assertion at the end of this test attaches its handler, and a macrotask boundary in
  // between is exactly when the host reports an unhandledRejection. The side catch marks it handled; the
  // assertion still sees the original rejection.
  pending.catch(() => {});
  await tick();
  expect(attempts).toHaveLength(AVAILABILITY_ATTEMPTS);
  for (const attempt of attempts) expect(attempt.signal?.aborted).toBe(false);

  ctrl.abort();
  await tick();
  for (const attempt of attempts) expect(attempt.signal?.aborted).toBe(true);
  await expect(pending).rejects.toThrow();

  const entries = getSnapshot().network;
  expect(entries).toHaveLength(AVAILABILITY_ATTEMPTS);
  expect(entries.every((e) => e.outcome === 'aborted')).toBe(true);
  expect(entries.some((e) => e.outcome === 'timeout')).toBe(false);
});

// A signal that is ALREADY aborted must not produce three live requests that only get cancelled later.
test('a caller signal aborted before the call aborts every attempt immediately', async () => {
  const { attempts, fetchImpl } = racingFetch();
  const repo = createDaisoStoreStockRepository({ fetchImpl, timeoutMs: 60_000 });
  const ctrl = new AbortController();
  ctrl.abort();
  await expect(repo.query(store, { keyword: '밀폐용기' }, ctrl.signal)).rejects.toThrow();
  for (const attempt of attempts) expect(attempt.signal?.aborted).toBe(true);
});

// ---------------------------------------------------------------------------------------------------
// Per-attempt diagnostics (§B30-18)
// ---------------------------------------------------------------------------------------------------

test('each attempt is published with its 1-based index and the total', async () => {
  const { attempts, fetchImpl } = racingFetch();
  const repo = createDaisoStoreStockRepository({ fetchImpl });
  const pending = repo.query(store, { keyword: '밀폐용기' });
  await tick();
  attempts[0]?.resolve(inStockSettled());
  await pending;
  await tick();

  const entries = getSnapshot().network;
  expect(entries).toHaveLength(AVAILABILITY_ATTEMPTS);
  expect(entries.map((e) => e.attempt)).toEqual(
    expect.arrayContaining([
      { index: 1, total: 3 },
      { index: 2, total: 3 },
      { index: 3, total: 3 },
    ]),
  );
  for (const entry of entries) expect(entry.path).toBe('/api/availability');
});

test('an attempt past its deadline is published as a timeout, distinct from a non-ok status', async () => {
  const { fetchImpl } = racingFetch(); // never settles on its own — only the deadline can end it
  const repo = createDaisoStoreStockRepository({ fetchImpl, timeoutMs: 5 });
  await expect(repo.query(store, { keyword: '밀폐용기' })).rejects.toThrow();
  await tick();

  const entries = getSnapshot().network;
  expect(entries).toHaveLength(AVAILABILITY_ATTEMPTS);
  expect(entries.every((e) => e.outcome === 'timeout')).toBe(true);
  // A timeout produced no HTTP response, so it must not claim a status code.
  expect(entries.every((e) => e.status === 'error')).toBe(true);
});

test('a non-ok response is published as an httpError carrying its real status', async () => {
  const repo = createDaisoStoreStockRepository({
    fetchImpl: async () => ({ ok: false, status: 502, json: async () => ({}) }),
  });
  await expect(repo.query(store, { keyword: '밀폐용기' })).rejects.toThrow();
  await tick();

  const entries = getSnapshot().network;
  expect(entries).toHaveLength(AVAILABILITY_ATTEMPTS);
  expect(entries.every((e) => e.outcome === 'httpError')).toBe(true);
  expect(entries.every((e) => e.status === 502)).toBe(true);
  expect(entries.every((e) => e.outcome !== 'timeout')).toBe(true);
});

// The single most important guarantee of this slice: a cancelled duplicate is not an error, and the
// logging exists precisely to count errors.
test('a cancelled race loser is never published as an error', async () => {
  const { attempts, fetchImpl } = racingFetch();
  const repo = createDaisoStoreStockRepository({ fetchImpl });
  const pending = repo.query(store, { keyword: '밀폐용기' });
  await tick();
  attempts[0]?.resolve(inStockSettled());
  await pending;
  await tick();

  const entries = getSnapshot().network;
  expect(entries.filter((e) => e.outcome === 'aborted')).toHaveLength(AVAILABILITY_ATTEMPTS - 1);
  expect(entries.filter((e) => e.outcome === 'ok')).toHaveLength(1);
  const errorKinds = entries.filter(
    (e) => e.outcome === 'httpError' || e.outcome === 'timeout' || e.outcome === 'networkError',
  );
  expect(errorKinds).toEqual([]);
});

test('a transport-level rejection is published as a networkError, not as a cancellation', async () => {
  const { attempts, fetchImpl } = racingFetch();
  const repo = createDaisoStoreStockRepository({ fetchImpl });
  const pending = repo.query(store, { keyword: '밀폐용기' });
  await tick();
  for (const attempt of attempts) attempt.reject(new Error('offline'));
  await expect(pending).rejects.toThrow('offline');
  await tick();

  const entries = getSnapshot().network;
  // The length assertion is what stops the two `every` calls below from passing VACUOUSLY: an empty array
  // satisfies both, so without it the whole `networkError` publish could be deleted and this test — the
  // only one that names the classification — would still be green while real transport failures vanished
  // from the panel entirely. Every sibling outcome test in this file pins its count for the same reason.
  expect(entries).toHaveLength(AVAILABILITY_ATTEMPTS);
  expect(entries.every((e) => e.outcome === 'networkError')).toBe(true);
  expect(entries.every((e) => e.outcome !== 'aborted')).toBe(true);
});

// The reason the ok entry is published BEFORE the body is parsed: a 200 whose body will not even parse is
// still a 200 on the wire. Published after the parse, this attempt would report `error · 질의 실패` and the
// panel would blame the transport for a body problem.
test('a 200 whose body will not parse is still published as a successful transport', async () => {
  const broken = {
    ok: true,
    status: 200,
    json: async () => {
      throw new SyntaxError('Unexpected end of JSON input');
    },
  };
  const repo = createDaisoStoreStockRepository({ fetchImpl: async () => broken });
  await expect(repo.query(store, { keyword: '밀폐용기' })).rejects.toBeInstanceOf(SyntaxError);
  await tick();

  const entries = getSnapshot().network;
  expect(entries).toHaveLength(AVAILABILITY_ATTEMPTS);
  expect(entries.every((e) => e.outcome === 'ok' && e.status === 200)).toBe(true);
  expect(entries.some((e) => e.outcome === 'networkError')).toBe(false);
});

// A mapping failure is not a network fact: the request itself succeeded with a 200 and already published
// one entry. A second, error-shaped entry for it would misreport the transport.
test('a malformed body publishes the successful transport only, never a second error entry', async () => {
  const repo = createDaisoStoreStockRepository({
    fetchImpl: async () => ok({ data: { strCd: 1 } }),
  });
  await expect(repo.query(store, { keyword: '밀폐용기' })).rejects.toBeInstanceOf(
    UnmappableAnswerError,
  );
  await tick();

  const entries = getSnapshot().network;
  expect(entries).toHaveLength(AVAILABILITY_ATTEMPTS);
  expect(entries.every((e) => e.outcome === 'ok' && e.status === 200)).toBe(true);
});

// ---------------------------------------------------------------------------------------------------
// One entry per attempt, whatever happens after the response arrives
// ---------------------------------------------------------------------------------------------------

// The whole panel reading rests on `#i/total` being a partition: bus.ts's NETWORK_LIMIT = 12 is sized as
// "four consecutive 3-attempt lookups", and a lookup that emitted four lines would make one `#i/3` appear
// twice. An attempt that already reported an OBSERVED response must not go on to report a second outcome.
test('a loser aborted mid-body keeps its observed 200 — one entry, not a 200 plus a 취소', async () => {
  const { attempts, fetchImpl } = racingFetch();
  const repo = createDaisoStoreStockRepository({ fetchImpl });
  const pending = repo.query(store, { keyword: '밀폐용기' });
  await tick();

  // Both losers get their headers first, so each publishes its `ok` entry and then parks on the body…
  attempts[1]?.resolve(stallingBody(attempts[1]?.signal));
  attempts[2]?.resolve(stallingBody(attempts[2]?.signal));
  // …and the winner then settles fully, which aborts the two parked bodies mid-read.
  attempts[0]?.resolve(inStockSettled());
  await expect(pending).resolves.toEqual(mockAnswers.inStock);
  await tick();

  const entries = getSnapshot().network;
  expect(entries).toHaveLength(AVAILABILITY_ATTEMPTS);
  expect(new Set(entries.map((e) => e.attempt?.index)).size).toBe(AVAILABILITY_ATTEMPTS);
  // The surviving entry is the one that states a fact: a 200 really did arrive on all three.
  expect(entries.every((e) => e.outcome === 'ok' && e.status === 200)).toBe(true);
});

// §B30-19③ reads the `시간 초과` count LITERALLY ("`시간 초과` 0건") to judge how urgently the 2000ms runner
// cap needs revisiting. A phantom timeout for a request that demonstrably answered 200 inverts that reading.
//
// THE PRICE OF THIS RULE, stated here because the test is what enforces it: first-observed wins, so the
// count is blind in the mirror direction. An attempt whose headers arrived and whose BODY then outran the
// 1800ms deadline keeps its `200 · ok` and publishes no `시간 초과` at all. So "`시간 초과` 0건" means "no
// attempt was cancelled BEFORE its response headers arrived" — not "no attempt hit its deadline". Recorded
// as a reading rule rather than fixed in code: the alternative (letting a terminal outcome overwrite the
// observed one) would cost the `200 whose body will not parse is still a 200 on the wire` fact that the
// test below pins, and no measurement so far needs the distinction. See §B30-21.
test('an attempt whose body stalls past the deadline reports no phantom 시간 초과 over its 200', async () => {
  const { attempts, fetchImpl } = racingFetch();
  const repo = createDaisoStoreStockRepository({ fetchImpl, timeoutMs: 20 });
  const pending = repo.query(store, { keyword: '밀폐용기' });
  pending.catch(() => {}); // rejects before the assertion below attaches — see the caller-abort test
  await tick();
  // Headers land on every attempt well inside the deadline; only the bodies outrun it.
  for (const attempt of attempts) attempt.resolve(stallingBody(attempt.signal));
  await expect(pending).rejects.toThrow();
  await tick();

  const entries = getSnapshot().network;
  expect(entries).toHaveLength(AVAILABILITY_ATTEMPTS);
  expect(entries.every((e) => e.outcome === 'ok' && e.status === 200)).toBe(true);
  expect(entries.some((e) => e.outcome === 'timeout')).toBe(false);
});

// ---------------------------------------------------------------------------------------------------
// Per-attempt elapsed time (the `ms` §B30-19③ reasons over)
// ---------------------------------------------------------------------------------------------------

test('each attempt publishes its own elapsed window — the winner its latency, a loser its cancellation', async () => {
  const { attempts, fetchImpl } = racingFetch();
  // Starts 0/10/20, then the winner's publish at 1169 and the two cancellations at 1181/1192 — the shape a
  // real lookup produces: one winner, then two cancellations a couple of ms behind it. Distinct windows on
  // purpose: equal ones could not tell "each attempt measures itself" from "all three share one number".
  const now = scriptedClock([0, 10, 20, 1169, 1181, 1192]);
  const repo = createDaisoStoreStockRepository({ fetchImpl, now });
  const pending = repo.query(store, { keyword: '밀폐용기' });
  await tick();
  attempts[0]?.resolve(inStockSettled());
  await expect(pending).resolves.toEqual(mockAnswers.inStock);
  await tick();

  const entries = getSnapshot().network;
  const byIndex = new Map(entries.map((e) => [e.attempt?.index, e]));
  expect(byIndex.get(1)?.ms).toBe(1169);
  // A loser's ms is its time to CANCELLATION — every attempt starts in the same synchronous tick and the
  // losers are aborted only after the winner has settled — so it says nothing about that attempt's own
  // vendor latency. Pinned anyway, because §B30-19③ reads these numbers.
  expect(byIndex.get(2)?.ms).toBe(1171);
  expect(byIndex.get(3)?.ms).toBe(1172);
  for (const entry of entries) expect(Number.isFinite(entry.ms)).toBe(true);
});

// Fake timers, and the DEFAULT `now` (Date.now) rather than the scripted seam: the point is that the
// published duration is derived from a real clock and lands on the deadline, which a scripted reading
// could only assert by restating itself.
test('a timed-out attempt reports the deadline it outran, never 0', async () => {
  vi.useFakeTimers();
  try {
    const { fetchImpl } = racingFetch(); // never settles on its own — only the deadline can end it
    const repo = createDaisoStoreStockRepository({
      fetchImpl,
      timeoutMs: AVAILABILITY_ATTEMPT_TIMEOUT_MS,
    });
    const pending = repo.query(store, { keyword: '밀폐용기' });
    pending.catch(() => {});
    await vi.advanceTimersByTimeAsync(AVAILABILITY_ATTEMPT_TIMEOUT_MS);
    await expect(pending).rejects.toThrow();

    const entries = getSnapshot().network;
    expect(entries).toHaveLength(AVAILABILITY_ATTEMPTS);
    expect(entries.every((e) => e.outcome === 'timeout')).toBe(true);
    for (const entry of entries) expect(entry.ms).toBe(AVAILABILITY_ATTEMPT_TIMEOUT_MS);
  } finally {
    vi.useRealTimers();
  }
});

// ---------------------------------------------------------------------------------------------------
// Error body capture
// ---------------------------------------------------------------------------------------------------

test('a failed response body is captured when text() exists', async () => {
  // A variable, not a fresh literal: `text` is an excess property against FetchLike's return type, which
  // is exactly the point — production hands over a real Response, the type stays unwidened.
  const failed = {
    ok: false,
    status: 502,
    json: async () => ({}),
    text: async () => '{"error":"upstream_unavailable"}',
  };
  const repo = createDaisoStoreStockRepository({ fetchImpl: async () => failed });
  await expect(repo.query(store, { keyword: '밀폐용기' })).rejects.toThrow();
  await tick();

  expect(getSnapshot().network[0]?.errorBody).toBe('{"error":"upstream_unavailable"}');
});

test('a response object with no text() publishes no body rather than a fabricated one', async () => {
  const repo = createDaisoStoreStockRepository({
    fetchImpl: async () => ({ ok: false, status: 502, json: async () => ({}) }),
  });
  await expect(repo.query(store, { keyword: '밀폐용기' })).rejects.toThrow();
  await tick();

  const entry = getSnapshot().network[0];
  expect(entry?.status).toBe(502);
  expect(entry?.errorBody).toBeUndefined();
});

test('a body is never read on a SUCCESSFUL response', async () => {
  let textReads = 0;
  const good = {
    ok: true,
    status: 200,
    json: async () => ({ data: observationFixtures.inStock }),
    text: async () => {
      textReads += 1;
      return 'should never be read';
    },
  };
  const repo = createDaisoStoreStockRepository({ fetchImpl: async () => good });
  await expect(repo.query(store, { keyword: '밀폐용기' })).resolves.toEqual(mockAnswers.inStock);
  expect(textReads).toBe(0);
});

test('an error body at exactly ERROR_BODY_MAX_CHARS is kept whole', async () => {
  const exact = 'x'.repeat(ERROR_BODY_MAX_CHARS);
  const failed = { ok: false, status: 500, json: async () => ({}), text: async () => exact };
  const repo = createDaisoStoreStockRepository({ fetchImpl: async () => failed });
  await expect(repo.query(store, { keyword: '밀폐용기' })).rejects.toThrow();
  await tick();

  expect(getSnapshot().network[0]?.errorBody).toBe(exact);
});

test('an error body one character over the cap is truncated to the cap plus an ellipsis', async () => {
  const over = 'x'.repeat(ERROR_BODY_MAX_CHARS + 1);
  const failed = { ok: false, status: 500, json: async () => ({}), text: async () => over };
  const repo = createDaisoStoreStockRepository({ fetchImpl: async () => failed });
  await expect(repo.query(store, { keyword: '밀폐용기' })).rejects.toThrow();
  await tick();

  const body = getSnapshot().network[0]?.errorBody;
  expect(body).toBe(`${'x'.repeat(ERROR_BODY_MAX_CHARS)}…`);
  expect(body).toHaveLength(ERROR_BODY_MAX_CHARS + 1); // the cap plus the one-character marker
});

// The panel joins entries with '\n'. A body carrying newlines would inject counterfeit network lines
// into a report that gets copied into notes.
test('a multi-line error body is flattened so it cannot inject panel lines', async () => {
  const failed = {
    ok: false,
    status: 500,
    json: async () => ({}),
    text: async () => '  <html>\n  <body>502 Bad Gateway</body>\n</html>  ',
  };
  const repo = createDaisoStoreStockRepository({ fetchImpl: async () => failed });
  await expect(repo.query(store, { keyword: '밀폐용기' })).rejects.toThrow();
  await tick();

  const body = getSnapshot().network[0]?.errorBody;
  expect(body).toBe('<html> <body>502 Bad Gateway</body> </html>');
  expect(body).not.toContain('\n');
});

test('an empty error body reports nothing rather than an empty marker', async () => {
  const failed = { ok: false, status: 500, json: async () => ({}), text: async () => '   \n  ' };
  const repo = createDaisoStoreStockRepository({ fetchImpl: async () => failed });
  await expect(repo.query(store, { keyword: '밀폐용기' })).rejects.toThrow();
  await tick();

  expect(getSnapshot().network[0]?.errorBody).toBeUndefined();
});

test('a text() that throws leaves the entry bodyless instead of failing the lookup path', async () => {
  const failed = {
    ok: false,
    status: 503,
    json: async () => ({}),
    text: async () => {
      throw new Error('body already consumed');
    },
  };
  const repo = createDaisoStoreStockRepository({ fetchImpl: async () => failed });
  await expect(repo.query(store, { keyword: '밀폐용기' })).rejects.toThrow('availability 503');
  await tick();

  const entry = getSnapshot().network[0];
  expect(entry?.status).toBe(503);
  expect(entry?.errorBody).toBeUndefined();
});

// ---------------------------------------------------------------------------------------------------
// The per-attempt deadline's value is COUPLED to createQueryRunner's Bible-owned 2000ms cap
// ---------------------------------------------------------------------------------------------------

// Basis (§B30-18): the maximum SUCCESSFUL /api/availability response measured on a real device is 1445ms,
// while createQueryRunner aborts the whole lookup at 2000ms — Bible-owned (Engineering §5 dependency
// table), so not ours to raise. The deadline must sit above the measured maximum (or it would abort reads
// that would have succeeded) AND below the runner's cap (or it could never fire, and "did a timeout
// occur" would stay unanswerable). Both bounds are asserted because breaking either is silent.
const MAX_OBSERVED_SUCCESS_MS = 1445;
const RUNNER_CAP_MS = 2000;

test('the per-attempt deadline sits above the measured maximum and below the runner cap', () => {
  expect(AVAILABILITY_ATTEMPT_TIMEOUT_MS).toBeGreaterThan(MAX_OBSERVED_SUCCESS_MS);
  expect(AVAILABILITY_ATTEMPT_TIMEOUT_MS).toBeLessThan(RUNNER_CAP_MS);
});

// ---------------------------------------------------------------------------------------------------
// Type discipline (source-text guard — unobservable behaviourally, so pinned on the source)
// ---------------------------------------------------------------------------------------------------

// FetchLike must stay { ok, status, json }: doubles across this repo (and the three tests above that build
// a `failed` object with a text()) implement exactly that shape, and widening it would break them all.
test('FetchLike is not widened with text()', () => {
  const fetchLikeDecl = repositorySource.slice(
    repositorySource.indexOf('export type FetchLike'),
    repositorySource.indexOf('export const AVAILABILITY_ATTEMPTS'),
  );
  expect(fetchLikeDecl).toContain('json(): Promise<unknown>');
  // Any mention at all, not just `text(`: an OPTIONAL `text?()` widens the contract without breaking a
  // single double, so it would slip past a narrower check while quietly making the probe unnecessary.
  expect(fetchLikeDecl).not.toContain('text');
});

// The error body is reached through `'text' in res` narrowing, which is what makes the probe legal with no
// escape hatch. Any of these would compile and leave every behavioural test above green. Comments are
// stripped first: the module's own prose NAMES the hatches it avoids, and a raw substring scan would
// otherwise fail on the documentation rather than on the code.
test('the error body is read with no cast or suppression escape hatch', () => {
  const code = repositorySource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  expect(code).toContain("'text' in res && typeof res.text === 'function'");
  for (const forbidden of ['as unknown as', 'as any', '@ts-expect-error', '@ts-ignore']) {
    expect(code).not.toContain(forbidden);
  }
});

// ---------------------------------------------------------------------------------------------------
// Upstream timing (Server-Timing) — this adapter self-publishes and does not go through
// createDiagnosticFetch, so the header has to be read here too (§B30-18).
// ---------------------------------------------------------------------------------------------------

test('an ok attempt publishes the upstream timing the proxy reported', async () => {
  // /api/availability does NOT go through createDiagnosticFetch -- this adapter self-publishes
  // (§B30-18) -- so the header has to be read here too, and this test is what proves it is.
  const repo = createDaisoStoreStockRepository({
    fetchImpl: async () =>
      okTimed({ data: observationFixtures.inStock }, 'total;dur=1169, search;dur=88, stck;dur=310'),
  });
  expect(await repo.query(store, { keyword: '밀폐용기' })).toEqual(mockAnswers.inStock);
  expect(getSnapshot().network.find((e) => e.outcome === 'ok')?.upstream).toEqual({
    totalMs: 1169,
    legs: [
      { name: 'search', ms: 88 },
      { name: 'stck', ms: 310 },
    ],
  });
});

test('a failed attempt publishes upstream timing too', async () => {
  // The 502 case is the one most worth measuring; losing it here would blind exactly that.
  const repo = createDaisoStoreStockRepository({
    fetchImpl: async () => ({
      ok: false,
      status: 502,
      headers: { get: () => 'total;dur=800, search;dur=88' },
      json: async () => ({}),
      text: async () => '{"error":"upstream_unavailable"}',
    }),
  });
  await expect(repo.query(store, { keyword: '밀폐용기' })).rejects.toBeInstanceOf(Error);
  expect(getSnapshot().network.find((e) => e.outcome === 'httpError')?.upstream).toEqual({
    totalMs: 800,
    legs: [{ name: 'search', ms: 88 }],
  });
});

test('a double without headers publishes no upstream field', async () => {
  // The shape most doubles in this file have. This is what proves the structural probe holds rather
  // than throwing on the { ok, status, json } doubles FetchLike is deliberately narrowed to.
  const repo = createDaisoStoreStockRepository({
    fetchImpl: async () => ok({ data: observationFixtures.inStock }),
  });
  await repo.query(store, { keyword: '밀폐용기' });
  const entry = getSnapshot().network.find((e) => e.outcome === 'ok');
  // The presence assertion proves an 'ok' entry was actually published — without it, a regression
  // that dropped the publish entirely would leave `entry` undefined and the assertion below green
  // for the wrong reason (undefined?.upstream is also undefined). composition.test.ts closed the
  // identical hole for createDiagnosticFetch's publisher; this makes this adapter's own publisher
  // symmetric with it.
  expect(entry).toBeDefined();
  expect(entry?.upstream).toBeUndefined();
});
