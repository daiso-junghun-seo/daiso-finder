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
