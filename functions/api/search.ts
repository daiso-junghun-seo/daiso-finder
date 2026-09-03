// functions/api/search.ts — SearchGoods → folded candidate list for the literal multi-candidate flow.
// Cookie-only (no Bearer), mirrors functions/api/stores.ts. Read-only, no-store.
import {
  type UpstreamConfig,
  type UpstreamEnv,
  absolutizeImageUrl,
  badGateway,
  isStoreCarryableBaseDoc,
  jsonResponse,
  searchGoodsUrl,
  upstreamConfig,
} from '../_lib/daisoUpstream';
import {
  type DiagEnv,
  type UpstreamTimer,
  createUpstreamTimer,
  diagTimingEnabled,
  withTiming,
} from '../_lib/timing';

interface SearchDoc {
  pdNo?: unknown;
  pdNm?: unknown;
  exhPdNm?: unknown;
  pdPrc?: unknown;
  pdImgUrl?: unknown;
  MASTER_PD_NO?: unknown;
  onlyOnlYn?: unknown;
}
interface SearchGoodsPayload {
  resultSet?: { result?: Array<{ resultDocuments?: SearchDoc[] }> };
}
interface Candidate {
  pdNo: string;
  name: string;
  price: number;
  imageUrl: string | null;
}

const CANDIDATE_CAP = 10;

function foldCandidates(payload: SearchGoodsPayload): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Set<string>();
  for (const g of payload?.resultSet?.result ?? []) {
    for (const doc of g?.resultDocuments ?? []) {
      if (!isStoreCarryableBaseDoc(doc)) continue; // fold B-variants + drop online-only (see _lib)
      const pdNo = String(doc?.pdNo ?? '');
      if (!pdNo) continue;
      const name = String(doc?.exhPdNm ?? doc?.pdNm ?? '');
      if (!name) continue;
      if (seen.has(pdNo)) continue; // dedup: first wins
      seen.add(pdNo);
      const price = Number(doc?.pdPrc);
      out.push({
        pdNo,
        name,
        price: Number.isFinite(price) ? price : 0,
        imageUrl: absolutizeImageUrl(doc?.pdImgUrl),
      });
      if (out.length >= CANDIDATE_CAP) return out;
    }
  }
  return out;
}

type Ctx = { request: Request; env: UpstreamEnv & DiagEnv };

// The handler body is inner so the header is attached at exactly ONE place. This file has six return
// statements; threading a timer argument into each is how a path silently loses its timing.
async function handle(context: Ctx, timer: UpstreamTimer): Promise<Response> {
  let cfg: UpstreamConfig;
  try {
    cfg = upstreamConfig(context.env);
  } catch {
    return badGateway();
  }
  let body: { keyword?: string };
  try {
    body = JSON.parse(await context.request.text()) as typeof body;
  } catch {
    return jsonResponse({ error: 'bad_request' }, 400);
  }
  const keyword = (body.keyword ?? '').trim();
  if (!keyword) return jsonResponse({ candidates: [] });

  try {
    const res = await timer.leg('search', () =>
      fetch(searchGoodsUrl(cfg.wwwBase, keyword), { method: 'GET' }),
    );
    if (!res.ok) return badGateway();
    const payload = (await res.json()) as SearchGoodsPayload;
    return jsonResponse({ candidates: foldCandidates(payload) });
  } catch {
    return badGateway();
  }
}

export async function onRequestPost(context: Ctx): Promise<Response> {
  const timer = createUpstreamTimer(diagTimingEnabled(context.env));
  return withTiming(await handle(context, timer), timer);
}
