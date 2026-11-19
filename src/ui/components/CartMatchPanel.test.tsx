// src/ui/components/CartMatchPanel.test.tsx — owner decision §B52: the explicit stock-match
// step. Nothing runs on open, only checked rows are queried, and a store switch needs a tap.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AvailabilityAnswer, StoreContext } from '../../domain/types';
import type { CartItem } from '../../infra/cart';
import type { CartMatchDeps } from '../cart-match';
import { CartMatchPanel } from './CartMatchPanel';

const store: StoreContext = { strCd: '001', strNm: '명동역점' };

function item(id: string, overrides: Partial<CartItem> = {}): CartItem {
  return {
    id,
    name: `상품 ${id}`,
    query: `상품 ${id}`,
    price: 1000,
    qty: 1,
    checked: true,
    addedAt: 1,
    observedAt: 1,
    ...overrides,
  };
}

function inStock(name: string, price = 1000): AvailabilityAnswer {
  return {
    kind: 'inStock',
    productName: name,
    price,
    locations: [{ floor: '11', zone: '56' }],
    qtyUpperBound: 3,
  };
}

function deps(stock: (storeCd: string, id: string) => AvailabilityAnswer | Error): CartMatchDeps {
  return {
    getNearbyStores: vi.fn(async () => [
      { strCd: 'A', strNm: '가까운점', distanceM: 100 },
      { strCd: 'B', strNm: '먼점', distanceM: 200 },
    ]),
    queryStock: vi.fn(async (target, cartItem) => {
      const answer = stock(target.strCd, cartItem.id);
      if (answer instanceof Error) throw answer;
      return answer;
    }),
  };
}

test('nothing runs until the shopper presses the explicit button', async () => {
  const d = deps(() => inStock('상품 a'));
  render(<CartMatchPanel store={store} items={[item('a')]} locale="ko" deps={d} />);

  expect(d.getNearbyStores).not.toHaveBeenCalled();
  expect(d.queryStock).not.toHaveBeenCalled();
  expect(
    screen.getByText('이 목록의 품목이 모두 있는 가장 가까운 매장을 찾아드려요.'),
  ).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: '주변 매장 재고 확인' }));
  expect(await screen.findByText('모든 품목이 있는 매장')).toBeInTheDocument();
  expect(d.getNearbyStores).toHaveBeenCalledTimes(1);
});

test('only checked rows are queried; an empty checked set disables the button', async () => {
  const d = deps(() => inStock('상품 a'));
  const items = [item('a'), item('b', { checked: false })];
  const { rerender } = render(<CartMatchPanel store={store} items={items} locale="ko" deps={d} />);

  await userEvent.click(screen.getByRole('button', { name: '주변 매장 재고 확인' }));
  expect(await screen.findByText('모든 품목이 있는 매장')).toBeInTheDocument();
  expect(d.queryStock).toHaveBeenCalledWith(
    expect.objectContaining({ strCd: '001' }),
    expect.objectContaining({ id: 'a' }),
    expect.any(AbortSignal),
  );
  expect(d.queryStock).not.toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ id: 'b' }),
    expect.anything(),
  );

  rerender(
    <CartMatchPanel
      store={store}
      items={[item('a', { checked: false }), item('b', { checked: false })]}
      locale="ko"
      deps={d}
    />,
  );
  expect(screen.getByRole('button', { name: '주변 매장 재고 확인' })).toBeDisabled();
  expect(screen.getByText('확인할 품목을 하나 이상 체크해 주세요.')).toBeInTheDocument();
});

test('a full match at the current store says so and offers no switch', async () => {
  const d = deps(() => inStock('상품 a'));
  render(<CartMatchPanel store={store} items={[item('a')]} locale="ko" deps={d} />);

  await userEvent.click(screen.getByRole('button', { name: '주변 매장 재고 확인' }));

  expect(await screen.findByText('모든 품목이 있는 매장')).toBeInTheDocument();
  expect(screen.getByText('현재 매장')).toBeInTheDocument();
  expect(screen.getByText('지금 매장에 모든 품목이 있어요.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '여기서 장보기' })).not.toBeInTheDocument();
  // A finished run offers a retry, never a silent refresh.
  expect(screen.getByRole('button', { name: '다시 확인' })).toBeInTheDocument();
});

test('a full match at another store lists it with distance and switches only on tap', async () => {
  const onShopAt = vi.fn();
  const d = deps((storeCd, id) =>
    storeCd === '001' && id === 'b'
      ? { kind: 'notCarried', productName: '상품 b' }
      : inStock(`상품 ${id}`),
  );
  const items = [item('a'), item('b')];
  render(<CartMatchPanel store={store} items={items} locale="ko" deps={d} onShopAt={onShopAt} />);

  await userEvent.click(screen.getByRole('button', { name: '주변 매장 재고 확인' }));
  expect(await screen.findByText('모든 품목이 있는 매장')).toBeInTheDocument();

  expect(onShopAt).not.toHaveBeenCalled(); // no automatic switch, ever
  expect(screen.getByText('가까운점')).toBeInTheDocument();
  expect(screen.getByText('100m')).toBeInTheDocument();
  expect(screen.getAllByText('2/2').length).toBeGreaterThan(0);
  // The active store is the partial fallback: it keeps the shopper's current context.
  expect(screen.getByText('일부만 있는 매장')).toBeInTheDocument();
  expect(screen.getByText('현재 매장')).toBeInTheDocument();
  expect(screen.getByText('없는 품목: 상품 b')).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: '가까운점에서 장보기' }));
  expect(onShopAt).toHaveBeenCalledTimes(1);
  expect(onShopAt).toHaveBeenCalledWith(
    expect.objectContaining({ strCd: 'A', strNm: '가까운점' }),
    expect.objectContaining({ fullMatch: expect.objectContaining({ active: false }) }),
  );
});

test('without a full match the panel says so and shows partial stores by coverage', async () => {
  const d = deps((storeCd, id) =>
    (storeCd === '001' || storeCd === 'A') && id === 'a'
      ? inStock(`상품 ${id}`)
      : { kind: 'notCarried', productName: `상품 ${id}` },
  );
  render(<CartMatchPanel store={store} items={[item('a'), item('b')]} locale="ko" deps={d} />);

  await userEvent.click(screen.getByRole('button', { name: '주변 매장 재고 확인' }));

  expect(
    await screen.findByText(
      '모든 품목이 있는 주변 매장을 찾지 못했어요. 아래 매장에서 일부만 살 수 있어요.',
    ),
  ).toBeInTheDocument();
  expect(screen.queryByText('모든 품목이 있는 매장')).not.toBeInTheDocument();
  // Active and A are 1/2; B has 0/2 and is omitted from the Plan B list.
  expect(screen.queryByText('먼점')).not.toBeInTheDocument();
  expect(screen.getAllByText('1/2')).toHaveLength(2);
});

test('unknown rows are labeled separately from missing rows', async () => {
  const d = deps((_storeCd, id) =>
    id === 'c' ? { kind: 'franchiseUndeterminable', productName: '상품 c' } : inStock(`상품 ${id}`),
  );
  render(<CartMatchPanel store={store} items={[item('a'), item('c')]} locale="ko" deps={d} />);

  await userEvent.click(screen.getByRole('button', { name: '주변 매장 재고 확인' }));

  expect((await screen.findAllByText('확인하지 못한 품목: 상품 c')).length).toBeGreaterThan(0);
  expect(screen.queryByText(/없는 품목:/)).not.toBeInTheDocument();
  expect(screen.queryByText('모든 품목이 있는 매장')).not.toBeInTheDocument();
  expect(screen.getAllByText('1/2').length).toBeGreaterThan(0);
});

test('changing the checked set throws away the old verdict', async () => {
  const d = deps(() => inStock('상품 a'));
  const { rerender } = render(
    <CartMatchPanel store={store} items={[item('a')]} locale="ko" deps={d} />,
  );

  await userEvent.click(screen.getByRole('button', { name: '주변 매장 재고 확인' }));
  expect(await screen.findByText('모든 품목이 있는 매장')).toBeInTheDocument();

  rerender(<CartMatchPanel store={store} items={[item('a'), item('b')]} locale="ko" deps={d} />);
  await waitFor(() => expect(screen.queryByText('모든 품목이 있는 매장')).not.toBeInTheDocument());
  expect(screen.getByRole('button', { name: '주변 매장 재고 확인' })).toBeInTheDocument();
});

test('more than ten checked rows shows the batch limit before and after a run', async () => {
  const items = Array.from({ length: 11 }, (_, index) => item(String(index)));
  const d = deps(() => inStock('상품'));
  render(<CartMatchPanel store={store} items={items} locale="ko" deps={d} />);

  expect(screen.getByText('한 번에 10개 품목까지만 확인해요.')).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: '주변 매장 재고 확인' }));
  await screen.findByText('모든 품목이 있는 매장');
  expect(screen.getByText('10/10')).toBeInTheDocument();
  expect(screen.getAllByText('한 번에 10개 품목까지만 확인해요.')).toHaveLength(2);
});

test('when no nearby store resolves, the panel reports the active-store-only check', async () => {
  const d = deps(() => inStock('상품 a'));
  d.getNearbyStores = vi.fn(async () => []);
  render(<CartMatchPanel store={store} items={[item('a')]} locale="ko" deps={d} />);

  await userEvent.click(screen.getByRole('button', { name: '주변 매장 재고 확인' }));

  expect(
    await screen.findByText('주변 매장을 찾지 못해 현재 매장만 확인했어요.'),
  ).toBeInTheDocument();
});
