// src/adapters/daisomall/storeDirectory.ts
// StoreDirectoryPort (B16) over the internal /api/stores proxy. Blank/failed search → honest [] (D082 sheet
// shows no results, never crashes).
import type { StoreDirectoryPort } from '../../domain/ports';
import type { StoreContext } from '../../domain/types';

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
