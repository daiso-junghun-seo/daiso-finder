// src/ui/store.test.ts
import { initialState } from '../domain/state-machine';
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
