// src/adapters/daisomall/productSearchRepository.ts
// ProductSearchPort over the internal /api/search proxy. Blank/failed search → honest [] (mirrors
// storeDirectory.ts's honest-empty pattern — never crashes the candidate flow).
import type { ProductSearchPort } from '../../domain/ports';
import type { ProductCandidate } from '../../domain/types';

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export function createDaisoProductSearch(
  deps: { endpoint?: string; fetchImpl?: FetchLike } = {},
): ProductSearchPort {
  const endpoint = deps.endpoint ?? '/api/search';
  const doFetch: FetchLike = deps.fetchImpl ?? ((url, init) => fetch(url, init));
  return {
    async search(keyword) {
      const q = keyword.trim();
      if (!q) return [];
      try {
        const res = await doFetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ keyword: q }),
        });
        if (!res.ok) return [];
        const json = (await res.json()) as {
          candidates?: Array<{
            pdNo?: unknown;
            name?: unknown;
            price?: unknown;
            imageUrl?: unknown;
          }>;
        };
        return (json?.candidates ?? [])
          .filter(
            (c): c is { pdNo: string; name: string; price: number; imageUrl: string | null } =>
              typeof c?.pdNo === 'string' &&
              typeof c?.name === 'string' &&
              typeof c?.price === 'number',
          )
          .map(
            (c): ProductCandidate => ({
              pdNo: c.pdNo,
              name: c.name,
              price: c.price,
              ...(typeof c.imageUrl === 'string' ? { imageUrl: c.imageUrl } : {}),
            }),
          );
      } catch {
        return []; // network failure → honest empty
      }
    },
  };
}
