import { createStoreDirectory, createStoreStockRepository } from './composition';
import { mockAnswers } from './mock/fixtures';

test('DEV/test build wires the keyword mock repository', async () => {
  const repo = createStoreStockRepository();
  expect(await repo.query({ strCd: '1', strNm: 'x' }, { keyword: '밀폐용기' })).toEqual(
    mockAnswers.inStock,
  );
});

test('DEV/test build wires the mock store directory', async () => {
  const dir = createStoreDirectory();
  await expect(dir.searchStores('명동')).resolves.toEqual([
    { strCd: '001', strNm: '명동역점' },
    { strCd: '002', strNm: '명동중앙점' },
  ]);
});

test('PROD build wires the live /api/availability adapter', async () => {
  vi.stubEnv('PROD', true);
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (url: RequestInfo | URL) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ noMatch: true }), { status: 200 });
  }) as typeof fetch;
  try {
    await createStoreStockRepository()
      .query({ strCd: '1', strNm: 'x' }, { keyword: 'x' })
      .catch(() => {});
    expect(calls.some((u) => u.includes('/api/availability'))).toBe(true);
  } finally {
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
  }
});
