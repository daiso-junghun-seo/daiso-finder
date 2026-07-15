import { UnmappableAnswerError } from '../../domain/errors';
import { type Scenario, mockAnswers } from '../mock/fixtures';
import { type RawStoreEntry, mapResponse } from './mapResponse';
import { identityFixture, rawFixtures } from './rawFixtures';

const scenarios: Scenario[] = [
  'inStock',
  'inStockLowQty',
  'inStockMultiLocation',
  'noLocation',
  'temporarilyOut',
  'discontinued',
  'notCarried',
  'restockArriving',
  'franchise',
];

for (const s of scenarios) {
  test(`parity: mapping the ${s} raw entry reproduces the canonical mock answer`, () => {
    expect(mapResponse(rawFixtures[s], identityFixture)).toEqual(mockAnswers[s]);
  });
}

test('an unmapped field combination throws UnmappableAnswerError (safe fallback, never a fabricated Success)', () => {
  // franchise store (directYn 'N') WITH a location but qty 0 and sleStsCd null: matches no rule.
  const weird: RawStoreEntry = {
    strCd: '1',
    pdNo: 'P1',
    directYn: 'N',
    sleStsCd: null,
    qty: '0',
    stairNoList: ['3'],
    zoneNoList: ['9'],
    mrkGdsYn: 'N',
    lchDay: '',
  };
  expect(() => mapResponse(weird, identityFixture)).toThrow(UnmappableAnswerError);
});
