import { NoCatalogMatchError } from '../../domain/errors';
import { mockAnswers } from '../mock/fixtures';
import { type ProductIdentityResolver, createNewIntSelStrAdapter } from './newIntSelStrAdapter';
import { identityFixture, rawFixtures } from './rawFixtures';

const store = { strCd: '1', strNm: '명동역점' };
const stubIdentity: ProductIdentityResolver = {
  async resolve() {
    return identityFixture;
  },
};
const okBody = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

test('success maps msStrVOList[0] to the domain answer', async () => {
  const fetchImpl = async () => okBody({ data: { msStrVOList: [rawFixtures.inStock] } });
  const repo = createNewIntSelStrAdapter({ identity: stubIdentity, fetchImpl });
  expect(await repo.query(store, { keyword: '밀폐용기' })).toEqual(mockAnswers.inStock);
});

test('an empty msStrVOList throws NoCatalogMatchError (→ Empty, never a stale-cache dress-up)', async () => {
  const fetchImpl = async () => okBody({ data: { msStrVOList: [] } });
  const repo = createNewIntSelStrAdapter({ identity: stubIdentity, fetchImpl });
  await expect(repo.query(store, { keyword: '없는상품' })).rejects.toBeInstanceOf(
    NoCatalogMatchError,
  );
});

test('a non-ok relay response throws (→ FAILURE via the query runner)', async () => {
  const fetchImpl = async () => ({ ok: false, status: 502, json: async () => ({}) });
  const repo = createNewIntSelStrAdapter({ identity: stubIdentity, fetchImpl });
  await expect(repo.query(store, { keyword: '밀폐용기' })).rejects.toThrow();
});
