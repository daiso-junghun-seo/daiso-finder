import { NoCatalogMatchError } from '../../domain/errors';
import { mockAnswers } from './fixtures';
// src/adapters/mock/mockRepository.test.ts
import { createKeywordMockRepository, createMockRepository } from './mockRepository';

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

describe('createKeywordMockRepository', () => {
  const store = { strCd: '001', strNm: '명동역점' };

  test('an exact scenario key resolves to that fixture', async () => {
    const repo = createKeywordMockRepository();
    await expect(repo.query(store, { keyword: 'franchise' })).resolves.toBe(mockAnswers.franchise);
    await expect(repo.query(store, { keyword: 'temporarilyOut' })).resolves.toBe(
      mockAnswers.temporarilyOut,
    );
  });

  test('a keyword contained in the mock product name resolves to inStock', async () => {
    const repo = createKeywordMockRepository();
    await expect(repo.query(store, { keyword: '밀폐용기' })).resolves.toBe(mockAnswers.inStock);
    await expect(repo.query(store, { keyword: '리빙 밀폐용기 1.2L' })).resolves.toBe(
      mockAnswers.inStock,
    );
  });

  test('anything else throws NoCatalogMatchError (→ Empty)', async () => {
    const repo = createKeywordMockRepository();
    await expect(repo.query(store, { keyword: '락앤락같은통' })).rejects.toBeInstanceOf(
      NoCatalogMatchError,
    );
    await expect(repo.query(store, { keyword: '' })).rejects.toBeInstanceOf(NoCatalogMatchError);
  });
});
