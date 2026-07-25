// src/domain/ports.ts
import type { AvailabilityAnswer, ProductCandidate, StoreContext } from './types';

export interface StoreStockRepository {
  query(
    store: StoreContext,
    term: { keyword?: string; pdNo?: string },
    signal?: AbortSignal,
  ): Promise<AvailabilityAnswer>;
}
export interface GeolocationPort {
  getNearbyStores(): Promise<Array<StoreContext & { distanceM: number }>>;
}
export interface RestockSubscriptionPort {
  subscribe(pdNo: string, store: StoreContext): Promise<void>;
}
export interface SearchAliasResolverPort {
  resolve(query: string): string | null;
}

// Store search by name/region for the D082 store-selection sheet. The live daisomall directory
// adapter is deferred behind this seam (open-questions.md B16/A9) — only the mock exists today.
export interface StoreDirectoryPort {
  searchStores(query: string): Promise<StoreContext[]>;
}

// Literal product search for the pre-answer candidate list (fallback-first; no AI confidence model).
export interface ProductSearchPort {
  search(keyword: string): Promise<ProductCandidate[]>;
}

// Barcode scan entry (Interface §3, entry path 2). The adapter owns the camera and the decoder; the
// port speaks only outcomes and NEVER throws — every failure must reach the overlay as a variant so the
// flow can end with a concrete next step (Anti-goal 5). Aborting the signal stops the camera.
export type ScanOutcome =
  | { kind: 'decoded'; value: string }
  | { kind: 'permissionDenied' }
  | { kind: 'unsupported' }
  | { kind: 'cancelled' }
  | { kind: 'failed' };

export interface ScanTarget {
  video: HTMLVideoElement;
}

export interface ScannerPort {
  scan(target: ScanTarget, signal: AbortSignal): Promise<ScanOutcome>;
}
