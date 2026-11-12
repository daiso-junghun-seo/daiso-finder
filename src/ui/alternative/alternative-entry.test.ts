import type { AvailabilityAnswer, StoreContext } from '../../domain/types';
import type { SubmittedQuery } from '../availability/pipelines';
import type { NavigationEntry } from '../navigation/navigation-refresh';
import {
  NEARBY_LIVE,
  alternativeEntryFromNavigation,
  alternativeEntryOf,
  devForceNearby,
} from './alternative-entry';
import type { AlternativeEntry } from './alternative-types';

const STORE: StoreContext = { strCd: '10803', strNm: '명동역점' };

function success(answer: AvailabilityAnswer) {
  return {
    state: 'success' as const,
    query: '밀폐용기',
    answer,
    freshness: { class: 'live' as const, observedAt: 1_700_000_000_000 },
  };
}
function must(entry: AlternativeEntry | null): AlternativeEntry {
  if (entry === null) throw new Error('expected an alternative entry');
  return entry;
}
function notCarried(pdNo?: string): AvailabilityAnswer {
  return { kind: 'notCarried', pdNo, productName: '밀폐용기 6P 세트' };
}
const typed: SubmittedQuery = { kind: 'typed', keyword: '밀폐용기' };
const candidate: SubmittedQuery = {
  kind: 'candidate',
  candidate: { pdNo: '19987', name: '밀폐용기 6P 세트', price: 5000 },
};

test('temporarilyOut opens Group A only in production (nearby withheld)', () => {
  const entry = must(
    alternativeEntryOf({
      ui: success({
        kind: 'temporarilyOut',
        pdNo: '19987',
        productName: '밀폐용기 6P 세트',
        price: 5000,
        restockOfferable: true,
      }),
      store: STORE,
      last: typed,
    }),
  );
  expect(entry.issued).toEqual({ similar: true, nearby: false });
  expect(entry.lead).toBe('similar');
  expect(entry.reason).toBe('temporarilyOut');
  expect(entry.keyword).toBe('밀폐용기');
  expect(entry.pdNo).toBe('19987');
  expect(entry.origin).toBe('flow1');
});

test.each(['inStock', 'restockArriving'] as const)('%s has no Flow 3 entry', (kind) => {
  const answer: AvailabilityAnswer =
    kind === 'inStock'
      ? {
          kind,
          productName: 'x',
          price: 1000,
          locations: [{ floor: '1', zone: '1' }],
          qtyUpperBound: 1,
        }
      : { kind, productName: 'x', price: 1000, lchDay: '2026-07-20' };
  expect(alternativeEntryOf({ ui: success(answer), store: STORE, last: typed })).toBeNull();
});

test('pre-answer states and a missing store produce no entry', () => {
  expect(
    alternativeEntryOf({
      ui: { state: 'loading', query: '밀폐용기', slow: false },
      store: STORE,
      last: typed,
    }),
  ).toBeNull();
  expect(alternativeEntryOf({ ui: success(notCarried('1')), store: null, last: typed })).toBeNull();
});

test('discontinued never issues nearby even when live and identified', () => {
  const entry = must(
    alternativeEntryOf({
      ui: success({
        kind: 'discontinued',
        pdNo: '19987',
        productName: '밀폐용기 6P 세트',
        price: 5000,
      }),
      store: STORE,
      last: typed,
      nearbyLive: true,
    }),
  );
  expect(entry.issued).toEqual({ similar: true, nearby: false });
});

test('notCarried leads with nearby; production falls back to the similar slot', () => {
  const prod = must(
    alternativeEntryOf({ ui: success(notCarried('19987')), store: STORE, last: typed }),
  );
  expect(prod.issued).toEqual({ similar: true, nearby: false });
  expect(prod.lead).toBe('similar');

  const mocked = must(
    alternativeEntryOf({
      ui: success(notCarried('19987')),
      store: STORE,
      last: typed,
      nearbyLive: true,
    }),
  );
  expect(mocked.issued).toEqual({ similar: true, nearby: true });
  expect(mocked.lead).toBe('nearby');
});

test('franchise is nearby-only: withheld in production, opened when live + pdNo', () => {
  const franchise: AvailabilityAnswer = {
    kind: 'franchiseUndeterminable',
    pdNo: '19987',
    productName: '밀폐용기 6P 세트',
  };
  expect(alternativeEntryOf({ ui: success(franchise), store: STORE, last: typed })).toBeNull();
  const live = must(
    alternativeEntryOf({
      ui: success(franchise),
      store: STORE,
      last: typed,
      nearbyLive: true,
    }),
  );
  expect(live.issued).toEqual({ similar: false, nearby: true });
  expect(live.lead).toBe('nearby');
});

test('nearby requires an exact pdNo — a keyword-only entry withholds it', () => {
  const entry = must(
    alternativeEntryOf({
      ui: success({
        kind: 'temporarilyOut',
        productName: '밀폐용기',
        price: 1000,
        restockOfferable: false,
      }),
      store: STORE,
      last: typed,
      nearbyLive: true,
    }),
  );
  expect(entry.pdNo).toBeUndefined();
  expect(entry.issued).toEqual({ similar: true, nearby: false });
});

test('Group A keyword: typed keeps the typed term, candidate/scan use the product name', () => {
  const answer: AvailabilityAnswer = {
    kind: 'temporarilyOut',
    productName: '밀폐용기 6P 세트',
    price: 5000,
    restockOfferable: false,
  };
  expect(must(alternativeEntryOf({ ui: success(answer), store: STORE, last: typed })).keyword).toBe(
    '밀폐용기',
  );
  expect(
    must(alternativeEntryOf({ ui: success(answer), store: STORE, last: candidate })).keyword,
  ).toBe('밀폐용기 6P 세트');
  expect(
    must(
      alternativeEntryOf({
        ui: success(answer),
        store: STORE,
        last: { kind: 'scan', value: '8801234567890' },
      }),
    ).keyword,
  ).toBe('밀폐용기 6P 세트');
  // A whitespace-only typed term is not an identity — the product name is the term.
  expect(
    must(
      alternativeEntryOf({
        ui: success(answer),
        store: STORE,
        last: { kind: 'typed', keyword: '  ' },
      }),
    ).keyword,
  ).toBe('밀폐용기 6P 세트');
});

test('identity precedence: the answer pdNo wins over the retained query', () => {
  const entry = must(
    alternativeEntryOf({
      ui: success({
        kind: 'discontinued',
        pdNo: '20001',
        productName: '밀폐용기 6P 세트',
        price: 5000,
      }),
      store: STORE,
      last: candidate,
    }),
  );
  expect(entry.pdNo).toBe('20001');
});

test('alternativeEntryFromNavigation opens Flow 2 exit and re-searches by name', () => {
  const navigation: NavigationEntry = {
    store: STORE,
    answer: {
      kind: 'inStock',
      pdNo: '19987',
      productName: '밀폐용기 6P 세트',
      price: 5000,
      locations: [{ floor: '11', zone: '56' }],
      qtyUpperBound: 2,
    },
    freshness: { class: 'live', observedAt: 1_700_000_000_000 },
    term: { kind: 'keyword', keyword: '밀폐용기' },
  };
  const entry = must(alternativeEntryFromNavigation({ navigation }));
  expect(entry.reason).toBe('flow2');
  expect(entry.origin).toBe('flow2');
  expect(entry.keyword).toBe('밀폐용기 6P 세트');
  expect(entry.pdNo).toBe('19987');
  expect(entry.issued).toEqual({ similar: true, nearby: false });
});

test('Flow 2 exit with a pdNo term but an answer without pdNo still identifies it', () => {
  const navigation: NavigationEntry = {
    store: STORE,
    answer: {
      kind: 'inStock',
      productName: '밀폐용기 6P 세트',
      price: 5000,
      locations: [{ floor: '11', zone: '56' }],
      qtyUpperBound: 2,
    },
    freshness: { class: 'live', observedAt: 1 },
    term: { kind: 'pdNo', pdNo: '19987', keyword: '밀폐용기' },
  };
  expect(must(alternativeEntryFromNavigation({ navigation, nearbyLive: true })).pdNo).toBe('19987');
});

test('devForceNearby only widens the ?alt= scenarios that need the withheld branch', () => {
  const entry = must(
    alternativeEntryOf({
      ui: success({
        kind: 'discontinued',
        pdNo: '19987',
        productName: '밀폐용기 6P 세트',
        price: 5000,
      }),
      store: STORE,
      last: typed,
    }),
  );
  expect(entry.issued.nearby).toBe(false);
  expect(devForceNearby(entry, null).issued.nearby).toBe(false);
  expect(devForceNearby(entry, 'slow').issued.nearby).toBe(false);
  expect(devForceNearby(entry, 'nearby').issued.nearby).toBe(true);
  expect(devForceNearby(entry, 'bothFailed').issued.nearby).toBe(true);
});

test('an entry without pdNo is never widened by the dev override', () => {
  const entry = must(
    alternativeEntryOf({
      ui: success({
        kind: 'temporarilyOut',
        productName: '밀폐용기',
        price: 1000,
        restockOfferable: false,
      }),
      store: STORE,
      last: typed,
    }),
  );
  expect(devForceNearby(entry, 'nearby').issued.nearby).toBe(false);
});

test('NEARBY_LIVE ships false — the production matrix must not query Group B', () => {
  expect(NEARBY_LIVE).toBe(false);
});
