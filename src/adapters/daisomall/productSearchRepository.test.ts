import { type FetchLike, createDaisoProductSearch } from './productSearchRepository';

const ok = (body: unknown): ReturnType<FetchLike> =>
  Promise.resolve({ ok: true, status: 200, json: async () => body });

test('maps { candidates } to ProductCandidate[] (imageUrl omitted when null)', async () => {
  const search = createDaisoProductSearch({
    fetchImpl: async (_u, init) => {
      expect(JSON.parse(init.body)).toEqual({ keyword: '밀폐용기' });
      return ok({
        candidates: [
          {
            pdNo: '19987',
            name: '리빙 밀폐용기 1.2L',
            price: 2000,
            imageUrl: 'https://cdn.daisomall.co.kr/file/PD/x.jpg',
          },
          { pdNo: '19989', name: '밀폐용기 6P 세트', price: 5000, imageUrl: null },
        ],
      });
    },
  });
  await expect(search.search('밀폐용기')).resolves.toEqual([
    {
      pdNo: '19987',
      name: '리빙 밀폐용기 1.2L',
      price: 2000,
      imageUrl: 'https://cdn.daisomall.co.kr/file/PD/x.jpg',
    },
    { pdNo: '19989', name: '밀폐용기 6P 세트', price: 5000 },
  ]);
});

test('a blank keyword returns [] without calling the proxy', async () => {
  let called = false;
  const search = createDaisoProductSearch({
    fetchImpl: async () => {
      called = true;
      return ok({ candidates: [] });
    },
  });
  await expect(search.search('   ')).resolves.toEqual([]);
  expect(called).toBe(false);
});

test('a non-ok response or network failure degrades to [] (honest empty, never a crash)', async () => {
  const notOk = createDaisoProductSearch({
    fetchImpl: async () => ({ ok: false, status: 502, json: async () => ({}) }),
  });
  await expect(notOk.search('밀폐용기')).resolves.toEqual([]);
  const boom = createDaisoProductSearch({
    fetchImpl: async () => {
      throw new Error('network');
    },
  });
  await expect(boom.search('밀폐용기')).resolves.toEqual([]);
});

test('malformed candidate rows (wrong types) are filtered out', async () => {
  const search = createDaisoProductSearch({
    fetchImpl: async () =>
      ok({
        candidates: [
          { pdNo: '1', name: 'ok', price: 100, imageUrl: null },
          { pdNo: 2, name: 'bad pdNo type', price: 100 },
          { pdNo: '3', name: 123, price: 100 },
          { pdNo: '4', name: 'bad price', price: '100' },
        ],
      }),
  });
  await expect(search.search('x')).resolves.toEqual([{ pdNo: '1', name: 'ok', price: 100 }]);
});
