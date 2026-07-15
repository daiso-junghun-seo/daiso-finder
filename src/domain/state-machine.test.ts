// src/domain/state-machine.test.ts
import { initialState, reduce } from './state-machine';
import type { AvailabilityAnswer, Freshness } from './types';

const live: Freshness = { class: 'live', observedAt: 1000 };
const loading = reduce(initialState, { type: 'SUBMIT', query: '밀폐용기' });
const answer = (a: AvailabilityAnswer) =>
  reduce(loading, { type: 'RESULT', answer: a, freshness: live });

test('default + SUBMIT → loading', () =>
  expect(loading).toEqual({ state: 'loading', query: '밀폐용기', slow: false }));
test('loading + SLOW → loading slow', () =>
  expect(reduce(loading, { type: 'SLOW' })).toMatchObject({ state: 'loading', slow: true }));
test('in stock with location → success', () =>
  expect(
    answer({
      kind: 'inStock',
      productName: 'X',
      price: 2000,
      locations: [{ floor: '11', zone: '56' }],
      qtyUpperBound: 50,
    }).state,
  ).toBe('success'));
test('in stock without location → partial(locationMissing)', () =>
  expect(
    answer({ kind: 'inStock', productName: 'X', price: 2000, locations: [], qtyUpperBound: 50 }),
  ).toMatchObject({ state: 'partial', trigger: 'locationMissing' }));
test('temporarily out → success', () =>
  expect(
    answer({ kind: 'temporarilyOut', productName: 'X', price: 2000, restockOfferable: true }).state,
  ).toBe('success'));
test('franchise → partial(franchise)', () =>
  expect(answer({ kind: 'franchiseUndeterminable', productName: 'X' })).toMatchObject({
    state: 'partial',
    trigger: 'franchise',
  }));
test('no match → empty', () =>
  expect(
    reduce(loading, { type: 'NO_MATCH', query: '락앤락같은통', suggestions: ['밀폐용기'] }),
  ).toMatchObject({ state: 'empty', suggestions: ['밀폐용기'] }));
test('failure within threshold → error(cached)', () => {
  const a: AvailabilityAnswer = {
    kind: 'inStock',
    productName: 'X',
    price: 2000,
    locations: [{ floor: '11', zone: '56' }],
    qtyUpperBound: 50,
  };
  expect(
    reduce(loading, {
      type: 'FAILURE',
      cache: {
        kind: 'withinThreshold',
        answer: a,
        freshness: { class: 'cachedWithinThreshold', observedAt: 5 },
      },
    }),
  ).toMatchObject({ state: 'error', variant: 'cached' });
});
test('failure beyond threshold → partial(staleCache)', () => {
  const a: AvailabilityAnswer = {
    kind: 'inStock',
    productName: 'X',
    price: 2000,
    locations: [{ floor: '11', zone: '56' }],
    qtyUpperBound: 50,
  };
  expect(
    reduce(loading, {
      type: 'FAILURE',
      cache: {
        kind: 'beyondThreshold',
        answer: a,
        freshness: { class: 'cachedBeyondThreshold', observedAt: 5 },
      },
    }),
  ).toMatchObject({ state: 'partial', trigger: 'staleCache' });
});
test('failure no cache → error(noCache)', () =>
  expect(reduce(loading, { type: 'FAILURE', cache: { kind: 'noCache' } })).toEqual({
    state: 'error',
    variant: 'noCache',
  }));
test('any answer + SUBMIT → loading (re-search)', () => {
  const s = answer({
    kind: 'inStock',
    productName: 'X',
    price: 2000,
    locations: [{ floor: '11', zone: '56' }],
    qtyUpperBound: 50,
  });
  expect(reduce(s, { type: 'SUBMIT', query: '수납 바구니' }).state).toBe('loading');
});
test('CHANGE_STORE → default', () =>
  expect(
    reduce(loading, { type: 'CHANGE_STORE', store: { strCd: '1', strNm: '명동역점' } }),
  ).toEqual({ state: 'default' }));
