import { NoCatalogMatchError, UnmappableAnswerError } from '../../domain/errors';
import { mockAnswers } from '../mock/fixtures';
import { observationFixtures } from './observationFixtures';
import { type FetchLike, createDaisoStoreStockRepository } from './storeStockRepository';

const store = { strCd: '10803', strNm: '명동역점' };
const ok = (body: unknown): ReturnType<FetchLike> =>
  Promise.resolve({ ok: true, status: 200, json: async () => body });

test('a { data } observation is validated and mapped to the domain answer', async () => {
  const fetchImpl: FetchLike = async (_url, init) => {
    expect(JSON.parse(init.body)).toEqual({ strCd: '10803', keyword: '밀폐용기' });
    return ok({ data: observationFixtures.inStock });
  };
  const repo = createDaisoStoreStockRepository({ fetchImpl });
  expect(await repo.query(store, { keyword: '밀폐용기' })).toEqual(mockAnswers.inStock);
});

test('a pdNo term is forwarded on the POST body (candidate-tap re-query)', async () => {
  const fetchImpl: FetchLike = async (_url, init) => {
    expect(JSON.parse(init.body)).toEqual({
      strCd: '10803',
      keyword: '리빙 밀폐용기 1.2L',
      pdNo: '19987',
    });
    return ok({ data: observationFixtures.inStock });
  };
  const repo = createDaisoStoreStockRepository({ fetchImpl });
  expect(await repo.query(store, { keyword: '리빙 밀폐용기 1.2L', pdNo: '19987' })).toEqual(
    mockAnswers.inStock,
  );
});

test('{ noMatch: true } → NoCatalogMatchError (→ NO_MATCH → Empty)', async () => {
  const repo = createDaisoStoreStockRepository({ fetchImpl: async () => ok({ noMatch: true }) });
  await expect(repo.query(store, { keyword: '없는상품' })).rejects.toBeInstanceOf(
    NoCatalogMatchError,
  );
});

test('a non-ok response throws (→ FAILURE path)', async () => {
  const repo = createDaisoStoreStockRepository({
    fetchImpl: async () => ({ ok: false, status: 502, json: async () => ({}) }),
  });
  await expect(repo.query(store, { keyword: '밀폐용기' })).rejects.toThrow();
});

test('a malformed observation → UnmappableAnswerError (safe fallback, no fabrication)', async () => {
  const repo = createDaisoStoreStockRepository({
    fetchImpl: async () => ok({ data: { strCd: 1 } }),
  });
  await expect(repo.query(store, { keyword: '밀폐용기' })).rejects.toBeInstanceOf(
    UnmappableAnswerError,
  );
});
