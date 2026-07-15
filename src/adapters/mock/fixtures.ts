// src/adapters/mock/fixtures.ts
import type { AvailabilityAnswer } from '../../domain/types';

export type Scenario =
  | 'inStock'
  | 'inStockLowQty'
  | 'inStockMultiLocation'
  | 'noLocation'
  | 'temporarilyOut'
  | 'discontinued'
  | 'notCarried'
  | 'restockArriving'
  | 'franchise';

const NAME = '리빙 밀폐용기 1.2L';
export const mockAnswers: Record<Scenario, AvailabilityAnswer> = {
  inStock: {
    kind: 'inStock',
    productName: NAME,
    price: 2000,
    locations: [{ floor: '11', zone: '56' }],
    qtyUpperBound: 50,
  },
  inStockLowQty: {
    kind: 'inStock',
    productName: NAME,
    price: 2000,
    locations: [{ floor: '11', zone: '56' }],
    qtyUpperBound: 3,
  },
  inStockMultiLocation: {
    kind: 'inStock',
    productName: NAME,
    price: 2000,
    locations: [
      { floor: '11', zone: '56' },
      { floor: '2', zone: '14' },
    ],
    qtyUpperBound: 50,
  },
  noLocation: { kind: 'inStock', productName: NAME, price: 2000, locations: [], qtyUpperBound: 50 },
  temporarilyOut: {
    kind: 'temporarilyOut',
    productName: NAME,
    price: 2000,
    restockOfferable: true,
  },
  discontinued: { kind: 'discontinued', productName: NAME, price: 2000 },
  notCarried: { kind: 'notCarried', productName: NAME },
  restockArriving: { kind: 'restockArriving', productName: NAME, price: 2000, lchDay: '7월 15일' },
  franchise: { kind: 'franchiseUndeterminable', productName: NAME },
};
