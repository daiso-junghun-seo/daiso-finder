// src/adapters/newIntSelStr/newIntSelStrAdapter.ts
// The real StoreStockRepository: POST the proxied core API, take msStrVOList[0] (design spec §5), map to domain.
// Freshness/observedAt are stamped by the query runner (infra/query-cache), not here.
import { NoCatalogMatchError, UnmappableAnswerError } from '../../domain/errors';
import type { StoreStockRepository } from '../../domain/ports';
import type { StoreContext } from '../../domain/types';
import { type ProductIdentity, type RawStoreEntry, mapResponse } from './mapResponse';

// Minimal fetch surface — the real global fetch satisfies it; tests inject a stub.
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

// SHIM seam for the undocumented name/price source (Engineering §4 catalog subset). Wired in a later phase.
export interface ProductIdentityResolver {
  resolve(pdNo: string, store: StoreContext): Promise<ProductIdentity | null>;
}
// Placeholder until the catalog-subset join is wired: no identity → UnmappableAnswerError (safe fallback).
export const nullIdentityResolver: ProductIdentityResolver = {
  async resolve() {
    return null;
  },
};

export function createNewIntSelStrAdapter(deps: {
  identity: ProductIdentityResolver;
  endpoint?: string;
  fetchImpl?: FetchLike;
}): StoreStockRepository {
  const endpoint = deps.endpoint ?? '/api/stock';
  const doFetch: FetchLike = deps.fetchImpl ?? ((url, init) => fetch(url, init));
  return {
    async query(store, term, signal) {
      const res = await doFetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // UNVERIFIED (F2 → open-questions §A8): data-contract §2 lists the OBSERVED request keys as
        // keyword, pdNo, curLttd, curLitd, geolocationAgrYn, pkupYn, intCd, pageSize, currentPage —
        // strCd is NOT among them (it is a Store-identity RESPONSE field, §3). The observed endpoint
        // scopes by geolocation and returns msStrVOList[] (one row per nearby store); single-store
        // scoping by strCd is an assumption. This adapter is never constructed in production yet (only in
        // its own test); the true request contract + multi-store reconciliation must be settled with the
        // data owner before A9 wiring. Kept here only so the shape is visible for that escalation.
        body: JSON.stringify({ keyword: term.keyword, pdNo: term.pdNo, strCd: store.strCd }),
        signal,
      });
      if (!res.ok) throw new Error(`stock relay ${res.status}`); // network/relay failure → FAILURE path
      const data = (await res.json()) as { data?: { msStrVOList?: RawStoreEntry[] } };
      const entries = data?.data?.msStrVOList ?? [];
      if (entries.length === 0) throw new NoCatalogMatchError([]); // keyword matched no product → NO_MATCH → Empty
      const entry = entries[0]; // design spec §5; multi-store reconciliation deferred to live wiring
      // Narrowing (not a logic change): entries.length > 0 here, so entry is always defined.
      // Required because this repo's tsconfig sets noUncheckedIndexedAccess.
      if (!entry) throw new UnmappableAnswerError('unexpected empty store row');
      const identity = await deps.identity.resolve(entry.pdNo ?? term.pdNo ?? '', store);
      if (!identity) throw new UnmappableAnswerError('product identity unavailable'); // safe fallback, no fabrication
      return mapResponse(entry, identity);
    },
  };
}
