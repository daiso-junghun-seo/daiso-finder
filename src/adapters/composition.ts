// src/adapters/composition.ts — single production wiring point. PROD builds the real /api adapters; DEV/test
// keep the mocks so `vite dev` + Vitest + the Playwright dev sweep run without a live /api server.
import type {
  GeolocationPort,
  ProductSearchPort,
  StoreDirectoryPort,
  StoreStockRepository,
} from '../domain/ports';
import { createDaisoProductSearch } from './daisomall/productSearchRepository';
import { createDaisoNearbyFetch, createDaisoStoreDirectory } from './daisomall/storeDirectory';
import { createDaisoStoreStockRepository } from './daisomall/storeStockRepository';
import { createBrowserGeolocation } from './geolocation/browserGeolocation';
import { createKeywordMockRepository } from './mock/mockRepository';
import { createMockProductSearch } from './mock/productSearch';
import { createMockStoreDirectory, mockStores } from './mock/storeDirectory';

export function createStoreStockRepository(): StoreStockRepository {
  return import.meta.env.PROD ? createDaisoStoreStockRepository() : createKeywordMockRepository();
}

export function createStoreDirectory(): StoreDirectoryPort {
  return import.meta.env.PROD ? createDaisoStoreDirectory() : createMockStoreDirectory();
}

export function createGeolocation(): GeolocationPort {
  const fetchNearby = import.meta.env.PROD ? createDaisoNearbyFetch() : async () => mockStores;
  return createBrowserGeolocation(navigator, fetchNearby);
}

export function createProductSearch(): ProductSearchPort {
  return import.meta.env.PROD ? createDaisoProductSearch() : createMockProductSearch();
}
