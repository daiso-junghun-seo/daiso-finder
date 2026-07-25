import { NoCatalogMatchError } from '../../domain/errors';
// src/adapters/mock/mockRepository.ts
import type { StoreStockRepository } from '../../domain/ports';
import { type Scenario, mockAnswers, mockProductName } from './fixtures';
import { mockCandidates } from './productSearch';

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
      // Own keys only: `in` would match prototype-chain keys (__proto__, toString, …) and hand
      // non-answer objects to the UI/cache.
      if (Object.hasOwn(mockAnswers, keyword)) return mockAnswers[keyword as Scenario];
      // A scanned barcode arrives as keyword=pdNo=<decoded value> (spec §3.3): match the mock catalog
      // by pdNo so the DEV/E2E scan flow reaches a real answer card instead of always going Empty.
      // ONLY the base candidate, whose name/pdNo mockAnswers.inStock actually describes — matching any
      // candidate would answer a tap on 19988/19989 with an answer card naming a different product.
      if (term.pdNo && term.pdNo === mockCandidates[0]?.pdNo) return mockAnswers.inStock;
      if (keyword && mockProductName.includes(keyword)) return mockAnswers.inStock;
      throw new NoCatalogMatchError([]);
    },
  };
}
