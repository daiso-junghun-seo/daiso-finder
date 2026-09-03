import { onRequestPost } from './stores';

const ENV = { PRE_AUTH_ENC_KEY: 'k' };
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
function req(body: unknown) {
  return {
    request: new Request('http://x/api/stores', { method: 'POST', body: JSON.stringify(body) }),
    env: ENV,
  };
}

test('maps selStr search-mode data[] to whitelisted { strCd, strNm }', async () => {
  globalThis.fetch = (async (_u: RequestInfo | URL, init?: RequestInit) => {
    expect(JSON.parse(String(init?.body))).toMatchObject({
      keyword: '명동',
      srchYn: 'Y',
      geolocationAgrYn: 'N',
    });
    return new Response(
      JSON.stringify({
        data: [{ strCd: '11043', strNm: '명동역점', strAddr: 'x', km: '9.9', directYn: 'Y' }],
      }),
      { status: 200 },
    );
  }) as typeof fetch;
  const res = await onRequestPost(req({ query: '명동' }));
  expect(res.status).toBe(200);
  expect(res.headers.get('cache-control')).toBe('no-store');
  expect(await res.json()).toEqual({ stores: [{ strCd: '11043', strNm: '명동역점' }] });
});

test('a blank query short-circuits to an empty list without calling upstream', async () => {
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    return new Response('{}', { status: 200 });
  }) as typeof fetch;
  expect(await (await onRequestPost(req({ query: '   ' }))).json()).toEqual({ stores: [] });
  expect(called).toBe(false);
});

test('an upstream failure → 502 upstream_unavailable', async () => {
  globalThis.fetch = (async () => new Response('', { status: 500 })) as typeof fetch;
  const res = await onRequestPost(req({ query: '명동' }));
  expect(res.status).toBe(502);
  expect(await res.json()).toEqual({ error: 'upstream_unavailable' });
});

test('nearby-mode: lat/lng present calls selStr with nearby body and maps km to a number', async () => {
  globalThis.fetch = (async (_u: RequestInfo | URL, init?: RequestInit) => {
    expect(JSON.parse(String(init?.body))).toMatchObject({
      keyword: '',
      srchYn: 'N',
      geolocationAgrYn: 'Y',
      curLttd: 37.5,
      curLitd: 127.0,
    });
    return new Response(
      JSON.stringify({
        data: [{ strCd: '11043', strNm: '명동역점', km: '0.34' }],
      }),
      { status: 200 },
    );
  }) as typeof fetch;
  const res = await onRequestPost(req({ lat: 37.5, lng: 127.0 }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ stores: [{ strCd: '11043', strNm: '명동역점', km: 0.34 }] });
});

test('nearby-mode: no query and no lat/lng → empty list without calling upstream', async () => {
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    return new Response('{}', { status: 200 });
  }) as typeof fetch;
  expect(await (await onRequestPost(req({}))).json()).toEqual({ stores: [] });
  expect(called).toBe(false);
});

test('nearby-mode: an upstream failure → 502 upstream_unavailable', async () => {
  globalThis.fetch = (async () => new Response('', { status: 500 })) as typeof fetch;
  const res = await onRequestPost(req({ lat: 37.5, lng: 127.0 }));
  expect(res.status).toBe(502);
  expect(await res.json()).toEqual({ error: 'upstream_unavailable' });
});

test('search mode emits Server-Timing with the str leg when DIAG_TIMING=1', async () => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ data: [] }), { status: 200 })) as typeof fetch;
  const res = await onRequestPost({
    request: new Request('http://x/api/stores', {
      method: 'POST',
      body: JSON.stringify({ query: '강남' }),
    }),
    env: { PRE_AUTH_ENC_KEY: 'k', DIAG_TIMING: '1' },
  });
  expect(res.headers.get('server-timing')).toMatch(/str;dur=\d+/);
  expect(res.headers.get('access-control-expose-headers')).toBe('server-timing');
});

test('nearby mode emits the str leg too', async () => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ data: [] }), { status: 200 })) as typeof fetch;
  const res = await onRequestPost({
    request: new Request('http://x/api/stores', {
      method: 'POST',
      body: JSON.stringify({ lat: 37.5, lng: 127.0 }),
    }),
    env: { PRE_AUTH_ENC_KEY: 'k', DIAG_TIMING: '1' },
  });
  expect(res.headers.get('server-timing')).toMatch(/str;dur=\d+/);
});

test('the no-coordinates early return carries total with no legs', async () => {
  const res = await onRequestPost({
    request: new Request('http://x/api/stores', { method: 'POST', body: JSON.stringify({}) }),
    env: { PRE_AUTH_ENC_KEY: 'k', DIAG_TIMING: '1' },
  });
  expect(res.headers.get('server-timing')).toMatch(/^total;dur=\d+$/);
});

test('emits no Server-Timing without DIAG_TIMING', async () => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ data: [] }), { status: 200 })) as typeof fetch;
  const res = await onRequestPost(req({ query: '강남' }));
  expect(res.headers.get('server-timing')).toBeNull();
});
