import { NoCatalogMatchError } from '../../domain/errors';
// src/adapters/mock/mockRepository.ts
import type { StoreStockRepository } from '../../domain/ports';
import { type Scenario, mockAnswers } from './fixtures';

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
