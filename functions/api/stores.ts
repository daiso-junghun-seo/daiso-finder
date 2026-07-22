// functions/api/stores.ts — selStr search-mode proxy for the D082 store-selection sheet.
// Cookie-only (no Bearer). Returns whitelisted { strCd, strNm } rows. Read-only, no-store.
import {
  PATHS,
  type UpstreamConfig,
  type UpstreamEnv,
  badGateway,
  jsonResponse,
  upstreamConfig,
} from '../_lib/daisoUpstream';

interface StoreRow {
  strCd?: unknown;
  strNm?: unknown;
}

export async function onRequestPost(context: {
  request: Request;
  env: UpstreamEnv;
}): Promise<Response> {
  let cfg: UpstreamConfig;
  try {
    cfg = upstreamConfig(context.env);
  } catch {
    return badGateway();
  }
  let query: string;
  try {
    query = ((JSON.parse(await context.request.text()) as { query?: string }).query ?? '').trim();
  } catch {
    return jsonResponse({ error: 'bad_request' }, 400);
  }
  if (!query) return jsonResponse({ stores: [] });
  try {
    const res = await fetch(`${cfg.fapiBase}${PATHS.selStr}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        keyword: query,
        srchYn: 'Y',
        srchBassPkupStrYn: 'Y',
        geolocationAgrYn: 'N',
        currentPage: 1,
        pageSize: 10,
      }),
    });
    if (!res.ok) return badGateway();
    const j = (await res.json()) as { data?: StoreRow[] };
    const stores = (j?.data ?? [])
      .filter((s) => s?.strCd != null && s?.strNm != null)
      .map((s) => ({ strCd: String(s.strCd), strNm: String(s.strNm) }));
    return jsonResponse({ stores });
  } catch {
    return badGateway();
  }
}
