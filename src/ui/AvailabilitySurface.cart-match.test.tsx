// src/ui/AvailabilitySurface.cart-match.test.tsx — owner decision §B52 end-to-end: the explicit
// stock check finds a store with the whole list, and the shopper's tap moves the memo and switches
// context through the same path as 매장 변경.
import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AvailabilityAnswer, StoreContext } from '../domain/types';
import { AvailabilitySurface } from './AvailabilitySurface';
import { useAvailabilityStore } from './store';

// The active store answers either normally (so the list can be filled) or as not-carried (so the
// nearby store is the only full match). The switch happens between those two steps.
const stockControl = vi.hoisted(() => ({ activeMissing: false }));

vi.mock('../adapters/composition', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../adapters/composition')>();
  return {
    ...actual,
    createGeolocation: () => ({
      getNearbyStores: async () => [{ strCd: '002', strNm: '강남점', distanceM: 120 }],
    }),
    createStoreStockRepository: () => ({
      query: async (store: StoreContext): Promise<AvailabilityAnswer> => {
        if (store.strCd === '001' && stockControl.activeMissing) {
          return { kind: 'notCarried', productName: '리빙 밀폐용기 1.2L' };
        }
        return {
          kind: 'inStock',
          productName: '리빙 밀폐용기 1.2L',
          price: 2000,
          locations: [{ floor: store.strCd === '002' ? 'B1' : '11', zone: '56' }],
          qtyUpperBound: 5,
        };
      },
    }),
  };
});

beforeEach(() => {
  localStorage.clear();
  stockControl.activeMissing = false;
  useAvailabilityStore.setState({
    ui: { state: 'default' },
    store: { strCd: '001', strNm: '명동역점' },
    sheetOpen: false,
    scannerOpen: false,
    locale: 'ko',
    carts: {},
    cartOpen: false,
    recentSearches: [],
    recentViews: [],
  });
});

test('tapping shop-here moves the list to the target store and switches store context', async () => {
  render(<AvailabilitySurface />);
  await userEvent.type(screen.getByLabelText('상품 검색'), '밀폐용기{Enter}');
  await userEvent.click(await screen.findByRole('button', { name: /리빙 밀폐용기 1\.2L/ }));
  expect(await screen.findByText('이 매장에 있어요')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: '담기' }));

  // Before matching: the active store's own snapshot.
  const before = useAvailabilityStore.getState().carts['001']?.items[0];
  expect(before).toMatchObject({ location: { floor: '11', zone: '56' } });
  const beforeObservedAt = before?.observedAt ?? 0;

  stockControl.activeMissing = true;
  await userEvent.click(await screen.findByRole('button', { name: /장바구니 1개/ }));

  const matchButton = await screen.findByRole('button', { name: '주변 매장 재고 확인' });
  expect(
    screen.getByText('장바구니는 결제가 아니라, 이 매장에서 살 품목을 적어 두는 목록이에요.'),
  ).toBeInTheDocument();
  await userEvent.click(matchButton);

  expect(await screen.findByText('모든 품목이 있는 매장')).toBeInTheDocument();
  expect(screen.getByText('강남점')).toBeInTheDocument();
  // Nothing moves until the tap.
  expect(useAvailabilityStore.getState().store?.strCd).toBe('001');
  expect(useAvailabilityStore.getState().carts['001']?.items).toHaveLength(1);

  await userEvent.click(screen.getByRole('button', { name: '강남점에서 장보기' }));

  // The memo moved: source empty of rows (the store key is dropped), target carries the list
  // with the target store's shelf position and a fresh observation time.
  const carts = useAvailabilityStore.getState().carts;
  expect(carts['001']).toBeUndefined();
  expect(carts['002']).toMatchObject({ storeCd: '002', storeName: '강남점' });
  const moved = carts['002']?.items[0];
  expect(moved).toMatchObject({
    id: before?.id,
    name: '리빙 밀폐용기 1.2L',
    price: 2000,
    location: { floor: 'B1', zone: '56' },
  });
  expect(moved?.observedAt).toBeGreaterThan(beforeObservedAt);

  // Context switched through the normal store path and the sheet closed.
  expect(useAvailabilityStore.getState().store).toEqual({ strCd: '002', strNm: '강남점' });
  expect(screen.queryByRole('dialog', { name: /장바구니/ })).not.toBeInTheDocument();
  // The retained lookup re-ran under the new store (the answer card is back).
  expect(await screen.findByText('이 매장에 있어요')).toBeInTheDocument();
});
