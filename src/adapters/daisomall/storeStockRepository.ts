// src/adapters/daisomall/storeStockRepository.ts
// StoreStockRepository (B6) over the internal /api/availability proxy. Validates + maps; never talks to daisomall.
import { NoCatalogMatchError } from '../../domain/errors';
import type { StoreStockRepository } from '../../domain/ports';
import { mapStoreObservation } from './mapStoreObservation';
import { parseRawObservation } from './rawObservation';

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export function createDaisoStoreStockRepository(
  deps: { endpoint?: string; fetchImpl?: FetchLike } = {},
): StoreStockRepository {
  const endpoint = deps.endpoint ?? '/api/availability';
  const doFetch: FetchLike = deps.fetchImpl ?? ((url, init) => fetch(url, init));
  return {
    async query(store, term, signal) {
      const res = await doFetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ strCd: store.strCd, keyword: term.keyword, pdNo: term.pdNo }),
        signal,
      });
      if (!res.ok) throw new Error(`availability ${res.status}`); // → FAILURE path
      const json = (await res.json()) as { noMatch?: boolean; data?: unknown };
      if (json?.noMatch) throw new NoCatalogMatchError([]); // → NO_MATCH → Empty
      return mapStoreObservation(parseRawObservation(json?.data));
    },
  };
}
