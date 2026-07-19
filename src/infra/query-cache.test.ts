import { mockAnswers } from '../adapters/mock/fixtures';
import { createMockRepository } from '../adapters/mock/mockRepository';
import { defaultPolicy } from '../domain/policy';
import type { AvailabilityAnswer } from '../domain/types';
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
