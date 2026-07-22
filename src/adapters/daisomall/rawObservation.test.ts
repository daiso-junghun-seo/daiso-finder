import { UnmappableAnswerError } from '../../domain/errors';
import { parseRawObservation } from './rawObservation';

const valid = {
  strCd: '10803',
  pdNo: '19987',
  productName: '리빙 밀폐용기 1.2L',
  price: 2000,
  directYn: 'Y',
  stck: '50',
  sleStsCd: '1',
  mrkGdsYn: null,
  lchDay: null,
  locations: [{ floor: '11', zone: '56' }],
};

test('parseRawObservation accepts a well-formed record', () => {
  expect(parseRawObservation(valid)).toEqual(valid);
});

test('null stock fields are accepted (franchise deliberately-unfetched shape)', () => {
  const franchise = { ...valid, directYn: 'N', stck: null, sleStsCd: null, locations: [] };
  expect(parseRawObservation(franchise)).toEqual(franchise);
});

test('a non-object, missing identity, or wrong-typed field throws UnmappableAnswerError', () => {
  expect(() => parseRawObservation(null)).toThrow(UnmappableAnswerError);
  expect(() => parseRawObservation({ ...valid, pdNo: 123 })).toThrow(UnmappableAnswerError);
  expect(() => parseRawObservation({ ...valid, price: '2000' })).toThrow(UnmappableAnswerError);
  expect(() => parseRawObservation({ ...valid, stck: 50 })).toThrow(UnmappableAnswerError);
  expect(() => parseRawObservation({ ...valid, locations: [{ floor: '1' }] })).toThrow(
    UnmappableAnswerError,
  );
  expect(() => parseRawObservation({ ...valid, locations: 'x' })).toThrow(UnmappableAnswerError);
});
