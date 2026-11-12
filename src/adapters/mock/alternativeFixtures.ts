// src/adapters/mock/alternativeFixtures.ts
// Flow 3 DEV/E2E fixtures. Group B is mock-only by decision (§B50-2); these rows exist so the surface,
// E2E and axe can prove the nearby branch the day a live adapter is registered.
import type { NearbyAlternative, SimilarAlternative } from '../../domain/types';

export type AltScenario =
  | 'default' // A rows, B withheld (production shape)
  | 'nearby' // A + B rows, one closed today
  | 'aEmpty' // A empty, B withheld → degraded Empty
  | 'aFailed' // A failed, B withheld → Error
  | 'bothEmpty' // A empty + B empty → Empty with mall
  | 'bothFailed' // A failed + B failed → Error
  | 'slow' // both pending past the skeleton moment
  | 'bSlow'; // A first, B progressive

export const mockSimilarRows: SimilarAlternative[] = [
  {
    pdNo: '20001',
    productName: '리빙 밀폐용기 1.4L',
    price: 3000,
    qtyUpperBound: 12,
    locations: [{ floor: '11', zone: '56' }],
    imageUrl: 'https://cdn.daisomall.co.kr/file/PD/test.jpg',
  },
  {
    pdNo: '20002',
    productName: '주방정리 바구니',
    price: 2000,
    qtyUpperBound: 3,
    locations: [{ floor: '2', zone: '14' }],
  },
];

// Vendor order is distance ascending with closed stores after open ones (spec §2.2).
export const mockNearbyRows: NearbyAlternative[] = [
  {
    strCd: '11043',
    strNm: '을지로입구점',
    distanceM: 850,
    address: '서울 중구 을지로 2',
    closingTime: '21:00',
    closedToday: false,
    qtyUpperBound: 2,
  },
  {
    strCd: '10523',
    strNm: '명동역점',
    distanceM: 1200,
    address: '서울 중구 명동길 1',
    closingTime: '22:00',
    closedToday: false,
    qtyUpperBound: 5,
  },
  {
    strCd: '10803',
    strNm: '남대문점',
    distanceM: 2100,
    address: '서울 중구 남대문로 3',
    closingTime: '20:00',
    closedToday: true,
    qtyUpperBound: 1,
  },
];

export const ALT_SCENARIOS: readonly AltScenario[] = [
  'default',
  'nearby',
  'aEmpty',
  'aFailed',
  'bothEmpty',
  'bothFailed',
  'slow',
  'bSlow',
];

// `?alt=` is DEV-only; production ignores it (the caller checks import.meta.env.DEV).
export function parseAltScenario(search: string): AltScenario | null {
  const value = new URLSearchParams(search).get('alt');
  return ALT_SCENARIOS.includes(value as AltScenario) ? (value as AltScenario) : null;
}
