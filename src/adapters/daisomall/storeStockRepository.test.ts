const flag = vi.hoisted(() => ({ enabled: true }));
vi.mock('../../diagnostics/enabled', () => ({ isDiagnosticsEnabled: () => flag.enabled }));

import { getSnapshot, resetDiagnostics } from '../../diagnostics/bus';
import { NoCatalogMatchError, UnmappableAnswerError } from '../../domain/errors';
import { mockAnswers } from '../mock/fixtures';
import { observationFixtures } from './observationFixtures';
import {
  AVAILABILITY_ATTEMPTS,
  AVAILABILITY_ATTEMPT_TIMEOUTS_MS,
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
// Sequential retry (§B56, 2026-11-27)
// ---------------------------------------------------------------------------------------------------
// A lookup is a SEQUENCE: attempt, and only on a failure a fresh read could fix (timeout, transport,
// 5xx, 429), attempt again. The parallel race these tests used to cover is retired at 1 (§B34) and is
// not part of the shipped behaviour — `AVAILABILITY_ATTEMPTS` is now the retry count, not a race width.
// ---------------------------------------------------------------------------------------------------

test('a lookup issues one request when the first attempt answers', async () => {
  const { attempts, fetchImpl } = racingFetch();
  const repo = createDaisoStoreStockRepository({ fetchImpl });
  const pending = repo.query(store, { keyword: '밀폐용기' });
  await tick();

  expect(attempts).toHaveLength(1);
  // Identical body — a retry re-reads the same request, it does not broaden it.
  expect(JSON.parse(attempts[0]?.body ?? '{}')).toEqual({ strCd: '10803', keyword: '밀폐용기' });

  attempts[0]?.resolve(inStockSettled());
  await expect(pending).resolves.toEqual(mockAnswers.inStock);
  await tick();
  expect(attempts).toHaveLength(1); // success ends the sequence
});

// The shipped policy is pinned here and lives in ONE place so tuning it is one line. Deadlines shrink
// because the retry is expected to be fast (the first attempt already warmed the server's auth cache).
test('the shipped policy is 3 attempts with shrinking deadlines', () => {
  expect(AVAILABILITY_ATTEMPTS).toBe(3);
  expect(AVAILABILITY_ATTEMPT_TIMEOUTS_MS).toEqual([2000, 1500, 1500]);
});

test('a transport failure is retried, and the retry’s answer is returned', async () => {
  const { attempts, fetchImpl } = racingFetch();
  const repo = createDaisoStoreStockRepository({ fetchImpl });
  const pending = repo.query(store, { keyword: '밀폐용기' });
  await tick();

  attempts[0]?.reject(new Error('offline'));
  await tick();
  expect(attempts).toHaveLength(2);

  attempts[1]?.resolve(inStockSettled());
  await expect(pending).resolves.toEqual(mockAnswers.inStock);
});

test('a 5xx is retried — the proxy’s transient upstream failure is exactly this case', async () => {
  const { attempts, fetchImpl } = racingFetch();
  const repo = createDaisoStoreStockRepository({ fetchImpl });
  const pending = repo.query(store, { keyword: '밀폐용기' });
  await tick();

  attempts[0]?.resolve({ ok: false, status: 502, json: async () => ({}) });
  await tick();
  expect(attempts).toHaveLength(2);

  attempts[1]?.resolve(inStockSettled());
  await expect(pending).resolves.toEqual(mockAnswers.inStock);
});

test('a 429 is retried', async () => {
  const { attempts, fetchImpl } = racingFetch();
  const repo = createDaisoStoreStockRepository({ fetchImpl });
  const pending = repo.query(store, { keyword: '밀폐용기' });
  await tick();

  attempts[0]?.resolve({ ok: false, status: 429, json: async () => ({}) });
  await tick();
  expect(attempts).toHaveLength(2);
  attempts[1]?.resolve(inStockSettled());
  await expect(pending).resolves.toEqual(mockAnswers.inStock);
});

test('a 4xx is definitive — no retry (the same request would be just as wrong)', async () => {
  const { attempts, fetchImpl } = racingFetch();
  const repo = createDaisoStoreStockRepository({ fetchImpl });
  const pending = repo.query(store, { keyword: '밀폐용기' });
  await tick();

  attempts[0]?.resolve({ ok: false, status: 404, json: async () => ({}) });
  await expect(pending).rejects.toThrow('availability 404');
  await tick();
  expect(attempts).toHaveLength(1);
});

test('only when every attempt fails does the lookup fail (→ FAILURE path)', async () => {
  const { attempts, fetchImpl } = racingFetch();
  const repo = createDaisoStoreStockRepository({ fetchImpl });
  const pending = repo.query(store, { keyword: '밀폐용기' });
  await tick();

  attempts[0]?.resolve({ ok: false, status: 502, json: async () => ({}) });
  await tick();
  attempts[1]?.resolve({ ok: false, status: 502, json: async () => ({}) });
  await tick();
  attempts[2]?.resolve({ ok: false, status: 502, json: async () => ({}) });
  // The last original reason survives — never an AggregateError, which createQueryRunner cannot route on.
  await expect(pending).rejects.toThrow('availability 502');
  await tick();
  expect(attempts).toHaveLength(AVAILABILITY_ATTEMPTS);
});

// A definitive answer, not a transport failure: re-reading cannot make "not carried" untrue.
test('a noMatch ends the lookup immediately — no retry', async () => {
  const { attempts, fetchImpl } = racingFetch();
  const repo = createDaisoStoreStockRepository({ fetchImpl });
  const pending = repo.query(store, { keyword: '없는상품' });
  await tick();

  attempts[0]?.resolve(okSettled({ noMatch: true }));
  await expect(pending).rejects.toBeInstanceOf(NoCatalogMatchError);
  await tick();
  expect(attempts).toHaveLength(1);
});

// timeoutMs is pushed far out on purpose, so only the caller can end the attempt within one tick.
test('the caller aborting cancels the running attempt and is not retried', async () => {
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
  expect(attempts).toHaveLength(1);
  expect(attempts[0]?.signal?.aborted).toBe(false);

  ctrl.abort();
  await tick();
  expect(attempts[0]?.signal?.aborted).toBe(true);
  await expect(pending).rejects.toThrow('availability cancelled');

  const entries = getSnapshot().network;
  expect(entries).toHaveLength(1); // a cancellation is not a failure to retry
  expect(entries.every((e) => e.outcome === 'aborted')).toBe(true);
  expect(entries.some((e) => e.outcome === 'timeout')).toBe(false);
});

// A signal that is ALREADY aborted must not produce a live request that only gets cancelled later.
test('a caller signal aborted before the call makes no request', async () => {
  const { attempts, fetchImpl } = racingFetch();
  const repo = createDaisoStoreStockRepository({ fetchImpl, timeoutMs: 60_000 });
  const ctrl = new AbortController();
  ctrl.abort();
  await expect(repo.query(store, { keyword: '밀폐용기' }, ctrl.signal)).rejects.toThrow(
    'availability cancelled',
  );
  expect(attempts).toHaveLength(1);
  expect(attempts[0]?.signal?.aborted).toBe(true);
});

// ---------------------------------------------------------------------------------------------------
// Per-attempt diagnostics (§B30-18)
// ---------------------------------------------------------------------------------------------------

test('each attempt is published with its 1-based index and the total', async () => {
  const { attempts, fetchImpl } = racingFetch();
  const repo = createDaisoStoreStockRepository({ fetchImpl });
  const pending = repo.query(store, { keyword: '밀폐용기' });
  await tick();
  attempts[0]?.reject(new Error('offline'));
  await tick();
  attempts[1]?.resolve(inStockSettled());
  await pending;
  await tick();

  const entries = getSnapshot().network;
  expect(entries).toHaveLength(2);
  expect(entries.map((e) => e.attempt)).toEqual([
    { index: 1, total: 3 },
    { index: 2, total: 3 },
  ]);
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

// The mirror of the rule above: a RETRY is not a cancellation, and the panel exists to count exactly
// this difference. A retried attempt states its own failure; the successful retry states its own win.
test('a failed attempt is published as its failure, and the retry as its own win', async () => {
  const { attempts, fetchImpl } = racingFetch();
  const repo = createDaisoStoreStockRepository({ fetchImpl });
  const pending = repo.query(store, { keyword: '밀폐용기' });
  await tick();
  attempts[0]?.reject(new Error('offline'));
  await tick();
  attempts[1]?.resolve(inStockSettled());
  await pending;
  await tick();

  const entries = getSnapshot().network;
  expect(entries.filter((e) => e.outcome === 'networkError')).toHaveLength(1);
  expect(entries.filter((e) => e.outcome === 'ok')).toHaveLength(1);
  expect(entries.some((e) => e.outcome === 'aborted')).toBe(false);
});

test('a transport-level rejection is published as a networkError, not as a cancellation', async () => {
  const { attempts, fetchImpl } = racingFetch();
  const repo = createDaisoStoreStockRepository({ fetchImpl });
  const pending = repo.query(store, { keyword: '밀폐용기' });
  // Sequential: each attempt must be seen and failed before the next one exists.
  for (let i = 0; i < AVAILABILITY_ATTEMPTS; i += 1) {
    await tick();
    attempts[i]?.reject(new Error('offline'));
  }
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
  // A body that will not parse is not a transport failure to retry: one attempt, one ok entry.
  expect(entries).toHaveLength(1);
  expect(entries.every((e) => e.outcome === 'ok' && e.status === 200)).toBe(true);
  expect(entries.some((e) => e.outcome === 'networkError')).toBe(false);
});

// A mapping failure is not a network fact: the request itself succeeded with a 200 and already published
// one entry. A second, error-shaped entry for it would misreport the transport — and a retry would send the
// same request to the same payload.
test('a malformed body publishes the successful transport only, never a second error entry', async () => {
  let calls = 0;
  const repo = createDaisoStoreStockRepository({
    fetchImpl: async () => {
      calls += 1;
      return ok({ data: { strCd: 1 } });
    },
  });
  await expect(repo.query(store, { keyword: '밀폐용기' })).rejects.toBeInstanceOf(
    UnmappableAnswerError,
  );
  await tick();

  expect(calls).toBe(1); // mapping failures are definitive
  const entries = getSnapshot().network;
  expect(entries).toHaveLength(1);
  expect(entries.every((e) => e.outcome === 'ok' && e.status === 200)).toBe(true);
});

// ---------------------------------------------------------------------------------------------------
// One entry per attempt, whatever happens after the response arrives
// ---------------------------------------------------------------------------------------------------

// The whole panel reading rests on `#i/total` being a partition: a lookup that emitted two lines for one
// attempt would make one index appear twice. An attempt that already reported an OBSERVED response must
// not go on to report a second outcome.
//
// §B30-21: the count is blind in one direction by design — an attempt whose headers arrived and whose BODY
// then outran the deadline keeps its `200 · ok` and publishes no `시간 초과`. Pinned here on a single
// attempt (the shipped sequence would retry the stalled body, which is a different fact).
test('an attempt whose body stalls past the deadline reports no phantom 시간 초과 over its 200', async () => {
  const { attempts, fetchImpl } = racingFetch();
  const repo = createDaisoStoreStockRepository({ fetchImpl, attempts: 1, timeoutMs: 20 });
  const pending = repo.query(store, { keyword: '밀폐용기' });
  pending.catch(() => {}); // rejects before the assertion below attaches — see the caller-abort test
  await tick();
  attempts[0]?.resolve(stallingBody(attempts[0]?.signal));
  await expect(pending).rejects.toThrow();
  await tick();

  const entries = getSnapshot().network;
  expect(entries).toHaveLength(1); // the header landed; the stalled body adds no phantom timeout
  expect(entries.every((e) => e.outcome === 'ok' && e.status === 200)).toBe(true);
  expect(entries.some((e) => e.outcome === 'timeout')).toBe(false);
});

// ---------------------------------------------------------------------------------------------------
// Per-attempt elapsed time (the `ms` §B30-19③ reasons over)
// ---------------------------------------------------------------------------------------------------

test('each attempt publishes its own elapsed window', async () => {
  const { attempts, fetchImpl } = racingFetch();
  // Attempt 1 starts at 0 and fails at 900; attempt 2 starts at 1200 and wins at 2000. Distinct windows on
  // purpose: equal ones could not tell "each attempt measures itself" from "both share one number".
  const now = scriptedClock([0, 900, 1200, 2000]);
  const repo = createDaisoStoreStockRepository({ fetchImpl, now });
  const pending = repo.query(store, { keyword: '밀폐용기' });
  await tick();
  attempts[0]?.reject(new Error('offline'));
  await tick();
  attempts[1]?.resolve(inStockSettled());
  await expect(pending).resolves.toEqual(mockAnswers.inStock);
  await tick();

  const entries = getSnapshot().network;
  const byIndex = new Map(entries.map((e) => [e.attempt?.index, e]));
  expect(byIndex.get(1)?.ms).toBe(900);
  expect(byIndex.get(2)?.ms).toBe(800);
  for (const entry of entries) expect(Number.isFinite(entry.ms)).toBe(true);
});

// Fake timers, and the DEFAULT `now` (Date.now) rather than the scripted seam: the point is that the
// published duration is derived from a real clock and lands on each attempt's own deadline, which a
// scripted reading could only assert by restating itself.
test('a timed-out attempt reports the deadline it outran, never 0', async () => {
  vi.useFakeTimers();
  try {
    const { fetchImpl } = racingFetch(); // never settles on its own — only the deadlines can end it
    const repo = createDaisoStoreStockRepository({ fetchImpl });
    const pending = repo.query(store, { keyword: '밀폐용기' });
    pending.catch(() => {});
    for (const deadline of AVAILABILITY_ATTEMPT_TIMEOUTS_MS) {
      await vi.advanceTimersByTimeAsync(deadline);
    }
    await expect(pending).rejects.toThrow('availability timeout');

    const entries = getSnapshot().network;
    expect(entries).toHaveLength(AVAILABILITY_ATTEMPTS);
    expect(entries.every((e) => e.outcome === 'timeout')).toBe(true);
    expect(entries.map((e) => e.ms)).toEqual([...AVAILABILITY_ATTEMPT_TIMEOUTS_MS]);
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
// The retry budget (§B56) and its relationship to createQueryRunner's backstop
// ---------------------------------------------------------------------------------------------------

// Basis: the cold production read that motivated the retry measured 2.06s (2026-11-27, warm re-read
// 0.33s). The first deadline is the old Bible Hypothesis figure (2.0s, Engineering §5) — the read that
// misses it is exactly the read the retry exists to finish. Deadlines shrink because the retry is
// expected to be fast; the runner's 6000ms cap is a backstop ABOVE their sum, so it never masks a
// per-attempt timeout (the panel must report the deadline, not the runner's blind abort).
const COLD_READ_MS = 2060;
const RUNNER_BACKSTOP_MS = 6000;

test('the retry budget covers the cold read and sits inside the runner backstop', () => {
  expect(AVAILABILITY_ATTEMPT_TIMEOUTS_MS[0]).toBeGreaterThanOrEqual(2000);
  expect(AVAILABILITY_ATTEMPT_TIMEOUTS_MS[0]).toBeGreaterThanOrEqual(COLD_READ_MS - 100);
  const sum = AVAILABILITY_ATTEMPT_TIMEOUTS_MS.reduce((total, ms) => total + ms, 0);
  expect(sum).toBe(5000);
  expect(sum).toBeLessThan(RUNNER_BACKSTOP_MS);
  // Shrinking, so a retry cannot hold the shopper for as long as the first read did.
  for (let i = 1; i < AVAILABILITY_ATTEMPT_TIMEOUTS_MS.length; i += 1) {
    expect(AVAILABILITY_ATTEMPT_TIMEOUTS_MS[i]).toBeLessThanOrEqual(
      AVAILABILITY_ATTEMPT_TIMEOUTS_MS[i - 1] as number,
    );
  }
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
