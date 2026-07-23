import {
  type FetchLike,
  createDaisoNearbyFetch,
  createDaisoStoreDirectory,
} from './storeDirectory';

const ok = (body: unknown): ReturnType<FetchLike> =>
  Promise.resolve({ ok: true, status: 200, json: async () => body });

test('maps { stores } to StoreContext[]', async () => {
  const dir = createDaisoStoreDirectory({
    fetchImpl: async (_u, init) => {
      expect(JSON.parse(init.body)).toEqual({ query: '명동' });
      return ok({
        stores: [
          { strCd: '11043', strNm: '명동역점' },
          { strCd: '11044', strNm: '명동중앙점' },
        ],
      });
    },
  });
  await expect(dir.searchStores('명동')).resolves.toEqual([
    { strCd: '11043', strNm: '명동역점' },
    { strCd: '11044', strNm: '명동중앙점' },
  ]);
});

test('a blank query returns [] without calling the proxy', async () => {
  let called = false;
  const dir = createDaisoStoreDirectory({
    fetchImpl: async () => {
      called = true;
      return ok({ stores: [] });
    },
  });
  await expect(dir.searchStores('   ')).resolves.toEqual([]);
  expect(called).toBe(false);
});

test('a non-ok response or network failure degrades to [] (honest empty, never a crash)', async () => {
  const notOk = createDaisoStoreDirectory({
    fetchImpl: async () => ({ ok: false, status: 502, json: async () => ({}) }),
  });
  await expect(notOk.searchStores('명동')).resolves.toEqual([]);
  const boom = createDaisoStoreDirectory({
    fetchImpl: async () => {
      throw new Error('network');
    },
  });
  await expect(boom.searchStores('명동')).resolves.toEqual([]);
});

test('nearby fetch: maps { stores } with km to { strCd, strNm, distanceM } (km×1000 rounded)', async () => {
  const fetchNearby = createDaisoNearbyFetch({
    fetchImpl: async (_u, init) => {
      expect(JSON.parse(init.body)).toEqual({ lat: 37.5, lng: 127.0 });
      return ok({
        stores: [
          { strCd: '11043', strNm: '명동역점', km: 0.34 },
          { strCd: '11044', strNm: '명동중앙점', km: 1.2345 },
        ],
      });
    },
  });
  await expect(fetchNearby(37.5, 127.0)).resolves.toEqual([
    { strCd: '11043', strNm: '명동역점', distanceM: 340 },
    { strCd: '11044', strNm: '명동중앙점', distanceM: 1235 },
  ]);
});

test('nearby fetch: rows without a numeric km are filtered out', async () => {
  const fetchNearby = createDaisoNearbyFetch({
    fetchImpl: async () =>
      ok({
        stores: [
          { strCd: '11043', strNm: '명동역점', km: 0.34 },
          { strCd: '11044', strNm: '누락점' },
          { strCd: '11045', strNm: '문자열점', km: 'x' },
        ],
      }),
  });
  await expect(fetchNearby(37.5, 127.0)).resolves.toEqual([
    { strCd: '11043', strNm: '명동역점', distanceM: 340 },
  ]);
});

test('nearby fetch: a non-ok response or network failure degrades to []', async () => {
  const notOk = createDaisoNearbyFetch({
    fetchImpl: async () => ({ ok: false, status: 502, json: async () => ({}) }),
  });
  await expect(notOk(37.5, 127.0)).resolves.toEqual([]);
  const boomNearby = createDaisoNearbyFetch({
    fetchImpl: async () => {
      throw new Error('network');
    },
  });
  await expect(boomNearby(37.5, 127.0)).resolves.toEqual([]);
});
