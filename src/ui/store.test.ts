// src/ui/store.test.ts
import { useAvailabilityStore } from './store';

test('dispatch routes through the pure reducer', () => {
  useAvailabilityStore.getState().dispatch({ type: 'SUBMIT', query: '밀폐용기' });
  expect(useAvailabilityStore.getState().ui).toMatchObject({ state: 'loading', query: '밀폐용기' });
});
