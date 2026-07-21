// src/adapters/mock/storeDirectory.ts — mock store directory behind StoreDirectoryPort (B16).
// The three stores mirror the Bible store-selection mockup (Interface §4), already distance-sorted.
import type { StoreDirectoryPort } from '../../domain/ports';
import type { StoreContext } from '../../domain/types';

export const mockStores: Array<StoreContext & { distanceM: number }> = [
  { strCd: '001', strNm: '명동역점', distanceM: 120 },
  { strCd: '002', strNm: '명동중앙점', distanceM: 340 },
  { strCd: '003', strNm: '을지로점', distanceM: 600 },
];

export function createMockStoreDirectory(): StoreDirectoryPort {
  return {
    async searchStores(query) {
      const q = query.trim();
      if (!q) return [];
      return mockStores
        .filter((s) => s.strNm.includes(q))
        .map(({ strCd, strNm }) => ({ strCd, strNm }));
    },
  };
}
