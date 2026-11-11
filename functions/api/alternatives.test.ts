import { clearAuthCache } from '../_lib/daisoAuth';
import { onRequestPost } from './alternatives';

const ENV = { PRE_AUTH_ENC_KEY: 'PRE_AUTH_ENC_KEY' };
const originalFetch = globalThis.fetch;
beforeEach(() => {
  clearAuthCache();
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;
interface Call {
  url: string;
  body: unknown;
}
function route(map: Array<[string, Handler]>): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, body });
    for (const [frag, h] of map) if (url.includes(frag)) return h(url, init);
    throw new Error(`no route for ${url}`);
  }) as typeof fetch;
  return calls;
}
const authOk: Handler = () =>
  new Response('jwt.token', { status: 200, headers: { 'x-dm-uid': 'uid-1' } });
const searchOk =
  (docs: unknown[]): Handler =>
  () =>
    new Response(JSON.stringify({ resultSet: { result: [{ resultDocuments: docs }] } }), {
      status: 200,
    });
const stockOk =
  (rows: unknown[]): Handler =>
  () =>
    new Response(JSON.stringify({ data: rows }), { status: 200 });
const locOk =
  (data: unknown[] = [{ zoneNo: '56', stairNo: '11' }]): Handler =>
  () =>
    new Response(JSON.stringify({ data }), { status: 200 });

function req(body: unknown) {
  return {
    request: new Request('http://x/api/alternatives', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    env: ENV,
  };
}
const doc = (pdNo: string, name = `상품 ${pdNo}`, extra: Record<string, unknown> = {}) => ({
  pdNo,
  pdNm: name,
  exhPdNm: name,
  pdPrc: '2000',
  pdImgUrl: `/file/PD/${pdNo}.jpg`,
  ...extra,
});

test('happy path: carryable docs only, exclude honored, stock batch by pdNo, vendor order kept', async () => {
  const calls = route([
    ['/auth/request', authOk],
    [
      'SearchGoods',
      searchOk([
        doc('1', '첫째'),
        doc('X', '제외 대상'),
        doc('2', '둘째', { MASTER_PD_NO: '1' }), // B-variant → not a base
        doc('3', '셋째', { onlyOnlYn: 'Y' }), // online-only → not store-carryable
        doc('4', '넷째'),
        doc('1', '첫째 중복'), // duplicate pdNo → dropped, first wins
        doc('', '빈 pdNo'),
      ]),
    ],
    // Deliberately shuffled vs request order: correlation must be by pdNo.
    [
      '/pd/pdh/selStrPkupStck',
      stockOk([
        { pdNo: '4', stck: '7' },
        { pdNo: '1', stck: '50' },
      ]),
    ],
    ['/pdo/selIntPdStDispInfo', locOk([{ zoneNo: '56', stairNo: '11' }])],
  ]);
  const res = await onRequestPost(req({ strCd: '10803', keyword: ' 밀폐용기 ', excludePdNo: 'X' }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({
    rows: [
      {
        pdNo: '1',
        productName: '첫째',
        price: 2000,
        imageUrl: 'https://cdn.daisomall.co.kr/file/PD/1.jpg',
        qtyUpperBound: 50,
        locations: [{ floor: '11', zone: '56' }],
      },
      {
        pdNo: '4',
        productName: '넷째',
        price: 2000,
        imageUrl: 'https://cdn.daisomall.co.kr/file/PD/4.jpg',
        qtyUpperBound: 7,
        locations: [{ floor: '11', zone: '56' }],
      },
    ],
    omitted: 0,
  });

  const stock = calls.find((c) => c.url.includes('selStrPkupStck'));
  expect(stock?.body).toEqual([
    { pdNo: '1', strCd: '10803' },
    { pdNo: '4', strCd: '10803' },
  ]);
  const disp = calls.filter((c) => c.url.includes('selIntPdStDispInfo')).map((c) => c.body);
  expect(disp).toEqual([
    { pdNo: '1', strCd: '10803' },
    { pdNo: '4', strCd: '10803' },
  ]);
  // Search hit exactly once, trimmed keyword, 30 per page.
  const search = calls.filter((c) => c.url.includes('SearchGoods'));
  expect(search).toHaveLength(1);
  expect(search[0]?.url).toContain('searchTerm=%EB%B0%80%ED%8F%90%EC%9A%A9%EA%B8%B0');
  expect(search[0]?.url).toContain('cntPerPage=30');
});

test('the 3-row bound: only the first three in-stock candidates get a location call', async () => {
  const calls = route([
    ['/auth/request', authOk],
    ['SearchGoods', searchOk([doc('1'), doc('2'), doc('3'), doc('4')])],
    [
      '/pd/pdh/selStrPkupStck',
      stockOk([
        { pdNo: '1', stck: '1' },
        { pdNo: '2', stck: '2' },
        { pdNo: '3', stck: '3' },
        { pdNo: '4', stck: '4' },
      ]),
    ],
    ['/pdo/selIntPdStDispInfo', locOk()],
  ]);
  const res = await onRequestPost(req({ strCd: '10803', keyword: '밀폐용기' }));
  const body = (await res.json()) as { rows: Array<{ pdNo: string }>; omitted: number };
  expect(body.rows.map((r) => r.pdNo)).toEqual(['1', '2', '3']);
  expect(body.omitted).toBe(0);
  expect(calls.filter((c) => c.url.includes('selIntPdStDispInfo'))).toHaveLength(3);
});

test('a failed location call omits ONLY that row and never backfills from candidate #4', async () => {
  const calls = route([
    ['/auth/request', authOk],
    ['SearchGoods', searchOk([doc('1'), doc('2'), doc('3'), doc('4')])],
    [
      '/pd/pdh/selStrPkupStck',
      stockOk([
        { pdNo: '1', stck: '1' },
        { pdNo: '2', stck: '2' },
        { pdNo: '3', stck: '3' },
        { pdNo: '4', stck: '4' },
      ]),
    ],
    [
      '/pdo/selIntPdStDispInfo',
      (url, init) => {
        const pdNo = (JSON.parse(String(init?.body)) as { pdNo: string }).pdNo;
        return pdNo === '2' ? new Response('boom', { status: 500 }) : locOk()(url, init);
      },
    ],
  ]);
  const res = await onRequestPost(req({ strCd: '10803', keyword: '밀폐용기' }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({
    rows: [expect.objectContaining({ pdNo: '1' }), expect.objectContaining({ pdNo: '3' })],
    omitted: 1,
  });
  const queried = calls
    .filter((c) => c.url.includes('selIntPdStDispInfo'))
    .map((c) => (c.body as { pdNo: string }).pdNo);
  expect(queried).toEqual(['1', '2', '3']);
  expect(queried).not.toContain('4');
});

test('empty display data means no location → row omitted; all omitted reports omitted>0', async () => {
  route([
    ['/auth/request', authOk],
    ['SearchGoods', searchOk([doc('1'), doc('2')])],
    [
      '/pd/pdh/selStrPkupStck',
      stockOk([
        { pdNo: '1', stck: '1' },
        { pdNo: '2', stck: '2' },
      ]),
    ],
    ['/pdo/selIntPdStDispInfo', locOk([{ zoneNo: '', stairNo: '1' }])],
  ]);
  const res = await onRequestPost(req({ strCd: '10803', keyword: '밀폐용기' }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ rows: [], omitted: 2 });
});

test('every picked location call failing is a 502 — “none” cannot be claimed from a failed read', async () => {
  route([
    ['/auth/request', authOk],
    ['SearchGoods', searchOk([doc('1'), doc('2')])],
    [
      '/pd/pdh/selStrPkupStck',
      stockOk([
        { pdNo: '1', stck: '1' },
        { pdNo: '2', stck: '2' },
      ]),
    ],
    ['/pdo/selIntPdStDispInfo', () => new Response('boom', { status: 500 })],
  ]);
  const res = await onRequestPost(req({ strCd: '10803', keyword: '밀폐용기' }));
  expect(res.status).toBe(502);
  expect(await res.json()).toEqual({ error: 'upstream_unavailable' });
});

test('a single in-stock candidate with a failed location call is a 502', async () => {
  route([
    ['/auth/request', authOk],
    ['SearchGoods', searchOk([doc('1')])],
    ['/pd/pdh/selStrPkupStck', stockOk([{ pdNo: '1', stck: '1' }])],
    ['/pdo/selIntPdStDispInfo', () => new Response('boom', { status: 500 })],
  ]);
  const res = await onRequestPost(req({ strCd: '10803', keyword: '밀폐용기' }));
  expect(res.status).toBe(502);
});

test('no in-stock candidates is a normal empty: rows=[] omitted=0, no location calls', async () => {
  const calls = route([
    ['/auth/request', authOk],
    ['SearchGoods', searchOk([doc('1')])],
    ['/pd/pdh/selStrPkupStck', stockOk([{ pdNo: '1', stck: '0' }])],
  ]);
  const res = await onRequestPost(req({ strCd: '10803', keyword: '밀폐용기' }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ rows: [], omitted: 0 });
  expect(calls.some((c) => c.url.includes('selIntPdStDispInfo'))).toBe(false);
});

test('a store that carries none of the candidates (missing batch rows) is a normal empty', async () => {
  route([
    ['/auth/request', authOk],
    ['SearchGoods', searchOk([doc('1'), doc('2')])],
    ['/pd/pdh/selStrPkupStck', stockOk([])],
  ]);
  const res = await onRequestPost(req({ strCd: '10803', keyword: '밀폐용기' }));
  expect(await res.json()).toEqual({ rows: [], omitted: 0 });
});

test('no search results short-circuits to empty without auth/stock work', async () => {
  const calls = route([['SearchGoods', searchOk([])]]);
  const res = await onRequestPost(req({ strCd: '10803', keyword: '없는상품' }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ rows: [], omitted: 0 });
  expect(calls.filter((c) => c.url.includes('/auth/request'))).toHaveLength(1); // started, not awaited
  expect(calls.some((c) => c.url.includes('selStrPkupStck'))).toBe(false);
});

test('SearchGoods failure is a 502', async () => {
  route([
    ['/auth/request', authOk],
    ['SearchGoods', () => new Response('boom', { status: 500 })],
  ]);
  const res = await onRequestPost(req({ strCd: '10803', keyword: '밀폐용기' }));
  expect(res.status).toBe(502);
});

test('a non-JSON SearchGoods body is a 502, never an empty claim', async () => {
  route([
    ['/auth/request', authOk],
    ['SearchGoods', () => new Response('not json', { status: 200 })],
  ]);
  const res = await onRequestPost(req({ strCd: '10803', keyword: '밀폐용기' }));
  expect(res.status).toBe(502);
});

test('auth failure is a 502', async () => {
  route([
    ['/auth/request', () => new Response('no', { status: 500 })],
    ['SearchGoods', searchOk([doc('1')])],
  ]);
  const res = await onRequestPost(req({ strCd: '10803', keyword: '밀폐용기' }));
  expect(res.status).toBe(502);
});

test('stock failure is a 502', async () => {
  route([
    ['/auth/request', authOk],
    ['SearchGoods', searchOk([doc('1')])],
    ['/pd/pdh/selStrPkupStck', () => new Response('boom', { status: 500 })],
  ]);
  const res = await onRequestPost(req({ strCd: '10803', keyword: '밀폐용기' }));
  expect(res.status).toBe(502);
});

test('a 401 on the stock call re-issues the token once and retries the same body', async () => {
  let authCalls = 0;
  const stockCalls: Array<{ uid: string | null; bearer: string | null }> = [];
  route([
    [
      '/auth/request',
      () => {
        authCalls += 1;
        return new Response(`jwt.${authCalls}`, {
          status: 200,
          headers: { 'x-dm-uid': `uid-${authCalls}` },
        });
      },
    ],
    ['SearchGoods', searchOk([doc('1')])],
    [
      '/pd/pdh/selStrPkupStck',
      (url, init) => {
        const headers = new Headers(init?.headers);
        stockCalls.push({
          uid: headers.get('x-dm-uid'),
          bearer: headers.get('authorization'),
        });
        if (stockCalls.length === 1) return new Response('expired', { status: 401 });
        return stockOk([{ pdNo: '1', stck: '1' }])(url, init);
      },
    ],
    ['/pdo/selIntPdStDispInfo', locOk()],
  ]);
  const res = await onRequestPost(req({ strCd: '10803', keyword: '밀폐용기' }));
  expect(res.status).toBe(200);
  expect(stockCalls).toHaveLength(2);
  expect(stockCalls[0]?.uid).toBe('uid-1');
  expect(stockCalls[1]?.uid).toBe('uid-2');
  expect(stockCalls[1]?.bearer).not.toBe(stockCalls[0]?.bearer);
  // The retry body is the same batch, not a new query.
  expect(authCalls).toBe(2);
});

test('missing upstream config is a 502', async () => {
  const res = await onRequestPost({
    request: new Request('http://x/api/alternatives', { method: 'POST', body: '{}' }),
    env: { PRE_AUTH_ENC_KEY: '' },
  });
  expect(res.status).toBe(502);
});

test.each([
  ['malformed JSON', 'not json'],
  ['non-string keyword', JSON.stringify({ strCd: '10803', keyword: 7 })],
  ['non-string strCd', JSON.stringify({ strCd: 10803, keyword: '밀폐용기' })],
  [
    'non-string excludePdNo',
    JSON.stringify({ strCd: '10803', keyword: '밀폐용기', excludePdNo: 7 }),
  ],
  ['empty keyword', JSON.stringify({ strCd: '10803', keyword: '   ' })],
  ['absent strCd', JSON.stringify({ keyword: '밀폐용기' })],
  ['oversized keyword', JSON.stringify({ strCd: '10803', keyword: 'x'.repeat(101) })],
  ['oversized strCd', JSON.stringify({ strCd: 'x'.repeat(33), keyword: '밀폐용기' })],
])('bad request: %s → 400 before any upstream call', async (_label, raw) => {
  const calls = route([]);
  const res = await onRequestPost({
    request: new Request('http://x/api/alternatives', { method: 'POST', body: raw }),
    env: ENV,
  });
  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({ error: 'bad_request' });
  expect(calls).toHaveLength(0);
});
