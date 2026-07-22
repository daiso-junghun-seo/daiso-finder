// functions/_lib/daisoUpstream.ts
// App-owned upstream data contract for the Flow-1 fan-out (docs/notes/store-api-observations.md).
// Two host families (open-questions §B host-alignment; defaults per 2026-07-21 owner capture, env-overridable,
// confirmed by live smoke): fapi = auth + selStr + stock + display; www = SearchGoods.

export interface UpstreamEnv {
  PRE_AUTH_ENC_KEY: string;
  UPSTREAM_BASE?: string; // fapi override
  SEARCH_BASE?: string; // www override
}

export interface UpstreamConfig {
  fapiBase: string;
  wwwBase: string;
  encKey: string;
}

const DEFAULT_FAPI = 'https://fapi.daisomall.co.kr';
const DEFAULT_WWW = 'https://www.daisomall.co.kr';

export function upstreamConfig(env: UpstreamEnv): UpstreamConfig {
  const encKey = env.PRE_AUTH_ENC_KEY;
  if (!encKey) throw new Error('PRE_AUTH_ENC_KEY not configured');
  return {
    fapiBase: env.UPSTREAM_BASE ?? DEFAULT_FAPI,
    wwwBase: env.SEARCH_BASE ?? DEFAULT_WWW,
    encKey,
  };
}

export const PATHS = {
  auth: '/auth/request',
  selStr: '/ms/msg/selStr',
  pkupStck: '/pd/pdh/selStrPkupStck',
  dispInfo: '/pdo/selIntPdStDispInfo',
} as const;

export function searchGoodsUrl(wwwBase: string, keyword: string): string {
  const q = new URLSearchParams({
    searchTerm: keyword,
    pageNum: '1',
    cntPerPage: '30',
    mallId: 'MALL_MAIN',
  });
  return `${wwwBase}/ssn/search/SearchGoods?${q.toString()}`;
}

export const CORS_HEADERS = {
  'content-type': 'application/json',
  'access-control-allow-origin': '*',
  'cache-control': 'no-store',
} as const;

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS });
}

export function badGateway(): Response {
  return jsonResponse({ error: 'upstream_unavailable' }, 502);
}
