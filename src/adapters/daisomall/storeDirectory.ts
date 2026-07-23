// src/adapters/daisomall/storeDirectory.ts
// StoreDirectoryPort (B16) over the internal /api/stores proxy. Blank/failed search → honest [] (D082 sheet
// shows no results, never crashes).
import type { StoreDirectoryPort } from '../../domain/ports';
import type { StoreContext } from '../../domain/types';
import type { NearbyStoreFetch } from '../geolocation/browserGeolocation';

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export function createDaisoStoreDirectory(
  deps: { endpoint?: string; fetchImpl?: FetchLike } = {},
): StoreDirectoryPort {
  const endpoint = deps.endpoint ?? '/api/stores';
  const doFetch: FetchLike = deps.fetchImpl ?? ((url, init) => fetch(url, init));
  return {
    async searchStores(query) {
      const q = query.trim();
      if (!q) return [];
      try {
        const res = await doFetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ query: q }),
        });
        if (!res.ok) return [];
        const json = (await res.json()) as { stores?: Array<{ strCd?: unknown; strNm?: unknown }> };
        const stores: StoreContext[] = (json?.stores ?? [])
          .filter(
            (s): s is { strCd: string; strNm: string } =>
              typeof s?.strCd === 'string' && typeof s?.strNm === 'string',
          )
          .map((s) => ({ strCd: s.strCd, strNm: s.strNm }));
        return stores;
      } catch {
        return []; // network failure → honest empty
      }
    },
  };
}

// Live nearby-store fetch behind GeolocationPort (A9/B16). km→m conversion happens here (adapter
// layer maps raw upstream units into the domain-facing distanceM), not in src/ui — adapters must not
// depend on the UI layer.
export function createDaisoNearbyFetch(
  deps: { endpoint?: string; fetchImpl?: FetchLike } = {},
): NearbyStoreFetch {
  const endpoint = deps.endpoint ?? '/api/stores';
  const doFetch: FetchLike = deps.fetchImpl ?? ((url, init) => fetch(url, init));
  return async (lat, lng) => {
    try {
      const res = await doFetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lat, lng }),
      });
      if (!res.ok) return [];
      const json = (await res.json()) as {
        stores?: Array<{ strCd?: unknown; strNm?: unknown; km?: unknown }>;
      };
      return (json?.stores ?? [])
        .filter(
          (s): s is { strCd: string; strNm: string; km: number } =>
            typeof s?.strCd === 'string' &&
            typeof s?.strNm === 'string' &&
            typeof s?.km === 'number' &&
            Number.isFinite(s.km),
        )
        .map((s) => ({ strCd: s.strCd, strNm: s.strNm, distanceM: Math.round(s.km * 1000) }));
    } catch {
      return [];
    }
  };
}
