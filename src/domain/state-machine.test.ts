// src/domain/state-machine.test.ts
import { mockAnswers } from '../adapters/mock/fixtures';
import { initialState, reduce } from './state-machine';
import type { AvailabilityAnswer, Freshness, ProductCandidate } from './types';

const live: Freshness = { class: 'live', observedAt: 1000 };
const loading = reduce(initialState, { type: 'SUBMIT', query: '밀폐용기' });
const answer = (a: AvailabilityAnswer) =>
  reduce(loading, { type: 'RESULT', answer: a, freshness: live });

test('default + SUBMIT → loading', () =>
  expect(loading).toEqual({ state: 'loading', query: '밀폐용기', slow: false }));
test('loading + SLOW → loading slow', () =>
  expect(reduce(loading, { type: 'SLOW' })).toMatchObject({ state: 'loading', slow: true }));
test('SLOW outside loading is a no-op', () => {
  const success = answer({
    kind: 'inStock',
    productName: 'X',
    price: 2000,
    locations: [{ floor: '11', zone: '56' }],
    qtyUpperBound: 50,
  });
  expect(reduce(success, { type: 'SLOW' })).toBe(success);
});
test('DISMISS_AI is a no-op', () => {
  const success = answer({ kind: 'franchiseUndeterminable', productName: 'X' });
  expect(reduce(success, { type: 'DISMISS_AI' })).toBe(success);
});
test('RESULT outside loading does not invent a query', () => {
  const next = reduce(initialState, {
    type: 'RESULT',
    answer: { kind: 'temporarilyOut', productName: 'X', price: 2000, restockOfferable: true },
    freshness: live,
  });
  expect(next).toMatchObject({ state: 'success', query: '' });
});
test('NO_MATCH outside loading does not inherit provenance', () => {
  const success = answer({
    kind: 'inStock',
    productName: 'X',
    price: 2000,
    locations: [{ floor: '11', zone: '56' }],
    qtyUpperBound: 50,
  });
  expect(reduce(success, { type: 'NO_MATCH', query: 'X', suggestions: [] })).toMatchObject({
    state: 'empty',
    origin: undefined,
  });
});
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
    query: '밀폐용기',
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
test('NO_MATCH with 4 suggestions keeps only the first 3', () =>
  expect(
    reduce(loading, {
      type: 'NO_MATCH',
      query: '락앤락같은통',
      suggestions: ['밀폐용기', '수납 바구니', '정리함', '리빙 박스'],
    }),
  ).toMatchObject({ state: 'empty', suggestions: ['밀폐용기', '수납 바구니', '정리함'] }));
test('SELECT_CANDIDATE from an answer state → loading with the candidate query', () => {
  const success = answer({
    kind: 'inStock',
    productName: 'X',
    price: 2000,
    locations: [{ floor: '11', zone: '56' }],
    qtyUpperBound: 50,
  });
  expect(reduce(success, { type: 'SELECT_CANDIDATE', query: '밀폐용기', pdNo: '12345' })).toEqual({
    state: 'loading',
    query: '밀폐용기',
    slow: false,
  });
});

test('CANDIDATES → candidates state, capped at 3 with order preserved', () => {
  const candidates: ProductCandidate[] = [
    { pdNo: '1', name: '밀폐용기 A', price: 1000 },
    { pdNo: '2', name: '밀폐용기 B', price: 2000 },
    { pdNo: '3', name: '밀폐용기 C', price: 3000 },
    { pdNo: '4', name: '밀폐용기 D', price: 4000 },
    { pdNo: '5', name: '밀폐용기 E', price: 5000 },
  ];
  const next = reduce(loading, { type: 'CANDIDATES', query: '밀폐용기', candidates });
  expect(next).toEqual({
    state: 'candidates',
    query: '밀폐용기',
    candidates: candidates.slice(0, 3),
  });
  expect(next.state === 'candidates' && next.candidates).toHaveLength(3);
});

test('a scan submit carries its provenance into loading and on to empty', () => {
  const loading = reduce(initialState, { type: 'SUBMIT', query: '19987', origin: 'scan' });
  expect(loading).toEqual({ state: 'loading', query: '19987', slow: false, origin: 'scan' });
  const empty = reduce(loading, { type: 'NO_MATCH', query: '19987', suggestions: [] });
  expect(empty).toEqual({ state: 'empty', query: '19987', suggestions: [], origin: 'scan' });
});

test('a typed submit has no provenance and reaches a provenance-free empty', () => {
  const loading = reduce(initialState, { type: 'SUBMIT', query: '밀폐용기' });
  expect(loading).toEqual({ state: 'loading', query: '밀폐용기', slow: false, origin: undefined });
  const empty = reduce(loading, { type: 'NO_MATCH', query: '밀폐용기', suggestions: [] });
  expect(empty).toMatchObject({ state: 'empty', query: '밀폐용기', origin: undefined });
});

test('provenance does not survive a candidate selection (the shopper picked a product, not a code)', () => {
  const scanLoading = reduce(initialState, { type: 'SUBMIT', query: '19987', origin: 'scan' });
  const picked = reduce(scanLoading, {
    type: 'SELECT_CANDIDATE',
    query: '리빙 밀폐용기 1.2L',
    pdNo: '19987',
  });
  expect(picked).toEqual({ state: 'loading', query: '리빙 밀폐용기 1.2L', slow: false });
});

describe('query retention (B15)', () => {
  const loading = reduce(initialState, { type: 'SUBMIT', query: '밀폐용기' });

  test('RESULT retains the submitted query on success', () => {
    const next = reduce(loading, {
      type: 'RESULT',
      answer: mockAnswers.inStock,
      freshness: { class: 'live', observedAt: 0 },
    });
    expect(next).toMatchObject({ state: 'success', query: '밀폐용기' });
  });

  test('RESULT retains the query on partial (franchise)', () => {
    const next = reduce(loading, {
      type: 'RESULT',
      answer: mockAnswers.franchise,
      freshness: { class: 'live', observedAt: 0 },
    });
    expect(next).toMatchObject({ state: 'partial', trigger: 'franchise', query: '밀폐용기' });
  });

  test('FAILURE retains the query on error/noCache', () => {
    const next = reduce(loading, { type: 'FAILURE', cache: { kind: 'noCache' } });
    expect(next).toEqual({ state: 'error', variant: 'noCache', query: '밀폐용기' });
  });

  test('FAILURE retains the query on error/cached and partial/staleCache', () => {
    const freshness = { class: 'cachedWithinThreshold' as const, observedAt: 0 };
    const cached = reduce(loading, {
      type: 'FAILURE',
      cache: { kind: 'withinThreshold', answer: mockAnswers.inStock, freshness },
    });
    expect(cached).toMatchObject({ state: 'error', variant: 'cached', query: '밀폐용기' });
    const stale = reduce(loading, {
      type: 'FAILURE',
      cache: {
        kind: 'beyondThreshold',
        answer: mockAnswers.inStock,
        freshness: { class: 'cachedBeyondThreshold', observedAt: 0 },
      },
    });
    expect(stale).toMatchObject({ state: 'partial', trigger: 'staleCache', query: '밀폐용기' });
  });
});
