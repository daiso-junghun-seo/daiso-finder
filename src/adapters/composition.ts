// src/adapters/composition.ts — single production wiring point. PROD builds the real /api adapters; DEV/test
// keep the mocks so `vite dev` + Vitest + the Playwright dev sweep run without a live /api server.
import { publishNetwork } from '../diagnostics/bus';
import type {
  GeolocationPort,
  ProductSearchPort,
  ScannerPort,
  StoreDirectoryPort,
  StoreStockRepository,
} from '../domain/ports';
import { createBrowserScanner } from './barcode/browserScanner';
import { createDaisoProductSearch } from './daisomall/productSearchRepository';
import { createDaisoNearbyFetch, createDaisoStoreDirectory } from './daisomall/storeDirectory';
import { createDaisoStoreStockRepository } from './daisomall/storeStockRepository';
import { createBrowserGeolocation } from './geolocation/browserGeolocation';
import { createKeywordMockRepository } from './mock/mockRepository';
import { createMockProductSearch } from './mock/productSearch';
import { createMockScanner } from './mock/scanner';
import { createMockStoreDirectory, mockStores } from './mock/storeDirectory';

// The widest of the vendor FetchLike shapes: the optional `signal` and the concrete `Response` make one
// implementation assignable to all of them (see the task note). Declared here rather than imported so
// composition.ts does not depend on one adapter's type for the rest. Used by stores/nearby/search — the
// availability adapter instruments itself instead (see createStoreStockRepository below).
type DiagnosticFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<Response>;

// Observation only: the response object is returned by identity and a failure re-throws the original
// error, so nothing downstream can behave differently because diagnostics are on.
export function createDiagnosticFetch(now: () => number = Date.now): DiagnosticFetch {
  return async (url, init) => {
    const started = now();
    try {
      const response = await fetch(url, init);
      publishNetwork({ path: url, status: response.status, ms: now() - started });
      return response;
    } catch (err) {
      publishNetwork({ path: url, status: 'error', ms: now() - started });
      throw err;
    }
  };
}

const diagnosticFetch = createDiagnosticFetch();

// Deliberately NOT wrapped in createDiagnosticFetch: this adapter races AVAILABILITY_ATTEMPTS identical
// reads and publishes its OWN per-attempt entries (attempt index, timeout vs cancelled-duplicate, error
// body) — facts the generic wrapper cannot see, since it observes only url/status/duration and cannot tell
// a timeout from a loser's abort. Wrapping it as well would double-log every attempt.
export function createStoreStockRepository(): StoreStockRepository {
  return import.meta.env.PROD ? createDaisoStoreStockRepository() : createKeywordMockRepository();
}

export function createStoreDirectory(): StoreDirectoryPort {
  return import.meta.env.PROD
    ? createDaisoStoreDirectory({ fetchImpl: diagnosticFetch })
    : createMockStoreDirectory();
}

export function createGeolocation(): GeolocationPort {
  const fetchNearby = import.meta.env.PROD
    ? createDaisoNearbyFetch({ fetchImpl: diagnosticFetch })
    : async () => mockStores;
  return createBrowserGeolocation(navigator, fetchNearby);
}

export function createProductSearch(): ProductSearchPort {
  return import.meta.env.PROD
    ? createDaisoProductSearch({ fetchImpl: diagnosticFetch })
    : createMockProductSearch();
}

export function createScanner(): ScannerPort {
  return import.meta.env.PROD ? createBrowserScanner() : createMockScanner();
}
