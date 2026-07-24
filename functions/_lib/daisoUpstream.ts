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

// pdImgUrl (SearchGoods) is a relative path (/file/PD/...) served only from the image CDN
// (store-api-observations §라이브 스모크 검증 III — www host 404s; cdn host confirmed live).
export const IMAGE_CDN_BASE = 'https://cdn.daisomall.co.kr';

export function absolutizeImageUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw === '') return null;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  return `${IMAGE_CDN_BASE}${raw.startsWith('/') ? '' : '/'}${raw}`;
}

// A SearchGoods doc is a "store-carryable base" when it is neither a bulk/online B-variant
// (MASTER_PD_NO points at a base pdNo, folding onto that base — store-api-observations §라이브 스모크 III)
// nor an online-only SKU (onlyOnlYn "Y" — store-api-observations §SearchGoods). Shared by /api/search
// foldCandidates (exclusion) and /api/availability pickProductDoc (preference) so both endpoints agree
// on "the base product for a keyword". Fail-open on absent/null: an unknown flag never over-excludes.
//
// Reversible Hypothesis-class de-noise (owner-approved 2026-07-24, open-questions §B29 M1/M2): the
// onlyOnlYn ⇒ "store doesn't carry" reading rests on a hedged single observation (§SearchGoods,
// onlyOnlYn:"Y"=온라인 전용/매장 미취급 후보) and is NOT cross-tabbed against selStrPkupStck stock rows
// (§라이브 스모크 II may undercut it). So this only de-noises the catalog-level candidate list; per-store
// carry is still decided honestly by selStrPkupStck (empty data[] ⇒ notCarried). Trivially revertible.
export function isStoreCarryableBaseDoc(doc: {
  MASTER_PD_NO?: unknown;
  onlyOnlYn?: unknown;
}): boolean {
  return String(doc?.MASTER_PD_NO ?? '') === '' && String(doc?.onlyOnlYn ?? '') !== 'Y';
}
