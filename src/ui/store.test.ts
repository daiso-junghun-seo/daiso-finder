// src/ui/store.test.ts
import { initialState } from '../domain/state-machine';
import { strings } from '../i18n/strings';
import { loadRecentSearches } from '../infra/recent-searches';
import { loadStoreContext } from '../infra/store-context';
import { useAvailabilityStore } from './store';

test('dispatch routes through the pure reducer', () => {
  useAvailabilityStore.getState().dispatch({ type: 'SUBMIT', query: '밀폐용기' });
  expect(useAvailabilityStore.getState().ui).toMatchObject({ state: 'loading', query: '밀폐용기' });
});

describe('store context (D082)', () => {
  beforeEach(() => {
    localStorage.clear();
    useAvailabilityStore.setState({
      ui: initialState,
      store: null,
      sheetOpen: true,
    });
  });

  test('selectStore persists the store, closes the sheet, and resets ui to default', () => {
    useAvailabilityStore.setState({ ui: { state: 'loading', query: '밀폐용기', slow: false } });
    useAvailabilityStore.getState().selectStore({ strCd: '002', strNm: '명동중앙점' });
    const s = useAvailabilityStore.getState();
    expect(s.store).toEqual({ strCd: '002', strNm: '명동중앙점' });
    expect(s.sheetOpen).toBe(false);
    expect(s.ui).toEqual({ state: 'default' });
    expect(loadStoreContext()).toEqual({ strCd: '002', strNm: '명동중앙점' });
  });

  test('selectStore still updates store/sheetOpen/ui when persistence is blocked (F3)', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    try {
      useAvailabilityStore.getState().selectStore({ strCd: '003', strNm: '을지로점' });
    } finally {
      spy.mockRestore();
    }
    const s = useAvailabilityStore.getState();
    expect(s.store).toEqual({ strCd: '003', strNm: '을지로점' });
    expect(s.sheetOpen).toBe(false);
    expect(s.ui).toEqual({ state: 'default' });
  });

  test('openSheet/closeSheet toggle the sheet', () => {
    useAvailabilityStore.getState().closeSheet();
    expect(useAvailabilityStore.getState().sheetOpen).toBe(false);
    useAvailabilityStore.getState().openSheet();
    expect(useAvailabilityStore.getState().sheetOpen).toBe(true);
  });
});

describe('recent searches', () => {
  beforeEach(() => {
    localStorage.clear();
    useAvailabilityStore.setState({ recentSearches: [] });
  });

  test('recordSearch updates recentSearches and persists it (loadRecentSearches reflects it)', () => {
    useAvailabilityStore.getState().recordSearch('밀폐용기');
    expect(useAvailabilityStore.getState().recentSearches).toEqual(['밀폐용기']);
    expect(loadRecentSearches()).toEqual(['밀폐용기']);
  });

  test('recording the same keyword twice keeps it as a single entry at the front', () => {
    useAvailabilityStore.getState().recordSearch('밀폐용기');
    useAvailabilityStore.getState().recordSearch('밀폐용기');
    expect(useAvailabilityStore.getState().recentSearches).toEqual(['밀폐용기']);
  });
});

describe('cart actions (§B47)', () => {
  const item = {
    id: '12345',
    name: '리빙 밀폐용기 1.2L',
    query: '밀폐용기',
    pdNo: '12345',
    price: 2000,
    qty: 1,
    checked: true,
    addedAt: 1,
    observedAt: 1,
  };

  beforeEach(() => {
    localStorage.clear();
    useAvailabilityStore.setState({
      carts: { '001': { storeCd: '001', storeName: '명동역점', items: [item] } },
    });
  });

  test('toggleItemChecked flips only the named row and persists', () => {
    useAvailabilityStore.getState().toggleItemChecked('001', '12345');
    expect(useAvailabilityStore.getState().carts['001']?.items[0]?.checked).toBe(false);
    expect(localStorage.getItem('daiso.carts.v1')).toContain('"checked":false');
  });

  test('removeItem drops the row from that store list and persists the empty cart', () => {
    useAvailabilityStore.getState().removeItem('001', '12345');
    expect(useAvailabilityStore.getState().carts['001']?.items).toEqual([]);
    expect(localStorage.getItem('daiso.carts.v1')).toContain('"items":[]');
  });
});

// Owner decision §B52: only ko/en ship in the entry chunk. A language switch must never paint
// one language's guidance under another language's <select> value, so a lazy table commits
// only after its chunk resolves. ko/en stay synchronous (they are always resident).
describe('locale switch', () => {
  beforeEach(() => {
    localStorage.clear();
    useAvailabilityStore.setState({ locale: 'ko' });
  });

  test('a resident table (ko) commits synchronously and persists', () => {
    useAvailabilityStore.setState({ locale: 'en' });
    useAvailabilityStore.getState().setLocale('ko');
    expect(useAvailabilityStore.getState().locale).toBe('ko');
    expect(localStorage.getItem('daiso.locale')).toBe('ko');
  });

  test('a lazy table commits only after its chunk loads', async () => {
    useAvailabilityStore.getState().setLocale('ja');
    // Still Korean on the same tick: the select's value must not move before the table exists.
    expect(useAvailabilityStore.getState().locale).toBe('ko');
    await vi.waitFor(() => {
      expect(useAvailabilityStore.getState().locale).toBe('ja');
    });
    expect(localStorage.getItem('daiso.locale')).toBe('ja');
    // The chunk really is the Japanese table, not the English fallback.
    expect(strings('ja').HOW_IT_WORKS_LABEL).toBe('使い方');
  });
});
