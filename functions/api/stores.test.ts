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
