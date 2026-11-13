// src/ui/components/CartSheetLoader.test.tsx — pins the lazy boundary itself: the sheet still opens
// with its full contract, the Suspense shell carries the same dialog/focus/Escape behaviour, and an
// empty cart keeps the unsuffixed title.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { StoreCart } from '../../infra/cart';
import { CartSheetLoader } from './CartSheetLoader';

const cart: StoreCart = {
  storeCd: '001',
  storeName: '명동역점',
  items: [
    {
      id: '12345',
      name: '리빙 밀폐용기 1.2L',
      query: '밀폐용기',
      pdNo: '12345',
      price: 2000,
      location: { floor: '11', zone: '56' },
      qty: 1,
      checked: true,
      addedAt: 1,
      observedAt: 1,
    },
  ],
};

const handlers = () => ({
  onClose: vi.fn(),
  onSetQty: vi.fn(),
  onToggle: vi.fn(),
  onRemove: vi.fn(),
  onRecheck: vi.fn(),
  onImportJson: vi.fn(() => ({ ok: true, count: 1, crossStore: false })),
});

test('the loaded sheet keeps the dialog title, focused close, Escape and row contract', async () => {
  const h = handlers();
  render(<CartSheetLoader cart={cart} otherStoreCount={0} locale="ko" {...h} />);

  // The Suspense shell paints the same labelled dialog immediately; the lazy sheet must leave that
  // contract untouched once it replaces it.
  expect(screen.getByRole('dialog', { name: '장바구니 · 명동역점' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '닫기' })).toHaveFocus();

  await userEvent.keyboard('{Escape}');
  expect(h.onClose).toHaveBeenCalledTimes(1);

  expect(await screen.findByText('리빙 밀폐용기 1.2L')).toBeInTheDocument();
  expect(screen.getByText('합계 2,000원')).toBeInTheDocument();
  expect(screen.getByRole('dialog', { name: '장바구니 · 명동역점' })).toBeInTheDocument();
});

test('an empty cart keeps the plain title and shows the empty note, not a blank shell', async () => {
  const h = handlers();
  render(<CartSheetLoader cart={null} otherStoreCount={0} locale="ko" {...h} />);
  expect(
    await screen.findByText('아직 담은 상품이 없어요. 답 카드에서 담기를 눌러 보세요.'),
  ).toBeInTheDocument();
  expect(screen.getByRole('dialog', { name: '장바구니' })).toBeInTheDocument();
});
