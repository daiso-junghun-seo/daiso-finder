import { mockAnswers } from '../adapters/mock/fixtures';
import { createMockRepository } from '../adapters/mock/mockRepository';
import { defaultPolicy } from '../domain/policy';
import type { AvailabilityAnswer, StoreEvent } from '../domain/types';
import type { CacheStorage } from './cache-storage';
import { createQueryRunner } from './query-cache';

// No @types/node in this project — a minimal local ambient type for the one Node global this
// spec needs (process.on/off for the unhandledRejection spy below).
declare const process: {
  on(event: 'unhandledRejection', listener: (reason: unknown) => void): void;
  off(event: 'unhandledRejection', listener: (reason: unknown) => void): void;
};

const store = { strCd: '1', strNm: '명동역점' };
const memCache = (): CacheStorage => {
  const m = new Map<string, { answer: AvailabilityAnswer; observedAt: number }>();
  return {
    async readAnswer(k) {
      return m.get(k) ?? null;
    },
    async writeAnswer(k, answer, observedAt) {
      m.set(k, { answer, observedAt });
    },
  };
};

test('success → RESULT stamped live at now, and the answer is cached', async () => {
  const cache = memCache();
  const run = createQueryRunner({
    repo: createMockRepository('inStock'),
    cache,
    policy: defaultPolicy,
    now: () => 5000,
  });
  const ev = await run.run(store, { keyword: '밀폐용기' });
  expect(ev).toEqual({
    type: 'RESULT',
    answer: mockAnswers.inStock,
    freshness: { class: 'live', observedAt: 5000 },
  });
  expect(await cache.readAnswer('1:밀폐용기')).toEqual({
    answer: mockAnswers.inStock,
    observedAt: 5000,
  });
});
test('failure with fresh cache → FAILURE withinThreshold', async () => {
  const cache = memCache();
  await cache.writeAnswer('1:밀폐용기', mockAnswers.inStock, 4000);
  const run = createQueryRunner({
    repo: createMockRepository('inStock', { fail: true }),
    cache,
    policy: { ...defaultPolicy, stalenessThresholdMs: 10_000 },
    now: () => 8000,
  });
  const ev = await run.run(store, { keyword: '밀폐용기' });
  expect(ev).toMatchObject({ type: 'FAILURE', cache: { kind: 'withinThreshold' } });
});
test('failure with stale cache → FAILURE beyondThreshold', async () => {
  const cache = memCache();
  await cache.writeAnswer('1:밀폐용기', mockAnswers.inStock, 0);
  const run = createQueryRunner({
    repo: createMockRepository('inStock', { fail: true }),
    cache,
    policy: { ...defaultPolicy, stalenessThresholdMs: 1000 },
    now: () => 8000,
  });
  expect(await run.run(store, { keyword: '밀폐용기' })).toMatchObject({
    type: 'FAILURE',
    cache: { kind: 'beyondThreshold' },
  });
});
test('failure with no cache → FAILURE noCache', async () => {
  const run = createQueryRunner({
    repo: createMockRepository('inStock', { fail: true }),
    cache: memCache(),
    policy: defaultPolicy,
    now: () => 8000,
  });
  expect(await run.run(store, { keyword: '없는상품' })).toEqual({
    type: 'FAILURE',
    cache: { kind: 'noCache' },
  });
});
test('a timeout beyond timeoutMs is treated as a failure', async () => {
  const run = createQueryRunner({
    repo: createMockRepository('inStock', { latencyMs: 50 }),
    cache: memCache(),
    policy: defaultPolicy,
    now: () => 8000,
    timeoutMs: 10,
  });
  expect(await run.run(store, { keyword: '밀폐용기' })).toMatchObject({ type: 'FAILURE' });
});
// The 6000ms DEFAULT, which every other test here bypasses by injecting `timeoutMs` — so nothing pinned the
// only value production actually runs under (AvailabilitySurface's liveQueryRunner passes none).
//
// This used to be 2000ms: Bible Engineering §5's dependency table states a flat 2s for the store/stock read.
// That figure is labelled a Hypothesis there (":58 — requires field validation", likewise :53 and :156), and
// the 2026-11-27 production measurement is the field evidence it asked for: a cold /api/availability took
// 2.06s because the proxy's vendor-handshake cache expires after 5 minutes, while the immediate re-read took
// 0.33s. The availability adapter now retries a transient failure itself, 3 attempts at 2.0s → 1.5s → 1.5s
// (~5s worst case, §B56). This runner timer is the BACKSTOP above that sum, not the per-read budget: it must
// not abort the retry that exists to hide the cold handshake, while still bounding a repository that ignores
// AbortSignal entirely. Raise it further and a hung repo stalls the shopper longer; lower it below the sum
// and the retry can never finish.
test('the default backstop is 6000ms — above the adapter retry budget, below a hang', async () => {
  vi.useFakeTimers();
  try {
    const run = createQueryRunner({
      // Latency far past any plausible default, so ONLY the runner's own timer can end this run.
      repo: createMockRepository('inStock', { latencyMs: 60_000 }),
      cache: memCache(),
      policy: defaultPolicy,
      now: () => 8000,
      // timeoutMs deliberately NOT injected — the default is the whole subject of this test.
    });
    let event: StoreEvent | undefined;
    // The runner never rejects (it classifies every failure into an event), so nothing to handle here.
    run.run(store, { keyword: '밀폐용기' }).then((ev) => {
      event = ev;
    });

    await vi.advanceTimersByTimeAsync(5999);
    expect(event).toBeUndefined(); // a smaller default would have fired by now…
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(0); // drain the runner's own cache-classify microtasks
    expect(event).toEqual({ type: 'FAILURE', cache: { kind: 'noCache' } }); // …and 6000 is when it must
  } finally {
    vi.useRealTimers();
  }
});
test('a late repo rejection after the timeout already won registers no unhandled rejection', async () => {
  const onUnhandled = vi.fn();
  process.on('unhandledRejection', onUnhandled);
  try {
    const run = createQueryRunner({
      repo: createMockRepository('inStock', { latencyMs: 50, fail: true }),
      cache: memCache(),
      policy: defaultPolicy,
      now: () => 8000,
      timeoutMs: 10,
    });
    expect(await run.run(store, { keyword: '밀폐용기' })).toMatchObject({ type: 'FAILURE' });
    // Flush past the mock repo's 50ms latency so its late rejection has a chance to surface.
    await new Promise((r) => setTimeout(r, 100));
    expect(onUnhandled).not.toHaveBeenCalled();
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
});
test('a failing cache write never demotes a successful live answer (write is best-effort)', async () => {
  const blockedWriteCache: CacheStorage = {
    async readAnswer() {
      return null;
    },
    async writeAnswer() {
      throw new Error('quota exceeded');
    },
  };
  const run = createQueryRunner({
    repo: createMockRepository('inStock'),
    cache: blockedWriteCache,
    policy: defaultPolicy,
    now: () => 5000,
  });
  // The live answer already arrived — bookkeeping failure must not reroute it to the FAILURE path.
  expect(await run.run(store, { keyword: '밀폐용기' })).toEqual({
    type: 'RESULT',
    answer: mockAnswers.inStock,
    freshness: { class: 'live', observedAt: 5000 },
  });
});
test('a failing cache read during failure classification degrades to noCache instead of throwing', async () => {
  const blockedReadCache: CacheStorage = {
    async readAnswer() {
      throw new Error('idb blocked');
    },
    async writeAnswer() {},
  };
  const run = createQueryRunner({
    repo: createMockRepository('inStock', { fail: true }),
    cache: blockedReadCache,
    policy: defaultPolicy,
    now: () => 8000,
  });
  expect(await run.run(store, { keyword: '밀폐용기' })).toEqual({
    type: 'FAILURE',
    cache: { kind: 'noCache' },
  });
});
test('a cached NEGATIVE answer beyond threshold degrades to noCache, never Partial(staleCache) (§A10 interim)', async () => {
  const cache = memCache();
  await cache.writeAnswer('1:온도계', mockAnswers.temporarilyOut, 0);
  const run = createQueryRunner({
    repo: createMockRepository('temporarilyOut', { fail: true }),
    cache,
    policy: { ...defaultPolicy, stalenessThresholdMs: 1000 },
    now: () => 8000,
  });
  // The staleCache Partial copy asserts "…에는 있었어요" — the opposite of a cached 품절 observation.
  expect(await run.run(store, { keyword: '온도계' })).toEqual({
    type: 'FAILURE',
    cache: { kind: 'noCache' },
  });
});
test('a cached negative answer within threshold still serves Error(cached) with kind-true facts', async () => {
  const cache = memCache();
  await cache.writeAnswer('1:온도계', mockAnswers.temporarilyOut, 7000);
  const run = createQueryRunner({
    repo: createMockRepository('temporarilyOut', { fail: true }),
    cache,
    policy: { ...defaultPolicy, stalenessThresholdMs: 10_000 },
    now: () => 8000,
  });
  expect(await run.run(store, { keyword: '온도계' })).toMatchObject({
    type: 'FAILURE',
    cache: { kind: 'withinThreshold', answer: mockAnswers.temporarilyOut },
  });
});
test('no catalog match → NO_MATCH (never serves stale cache)', async () => {
  const cache = memCache();
  await cache.writeAnswer('1:없는상품', mockAnswers.inStock, 0); // a stale cache exists…
  const run = createQueryRunner({
    repo: createMockRepository('inStock', { noMatch: true }),
    cache,
    policy: defaultPolicy,
    now: () => 8000,
  });
  // …but a no-match must NOT be dressed up as a cached failure; it is Empty.
  expect(await run.run(store, { keyword: '없는상품' })).toEqual({
    type: 'NO_MATCH',
    query: '없는상품',
    suggestions: [],
  });
});
