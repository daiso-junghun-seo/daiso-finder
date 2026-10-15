// src/infra/cart.test.ts — owner-exception §B47 slice 2.
import type { AvailabilityAnswer } from '../domain/types';
import {
  addToCart,
  cartFor,
  cartQtyCount,
  cartTotal,
  itemFromAnswer,
  loadCarts,
  removeItem,
  saveCarts,
  setItemQty,
  toggleItemChecked,
} from './cart';

const inStock: AvailabilityAnswer = {
  kind: 'inStock',
  productName: '리빙 밀폐용기 1.2L',
  price: 2000,
  locations: [{ floor: '11', zone: '56' }],
  qtyUpperBound: 5,
  imageUrl: 'https://cdn.daisomall.co.kr/1.jpg',
};

const notCarried: AvailabilityAnswer = { kind: 'notCarried', productName: '없는 상품' };

beforeEach(() => localStorage.clear());

test('itemFromAnswer snapshots price, primary location and our observation time', () => {
  const item = itemFromAnswer('밀폐용기', '12345', inStock, 1000, 2000);
  expect(item).toMatchObject({
    id: '12345',
    name: '리빙 밀폐용기 1.2L',
    query: '밀폐용기',
    pdNo: '12345',
    price: 2000,
    location: { floor: '11', zone: '56' },
    qty: 1,
    checked: true,
    observedAt: 1000,
    addedAt: 2000,
  });
});

test('priceless answers cannot become items (nothing to total, nothing to walk to)', () => {
  expect(itemFromAnswer('없는 상품', undefined, notCarried, 1, 2)).toBeUndefined();
});

test('re-adding bumps 담을 수량 instead of duplicating the row (capped at 99)', () => {
  const item = itemFromAnswer('밀폐용기', '12345', inStock, 1, 2);
  if (!item) throw new Error('test setup failed');
  let carts = addToCart({}, '001', '명동역점', item);
  carts = addToCart(carts, '001', '명동역점', item);
  const cart = cartFor(carts, '001');
  expect(cart?.items).toHaveLength(1);
  expect(cart?.items[0]?.qty).toBe(2);
  carts = setItemQty(carts, '001', '12345', 500);
  expect(cartFor(carts, '001')?.items[0]?.qty).toBe(99);
  carts = setItemQty(carts, '001', '12345', 0);
  expect(cartFor(carts, '001')?.items[0]?.qty).toBe(1);
});

test('total sums checked rows only; the link count sums every row', () => {
  const a = itemFromAnswer('밀폐용기', '1', inStock, 1, 2);
  const b = itemFromAnswer(
    '수납',
    '2',
    { ...inStock, productName: '수납 바구니', price: 3000 },
    1,
    2,
  );
  if (!a || !b) throw new Error('test setup failed');
  let carts = addToCart(addToCart({}, '001', '명동역점', { ...a, qty: 2 }), '001', '명동역점', b);
  const cart = cartFor(carts, '001');
  if (!cart) throw new Error('test setup failed');
  expect(cartTotal(cart)).toBe(2000 * 2 + 3000);
  carts = toggleItemChecked(carts, '001', '1');
  const unchecked = cartFor(carts, '001');
  if (!unchecked) throw new Error('test setup failed');
  expect(cartTotal(unchecked)).toBe(3000);
  expect(cartQtyCount(unchecked)).toBe(3); // the bag counts unchecked rows too
});

test('carts are per-store: switching stores never rewrites another list', () => {
  const item = itemFromAnswer('밀폐용기', '12345', inStock, 1, 2);
  if (!item) throw new Error('test setup failed');
  const carts = addToCart({}, '001', '명동역점', item);
  expect(cartFor(carts, '002')).toBeNull();
  expect(cartFor(carts, '001')?.storeName).toBe('명동역점');
});

test('removeItem drops the row; unknown stores/rows are no-ops', () => {
  const item = itemFromAnswer('밀폐용기', '12345', inStock, 1, 2);
  if (!item) throw new Error('test setup failed');
  let carts = addToCart({}, '001', '명동역점', item);
  carts = removeItem(carts, '001', 'nope');
  expect(cartFor(carts, '001')?.items).toHaveLength(1);
  carts = removeItem(carts, '001', '12345');
  expect(cartFor(carts, '001')?.items).toHaveLength(0);
  expect(removeItem(carts, '999', '12345')).toEqual(carts);
});

test('corrupt storage degrades to empty, blocked writes never throw (G3)', () => {
  localStorage.setItem('daiso.carts.v1', '{not json');
  expect(loadCarts()).toEqual({});
  localStorage.setItem('daiso.carts.v1', JSON.stringify({ '001': { nope: true } }));
  expect(loadCarts()).toEqual({});
  vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
    throw new Error('blocked');
  });
  expect(() => saveCarts({})).not.toThrow();
});

test('a cart round-trips through storage byte-identically', () => {
  const item = itemFromAnswer('밀폐용기', '12345', inStock, 1, 2);
  if (!item) throw new Error('test setup failed');
  const carts = addToCart({}, '001', '명동역점', item);
  saveCarts(carts);
  expect(loadCarts()).toEqual(carts);
});
