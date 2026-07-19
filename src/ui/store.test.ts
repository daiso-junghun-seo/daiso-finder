// src/ui/store.test.ts
import { initialState } from '../domain/state-machine';
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

  test('openSheet/closeSheet toggle the sheet', () => {
    useAvailabilityStore.getState().closeSheet();
    expect(useAvailabilityStore.getState().sheetOpen).toBe(false);
    useAvailabilityStore.getState().openSheet();
    expect(useAvailabilityStore.getState().sheetOpen).toBe(true);
  });
});
