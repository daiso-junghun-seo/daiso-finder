// src/infra/sw/catalog-subset.test.ts
import { createMockRepository } from '../../adapters/mock/mockRepository';
import type { AvailabilityAnswer } from '../../domain/types';
import type { CacheStorage } from '../cache-storage';
import { populateCatalogSubset } from './catalog-subset';

const memCache = (): CacheStorage & { size: () => number } => {
  const m = new Map<string, { answer: AvailabilityAnswer; observedAt: number }>();
  return {
    async readAnswer(k) {
      return m.get(k) ?? null;
    },
    async writeAnswer(k, answer, observedAt) {
      m.set(k, { answer, observedAt });
    },
    size: () => m.size,
  };
};

test('background population writes one stamped entry per SKU', async () => {
  const cache = memCache();
  const n = await populateCatalogSubset({
    store: { strCd: '1', strNm: '명동역점' },
    skus: ['a', 'b', 'c'],
    repo: createMockRepository('inStock'),
    cache,
    now: () => 5000,
  });
  expect(n).toBe(3);
  expect(cache.size()).toBe(3);
  expect(await cache.readAnswer('1:a')).toMatchObject({ observedAt: 5000 });
});
