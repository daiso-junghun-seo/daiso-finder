import { UnmappableAnswerError } from '../../domain/errors';
import { type Scenario, mockAnswers } from '../mock/fixtures';
import { mapStoreObservation } from './mapStoreObservation';
import { observationFixtures } from './observationFixtures';
import type { RawStoreObservation } from './rawObservation';

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
  test(`parity: mapping the ${s} observation reproduces the canonical mock answer`, () => {
    expect(mapStoreObservation(observationFixtures[s])).toEqual(mockAnswers[s]);
  });
}

test('restockArriving formats lchDay from ISO to "M월 D일"', () => {
  expect(mapStoreObservation(observationFixtures.restockArriving)).toEqual({
    kind: 'restockArriving',
    productName: '리빙 밀폐용기 1.2L',
    price: 2000,
    lchDay: '7월 15일',
  });
});

test('an unmapped combination throws UnmappableAnswerError (safe fallback, never a fabricated Success)', () => {
  const weird: RawStoreObservation = {
    ...observationFixtures.franchise,
    directYn: 'N',
    sleStsCd: null,
    stck: '0',
    locations: [{ floor: '3', zone: '9' }],
  };
  expect(() => mapStoreObservation(weird)).toThrow(UnmappableAnswerError);
});

test('a direct store with unfetched stock (stck null) is refused, not read as notCarried (§4.1 invariant guard)', () => {
  expect(() => mapStoreObservation({ ...observationFixtures.notCarried, stck: null })).toThrow(
    UnmappableAnswerError,
  );
});
