// src/ui/availability/useCart.test.tsx
// §B47 controller unit coverage: the surface's cart sheet exercises the happy paths, but the
// defensive guards and the per-item re-check/import branches are only reachable through the
// controller itself. The pipelines are mocked — this file is about the controller's routing.
import { act, renderHook } from '@testing-library/react';
import { mockAnswers } from '../../adapters/mock/fixtures';
import type { StoreContext, UiState } from '../../domain/types';
import type { CartItem, StoreCart } from '../../infra/cart';
import type { CartMatchResult } from '../cart-match';
import { useAvailabilityStore } from '../store';
import { runByPdNo, runQuery } from './pipelines';
import type { SubmittedQuery } from './pipelines';
import { useCartController } from './useCart';

vi.mock('./pipelines', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./pipelines')>();
  return {
    ...actual,
    runByPdNo: vi.fn(async () => {}),
    runQuery: vi.fn(async () => {}),
  };
});

const store: StoreContext = { strCd: '001', strNm: '명동역점' };
const success: UiState = {
  state: 'success',
  query: '밀폐용기',
  answer: mockAnswers.inStock,
  freshness: { class: 'live', observedAt: 1 },
};

function item(overrides: Partial<CartItem> = {}): CartItem {
  return {
    id: '12345',
    name: '리빙 밀폐용기 1.2L',
    query: '밀폐용기',
    pdNo: '12345',
    price: 2000,
    qty: 1,
    checked: true,
    addedAt: 1,
    observedAt: 1,
    ...overrides,
  };
}

function matchResult(): CartMatchResult {
  return {
    stores: [
      {
        store: { strCd: '002', strNm: '강남점' },
        active: false,
        items: [{ id: '12345', name: '리빙 밀폐용기 1.2L', available: true, price: 2500 }],
        matchedCount: 1,
        totalCount: 1,
        full: true,
      },
    ],
    fullMatch: null,
    active: {
      store,
      active: true,
      items: [],
      matchedCount: 1,
      totalCount: 1,
      full: false,
    },
    checkedCount: 1,
    evaluatedCount: 1,
    nearbyUnavailable: false,
    at: 777,
  };
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(runByPdNo).mockClear();
  vi.mocked(runQuery).mockClear();
  useAvailabilityStore.setState({
    carts: {},
    cartOpen: false,
    ui: { state: 'default' },
    store,
  });
});

test('with no store every mutator is a no-op and the cart stays empty', () => {
  const dispatch = vi.fn();
  const { result } = renderHook(() =>
    useCartController({
      store: null,
      ui: { state: 'default' },
      lastSubmit: { current: null },
      locale: 'ko',
      dispatch,
    }),
  );

  act(() => {
    result.current.addToCart();
    result.current.recheckItem(item());
    result.current.setQty('12345', 2);
    result.current.toggleChecked('12345');
    result.current.removeItem('12345');
    result.current.transferTo({ strCd: '002', strNm: '강남점' }, matchResult());
  });

  expect(result.current.importJson('garbage')).toEqual({
    ok: false,
    count: 0,
    crossStore: false,
  });
  expect(result.current.activeCart).toBeNull();
  expect(result.current.activeCartCount).toBe(0);
  expect(result.current.otherStoreCount).toBe(0);
  expect(result.current.showCartLink).toBe(false);
  expect(runByPdNo).not.toHaveBeenCalled();
  expect(runQuery).not.toHaveBeenCalled();
});

test('addToCart is a no-op when the current state carries no priced answer', () => {
  const dispatch = vi.fn();
  const { result } = renderHook(() =>
    useCartController({
      store,
      ui: { state: 'default' },
      lastSubmit: { current: null },
      locale: 'ko',
      dispatch,
    }),
  );
  act(() => result.current.addToCart());
  expect(useAvailabilityStore.getState().carts).toEqual({});
  expect(result.current.cartNotice).toBeNull();
});

test('addToCart snapshots a scanned lookup under its pdNo and announces it once', () => {
  const last: { current: SubmittedQuery | null } = {
    current: { kind: 'scan', value: '19987' },
  };
  const dispatch = vi.fn();
  const { result } = renderHook(() =>
    useCartController({ store, ui: success, lastSubmit: last, locale: 'ko', dispatch }),
  );

  act(() => result.current.addToCart());

  const added = useAvailabilityStore.getState().carts['001']?.items[0];
  expect(added).toMatchObject({ id: '19987', price: 2000, qty: 1 });
  expect(result.current.cartNotice?.text).toBe('장바구니에 담았어요');
  expect(result.current.activeCartCount).toBe(1);
  expect(result.current.activeCartTotal).toBe(2000);
  expect(result.current.showCartLink).toBe(true);
});

test('recheckItem routes a row with pdNo through runByPdNo and closes the sheet', () => {
  const last: { current: SubmittedQuery | null } = { current: null };
  const dispatch = vi.fn();
  useAvailabilityStore.setState({ cartOpen: true });
  const { result } = renderHook(() =>
    useCartController({ store, ui: success, lastSubmit: last, locale: 'ko', dispatch }),
  );

  act(() => result.current.recheckItem(item()));

  expect(useAvailabilityStore.getState().cartOpen).toBe(false);
  expect(last.current).toMatchObject({ kind: 'candidate', candidate: { pdNo: '12345' } });
  expect(runByPdNo).toHaveBeenCalledWith(
    store,
    expect.objectContaining({ pdNo: '12345' }),
    dispatch,
  );
});

test('recheckItem falls back to a search-first run for a keyword-only row', () => {
  const last: { current: SubmittedQuery | null } = { current: null };
  const dispatch = vi.fn();
  const { result } = renderHook(() =>
    useCartController({ store, ui: success, lastSubmit: last, locale: 'ko', dispatch }),
  );

  act(() => result.current.recheckItem(item({ pdNo: undefined })));

  expect(last.current).toEqual({ kind: 'typed', keyword: '밀폐용기' });
  expect(runQuery).toHaveBeenCalledWith(store, '밀폐용기', dispatch);
});

test('importJson merges a valid memo and reports garbage without touching the list', () => {
  const dispatch = vi.fn();
  const valid: StoreCart = {
    storeCd: '001',
    storeName: '명동역점',
    items: [item()],
  };
  const { result } = renderHook(() =>
    useCartController({
      store,
      ui: { state: 'default' },
      lastSubmit: { current: null },
      locale: 'ko',
      dispatch,
    }),
  );

  let outcome: { ok: boolean; count: number; crossStore: boolean } | undefined;
  act(() => {
    outcome = result.current.importJson(JSON.stringify(valid));
  });
  expect(outcome).toEqual({ ok: true, count: 1, crossStore: false });
  expect(useAvailabilityStore.getState().carts['001']?.items).toHaveLength(1);

  expect(result.current.importJson('garbage')).toEqual({
    ok: false,
    count: 0,
    crossStore: false,
  });
});

test('transferTo moves the memo only when the target store is different', () => {
  const dispatch = vi.fn();
  useAvailabilityStore.setState({
    carts: { '001': { storeCd: '001', storeName: '명동역점', items: [item()] } },
  });
  const { result } = renderHook(() =>
    useCartController({
      store,
      ui: { state: 'default' },
      lastSubmit: { current: null },
      locale: 'ko',
      dispatch,
    }),
  );

  act(() => result.current.transferTo({ strCd: '001', strNm: '명동역점' }, matchResult()));
  expect(useAvailabilityStore.getState().carts['001']?.items).toHaveLength(1);
  expect(useAvailabilityStore.getState().carts['002']).toBeUndefined();

  act(() => result.current.transferTo({ strCd: '002', strNm: '강남점' }, matchResult()));
  const moved = useAvailabilityStore.getState().carts['002']?.items[0];
  expect(moved).toMatchObject({ id: '12345', price: 2500, observedAt: 777 });
  expect(useAvailabilityStore.getState().carts['001']).toBeUndefined();
});

test('setQty, toggleChecked and removeItem operate on the active store only', () => {
  const dispatch = vi.fn();
  useAvailabilityStore.setState({
    carts: { '001': { storeCd: '001', storeName: '명동역점', items: [item()] } },
  });
  const { result } = renderHook(() =>
    useCartController({
      store,
      ui: { state: 'default' },
      lastSubmit: { current: null },
      locale: 'ko',
      dispatch,
    }),
  );

  act(() => result.current.setQty('12345', 3));
  expect(useAvailabilityStore.getState().carts['001']?.items[0]?.qty).toBe(3);
  act(() => result.current.toggleChecked('12345'));
  expect(useAvailabilityStore.getState().carts['001']?.items[0]?.checked).toBe(false);
  act(() => result.current.removeItem('12345'));
  expect(useAvailabilityStore.getState().carts['001']?.items).toHaveLength(0);
});
