import { NoCatalogMatchError } from '../../domain/errors';
// src/adapters/mock/mockRepository.ts
import type { StoreStockRepository } from '../../domain/ports';
import { type Scenario, mockAnswers, mockProductName } from './fixtures';

export function createMockRepository(
  scenario: Scenario,
  opts: { latencyMs?: number; fail?: boolean; noMatch?: boolean } = {},
): StoreStockRepository {
  return {
    async query() {
      if (opts.latencyMs) await new Promise((r) => setTimeout(r, opts.latencyMs));
      if (opts.noMatch) throw new NoCatalogMatchError([]); // keyword matched no catalog product → NO_MATCH
      if (opts.fail) throw new Error('mock network failure'); // network/timeout → FAILURE
      return mockAnswers[scenario];
    },
  };
}

// Keyword-driven mock for the live search bar (B16: real catalog/store wiring is deferred).
// Exact scenario key → that fixture (keeps all states reachable by typing); a keyword contained
// in the mock product name → inStock; anything else → NoCatalogMatchError → Empty.
export function createKeywordMockRepository(): StoreStockRepository {
  return {
    async query(_store, term) {
      const keyword = (term.keyword ?? '').trim();
      if (keyword in mockAnswers) return mockAnswers[keyword as Scenario];
      if (keyword && mockProductName.includes(keyword)) return mockAnswers.inStock;
      throw new NoCatalogMatchError([]);
    },
  };
}
