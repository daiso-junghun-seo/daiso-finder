// src/ui/availability/scenario.test.ts
// The ?scenario= harness is DEV-only fabric data, but it is still code the state sweep depends on:
// every branch here paints a different answer during Playwright/axe runs. Unit coverage pins that
// each name reaches the pipeline it claims to, without having to run a browser for every branch.
import 'fake-indexeddb/auto';
import type { StoreEvent } from '../../domain/types';
import { saveStoreContext } from '../../infra/store-context';
import { runScenario } from './scenario';

const store = { strCd: '777', strNm: '시나리오점' };

function events(): StoreEvent[] {
  const seen: StoreEvent[] = [];
  return seen;
}

beforeEach(() => {
  localStorage.clear();
});

test('with no saved store it uses the placeholder and freezes Loading on ?scenario=loading', async () => {
  const seen = events();
  await runScenario('loading', (event) => seen.push(event));
  expect(seen).toEqual([{ type: 'SUBMIT', query: 'loading' }]);
});

test('a saved store context is used instead of the placeholder', async () => {
  saveStoreContext(store);
  const seen = events();
  await runScenario('loading', (event) => seen.push(event));
  expect(seen).toEqual([{ type: 'SUBMIT', query: 'loading' }]);
});

test('empty runs the mock query and lands NO_MATCH', async () => {
  saveStoreContext(store);
  const seen = events();
  await runScenario('empty', (event) => seen.push(event));
  expect(seen[0]).toEqual({ type: 'SUBMIT', query: 'empty' });
  expect(seen[1]).toMatchObject({ type: 'NO_MATCH', query: 'empty' });
});

test('errorNoCache lands FAILURE with no cache', async () => {
  saveStoreContext(store);
  const seen = events();
  await runScenario('errorNoCache', (event) => seen.push(event));
  expect(seen[1]).toEqual({ type: 'FAILURE', cache: { kind: 'noCache' } });
});

test('errorCached pre-seeds a fresh cache entry and lands FAILURE from it', async () => {
  saveStoreContext(store);
  const seen = events();
  await runScenario('errorCached', (event) => seen.push(event));
  expect(seen[0]).toEqual({ type: 'SUBMIT', query: 'errorCached' });
  expect(seen[1]).toMatchObject({
    type: 'FAILURE',
    cache: { kind: 'withinThreshold', answer: { kind: 'inStock' } },
  });
});

test('a known scenario name runs the mock query and lands its answer', async () => {
  saveStoreContext(store);
  const seen = events();
  await runScenario('temporarilyOut', (event) => seen.push(event));
  expect(seen[0]).toEqual({ type: 'SUBMIT', query: 'temporarilyOut' });
  expect(seen[1]).toMatchObject({
    type: 'RESULT',
    answer: { kind: 'temporarilyOut' },
    freshness: { class: 'live' },
  });
});

test('an unknown scenario name stops after SUBMIT — never a fabricated answer (F4)', async () => {
  saveStoreContext(store);
  const seen = events();
  await runScenario('__proto__', (event) => seen.push(event));
  expect(seen).toEqual([{ type: 'SUBMIT', query: '__proto__' }]);
});
