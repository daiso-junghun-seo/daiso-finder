// functions/api/stores.ts — selStr search-mode + nearby-mode proxy for the D082 store-selection sheet.
// Cookie-only (no Bearer). Returns whitelisted rows. Read-only, no-store.
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
  km?: unknown;
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
  let body: { query?: string; lat?: unknown; lng?: unknown };
  try {
    body = JSON.parse(await context.request.text()) as typeof body;
  } catch {
    return jsonResponse({ error: 'bad_request' }, 400);
  }
  const query = (body.query ?? '').trim();

  if (query) {
    // Search mode — UNCHANGED from the existing behavior.
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

  // Nearby mode — new. Requires finite lat/lng; otherwise honest empty (no query, no coords → nothing to ask).
  const lat = typeof body.lat === 'number' && Number.isFinite(body.lat) ? body.lat : null;
  const lng = typeof body.lng === 'number' && Number.isFinite(body.lng) ? body.lng : null;
  if (lat === null || lng === null) return jsonResponse({ stores: [] });

  try {
    const res = await fetch(`${cfg.fapiBase}${PATHS.selStr}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        keyword: '',
        srchYn: 'N',
        srchBassPkupStrYn: 'Y',
        geolocationAgrYn: 'Y',
        curLttd: lat,
        curLitd: lng,
        currentPage: 1,
        pageSize: 10,
      }),
    });
    if (!res.ok) return badGateway();
    const j = (await res.json()) as { data?: StoreRow[] };
    const stores = (j?.data ?? [])
      .filter((s) => s?.strCd != null && s?.strNm != null)
      .map((s) => {
        const km = Number(s.km);
        return Number.isFinite(km)
          ? { strCd: String(s.strCd), strNm: String(s.strNm), km }
          : { strCd: String(s.strCd), strNm: String(s.strNm) };
      });
    return jsonResponse({ stores });
  } catch {
    return badGateway();
  }
}
