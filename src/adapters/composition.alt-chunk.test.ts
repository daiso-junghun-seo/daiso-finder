// src/adapters/composition.alt-chunk.test.ts — Flow 3's live adapter is a lazy chunk in PROD.
// These pin the same two contracts the stock chunk has: the load starts on first use and a failed
// load is not cached. The module is mocked at the adapter factory so the test does not need the
// network or the zxing/raw parser graph.
const state = vi.hoisted(() => ({ created: 0, failFirst: 0, calls: [] as string[] }));

vi.mock('./daisomall/alternativeRepository', () => ({
  createDaisoAlternativeRepository: () => {
    state.created += 1;
    if (state.created <= state.failFirst) throw new Error('chunk down');
    return {
      querySimilar: async () => {
        state.calls.push('similar');
        return [];
      },
      queryNearby: async () => {
        state.calls.push('nearby');
        return [];
      },
    };
  },
}));

import { createAlternativeRepository, currentDevAltScenario } from './composition';

const store = { strCd: '001', strNm: '명동역점' };

beforeEach(() => {
  state.created = 0;
  state.failFirst = 0;
  state.calls = [];
  vi.stubEnv('PROD', true);
});

afterEach(() => {
  vi.unstubAllEnvs();
  window.history.pushState({}, '', '/');
});

test('PROD loads the Flow 3 chunk on the first query and reuses it for the second', async () => {
  const repo = createAlternativeRepository();
  expect(state.created).toBe(0); // creating the port is free

  await expect(repo.querySimilar(store, { keyword: '밀폐용기' })).resolves.toEqual([]);
  expect(state.created).toBe(1);

  await expect(repo.queryNearby(store, '19987')).resolves.toEqual([]);
  expect(state.created).toBe(1);
  expect(state.calls).toEqual(['similar', 'nearby']);
});

test('a failed Flow 3 chunk load is not cached: the next query retries and succeeds', async () => {
  state.failFirst = 1;
  const repo = createAlternativeRepository();

  await expect(repo.querySimilar(store, { keyword: '밀폐용기' })).rejects.toThrow('chunk down');
  await expect(repo.queryNearby(store, '19987')).resolves.toEqual([]);
  expect(state.created).toBe(2);
  expect(state.calls).toEqual(['nearby']);
});

test('?alt= is DEV-only: PROD always resolves null, DEV parses the known scenarios', () => {
  window.history.pushState({}, '', '/?alt=nearby');
  expect(currentDevAltScenario()).toBeNull();

  vi.unstubAllEnvs();
  expect(currentDevAltScenario()).toBe('nearby');

  window.history.pushState({}, '', '/?alt=not-a-scenario');
  expect(currentDevAltScenario()).toBeNull();
});
