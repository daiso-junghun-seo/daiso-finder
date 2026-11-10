import { mockAnswers } from '../../adapters/mock/fixtures';
import type { StoreContext, UiState } from '../../domain/types';
import type { SubmittedQuery } from '../availability/pipelines';
import { navigationEntryOf, navigationTermOf, parseDevAgeMinutes } from './navigation-entry';
import type { InStockAnswer } from './navigation-refresh';

const NOW = new Date(2026, 6, 15, 9, 0).getTime();
const STORE: StoreContext = { strCd: '001', strNm: '명동역점' };
const ANSWER = mockAnswers.inStock as InStockAnswer;
const SUCCESS: UiState = {
  state: 'success',
  query: '밀폐용기',
  answer: ANSWER,
  freshness: { class: 'live', observedAt: NOW },
};

test('navigationTermOf keeps candidate identity, scan identity, typed keyword, then display query', () => {
  const candidate: SubmittedQuery = {
    kind: 'candidate',
    candidate: { pdNo: '19987', name: '리빙 밀폐용기 1.2L', price: 2000 },
  };
  expect(navigationTermOf(candidate, '무시됨')).toEqual({
    kind: 'pdNo',
    pdNo: '19987',
    keyword: '리빙 밀폐용기 1.2L',
  });
  expect(navigationTermOf({ kind: 'scan', value: '8801234567890' }, '무시됨')).toEqual({
    kind: 'pdNo',
    pdNo: '8801234567890',
    keyword: '8801234567890',
  });
  expect(navigationTermOf({ kind: 'typed', keyword: '밀폐용기' }, '무시됨')).toEqual({
    kind: 'keyword',
    keyword: '밀폐용기',
  });
  expect(navigationTermOf(null, '표시 질의')).toEqual({ kind: 'keyword', keyword: '표시 질의' });
});

test('parseDevAgeMinutes reads only a positive finite ?navAge=', () => {
  expect(parseDevAgeMinutes('?navAge=90')).toBe(90);
  expect(parseDevAgeMinutes('?navAge=0')).toBeNull();
  expect(parseDevAgeMinutes('?navAge=-3')).toBeNull();
  expect(parseDevAgeMinutes('?navAge=abc')).toBeNull();
  expect(parseDevAgeMinutes('?navAge=Infinity')).toBeNull();
  expect(parseDevAgeMinutes('')).toBeNull();
});

test('navigationEntryOf hands over the answer, stamp, store and retained lookup', () => {
  const typed: SubmittedQuery = { kind: 'typed', keyword: '밀폐용기' };
  const entry = navigationEntryOf({ ui: SUCCESS, store: STORE, last: typed, nowMs: NOW });
  expect(entry).toEqual({
    store: STORE,
    answer: ANSWER,
    freshness: { class: 'live', observedAt: NOW },
    term: { kind: 'keyword', keyword: '밀폐용기' },
  });
});

test('the display query is the fallback term when no lookup was retained (scenario harness)', () => {
  const entry = navigationEntryOf({ ui: SUCCESS, store: STORE, last: null, nowMs: NOW });
  expect(entry?.term).toEqual({ kind: 'keyword', keyword: '밀폐용기' });
});

test('an emptied display query falls back to the product name, never a blank term', () => {
  // A second RESULT (the ?scenario= harness runs twice under StrictMode) leaves query ''. The refresh
  // must still carry a literal keyword — the name the answer already matched.
  const entry = navigationEntryOf({
    ui: { ...SUCCESS, query: '' },
    store: STORE,
    last: null,
    nowMs: NOW,
  });
  expect(entry?.term).toEqual({ kind: 'keyword', keyword: ANSWER.productName });
});

test('entry is refused without a store, outside Success, or without a position', () => {
  expect(navigationEntryOf({ ui: SUCCESS, store: null, last: null, nowMs: NOW })).toBeNull();
  expect(
    navigationEntryOf({
      ui: { state: 'default' },
      store: STORE,
      last: null,
      nowMs: NOW,
    }),
  ).toBeNull();
  expect(
    navigationEntryOf({
      ui: {
        state: 'success',
        query: '밀폐용기',
        answer: mockAnswers.noLocation,
        freshness: { class: 'live', observedAt: NOW },
      },
      store: STORE,
      last: null,
      nowMs: NOW,
    }),
  ).toBeNull();
  expect(
    navigationEntryOf({
      ui: {
        state: 'success',
        query: '밀폐용기',
        answer: mockAnswers.temporarilyOut,
        freshness: { class: 'live', observedAt: NOW },
      },
      store: STORE,
      last: null,
      nowMs: NOW,
    }),
  ).toBeNull();
});

test('?navAge ages the stamp into cachedWithinThreshold for the stale sweep', () => {
  const entry = navigationEntryOf({
    ui: SUCCESS,
    store: STORE,
    last: null,
    nowMs: NOW,
    devAgeMinutes: 90,
  });
  expect(entry?.freshness).toEqual({
    class: 'cachedWithinThreshold',
    observedAt: NOW - 90 * 60_000,
  });
});

test('no dev age keeps Flow 1 freshness byte-for-byte', () => {
  const freshness = { class: 'cachedBeyondThreshold' as const, observedAt: NOW - 1000 };
  const entry = navigationEntryOf({
    ui: { ...SUCCESS, freshness },
    store: STORE,
    last: null,
    nowMs: NOW,
    devAgeMinutes: null,
  });
  expect(entry?.freshness).toBe(freshness);
});
