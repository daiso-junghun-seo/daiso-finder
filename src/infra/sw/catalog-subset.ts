// src/infra/sw/catalog-subset.ts
import type { StoreStockRepository } from '../../domain/ports';
import type { StoreContext } from '../../domain/types';
import type { CacheStorage } from '../cache-storage';

// Populated in the BACKGROUND after Store Context is set; never on the first-answer critical path.
// Entry lifetime is governed by the freshness policy (D061), not an independent Workbox TTL.
export async function populateCatalogSubset(deps: {
  store: StoreContext;
  skus: string[];
  repo: StoreStockRepository;
  cache: CacheStorage;
  now: () => number;
}): Promise<number> {
  let written = 0;
  for (const sku of deps.skus) {
    try {
      const answer = await deps.repo.query(deps.store, { pdNo: sku });
      await deps.cache.writeAnswer(`${deps.store.strCd}:${sku}`, answer, deps.now());
      written += 1;
    } catch {
      /* background best-effort; never blocks the first answer */
    }
  }
  return written;
}
