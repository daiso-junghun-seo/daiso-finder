// src/adapters/newIntSelStr/rawFixtures.ts
// One representative raw newIntSelStr per-store entry per scenario. Only data-contract §3 documented fields.
// The state discriminators (qty/sleStsCd/directYn/mrkGdsYn/stair/zone) are documented; any non-discriminating
// sleStsCd value here is a plausible placeholder (exact in-stock/temporarily-out codes are A8-unresolved) and is
// NOT read by the mapping when an earlier rule fires. Product name/price live in identityFixture (the shim).
import type { Scenario } from '../mock/fixtures';
import type { ProductIdentity, RawStoreEntry } from './mapResponse';

export const identityFixture: ProductIdentity = { productName: '리빙 밀폐용기 1.2L', price: 2000 };

const base = { strCd: '1', pdNo: 'P1', mrkGdsYn: 'N', lchDay: '' } as const;

export const rawFixtures: Record<Scenario, RawStoreEntry> = {
  inStock: {
    ...base,
    directYn: 'Y',
    sleStsCd: '1',
    qty: '50',
    stairNoList: ['11'],
    zoneNoList: ['56'],
  },
  inStockLowQty: {
    ...base,
    directYn: 'Y',
    sleStsCd: '1',
    qty: '3',
    stairNoList: ['11'],
    zoneNoList: ['56'],
  },
  inStockMultiLocation: {
    ...base,
    directYn: 'Y',
    sleStsCd: '1',
    qty: '50',
    stairNoList: ['11', '2'],
    zoneNoList: ['56', '14'],
  },
  noLocation: { ...base, directYn: 'Y', sleStsCd: '1', qty: '50', stairNoList: [], zoneNoList: [] },
  temporarilyOut: {
    ...base,
    directYn: 'Y',
    sleStsCd: '1',
    qty: '0',
    stairNoList: [],
    zoneNoList: [],
  },
  discontinued: {
    ...base,
    directYn: 'Y',
    sleStsCd: '9',
    qty: '0',
    stairNoList: [],
    zoneNoList: [],
  },
  notCarried: { ...base, directYn: 'Y', sleStsCd: null, qty: '0', stairNoList: [], zoneNoList: [] },
  restockArriving: {
    ...base,
    directYn: 'Y',
    sleStsCd: null,
    qty: '0',
    stairNoList: [],
    zoneNoList: [],
    mrkGdsYn: 'Y',
    lchDay: '7월 15일',
  },
  franchise: { ...base, directYn: 'N', sleStsCd: null, qty: '0', stairNoList: [], zoneNoList: [] },
};
