// functions/api/stock.ts — no-cache pass-through relay only (design spec §3). No caching/business logic/logging of sensitive data.
const UPSTREAM = 'https://mapi.daisomall.co.kr/ms/msg/newIntSelStr';
const MALL_ONLY = ['pkupYn', 'bassPkupStrYn', 'pntAcmYn', 'pntUseYn', 'intUseYn'];

type UpstreamRow = Record<string, unknown>;
interface UpstreamPayload {
  data?: { msStrVOList?: UpstreamRow[] };
}

export function stripMallOnlyFields(json: UpstreamPayload): UpstreamPayload {
  const rows = json?.data?.msStrVOList;
  if (Array.isArray(rows)) {
    for (const row of rows) for (const f of MALL_ONLY) delete row[f];
  }
  return json;
}

const CORS_HEADERS = {
  'content-type': 'application/json',
  'access-control-allow-origin': '*',
  'cache-control': 'no-store',
} as const;

export async function onRequestPost(context: { request: Request }): Promise<Response> {
  const body = await context.request.text();
  try {
    const upstream = await fetch(UPSTREAM, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    const json = stripMallOnlyFields((await upstream.json()) as UpstreamPayload);
    return new Response(JSON.stringify(json), { status: upstream.status, headers: CORS_HEADERS });
  } catch {
    // Upstream unreachable or non-JSON: still a relay-shaped answer — CORS + no-store so the client's
    // FAILURE path (not an opaque CORS error) handles it. No caching, no business logic here.
    return new Response(JSON.stringify({ error: 'upstream_unavailable' }), {
      status: 502,
      headers: CORS_HEADERS,
    });
  }
}
