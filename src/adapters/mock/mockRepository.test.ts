import { mockAnswers } from './fixtures';
// src/adapters/mock/mockRepository.test.ts
import { createMockRepository } from './mockRepository';

const store = { strCd: '1', strNm: '명동역점' };

test('every scenario is represented', () => {
  expect(Object.keys(mockAnswers)).toEqual(
    expect.arrayContaining([
      'inStock',
      'inStockLowQty',
      'inStockMultiLocation',
      'noLocation',
      'temporarilyOut',
      'discontinued',
      'notCarried',
      'restockArriving',
      'franchise',
    ]),
  );
});
test('mock repository resolves the requested scenario answer', async () => {
  const repo = createMockRepository('temporarilyOut');
  await expect(repo.query(store, { keyword: '밀폐용기' })).resolves.toEqual(
    mockAnswers.temporarilyOut,
  );
});
test('mock repository can simulate a failure for the offline path', async () => {
  const repo = createMockRepository('inStock', { fail: true });
  await expect(repo.query(store, { keyword: '밀폐용기' })).rejects.toThrow();
});
test('mock repository can simulate a no-catalog-match (→ NO_MATCH → Empty)', async () => {
  const { NoCatalogMatchError } = await import('../../domain/errors');
  const repo = createMockRepository('inStock', { noMatch: true });
  await expect(repo.query(store, { keyword: '없는상품' })).rejects.toBeInstanceOf(
    NoCatalogMatchError,
  );
});
