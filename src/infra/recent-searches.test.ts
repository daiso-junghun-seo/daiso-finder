// src/infra/recent-searches.test.ts
import { loadRecentSearches, nextRecentSearches, saveRecentSearches } from './recent-searches';

beforeEach(() => localStorage.clear());

test('no recent searches saved yet → []', () => {
  expect(loadRecentSearches()).toEqual([]);
});

test('saveRecentSearches then loadRecentSearches round-trips', () => {
  saveRecentSearches(['밀폐용기', '수납 바구니']);
  expect(loadRecentSearches()).toEqual(['밀폐용기', '수납 바구니']);
});

test('loadRecentSearches degrades corrupt storage to [] instead of throwing (G3 hardening)', () => {
  localStorage.setItem('daiso.recentSearches', '{not json');
  expect(loadRecentSearches()).toEqual([]);
});

test('saveRecentSearches is best-effort: blocked storage never throws (D082 operability)', () => {
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('storage blocked');
  });
  try {
    expect(() => saveRecentSearches(['밀폐용기'])).not.toThrow();
  } finally {
    spy.mockRestore();
  }
});

describe('nextRecentSearches (pure)', () => {
  test('a new keyword is added to the front', () => {
    expect(nextRecentSearches(['수납 바구니'], '밀폐용기')).toEqual(['밀폐용기', '수납 바구니']);
  });

  test('an existing keyword is de-duplicated and re-bumped to the front', () => {
    expect(nextRecentSearches(['밀폐용기', '수납 바구니'], '수납 바구니')).toEqual([
      '수납 바구니',
      '밀폐용기',
    ]);
  });

  test('the keyword is trimmed', () => {
    expect(nextRecentSearches([], '  밀폐용기  ')).toEqual(['밀폐용기']);
  });

  test('a blank keyword is ignored and the existing list is returned unchanged', () => {
    const existing = ['밀폐용기'];
    expect(nextRecentSearches(existing, '   ')).toBe(existing);
  });

  test('the list is capped at MAX_ENTRIES (5), dropping the oldest', () => {
    const existing = ['a', 'b', 'c', 'd', 'e'];
    expect(nextRecentSearches(existing, 'f')).toEqual(['f', 'a', 'b', 'c', 'd']);
  });
});
