import { PATHS, badGateway, jsonResponse, searchGoodsUrl, upstreamConfig } from './daisoUpstream';

test('upstreamConfig applies fapi/www defaults and requires the enc key', () => {
  expect(upstreamConfig({ PRE_AUTH_ENC_KEY: 'k' })).toEqual({
    fapiBase: 'https://fapi.daisomall.co.kr',
    wwwBase: 'https://www.daisomall.co.kr',
    encKey: 'k',
  });
  expect(
    upstreamConfig({ PRE_AUTH_ENC_KEY: 'k', UPSTREAM_BASE: 'http://f', SEARCH_BASE: 'http://w' }),
  ).toMatchObject({ fapiBase: 'http://f', wwwBase: 'http://w' });
  expect(() => upstreamConfig({ PRE_AUTH_ENC_KEY: '' })).toThrow();
});

test('searchGoodsUrl encodes the keyword against the www host', () => {
  const url = searchGoodsUrl('https://www.daisomall.co.kr', '밀폐용기');
  expect(url.startsWith('https://www.daisomall.co.kr/ssn/search/SearchGoods?')).toBe(true);
  expect(url).toContain('searchTerm=%EB%B0%80%ED%8F%90%EC%9A%A9%EA%B8%B0');
  expect(url).toContain('cntPerPage=30');
});

test('jsonResponse / badGateway carry CORS + no-store', async () => {
  const ok = jsonResponse({ a: 1 });
  expect(ok.status).toBe(200);
  expect(ok.headers.get('access-control-allow-origin')).toBe('*');
  expect(ok.headers.get('cache-control')).toBe('no-store');
  expect(await ok.json()).toEqual({ a: 1 });
  const bad = badGateway();
  expect(bad.status).toBe(502);
  expect(await bad.json()).toEqual({ error: 'upstream_unavailable' });
});

test('PATHS pins the observed fapi endpoints', () => {
  expect(PATHS).toEqual({
    auth: '/auth/request',
    selStr: '/ms/msg/selStr',
    pkupStck: '/pd/pdh/selStrPkupStck',
    dispInfo: '/pdo/selIntPdStDispInfo',
  });
});
