// src/adapters/composition.stock-chunk.test.ts — the live availability adapter is a lazily loaded chunk
// in PROD. These pin the two things that split must not get wrong: the load starts when the repository
// is created (before any query), and a failed load is not cached for the rest of the session.
//
// The failure is injected at the adapter factory, which sits inside the same `.then` as the chunk
// import — a rejected `import()` and a throwing factory land in the same `.catch`, so the reset path
// under test is identical. (A throwing module factory would instead depend on how the test runner
// caches failed module evaluations, which is not the production contract.)
const state = vi.hoisted(() => ({ created: 0, failFirst: 0 }));

vi.mock('./daisomall/storeStockRepository', () => ({
  createDaisoStoreStockRepository: () => {
    state.created += 1;
    if (state.created <= state.failFirst) throw new Error('chunk down');
    return { query: async () => ({ kind: 'inStock' }) };
  },
}));

import { createStoreStockRepository } from './composition';

const store = { strCd: '1', strNm: 'x' };
const term = { keyword: 'x' };

beforeEach(() => {
  state.created = 0;
  state.failFirst = 0;
  vi.stubEnv('PROD', true);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

test('PROD starts the stock chunk load at creation, before the first query', async () => {
  const repo = createStoreStockRepository();
  // No query yet: the load is already in flight.
  await vi.waitFor(() => expect(state.created).toBe(1));
  await expect(repo.query(store, term)).resolves.toEqual({ kind: 'inStock' });
  // The query reused the warm-up load rather than starting a second one.
  expect(state.created).toBe(1);
});

test('a failed stock load is not cached: the next query retries and succeeds', async () => {
  state.failFirst = 1;
  const repo = createStoreStockRepository();
  // The warm-up failure is swallowed (the query is where it must be reported); if it were not, this
  // test would fail the run as an unhandled rejection.
  await vi.waitFor(() => expect(state.created).toBe(1));
  await expect(repo.query(store, term)).resolves.toEqual({ kind: 'inStock' });
  expect(state.created).toBe(2);
});
