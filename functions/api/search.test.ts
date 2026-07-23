import { onRequestPost } from './search';

const ENV = { PRE_AUTH_ENC_KEY: 'k' };
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
function req(body: unknown) {
  return {
    request: new Request('http://x/api/search', { method: 'POST', body: JSON.stringify(body) }),
    env: ENV,
  };
}

test('maps SearchGoods resultDocuments to whitelisted candidates, absolutizing imageUrl', async () => {
  globalThis.fetch = (async (u: RequestInfo | URL) => {
    expect(String(u)).toContain('SearchGoods');
    expect(String(u)).toContain('searchTerm=');
    return new Response(
      JSON.stringify({
        resultSet: {
          result: [
            {
              resultDocuments: [
                {
                  pdNo: '19987',
                  exhPdNm: '리빙 밀폐용기 1.2L',
                  pdPrc: '2000',
                  pdImgUrl: '/file/PD/x.jpg',
                },
              ],
            },
          ],
        },
      }),
      { status: 200 },
    );
  }) as typeof fetch;
  const res = await onRequestPost(req({ keyword: '밀폐용기' }));
  expect(res.status).toBe(200);
  expect(res.headers.get('cache-control')).toBe('no-store');
  expect(await res.json()).toEqual({
    candidates: [
      {
        pdNo: '19987',
        name: '리빙 밀폐용기 1.2L',
        price: 2000,
        imageUrl: 'https://cdn.daisomall.co.kr/file/PD/x.jpg',
      },
    ],
  });
});

test('folds out B-variant docs whose MASTER_PD_NO is non-empty, keeping only the base doc', async () => {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        resultSet: {
          result: [
            {
              resultDocuments: [
                {
                  pdNo: '19987',
                  exhPdNm: '리빙 밀폐용기 1.2L',
                  pdPrc: '2000',
                  pdImgUrl: '/file/PD/x.jpg',
                },
                {
                  pdNo: 'B19987',
                  exhPdNm: '리빙 밀폐용기 1.2L (대량)',
                  pdPrc: '18000',
                  pdImgUrl: '/file/PD/x.jpg',
                  MASTER_PD_NO: '19987',
                },
              ],
            },
          ],
        },
      }),
      { status: 200 },
    )) as typeof fetch;
  const res = await onRequestPost(req({ keyword: '밀폐용기' }));
  const body = (await res.json()) as { candidates: Array<{ pdNo: string }> };
  expect(body.candidates).toEqual([
    {
      pdNo: '19987',
      name: '리빙 밀폐용기 1.2L',
      price: 2000,
      imageUrl: 'https://cdn.daisomall.co.kr/file/PD/x.jpg',
    },
  ]);
});

test('flattens all result groups, dedups by pdNo (first wins), and caps at 10', async () => {
  const docs = Array.from({ length: 12 }, (_, i) => ({
    pdNo: String(1000 + i),
    exhPdNm: `상품${i}`,
    pdPrc: String(1000 + i),
    pdImgUrl: null,
  }));
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        resultSet: {
          result: [
            { resultDocuments: [docs[0], docs[1]] },
            { resultDocuments: [docs[1], ...docs.slice(2)] }, // docs[1] duplicated across groups
          ],
        },
      }),
      { status: 200 },
    )) as typeof fetch;
  const res = await onRequestPost(req({ keyword: 'x' }));
  const body = (await res.json()) as { candidates: Array<{ pdNo: string }> };
  expect(body.candidates).toHaveLength(10);
  expect(body.candidates[0]).toEqual({ pdNo: '1000', name: '상품0', price: 1000, imageUrl: null });
  expect(body.candidates[1]).toEqual({ pdNo: '1001', name: '상품1', price: 1001, imageUrl: null });
  // dedup: pdNo 1001 must not appear twice
  expect(body.candidates.filter((c) => c.pdNo === '1001')).toHaveLength(1);
});

test('skips docs with an empty pdNo or empty name', async () => {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        resultSet: {
          result: [
            {
              resultDocuments: [
                { pdNo: '', exhPdNm: '이름있음', pdPrc: '100', pdImgUrl: null },
                { pdNo: '123', exhPdNm: '', pdNm: '', pdPrc: '100', pdImgUrl: null },
                { pdNo: '456', exhPdNm: '정상상품', pdPrc: '100', pdImgUrl: null },
              ],
            },
          ],
        },
      }),
      { status: 200 },
    )) as typeof fetch;
  const res = await onRequestPost(req({ keyword: 'x' }));
  const body = (await res.json()) as { candidates: Array<{ pdNo: string }> };
  expect(body.candidates).toEqual([{ pdNo: '456', name: '정상상품', price: 100, imageUrl: null }]);
});

test('a blank keyword short-circuits to an empty list without calling upstream', async () => {
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    return new Response('{}', { status: 200 });
  }) as typeof fetch;
  expect(await (await onRequestPost(req({ keyword: '   ' }))).json()).toEqual({ candidates: [] });
  expect(called).toBe(false);
});

test('an upstream failure → 502 upstream_unavailable', async () => {
  globalThis.fetch = (async () => new Response('', { status: 500 })) as typeof fetch;
  const res = await onRequestPost(req({ keyword: '밀폐용기' }));
  expect(res.status).toBe(502);
  expect(await res.json()).toEqual({ error: 'upstream_unavailable' });
});
