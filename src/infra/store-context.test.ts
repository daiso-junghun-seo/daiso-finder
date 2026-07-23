// src/infra/store-context.test.ts
import { loadStoreContext, saveStoreContext } from './store-context';

beforeEach(() => localStorage.clear());

test('no store selected yet → null (first run leads to store search, never a search block)', () => {
  expect(loadStoreContext()).toBeNull();
});
test('the last-selected store persists and is the default', () => {
  saveStoreContext({ strCd: '1', strNm: '명동역점' });
  expect(loadStoreContext()).toEqual({ strCd: '1', strNm: '명동역점' });
});
test('loadStoreContext degrades corrupt storage to null instead of throwing (G3 hardening)', () => {
  localStorage.setItem('daiso.storeContext', '{not json');
  expect(loadStoreContext()).toBeNull();
});

test('saveStoreContext is best-effort: blocked storage never throws (D082 operability)', () => {
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('storage blocked');
  });
  try {
    expect(() => saveStoreContext({ strCd: '1', strNm: '명동역점' })).not.toThrow();
  } finally {
    spy.mockRestore();
  }
});
