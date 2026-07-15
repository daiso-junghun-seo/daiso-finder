// src/domain/ports.ts
import type { AvailabilityAnswer, StoreContext } from './types';

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
