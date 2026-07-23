import { onRequestPost } from './availability';

const ENV = { PRE_AUTH_ENC_KEY: 'PRE_AUTH_ENC_KEY' };
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

type Handler = (url: string, init?: RequestInit) => Response;
function route(map: Array<[string, Handler]>) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    for (const [frag, h] of map) if (url.includes(frag)) return h(url, init);
    throw new Error(`no route for ${url}`);
  }) as typeof fetch;
}
const authOk: Handler = () =>
  new Response('jwt.token', { status: 200, headers: { 'x-dm-uid': 'uid-1' } });
const searchOk =
  (docs: unknown[]): Handler =>
  () =>
    new Response(JSON.stringify({ resultSet: { result: [{ resultDocuments: docs }] } }), {
      status: 200,
    });
const PROD = {
  pdNo: '19987',
  pdNm: '리빙 밀폐용기 1.2L',
  exhPdNm: '리빙 밀폐용기 1.2L',
  pdPrc: '2000',
  pdImgUrl: '/file/PD/x.jpg',
};
function expectAuth(init?: RequestInit) {
  const h = (init?.headers ?? {}) as Record<string, string>;
  expect(h.authorization?.startsWith('Bearer ')).toBe(true);
  expect(h['x-dm-uid']).toBe('uid-1');
}
function req(body: unknown) {
  return {
    request: new Request('http://x/api/availability', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    env: ENV,
  };
}

test('direct store: fans out and returns a normalized inStock observation with no-store', async () => {
  route([
    ['/auth/request', authOk],
    ['SearchGoods', searchOk([PROD])],
    [
      '/ms/msg/selStr',
      () => new Response(JSON.stringify({ strCd: '10803', directYn: 'Y' }), { status: 200 }),
    ],
    [
      '/pdo/selIntPdStDispInfo',
      (_u, init) => {
        expectAuth(init);
        return new Response(JSON.stringify({ data: [{ zoneNo: '56', stairNo: '11' }] }), {
          status: 200,
        });
      },
    ],
    [
      '/pd/pdh/selStrPkupStck',
      (_u, init) => {
        expectAuth(init);
        return new Response(JSON.stringify({ data: [{ sleStsCd: '1', stck: '50' }] }), {
          status: 200,
        });
      },
    ],
  ]);
  const res = await onRequestPost(req({ strCd: '10803', keyword: '밀폐용기' }));
  expect(res.status).toBe(200);
  expect(res.headers.get('cache-control')).toBe('no-store');
  expect(await res.json()).toEqual({
    data: {
      strCd: '10803',
      pdNo: '19987',
      productName: '리빙 밀폐용기 1.2L',
      price: 2000,
      directYn: 'Y',
      stck: '50',
      sleStsCd: '1',
      mrkGdsYn: null,
      lchDay: null,
      locations: [{ floor: '11', zone: '56' }],
      imageUrl: 'https://cdn.daisomall.co.kr/file/PD/x.jpg',
    },
  });
});

test('franchise with no display zone: stock NOT fetched (stck null), locations empty', async () => {
  let stckCalled = false;
  route([
    ['/auth/request', authOk],
    ['SearchGoods', searchOk([PROD])],
    ['/ms/msg/selStr', () => new Response(JSON.stringify({ directYn: 'N' }), { status: 200 })],
    ['/pdo/selIntPdStDispInfo', () => new Response(JSON.stringify({ data: [] }), { status: 200 })],
    [
      '/pd/pdh/selStrPkupStck',
      () => {
        stckCalled = true;
        return new Response('{}', { status: 200 });
      },
    ],
  ]);
  const body = (await (await onRequestPost(req({ strCd: '1', keyword: '밀폐용기' }))).json()) as {
    data: { stck: string | null; directYn: string; locations: unknown[] };
  };
  expect(stckCalled).toBe(false);
  expect(body.data.stck).toBeNull();
  expect(body.data.directYn).toBe('N');
  expect(body.data.locations).toEqual([]);
});

test('franchise WITH a display zone: stock IS fetched (지하 floor preserved raw)', async () => {
  let stckCalled = false;
  route([
    ['/auth/request', authOk],
    ['SearchGoods', searchOk([PROD])],
    ['/ms/msg/selStr', () => new Response(JSON.stringify({ directYn: 'N' }), { status: 200 })],
    [
      '/pdo/selIntPdStDispInfo',
      () =>
        new Response(JSON.stringify({ data: [{ zoneNo: '30', stairNo: '-1' }] }), { status: 200 }),
    ],
    [
      '/pd/pdh/selStrPkupStck',
      () => {
        stckCalled = true;
        return new Response(JSON.stringify({ data: [{ stck: '6', sleStsCd: '1' }] }), {
          status: 200,
        });
      },
    ],
  ]);
  const body = (await (await onRequestPost(req({ strCd: '1', keyword: '밀폐용기' }))).json()) as {
    data: { stck: string | null; locations: { floor: string; zone: string }[] };
  };
  expect(stckCalled).toBe(true);
  expect(body.data.stck).toBe('6');
  expect(body.data.locations).toEqual([{ floor: '-1', zone: '30' }]);
});

test('SearchGoods 0 results → { noMatch: true }', async () => {
  route([
    ['/auth/request', authOk],
    ['SearchGoods', searchOk([])],
    ['/ms/msg/selStr', () => new Response(JSON.stringify({ directYn: 'Y' }), { status: 200 })],
  ]);
  const res = await onRequestPost(req({ strCd: '1', keyword: '없는상품' }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ noMatch: true });
});

test('an upstream failure on a required call → 502 upstream_unavailable + CORS', async () => {
  route([
    ['/auth/request', authOk],
    ['SearchGoods', searchOk([PROD])],
    ['/ms/msg/selStr', () => new Response('', { status: 500 })],
    ['/pdo/selIntPdStDispInfo', () => new Response(JSON.stringify({ data: [] }), { status: 200 })],
  ]);
  const res = await onRequestPost(req({ strCd: '1', keyword: '밀폐용기' }));
  expect(res.status).toBe(502);
  expect(await res.json()).toEqual({ error: 'upstream_unavailable' });
  expect(res.headers.get('access-control-allow-origin')).toBe('*');
});

test('a 401 on an authed call reissues auth once and retries', async () => {
  let authCalls = 0;
  let stckCalls = 0;
  route([
    [
      '/auth/request',
      () => {
        authCalls++;
        return new Response('jwt.token', { status: 200, headers: { 'x-dm-uid': 'uid-1' } });
      },
    ],
    ['SearchGoods', searchOk([PROD])],
    ['/ms/msg/selStr', () => new Response(JSON.stringify({ directYn: 'Y' }), { status: 200 })],
    [
      '/pdo/selIntPdStDispInfo',
      () =>
        new Response(JSON.stringify({ data: [{ zoneNo: '56', stairNo: '11' }] }), { status: 200 }),
    ],
    [
      '/pd/pdh/selStrPkupStck',
      () => {
        stckCalls++;
        return stckCalls === 1
          ? new Response('', { status: 401 })
          : new Response(JSON.stringify({ data: [{ stck: '50', sleStsCd: '1' }] }), {
              status: 200,
            });
      },
    ],
  ]);
  const body = (await (await onRequestPost(req({ strCd: '1', keyword: '밀폐용기' }))).json()) as {
    data: { stck: string | null };
  };
  expect(authCalls).toBe(2);
  expect(stckCalls).toBe(2);
  expect(body.data.stck).toBe('50');
});

test('direct store with a failing stock fetch → 502 (never a stck:null direct record)', async () => {
  route([
    ['/auth/request', authOk],
    ['SearchGoods', searchOk([PROD])],
    ['/ms/msg/selStr', () => new Response(JSON.stringify({ directYn: 'Y' }), { status: 200 })],
    [
      '/pdo/selIntPdStDispInfo',
      () =>
        new Response(JSON.stringify({ data: [{ zoneNo: '56', stairNo: '11' }] }), { status: 200 }),
    ],
    ['/pd/pdh/selStrPkupStck', () => new Response('', { status: 500 })],
  ]);
  expect((await onRequestPost(req({ strCd: '1', keyword: '밀폐용기' }))).status).toBe(502);
});

test('mall-only upstream fields never appear in the observation (whitelist by construction)', async () => {
  route([
    ['/auth/request', authOk],
    ['SearchGoods', searchOk([{ ...PROD, soldOutYn: 'N', ONL_STCK_QY: '191' }])],
    [
      '/ms/msg/selStr',
      () =>
        new Response(JSON.stringify({ directYn: 'Y', pkupYn: 'Y', pntAcmYn: 'Y' }), {
          status: 200,
        }),
    ],
    [
      '/pdo/selIntPdStDispInfo',
      () =>
        new Response(
          JSON.stringify({ data: [{ zoneNo: '56', stairNo: '11', storeErp: '10803' }] }),
          { status: 200 },
        ),
    ],
    [
      '/pd/pdh/selStrPkupStck',
      () =>
        new Response(
          JSON.stringify({ data: [{ stck: '50', sleStsCd: '1', pkupYn: 'Y', intUseYn: 'Y' }] }),
          { status: 200 },
        ),
    ],
  ]);
  const body = (await (
    await onRequestPost(req({ strCd: '10803', keyword: '밀폐용기' }))
  ).json()) as {
    data: Record<string, unknown>;
  };
  expect(Object.keys(body.data).sort()).toEqual(
    [
      'directYn',
      'imageUrl',
      'lchDay',
      'locations',
      'mrkGdsYn',
      'pdNo',
      'price',
      'productName',
      'sleStsCd',
      'stck',
      'strCd',
    ].sort(),
  );
});

test('missing strCd or keyword → 400', async () => {
  route([]);
  expect((await onRequestPost(req({ keyword: 'x' }))).status).toBe(400);
  expect((await onRequestPost(req({ strCd: '1' }))).status).toBe(400);
});
