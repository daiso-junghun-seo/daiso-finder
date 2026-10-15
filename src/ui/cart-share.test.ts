// src/ui/cart-share.test.ts — owner-exception §B47 slice 3.
import type { StoreCart } from '../infra/cart';
import { buildShareText, exportCartJson, mergeImportedCart, parseCartImport } from './cart-share';

const cart: StoreCart = {
  storeCd: '001',
  storeName: '명동역점',
  items: [
    {
      id: '1',
      name: '리빙 밀폐용기 1.2L',
      query: '밀폐용기',
      pdNo: '1',
      price: 2000,
      location: { floor: '11', zone: '56' },
      qty: 2,
      checked: true,
      addedAt: 1,
      observedAt: 1,
    },
    {
      id: '2',
      name: '수납 바구니',
      query: '수납',
      price: 3000,
      qty: 1,
      checked: false,
      addedAt: 1,
      observedAt: 1,
    },
  ],
};

test('share text is the whole memo: rows with snapshots, checked-only total, honesty footer', () => {
  expect(buildShareText(cart, 'ko')).toBe(
    [
      '명동역점 장바구니',
      '리빙 밀폐용기 1.2L × 2개 · 2,000원 · 11층 56번',
      '수납 바구니 × 1개 · 3,000원 (합계 제외)',
      '합계 4,000원',
      '담을 당시 정보예요. 오늘 재고는 다시 확인해 주세요.',
    ].join('\n'),
  );
});

test('share text in English moves units, never names or digits (B45/B46)', () => {
  const text = buildShareText(cart, 'en');
  expect(text).toContain('리빙 밀폐용기 1.2L × 2 · ₩2,000 · 11F · No. 56');
  expect(text).toContain('Total ₩4,000');
});

test('JSON export round-trips; garbage, half-shapes and empty lists never become a list', () => {
  expect(parseCartImport(exportCartJson(cart))).toEqual(cart);
  expect(parseCartImport('{not json')).toBeNull();
  expect(parseCartImport(JSON.stringify({ storeCd: '001' }))).toBeNull();
  expect(parseCartImport(JSON.stringify({ ...cart, items: [{ id: 1 }] }))).toBeNull();
  expect(parseCartImport(JSON.stringify({ ...cart, items: [] }))).toBeNull();
});

test('imported rows merge with the same dedup/caps as adding by hand', () => {
  const merged = mergeImportedCart({}, '001', '명동역점', cart);
  expect(merged['001']?.items).toHaveLength(2);
  const twice = mergeImportedCart(merged, '001', '명동역점', cart);
  expect(twice['001']?.items).toHaveLength(2);
  expect(twice['001']?.items.find((i) => i.id === '1')?.qty).toBe(4);
  expect(twice['001']?.items.find((i) => i.id === '2')?.qty).toBe(2);
});
