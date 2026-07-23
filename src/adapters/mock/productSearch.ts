// src/adapters/mock/productSearch.ts
// DEV/test candidate fixtures: substring-match on name. "밀폐용기" → 3 (multi → candidates path);
// exact "리빙 밀폐용기 1.2L" → 1 (→ availability, since createKeywordMockRepository matches it too);
// unmatched → [] (→ NO_MATCH).
import type { ProductSearchPort } from '../../domain/ports';
import type { ProductCandidate } from '../../domain/types';

// pdNo '19987' / name '리빙 밀폐용기 1.2L' intentionally match mockAnswers.inStock's base fixture
// (src/adapters/mock/fixtures.ts) — picking this candidate in Task 4 re-queries the keyword mock repo
// and lands on inStock.
export const mockCandidates: ProductCandidate[] = [
  {
    pdNo: '19987',
    name: '리빙 밀폐용기 1.2L',
    price: 2000,
    imageUrl: 'https://cdn.daisomall.co.kr/file/PD/test1.jpg',
  },
  {
    pdNo: '19988',
    name: '리빙 밀폐용기 2.0L',
    price: 3000,
    imageUrl: 'https://cdn.daisomall.co.kr/file/PD/test2.jpg',
  },
  {
    pdNo: '19989',
    name: '밀폐용기 6P 세트',
    price: 5000,
    imageUrl: 'https://cdn.daisomall.co.kr/file/PD/test3.jpg',
  },
];

export function createMockProductSearch(): ProductSearchPort {
  return {
    async search(keyword) {
      const q = keyword.trim();
      if (!q) return [];
      return mockCandidates.filter((c) => c.name.includes(q));
    },
  };
}
