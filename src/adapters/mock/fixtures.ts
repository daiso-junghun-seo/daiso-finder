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

export const mockProductName = '리빙 밀폐용기 1.2L';
export const mockPdNo = '19987';
const NAME = mockProductName;
const PDNO = mockPdNo;
export const mockAnswers: Record<Scenario, AvailabilityAnswer> = {
  inStock: {
    kind: 'inStock',
    pdNo: PDNO,
    productName: NAME,
    price: 2000,
    locations: [{ floor: '11', zone: '56' }],
    qtyUpperBound: 50,
    imageUrl: 'https://cdn.daisomall.co.kr/file/PD/test.jpg',
  },
  inStockLowQty: {
    kind: 'inStock',
    pdNo: PDNO,
    productName: NAME,
    price: 2000,
    locations: [{ floor: '11', zone: '56' }],
    qtyUpperBound: 3,
  },
  inStockMultiLocation: {
    kind: 'inStock',
    pdNo: PDNO,
    productName: NAME,
    price: 2000,
    locations: [
      { floor: '11', zone: '56' },
      { floor: '2', zone: '14' },
    ],
    qtyUpperBound: 50,
  },
  noLocation: {
    kind: 'inStock',
    pdNo: PDNO,
    productName: NAME,
    price: 2000,
    locations: [],
    qtyUpperBound: 50,
  },
  temporarilyOut: {
    kind: 'temporarilyOut',
    pdNo: PDNO,
    productName: NAME,
    price: 2000,
    restockOfferable: true,
  },
  discontinued: { kind: 'discontinued', pdNo: PDNO, productName: NAME, price: 2000 },
  notCarried: { kind: 'notCarried', pdNo: PDNO, productName: NAME },
  restockArriving: {
    kind: 'restockArriving',
    pdNo: PDNO,
    productName: NAME,
    price: 2000,
    lchDay: '7월 15일',
  },
  franchise: { kind: 'franchiseUndeterminable', pdNo: PDNO, productName: NAME },
};
