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

test('folds out online-only docs (onlyOnlYn "Y"), keeping only store-carryable base docs', async () => {
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
                  onlyOnlYn: 'N',
                },
                {
                  pdNo: '20001',
                  exhPdNm: '온라인전용 대용량 밀폐용기',
                  pdPrc: '9900',
                  pdImgUrl: '/file/PD/y.jpg',
                  onlyOnlYn: 'Y',
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

test('online-only docs are skipped before the 10-cap (they consume no candidate slot)', async () => {
  const carryable = Array.from({ length: 12 }, (_, i) => ({
    pdNo: String(2000 + i),
    exhPdNm: `상품${i}`,
    pdPrc: '1000',
    pdImgUrl: null,
  }));
  const online = Array.from({ length: 3 }, (_, i) => ({
    pdNo: `ONL${i}`,
    exhPdNm: `온라인${i}`,
    pdPrc: '9900',
    pdImgUrl: null,
    onlyOnlYn: 'Y',
  }));
  // Interleave online-only docs among the carryable ones — if they consumed cap slots the survivors
  // would be truncated early and/or include ONL*.
  const docs = [online[0], ...carryable.slice(0, 6), online[1], ...carryable.slice(6), online[2]];
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ resultSet: { result: [{ resultDocuments: docs }] } }), {
      status: 200,
    })) as typeof fetch;
  const res = await onRequestPost(req({ keyword: 'x' }));
  const body = (await res.json()) as { candidates: Array<{ pdNo: string }> };
  expect(body.candidates).toHaveLength(10);
  expect(body.candidates.some((c) => c.pdNo.startsWith('ONL'))).toBe(false);
  // Survivors = the first 10 carryable in upstream order (online-only skipped, not counted).
  expect(body.candidates[0].pdNo).toBe('2000');
  expect(body.candidates[9].pdNo).toBe('2009');
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

test('emits Server-Timing with the search leg when DIAG_TIMING=1', async () => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ resultSet: { result: [{ resultDocuments: [] }] } }), {
      status: 200,
    })) as typeof fetch;
  const res = await onRequestPost({
    request: new Request('http://x/api/search', {
      method: 'POST',
      body: JSON.stringify({ keyword: '밀폐용기' }),
    }),
    env: { PRE_AUTH_ENC_KEY: 'k', DIAG_TIMING: '1' },
  });
  const timing = res.headers.get('server-timing');
  expect(timing).toMatch(/(^|, )total;dur=\d+/);
  expect(timing).toMatch(/(^|, )search;dur=\d+/);
});

test('emits no Server-Timing without DIAG_TIMING', async () => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ resultSet: { result: [{ resultDocuments: [] }] } }), {
      status: 200,
    })) as typeof fetch;
  const res = await onRequestPost(req({ keyword: '밀폐용기' }));
  expect(res.headers.get('server-timing')).toBeNull();
});

test('a 502 still reports how far it got', async () => {
  globalThis.fetch = (async () => new Response('nope', { status: 500 })) as typeof fetch;
  const res = await onRequestPost({
    request: new Request('http://x/api/search', {
      method: 'POST',
      body: JSON.stringify({ keyword: '밀폐용기' }),
    }),
    env: { PRE_AUTH_ENC_KEY: 'k', DIAG_TIMING: '1' },
  });
  expect(res.status).toBe(502);
  // The leg is present because it COMPLETED (with a non-ok response); this is the case the header
  // exists for, and losing it would blind exactly the failure worth measuring.
  expect(res.headers.get('server-timing')).toMatch(/search;dur=\d+/);
});

test('an early 400 carries total with no legs', async () => {
  const res = await onRequestPost({
    request: new Request('http://x/api/search', { method: 'POST', body: 'not json' }),
    env: { PRE_AUTH_ENC_KEY: 'k', DIAG_TIMING: '1' },
  });
  expect(res.status).toBe(400);
  expect(res.headers.get('server-timing')).toMatch(/^total;dur=\d+$/);
});
