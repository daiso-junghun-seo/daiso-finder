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
function reqDiag(body: unknown) {
  return {
    request: new Request('http://x/api/availability', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    env: { ...ENV, DIAG_TIMING: '1' },
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

test('pdNo-identity: an explicit pdNo picks that doc for identity (not docs[0])', async () => {
  const OTHER = {
    pdNo: '19989',
    pdNm: '밀폐용기 6P 세트',
    exhPdNm: '밀폐용기 6P 세트',
    pdPrc: '5000',
    pdImgUrl: '/file/PD/other.jpg',
  };
  route([
    ['/auth/request', authOk],
    ['SearchGoods', searchOk([PROD, OTHER])],
    [
      '/ms/msg/selStr',
      () => new Response(JSON.stringify({ strCd: '10803', directYn: 'Y' }), { status: 200 }),
    ],
    [
      '/pdo/selIntPdStDispInfo',
      () =>
        new Response(JSON.stringify({ data: [{ zoneNo: '56', stairNo: '11' }] }), { status: 200 }),
    ],
    [
      '/pd/pdh/selStrPkupStck',
      () =>
        new Response(JSON.stringify({ data: [{ sleStsCd: '1', stck: '50' }] }), { status: 200 }),
    ],
  ]);
  const res = await onRequestPost(req({ strCd: '10803', keyword: '밀폐용기', pdNo: '19989' }));
  const body = (await res.json()) as {
    data: { pdNo: string; productName: string; price: number; imageUrl: string | null };
  };
  expect(body.data.pdNo).toBe('19989');
  expect(body.data.productName).toBe('밀폐용기 6P 세트');
  expect(body.data.price).toBe(5000);
  expect(body.data.imageUrl).toBe('https://cdn.daisomall.co.kr/file/PD/other.jpg');
});

test('pdNo-identity: an unmatched explicit pdNo falls back to the keyword base-pick identity', async () => {
  route([
    ['/auth/request', authOk],
    ['SearchGoods', searchOk([PROD])],
    [
      '/ms/msg/selStr',
      () => new Response(JSON.stringify({ strCd: '10803', directYn: 'Y' }), { status: 200 }),
    ],
    [
      '/pdo/selIntPdStDispInfo',
      () =>
        new Response(JSON.stringify({ data: [{ zoneNo: '56', stairNo: '11' }] }), { status: 200 }),
    ],
    [
      '/pd/pdh/selStrPkupStck',
      () =>
        new Response(JSON.stringify({ data: [{ sleStsCd: '1', stck: '50' }] }), { status: 200 }),
    ],
  ]);
  const res = await onRequestPost(
    req({ strCd: '10803', keyword: '밀폐용기', pdNo: 'no-such-pdno' }),
  );
  const body = (await res.json()) as { data: { pdNo: string; productName: string; price: number } };
  // An unmatched pdNo drops to the keyword base-pick (here the sole doc PROD, which is carryable);
  // the requested (unmatched) pdNo still echoes through the pre-existing `body.pdNo ?? product.pdNo`
  // line (unchanged) — this test is only about which doc supplies productName/price identity.
  expect(body.data.pdNo).toBe('no-such-pdno');
  expect(body.data.productName).toBe('리빙 밀폐용기 1.2L');
  expect(body.data.price).toBe(2000);
});

test('base-priority: no pdNo prefers a store-carryable base over a leading online-only doc', async () => {
  const ONLINE_ONLY = {
    pdNo: '30001',
    pdNm: '온라인전용 대용량 밀폐용기',
    exhPdNm: '온라인전용 대용량 밀폐용기',
    pdPrc: '9900',
    pdImgUrl: '/file/PD/online.jpg',
    onlyOnlYn: 'Y', // MASTER_PD_NO absent → base, but online-only → not store-carryable
  };
  route([
    ['/auth/request', authOk],
    ['SearchGoods', searchOk([ONLINE_ONLY, PROD])], // leading doc is non-carryable
    ['/ms/msg/selStr', () => new Response(JSON.stringify({ directYn: 'Y' }), { status: 200 })],
    [
      '/pdo/selIntPdStDispInfo',
      () =>
        new Response(JSON.stringify({ data: [{ zoneNo: '56', stairNo: '11' }] }), { status: 200 }),
    ],
    [
      '/pd/pdh/selStrPkupStck',
      () =>
        new Response(JSON.stringify({ data: [{ sleStsCd: '1', stck: '50' }] }), { status: 200 }),
    ],
  ]);
  const res = await onRequestPost(req({ strCd: '10803', keyword: '밀폐용기' }));
  const body = (await res.json()) as { data: { pdNo: string; productName: string; price: number } };
  expect(body.data.pdNo).toBe('19987');
  expect(body.data.productName).toBe('리빙 밀폐용기 1.2L');
  expect(body.data.price).toBe(2000);
});

test('base-priority honesty: no carryable base among docs → still uses docs[0], never noMatch', async () => {
  const VARIANT = {
    pdNo: 'B202505',
    pdNm: '대량 밀폐용기',
    exhPdNm: '대량 밀폐용기',
    pdPrc: '18000',
    pdImgUrl: '/file/PD/bulk.jpg',
    MASTER_PD_NO: '19987', // B-variant → not a base
  };
  const ONLINE_ONLY = {
    pdNo: '30002',
    pdNm: '온라인전용 밀폐용기',
    exhPdNm: '온라인전용 밀폐용기',
    pdPrc: '9900',
    pdImgUrl: '/file/PD/online.jpg',
    onlyOnlYn: 'Y',
  };
  route([
    ['/auth/request', authOk],
    ['SearchGoods', searchOk([VARIANT, ONLINE_ONLY])], // no store-carryable base at all
    ['/ms/msg/selStr', () => new Response(JSON.stringify({ directYn: 'Y' }), { status: 200 })],
    [
      '/pdo/selIntPdStDispInfo',
      () =>
        new Response(JSON.stringify({ data: [{ zoneNo: '56', stairNo: '11' }] }), { status: 200 }),
    ],
    [
      '/pd/pdh/selStrPkupStck',
      () =>
        new Response(JSON.stringify({ data: [{ sleStsCd: '1', stck: '50' }] }), { status: 200 }),
    ],
  ]);
  const res = await onRequestPost(req({ strCd: '10803', keyword: '밀폐용기' }));
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    data?: { pdNo: string; productName: string };
    noMatch?: boolean;
  };
  // Honesty invariant: a keyword that DOES match catalog docs must never fabricate NO_MATCH —
  // when no carryable base exists, fall back to docs[0] (never null).
  expect(body.noMatch).toBeUndefined();
  expect(body.data?.pdNo).toBe('B202505');
  expect(body.data?.productName).toBe('대량 밀폐용기');
});

const ONLINE_ONLY_DOC = {
  pdNo: '30001',
  pdNm: '온라인전용 대용량 밀폐용기',
  exhPdNm: '온라인전용 대용량 밀폐용기',
  pdPrc: '9900',
  pdImgUrl: '/file/PD/online.jpg',
  onlyOnlYn: 'Y',
};
const B_VARIANT_DOC = {
  pdNo: 'B19987',
  pdNm: '대량 밀폐용기',
  exhPdNm: '대량 밀폐용기',
  pdPrc: '18000',
  pdImgUrl: '/file/PD/bulk.jpg',
  MASTER_PD_NO: '19987',
};
// Multi-group SearchGoods payload (real responses span >1 resultSet.result group) — searchOk() only
// ever builds a single group, so these two tests specifically exercise pickProductDoc's firstDoc
// accumulator + carryable early-return ACROSS groups.
const searchGroups =
  (groups: unknown[][]): Handler =>
  () =>
    new Response(
      JSON.stringify({ resultSet: { result: groups.map((docs) => ({ resultDocuments: docs })) } }),
      { status: 200 },
    );
const locStck: Array<[string, Handler]> = [
  ['/ms/msg/selStr', () => new Response(JSON.stringify({ directYn: 'Y' }), { status: 200 })],
  [
    '/pdo/selIntPdStDispInfo',
    () =>
      new Response(JSON.stringify({ data: [{ zoneNo: '56', stairNo: '11' }] }), { status: 200 }),
  ],
  [
    '/pd/pdh/selStrPkupStck',
    () => new Response(JSON.stringify({ data: [{ sleStsCd: '1', stck: '50' }] }), { status: 200 }),
  ],
];

test('base-priority: prefers a store-carryable base found in a LATER result group', async () => {
  route([
    ['/auth/request', authOk],
    ['SearchGoods', searchGroups([[ONLINE_ONLY_DOC, B_VARIANT_DOC], [PROD]])], // carryable only in group 1
    ...locStck,
  ]);
  const res = await onRequestPost(req({ strCd: '10803', keyword: '밀폐용기' }));
  const body = (await res.json()) as { data: { pdNo: string; productName: string } };
  expect(body.data.pdNo).toBe('19987');
  expect(body.data.productName).toBe('리빙 밀폐용기 1.2L');
});

test('base-priority honesty: no carryable across groups → first doc of the FIRST group (not later)', async () => {
  route([
    ['/auth/request', authOk],
    // group 0 leads with the online-only doc; group 1 is the B-variant. No carryable anywhere.
    ['SearchGoods', searchGroups([[ONLINE_ONLY_DOC], [B_VARIANT_DOC]])],
    ...locStck,
  ]);
  const res = await onRequestPost(req({ strCd: '10803', keyword: '밀폐용기' }));
  const body = (await res.json()) as { data?: { pdNo: string }; noMatch?: boolean };
  expect(body.noMatch).toBeUndefined();
  // firstDoc must be captured from group 0 and survive the group boundary — a per-group-scoped
  // accumulator would wrongly return group 1's 'B19987'.
  expect(body.data?.pdNo).toBe('30001');
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

test('a direct-store lookup reports all five legs', async () => {
  route([['/auth/request', authOk], ['SearchGoods', searchOk([PROD])], ...locStck]);
  const res = await onRequestPost(reqDiag({ strCd: '10803', keyword: '밀폐용기' }));
  const timing = res.headers.get('server-timing') ?? '';
  expect(timing).toMatch(/(^|, )total;dur=\d+/);
  for (const leg of ['search', 'str', 'auth', 'disp', 'stck']) {
    expect(timing).toMatch(new RegExp(`(^|, )${leg};dur=\\d+`));
  }
});

test('noMatch does not report legs that were still in flight', async () => {
  // The in-flight condition must be GUARANTEED, not incidental. searchGoods and fetchDirectYn have
  // identical microtask depth (await fetch, then await res.json()) and start in the same synchronous
  // tick, so with ordinary mocks selStr settles BEFORE the noMatch return and this test would pass
  // or fail on scheduling rather than on the rule it claims to check. Parking selStr and auth
  // forever makes the rule the only thing under test.
  const never = new Promise<Response>(() => {});
  globalThis.fetch = ((input: RequestInfo | URL) =>
    String(input).includes('SearchGoods')
      ? Promise.resolve(
          new Response(JSON.stringify({ resultSet: { result: [{ resultDocuments: [] }] } }), {
            status: 200,
          }),
        )
      : never) as typeof fetch;
  const res = await onRequestPost(reqDiag({ strCd: '10803', keyword: '없는상품' }));
  expect(((await res.json()) as { noMatch?: boolean }).noMatch).toBe(true);
  const timing = res.headers.get('server-timing') ?? '';
  expect(timing).toMatch(/search;dur=\d+/);
  expect(timing).not.toMatch(/str;dur=/);
  expect(timing).not.toMatch(/auth;dur=/);
});

test('a franchise store with no display zone omits stck entirely', async () => {
  // stck is never called in that branch. It must be ABSENT, not 0 -- a 0 would claim a measurement
  // nobody made.
  route([
    ['/auth/request', authOk],
    ['SearchGoods', searchOk([PROD])],
    ['/ms/msg/selStr', () => new Response(JSON.stringify({ directYn: 'N' }), { status: 200 })],
    ['/pdo/selIntPdStDispInfo', () => new Response(JSON.stringify({ data: [] }), { status: 200 })],
  ]);
  const res = await onRequestPost(reqDiag({ strCd: '10803', keyword: '밀폐용기' }));
  const timing = res.headers.get('server-timing') ?? '';
  expect(timing).toMatch(/disp;dur=\d+/);
  expect(timing).not.toMatch(/stck;dur=/);
});

test('a 502 reports the legs that completed before the failure', async () => {
  route([
    ['/auth/request', authOk],
    ['SearchGoods', searchOk([PROD])],
    ['/ms/msg/selStr', () => new Response(JSON.stringify({ directYn: 'Y' }), { status: 200 })],
    [
      '/pdo/selIntPdStDispInfo',
      () =>
        new Response(JSON.stringify({ data: [{ zoneNo: '56', stairNo: '11' }] }), { status: 200 }),
    ],
    ['/pd/pdh/selStrPkupStck', () => new Response('nope', { status: 500 })],
  ]);
  const res = await onRequestPost(reqDiag({ strCd: '10803', keyword: '밀폐용기' }));
  expect(res.status).toBe(502);
  // The leg completed (with a non-ok response) before the throw, so it is reported. This is the case
  // the header exists for, and losing it would blind exactly the failure worth measuring.
  expect(res.headers.get('server-timing')).toMatch(/stck;dur=\d+/);
});

test('emits no Server-Timing without DIAG_TIMING', async () => {
  route([['/auth/request', authOk], ['SearchGoods', searchOk([PROD])], ...locStck]);
  const res = await onRequestPost(req({ strCd: '10803', keyword: '밀폐용기' }));
  expect(res.headers.get('server-timing')).toBeNull();
});
