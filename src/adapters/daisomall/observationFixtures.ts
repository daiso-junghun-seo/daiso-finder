// src/adapters/daisomall/observationFixtures.ts
// One RawStoreObservation per canonical scenario — the ported parity oracle for the 6-state mapping
// (replaces newIntSelStr/rawFixtures.ts). Product identity mirrors the mock name/price.
import type { Scenario } from '../mock/fixtures';
import type { RawStoreObservation } from './rawObservation';

const base = {
  strCd: '10803',
  pdNo: '19987',
  productName: '리빙 밀폐용기 1.2L',
  price: 2000,
  imageUrl: null,
};

export const observationFixtures: Record<Scenario, RawStoreObservation> = {
  inStock: {
    ...base,
    directYn: 'Y',
    sleStsCd: '1',
    stck: '50',
    mrkGdsYn: null,
    lchDay: null,
    locations: [{ floor: '11', zone: '56' }],
    imageUrl: 'https://cdn.daisomall.co.kr/file/PD/test.jpg',
  },
  inStockLowQty: {
    ...base,
    directYn: 'Y',
    sleStsCd: '1',
    stck: '3',
    mrkGdsYn: null,
    lchDay: null,
    locations: [{ floor: '11', zone: '56' }],
  },
  inStockMultiLocation: {
    ...base,
    directYn: 'Y',
    sleStsCd: '1',
    stck: '50',
    mrkGdsYn: null,
    lchDay: null,
    locations: [
      { floor: '11', zone: '56' },
      { floor: '2', zone: '14' },
    ],
  },
  noLocation: {
    ...base,
    directYn: 'Y',
    sleStsCd: '1',
    stck: '50',
    mrkGdsYn: null,
    lchDay: null,
    locations: [],
  },
  temporarilyOut: {
    ...base,
    directYn: 'Y',
    sleStsCd: '1',
    stck: '0',
    mrkGdsYn: null,
    lchDay: null,
    locations: [],
  },
  discontinued: {
    ...base,
    directYn: 'Y',
    sleStsCd: '9',
    stck: '0',
    mrkGdsYn: null,
    lchDay: null,
    locations: [],
  },
  notCarried: {
    ...base,
    directYn: 'Y',
    sleStsCd: null,
    stck: '0',
    mrkGdsYn: null,
    lchDay: null,
    locations: [],
  },
  restockArriving: {
    ...base,
    directYn: 'Y',
    sleStsCd: null,
    stck: '0',
    mrkGdsYn: 'Y',
    lchDay: '2026-07-15',
    locations: [],
  },
  franchise: {
    ...base,
    directYn: 'N',
    sleStsCd: null,
    stck: null,
    mrkGdsYn: null,
    lchDay: null,
    locations: [],
  },
};
