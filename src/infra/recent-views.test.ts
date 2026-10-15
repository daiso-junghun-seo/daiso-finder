// src/infra/recent-views.test.ts — owner-exception §B47 slice 1.
import type { AvailabilityAnswer } from '../domain/types';
import { loadRecentViews, nextRecentViews, saveRecentViews, viewFromResult } from './recent-views';

const inStock: AvailabilityAnswer = {
  kind: 'inStock',
  productName: '리빙 밀폐용기 1.2L',
  price: 2000,
  locations: [{ floor: '11', zone: '56' }],
  qtyUpperBound: 5,
  imageUrl: 'https://cdn.daisomall.co.kr/1.jpg',
};

const notCarried: AvailabilityAnswer = { kind: 'notCarried', productName: '단종된 상품' };

beforeEach(() => localStorage.clear());

test('viewFromResult carries pdNo, verbatim name, price and our observation time', () => {
  const view = viewFromResult('밀폐용기', '12345', inStock, 1700000000000);
  expect(view).toEqual({
    key: '12345',
    name: '리빙 밀폐용기 1.2L',
    query: '밀폐용기',
    pdNo: '12345',
    price: 2000,
    imageUrl: 'https://cdn.daisomall.co.kr/1.jpg',
    viewedAt: 1700000000000,
  });
});

test('viewFromResult without pdNo keys by product name; priceless answers stay priceless', () => {
  const view = viewFromResult('단종된 상품', undefined, notCarried, 1);
  expect(view.key).toBe('단종된 상품');
  expect(view.pdNo).toBeUndefined();
  expect(view.price).toBeUndefined();
});

test('nextRecentViews is most-recent-first, deduped by exact key, capped at 5', () => {
  const mk = (key: string) => ({ key, name: key, query: key, viewedAt: 1 });
  let list = [mk('a'), mk('b'), mk('c'), mk('d'), mk('e')];
  list = nextRecentViews(list, mk('c'));
  expect(list.map((v) => v.key)).toEqual(['c', 'a', 'b', 'd', 'e']);
  list = nextRecentViews(list, mk('f'));
  expect(list.map((v) => v.key)).toEqual(['f', 'c', 'a', 'b', 'd']);
  expect(list).toHaveLength(5);
});

test('nextRecentViews ignores blank names (never a row of nothing)', () => {
  const list = nextRecentViews([], { key: 'x', name: '  ', query: 'x', viewedAt: 1 });
  expect(list).toEqual([]);
});

test('corrupt storage degrades to empty, blocked writes never throw (G3)', () => {
  localStorage.setItem('daiso.recentViews', '{not json');
  expect(loadRecentViews()).toEqual([]);
  localStorage.setItem('daiso.recentViews', JSON.stringify([{ key: 1 }]));
  expect(loadRecentViews()).toEqual([]);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
    throw new Error('blocked');
  });
  expect(() => saveRecentViews([])).not.toThrow();
});

test('a recorded view round-trips through storage byte-identically', () => {
  const view = viewFromResult('밀폐용기', '12345', inStock, 7);
  saveRecentViews([view]);
  expect(loadRecentViews()).toEqual([view]);
});
