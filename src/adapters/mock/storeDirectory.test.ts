import { createMockStoreDirectory, mockStores } from './storeDirectory';

test('mockStores mirrors the Bible store-selection mockup (distance-sorted)', () => {
  expect(mockStores.map((s) => `${s.strNm} · ${s.distanceM}m`)).toEqual([
    '명동역점 · 120m',
    '명동중앙점 · 340m',
    '을지로점 · 600m',
  ]);
});

test('searchStores filters by store-name substring', async () => {
  const dir = createMockStoreDirectory();
  await expect(dir.searchStores('명동')).resolves.toEqual([
    { strCd: '001', strNm: '명동역점' },
    { strCd: '002', strNm: '명동중앙점' },
  ]);
  await expect(dir.searchStores('을지로')).resolves.toEqual([{ strCd: '003', strNm: '을지로점' }]);
});

test('searchStores returns [] for a blank or unmatched query', async () => {
  const dir = createMockStoreDirectory();
  await expect(dir.searchStores('   ')).resolves.toEqual([]);
  await expect(dir.searchStores('강남')).resolves.toEqual([]);
});
