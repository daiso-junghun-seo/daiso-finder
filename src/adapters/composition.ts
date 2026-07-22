// src/adapters/composition.ts — single production wiring point. PROD builds the real /api adapters; DEV/test
// keep the mocks so `vite dev` + Vitest + the Playwright dev sweep run without a live /api server.
import type { StoreDirectoryPort, StoreStockRepository } from '../domain/ports';
import { createDaisoStoreDirectory } from './daisomall/storeDirectory';
import { createDaisoStoreStockRepository } from './daisomall/storeStockRepository';
import { createKeywordMockRepository } from './mock/mockRepository';
import { createMockStoreDirectory } from './mock/storeDirectory';

export function createStoreStockRepository(): StoreStockRepository {
  return import.meta.env.PROD ? createDaisoStoreStockRepository() : createKeywordMockRepository();
}

export function createStoreDirectory(): StoreDirectoryPort {
  return import.meta.env.PROD ? createDaisoStoreDirectory() : createMockStoreDirectory();
}
