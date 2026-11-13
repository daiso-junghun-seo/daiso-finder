// src/adapters/composition.ts — single production wiring point. PROD builds the real /api adapters; DEV/test
// keep the mocks so `vite dev` + Vitest + the Playwright dev sweep run without a live /api server.
import { publishNetwork } from '../diagnostics/bus';
import { isDiagnosticsEnabled, resolveZoomOverride } from '../diagnostics/enabled';
import { readServerTiming } from '../diagnostics/serverTiming';
import type {
  AlternativeRepository,
  GeolocationPort,
  ProductSearchPort,
  ScannerPort,
  StoreDirectoryPort,
  StoreStockRepository,
} from '../domain/ports';
import { createDaisoProductSearch } from './daisomall/productSearchRepository';
import { createDaisoNearbyFetch, createDaisoStoreDirectory } from './daisomall/storeDirectory';
import { createBrowserGeolocation } from './geolocation/browserGeolocation';
import { type AltScenario, parseAltScenario } from './mock/alternativeFixtures';
import { createMockAlternativeRepository } from './mock/alternativeRepository';
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
      publishNetwork({
        path: url,
        status: response.status,
        ms: now() - started,
        upstream: readServerTiming(response) ?? undefined,
      });
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
//
// PROD keeps the live adapter (and its raw parser) out of the entry chunk: the code is only needed once
// the shopper submits a query, so it loads as its own chunk. The load STARTS here, in the same turn the
// repository is created (module scope, before first paint), so the fetch runs in parallel with the entry
// and the first query usually finds it already resolved. A failed chunk is not cached: the next query
// retries, and the caller sees its own normal error path. The warm-up's rejection is swallowed — the
// first query is where a load failure must be reported, not an unhandled rejection at startup.
export function createStoreStockRepository(): StoreStockRepository {
  if (!import.meta.env.PROD) return createKeywordMockRepository();

  let repository: Promise<StoreStockRepository> | null = null;
  const load = () => {
    repository ??= import('./daisomall/storeStockRepository')
      .then((module) => module.createDaisoStoreStockRepository())
      .catch((error) => {
        repository = null;
        throw error;
      });
    return repository;
  };
  void load().catch(() => {});
  return {
    query: (store, term, signal) => load().then((repo) => repo.query(store, term, signal)),
  };
}

// Flow 3: the live adapter answers Group A only; Group B stays withheld by the entry matrix until the
// nearby data questions close (§B50-2). DEV selects the ?alt= fixture, read once here so the query and
// the entry override agree on the same scenario.
//
// PROD loads the live adapter (and its raw parser) on the first query, not at module evaluation: the
// whole Flow 3 graph is a tap-time chunk, and a static import here would drag it back into the entry.
// A failed chunk is not cached — the surface's retry starts a fresh load.
export function createAlternativeRepository(): AlternativeRepository {
  if (!import.meta.env.PROD) {
    return createMockAlternativeRepository(currentDevAltScenario() ?? 'default');
  }
  let repository: Promise<AlternativeRepository> | null = null;
  const load = () => {
    repository ??= import('./daisomall/alternativeRepository')
      .then((module) => module.createDaisoAlternativeRepository({ fetchImpl: diagnosticFetch }))
      .catch((error) => {
        repository = null;
        throw error;
      });
    return repository;
  };
  return {
    querySimilar: (store, term, signal) =>
      load().then((repo) => repo.querySimilar(store, term, signal)),
    queryNearby: (store, pdNo, signal) =>
      load().then((repo) => repo.queryNearby(store, pdNo, signal)),
  };
}

export function currentDevAltScenario(): AltScenario | null {
  if (import.meta.env.PROD || typeof window === 'undefined') return null;
  return parseAltScenario(window.location.search);
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
  if (!import.meta.env.PROD) return createMockScanner();

  // Resolve the URL-derived override HERE, in the same synchronous turn that used to hand back a
  // scanner: the adapter's discipline is that every capability arrives through ScannerDeps, and this
  // is still the only place in the app that knows about the URL. Deferring the read until the chunk
  // lands would let a navigation between tap and scan change what the camera is told.
  const zoomOverride =
    typeof window === 'undefined'
      ? null
      : resolveZoomOverride(window.location.search, isDiagnosticsEnabled());

  // The camera pipeline + decoder is the scan entry's largest dependency and is needed only after the
  // shopper taps 바코드 스캔, so PROD loads it on the first scan() instead of at module evaluation.
  // A failed chunk is NOT cached: the next scan retries, and the overlay sees the same cancelled/
  // failed outcomes it already renders. Concurrent scans share one load.
  let scanner: Promise<ScannerPort> | null = null;
  return {
    scan(target, signal) {
      scanner ??= import('./barcode/browserScanner')
        .then((module) => module.createBrowserScanner({ zoomOverride }))
        .catch((error) => {
          scanner = null;
          throw error;
        });
      return scanner.then(
        // An abort while the chunk was loading means the shopper already closed the overlay; return
        // cancelled without touching the camera.
        (port) => (signal.aborted ? { kind: 'cancelled' as const } : port.scan(target, signal)),
        () => ({ kind: signal.aborted ? ('cancelled' as const) : ('failed' as const) }),
      );
    },
  };
}
