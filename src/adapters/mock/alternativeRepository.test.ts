import { mockNearbyRows, mockSimilarRows } from './alternativeFixtures';
import { ALT_SCENARIO_LATENCY_MS, createMockAlternativeRepository } from './alternativeRepository';

const STORE = { strCd: '001', strNm: '명동역점' };

test('the default double answers both groups with the shared fixtures', async () => {
  const repo = createMockAlternativeRepository();
  await expect(repo.querySimilar(STORE, { keyword: '밀폐용기' })).resolves.toEqual(mockSimilarRows);
  await expect(repo.queryNearby(STORE, '19987')).resolves.toEqual(mockNearbyRows);
});

test('each scenario changes only the groups it names', async () => {
  const aEmpty = createMockAlternativeRepository('aEmpty');
  await expect(aEmpty.querySimilar(STORE, { keyword: 'x' })).resolves.toEqual([]);
  await expect(aEmpty.queryNearby(STORE, '19987')).resolves.toEqual(mockNearbyRows);

  const bothEmpty = createMockAlternativeRepository('bothEmpty');
  await expect(bothEmpty.querySimilar(STORE, { keyword: 'x' })).resolves.toEqual([]);
  await expect(bothEmpty.queryNearby(STORE, '19987')).resolves.toEqual([]);

  const bothFailed = createMockAlternativeRepository('bothFailed');
  await expect(bothFailed.querySimilar(STORE, { keyword: 'x' })).rejects.toThrow(
    'mock alternatives failure',
  );
  await expect(bothFailed.queryNearby(STORE, '19987')).rejects.toThrow('mock alternatives failure');
});

test('a latency scenario resolves after its designed delay', async () => {
  vi.useFakeTimers();
  try {
    const repo = createMockAlternativeRepository('slow');
    const pending = repo.querySimilar(STORE, { keyword: 'x' });
    await vi.advanceTimersByTimeAsync(ALT_SCENARIO_LATENCY_MS);
    await expect(pending).resolves.toEqual(mockSimilarRows);
  } finally {
    vi.useRealTimers();
  }
});

test('an abort during the mock latency rejects like a dead request', async () => {
  vi.useFakeTimers();
  try {
    const repo = createMockAlternativeRepository('bSlow');
    const controller = new AbortController();
    const pending = repo.queryNearby(STORE, '19987', controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  } finally {
    vi.useRealTimers();
  }
});
