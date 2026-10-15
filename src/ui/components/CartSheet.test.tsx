// src/ui/components/CartSheet.test.tsx — owner-exception §B47 slice 2.
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { StoreCart } from '../../infra/cart';
import { CartSheet } from './CartSheet';

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
  onImportJson: vi.fn(() => ({ ok: true, count: 2 })),
});

test('rows show the snapshot with the honesty caption, the total, and wired actions', async () => {
  const h = handlers();
  render(<CartSheet cart={cart} otherStoreCount={0} locale="ko" {...h} />);
  expect(screen.getByText('장바구니 · 명동역점')).toBeInTheDocument();
  expect(
    screen.getByText('담을 당시 정보예요. 오늘 재고는 다시 확인해 주세요.'),
  ).toBeInTheDocument();
  expect(screen.getByText('리빙 밀폐용기 1.2L')).toBeInTheDocument();
  // Snapshot line: translated-unit price (B45) + grammar-moved location (B46), identical digits.
  expect(screen.getByText('2,000원 · 11층 56번')).toBeInTheDocument();
  expect(screen.getByText('합계 2,000원')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: '수량 늘리기' }));
  expect(h.onSetQty).toHaveBeenCalledWith('12345', 2);
  await userEvent.click(screen.getByRole('button', { name: '수량 줄이기' }));
  expect(h.onSetQty).toHaveBeenCalledWith('12345', 0);
  await userEvent.click(screen.getByRole('checkbox', { name: '리빙 밀폐용기 1.2L 합계에 포함' }));
  expect(h.onToggle).toHaveBeenCalledWith('12345');
  await userEvent.click(screen.getByRole('button', { name: '다시 확인' }));
  expect(h.onRecheck).toHaveBeenCalledTimes(1);
  await userEvent.click(screen.getByRole('button', { name: '삭제' }));
  expect(h.onRemove).toHaveBeenCalledWith('12345');
});

test('an empty cart renders the note — never rows or a total', () => {
  const h = handlers();
  render(<CartSheet cart={null} otherStoreCount={0} locale="ko" {...h} />);
  expect(
    screen.getByText('아직 담은 상품이 없어요. 답 카드에서 담기를 눌러 보세요.'),
  ).toBeInTheDocument();
  expect(screen.queryByText(/합계/)).not.toBeInTheDocument();
});

test('other stores’ lists render as an honest count, never their rows', () => {
  const h = handlers();
  render(<CartSheet cart={cart} otherStoreCount={2} locale="ko" {...h} />);
  expect(screen.getByText('다른 매장 리스트 2곳')).toBeInTheDocument();
});

test('닫기 and Escape both close; focus lands on 닫기 at open (sheet contract)', async () => {
  const h = handlers();
  render(<CartSheet cart={cart} otherStoreCount={0} locale="ko" {...h} />);
  expect(screen.getByRole('button', { name: '닫기' })).toHaveFocus();
  await userEvent.click(screen.getByRole('button', { name: '닫기' }));
  expect(h.onClose).toHaveBeenCalledTimes(1);
  await userEvent.keyboard('{Escape}');
  expect(h.onClose).toHaveBeenCalledTimes(2);
});

test('locale="en" renders English guidance with Korean names and moved units (B45/B46)', () => {
  const h = handlers();
  render(<CartSheet cart={cart} otherStoreCount={0} locale="en" {...h} />);
  expect(screen.getByText('Shopping list · 명동역점')).toBeInTheDocument();
  expect(screen.getByText('리빙 밀폐용기 1.2L')).toBeInTheDocument();
  expect(screen.getByText('₩2,000 · 11F · No. 56')).toBeInTheDocument();
  expect(screen.getByText('Total ₩2,000')).toBeInTheDocument();
});

test('공유하기 copies the memo text when no OS sheet exists, and reports it', async () => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async () => {} },
  });
  const h = handlers();
  render(<CartSheet cart={cart} otherStoreCount={0} locale="ko" {...h} />);
  await userEvent.click(screen.getByRole('button', { name: '공유하기' }));
  expect(await screen.findByText('복사했어요')).toBeInTheDocument();
  Reflect.deleteProperty(navigator, 'clipboard');
});

test('공유하기 with no share sheet and no clipboard falls back to hand-select text', async () => {
  Reflect.deleteProperty(navigator, 'clipboard');
  const h = handlers();
  render(<CartSheet cart={cart} otherStoreCount={0} locale="ko" {...h} />);
  await userEvent.click(screen.getByRole('button', { name: '공유하기' }));
  expect(
    await screen.findByText('복사하지 못했어요. 아래 텍스트를 직접 선택해 주세요.'),
  ).toBeInTheDocument();
  const fallback = screen.getByLabelText('공유할 내용');
  expect((fallback as HTMLTextAreaElement).value).toContain('명동역점 장바구니');
  expect((fallback as HTMLTextAreaElement).value).toContain('합계 2,000원');
});

test('가져오기 loads pasted JSON through onImportJson and reports the count; garbage fails honestly', async () => {
  const h = handlers();
  render(<CartSheet cart={cart} otherStoreCount={0} locale="ko" {...h} />);
  const box = screen.getByLabelText('가져올 내용 붙여넣기');
  // fireEvent, not userEvent.type: pasted JSON contains braces, which the keyboard parser
  // rejects — pasting is also what the shopper does.
  fireEvent.change(box, { target: { value: '{"storeCd":"001"}' } });
  await userEvent.click(screen.getByRole('button', { name: '불러오기' }));
  expect(h.onImportJson).toHaveBeenCalledWith('{"storeCd":"001"}');
  expect(await screen.findByText('2개 상품을 불러왔어요')).toBeInTheDocument();

  h.onImportJson.mockReturnValue({ ok: false, count: 0 });
  fireEvent.change(box, { target: { value: 'garbage' } });
  await userEvent.click(screen.getByRole('button', { name: '불러오기' }));
  expect(
    await screen.findByText('가져오지 못했어요. 복사한 내용이 맞는지 확인해 주세요.'),
  ).toBeInTheDocument();
});
