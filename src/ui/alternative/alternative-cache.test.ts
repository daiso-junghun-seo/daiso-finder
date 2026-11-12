import { createAlternativeCache } from './alternative-cache';
import type { AlternativeEntry, AlternativeSnapshot } from './alternative-types';

const STORE = { strCd: '10803', strNm: '명동역점' };
const ENTRY: AlternativeEntry = {
  store: STORE,
  reason: 'temporarilyOut',
  productName: '밀폐용기 6P 세트',
  pdNo: '19987',
  keyword: '밀폐용기',
  issued: { similar: true, nearby: false },
  lead: 'similar',
  origin: 'flow1',
};

function snapshot(overrides: Partial<AlternativeSnapshot> = {}): AlternativeSnapshot {
  return {
    slots: {
      similar: { status: 'ready', rows: [] },
      nearby: { status: 'withheld' },
    },
    issued: { similar: true, nearby: false },
    observedAt: 1_000,
    source: 'live',
    settled: true,
    ...overrides,
  };
}

test('the key is the store plus the exact identity (pdNo preferred over keyword)', () => {
  const cache = createAlternativeCache(() => 5_000);
  cache.save(ENTRY, snapshot());
  expect(cache.load(ENTRY)).not.toBeNull();
  expect(cache.load({ ...ENTRY, keyword: '다른 검색어' })).not.toBeNull();
  expect(cache.load({ ...ENTRY, pdNo: '20001' })).toBeNull();
  expect(cache.load({ ...ENTRY, store: { strCd: '11043', strNm: '을지로입구점' } })).toBeNull();
});

test('a keyword-keyed entry caches by keyword', () => {
  const cache = createAlternativeCache(() => 5_000);
  const keywordEntry: AlternativeEntry = { ...ENTRY, pdNo: undefined };
  cache.save(keywordEntry, snapshot());
  expect(cache.load(keywordEntry)).not.toBeNull();
  expect(cache.load({ ...keywordEntry, keyword: '다른 검색어' })).toBeNull();
});

test('only a settled LIVE answer is stored, and the stamp becomes the write time', () => {
  const cache = createAlternativeCache(() => 9_000);
  cache.save(ENTRY, snapshot({ settled: false }));
  cache.save(ENTRY, snapshot({ source: 'cache' }));
  expect(cache.load(ENTRY)).toBeNull();

  cache.save(ENTRY, snapshot({ observedAt: 123 }));
  const hit = cache.load(ENTRY);
  expect(hit?.source).toBe('cache');
  expect(hit?.observedAt).toBe(9_000); // write time, never the upstream claim
});

test('every issued slot must have succeeded — a failed or pending slot is never remembered', () => {
  const cache = createAlternativeCache();
  cache.save(
    ENTRY,
    snapshot({ slots: { similar: { status: 'failed' }, nearby: { status: 'withheld' } } }),
  );
  expect(cache.load(ENTRY)).toBeNull();

  cache.save(
    ENTRY,
    snapshot({ slots: { similar: { status: 'pending' }, nearby: { status: 'withheld' } } }),
  );
  expect(cache.load(ENTRY)).toBeNull();

  cache.save(
    ENTRY,
    snapshot({ slots: { similar: { status: 'empty' }, nearby: { status: 'withheld' } } }),
  );
  expect(cache.load(ENTRY)).not.toBeNull();
});

test('a two-slot answer needs BOTH slots to have succeeded', () => {
  const both: AlternativeEntry = { ...ENTRY, issued: { similar: true, nearby: true } };
  const cache = createAlternativeCache();
  cache.save(
    both,
    snapshot({
      issued: both.issued,
      slots: { similar: { status: 'ready', rows: [] }, nearby: { status: 'failed' } },
    }),
  );
  expect(cache.load(both)).toBeNull();
  cache.save(
    both,
    snapshot({
      issued: both.issued,
      slots: { similar: { status: 'empty' }, nearby: { status: 'empty' } },
    }),
  );
  expect(cache.load(both)).not.toBeNull();
});

test('an answer cached under a different issued set is not served', () => {
  const cache = createAlternativeCache();
  cache.save(ENTRY, snapshot());
  const widened: AlternativeEntry = { ...ENTRY, issued: { similar: true, nearby: true } };
  expect(cache.load(widened)).toBeNull();
});

test('clear empties every key', () => {
  const cache = createAlternativeCache();
  cache.save(ENTRY, snapshot());
  cache.clear();
  expect(cache.load(ENTRY)).toBeNull();
});
