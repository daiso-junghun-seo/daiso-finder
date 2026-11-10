import { mockAnswers } from '../../adapters/mock/fixtures';
import type { StoreContext } from '../../domain/types';
import { createDevRefreshRepository, parseDevRefreshMode } from './dev-refresh';
import type { InStockAnswer, NavigationEntry } from './navigation-refresh';

const NOW = new Date(2026, 6, 15, 9, 0).getTime();
const STORE: StoreContext = { strCd: '001', strNm: '명동역점' };
const ANSWER = mockAnswers.inStock as InStockAnswer;
const TERM = { keyword: '밀폐용기' } as const;

function entry(locations = ANSWER.locations): NavigationEntry {
  return {
    store: STORE,
    answer: { ...ANSWER, locations },
    freshness: { class: 'live', observedAt: NOW },
    term: { kind: 'keyword', keyword: '밀폐용기' },
  };
}

test('parseDevRefreshMode accepts only the six sweep modes', () => {
  for (const mode of ['failed', 'soldOut', 'other', 'still', 'recoverStale', 'unapplied']) {
    expect(parseDevRefreshMode(`?navRefresh=${mode}`)).toBe(mode);
  }
  expect(parseDevRefreshMode('?navRefresh=nope')).toBeNull();
  expect(parseDevRefreshMode('')).toBeNull();
});

test('failed never returns an answer — the entry refresh must cost only freshness', async () => {
  const repo = createDevRefreshRepository(entry(), 'failed');
  await expect(repo.query(STORE, TERM)).rejects.toThrow('dev navRefresh=failed');
});

test('the entry refresh is unchanged; the second call produces the requested outcome', async () => {
  for (const mode of ['soldOut', 'other', 'still', 'unapplied'] as const) {
    const repo = createDevRefreshRepository(entry(), mode);
    await expect(repo.query(STORE, TERM)).resolves.toEqual(ANSWER);
    const second = await repo.query(STORE, TERM);
    if (mode === 'soldOut') expect(second.kind).toBe('temporarilyOut');
    if (mode === 'other') expect(second.kind === 'inStock' && second.locations.length).toBe(2);
    if (mode === 'still') expect(second).toEqual(ANSWER);
    if (mode === 'unapplied') expect(second.kind).toBe('discontinued');
  }
});

test('recoverStale fails the entry refresh so 못 찾겠어요 is required first', async () => {
  const repo = createDevRefreshRepository(entry(), 'recoverStale');
  await expect(repo.query(STORE, TERM)).rejects.toThrow('entry failure');
  await expect(repo.query(STORE, TERM)).resolves.toEqual(ANSWER);
});

test('other adds a position the answer does not already have', async () => {
  const repo = createDevRefreshRepository(entry([{ floor: '2', zone: '14' }]), 'other');
  await repo.query(STORE, TERM);
  const second = await repo.query(STORE, TERM);
  expect(second.kind).toBe('inStock');
  if (second.kind === 'inStock') {
    expect(second.locations).toEqual([
      { floor: '2', zone: '14' },
      { floor: '3', zone: '12' },
    ]);
  }
});
