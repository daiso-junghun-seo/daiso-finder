// functions/api/alternatives.ts
// Flow 3 Group A (similar items at the SAME store). Read-only orchestration:
//   SearchGoods(keyword, 30) → store-carryable base docs → one batched selStrPkupStck call
//   (qty > 0, vendor order preserved) → up to 3 parallel selIntPdStDispInfo calls.
// Rows without a usable display location are omitted, never backfilled (the 3-row bound is a query
// bound, not a display preference — spec §2.1). If every picked candidate's location call fails, the
// answer is 502: "there are none" cannot be claimed from a failed read. If every picked candidate
// merely has no location, rows=[] + omitted>0 tells the client to show a failure, not an empty.
import { type AuthedCall, makeAuthedCall } from '../_lib/authedCall';
import { requestAuth } from '../_lib/daisoAuth';
import {
  PATHS,
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

// Network contract with the client — mirror of src/adapters/daisomall/rawAlternative.ts
// (keep in sync; the client validator is the enforcement point).
interface RawSimilarRow {
  pdNo: string;
  productName: string;
  price: number;
  imageUrl: string | null;
  qtyUpperBound: number;
  locations: { floor: string; zone: string }[];
}

interface ReqBody {
  strCd?: string;
  keyword?: string;
  excludePdNo?: string;
}

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
  productName: string;
  price: number;
  imageUrl: string | null;
}

const MAX_ROWS = 3;

async function fetchSearchDocs(wwwBase: string, keyword: string): Promise<SearchGoodsPayload> {
  const res = await fetch(searchGoodsUrl(wwwBase, keyword), { method: 'GET' });
  if (!res.ok) throw new Error(`SearchGoods ${res.status}`);
  return (await res.json()) as SearchGoodsPayload;
}

// Vendor order is the ranking. Dedupe by pdNo only (the same product can appear in more than one
// result group); never re-sort.
function candidatesFrom(payload: SearchGoodsPayload, excludePdNo?: string): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Set<string>();
  for (const group of payload?.resultSet?.result ?? []) {
    for (const doc of group?.resultDocuments ?? []) {
      if (!doc || !isStoreCarryableBaseDoc(doc)) continue;
      const pdNo = String(doc.pdNo ?? '').trim();
      const productName = String(doc.exhPdNm ?? doc.pdNm ?? '').trim();
      if (!pdNo || !productName || pdNo === excludePdNo || seen.has(pdNo)) continue;
      seen.add(pdNo);
      const price = Number(doc.pdPrc);
      out.push({
        pdNo,
        productName,
        price: Number.isFinite(price) ? price : 0,
        imageUrl: absolutizeImageUrl(doc.pdImgUrl),
      });
    }
  }
  return out;
}

interface StckRow {
  pdNo?: unknown;
  stck?: unknown;
}
// One batched call for every candidate (store-api-observations §③: the response contains only the
// (pdNo, strCd) pairs the store carries, and a missing pair means not carried). Rows are keyed back by
// pdNo rather than by array position — the vendor is not documented to preserve request order.
async function fetchStockBatch(
  fapiBase: string,
  pdNos: string[],
  strCd: string,
  call: AuthedCall,
): Promise<Map<string, number>> {
  const res = await call(
    `${fapiBase}${PATHS.pkupStck}`,
    JSON.stringify(pdNos.map((pdNo) => ({ pdNo, strCd }))),
  );
  if (!res.ok) throw new Error(`pkupStck ${res.status}`);
  const j = (await res.json()) as { data?: StckRow[] };
  const qty = new Map<string, number>();
  for (const row of j?.data ?? []) {
    const pdNo = String(row?.pdNo ?? '').trim();
    if (!pdNo) continue;
    const n = Number(row?.stck);
    qty.set(pdNo, Number.isFinite(n) ? n : 0);
  }
  return qty;
}

interface DispRow {
  stairNo?: unknown;
  zoneNo?: unknown;
}
// Same usable-location rule as Flow 1: a row without a display zone is not a location.
async function fetchLocations(
  fapiBase: string,
  pdNo: string,
  strCd: string,
  call: AuthedCall,
): Promise<{ floor: string; zone: string }[]> {
  const res = await call(`${fapiBase}${PATHS.dispInfo}`, JSON.stringify({ pdNo, strCd }));
  if (!res.ok) throw new Error(`dispInfo ${res.status}`);
  const j = (await res.json()) as { data?: DispRow[] };
  return (j?.data ?? [])
    .filter((r) => String(r?.zoneNo ?? '').trim() !== '')
    .map((r) => ({ floor: String(r?.stairNo ?? ''), zone: String(r?.zoneNo) }));
}

type Ctx = { request: Request; env: UpstreamEnv & DiagEnv };

async function handle(context: Ctx, timer: UpstreamTimer): Promise<Response> {
  let cfg: UpstreamConfig;
  try {
    cfg = upstreamConfig(context.env);
  } catch {
    return badGateway();
  }
  let body: ReqBody;
  try {
    body = JSON.parse(await context.request.text()) as ReqBody;
  } catch {
    return jsonResponse({ error: 'bad_request' }, 400);
  }
  const { strCd, keyword } = body;
  // Shape and bound checks before any value reaches an upstream URL or body.
  if (typeof strCd !== 'string' || typeof keyword !== 'string') {
    return jsonResponse({ error: 'bad_request' }, 400);
  }
  if (body.excludePdNo !== undefined && typeof body.excludePdNo !== 'string') {
    return jsonResponse({ error: 'bad_request' }, 400);
  }
  const trimmedKeyword = keyword.trim();
  const excludePdNo = body.excludePdNo?.trim() || undefined;
  if (!strCd || !trimmedKeyword || strCd.length > 32 || trimmedKeyword.length > 100) {
    return jsonResponse({ error: 'bad_request' }, 400);
  }

  // Product search and the auth handshake are independent — start both now.
  const searchP = timer.leg('search', () => fetchSearchDocs(cfg.wwwBase, trimmedKeyword));
  const authP = timer.leg('auth', () =>
    requestAuth({ fapiBase: cfg.fapiBase, encKey: cfg.encKey }),
  );
  authP.catch(() => {}); // guarded until we know the search produced candidates

  const docs = await searchP.catch(() => undefined);
  if (docs === undefined) return badGateway(); // SearchGoods unreachable/non-ok/non-JSON
  const candidates = candidatesFrom(docs, excludePdNo);
  if (candidates.length === 0) return jsonResponse({ rows: [], omitted: 0 });

  try {
    const auth = await authP;
    const call = makeAuthedCall(cfg, auth);
    const qtyByPdNo = await timer.leg('stck', () =>
      fetchStockBatch(
        cfg.fapiBase,
        candidates.map((c) => c.pdNo),
        strCd,
        call,
      ),
    );
    // stck > 0 wins over sleStsCd, exactly as in Flow 1: a positive on-hand count is stock.
    const inStock = candidates.filter((c) => (qtyByPdNo.get(c.pdNo) ?? 0) > 0);
    if (inStock.length === 0) return jsonResponse({ rows: [], omitted: 0 });

    const picked = inStock.slice(0, MAX_ROWS);
    const settled = await Promise.allSettled(
      picked.map((c) => timer.leg('disp', () => fetchLocations(cfg.fapiBase, c.pdNo, strCd, call))),
    );

    const rows: RawSimilarRow[] = [];
    let failed = 0;
    settled.forEach((result, i) => {
      const candidate = picked[i];
      if (candidate === undefined) return; // unreachable: settled mirrors picked
      if (result.status === 'rejected') {
        failed += 1; // this row only — do not backfill from candidate #4
        return;
      }
      if (result.value.length === 0) return; // no display location → omit
      rows.push({
        ...candidate,
        qtyUpperBound: qtyByPdNo.get(candidate.pdNo) ?? 0,
        locations: result.value,
      });
    });
    // Every location read failed: the slot cannot honestly say "none" or show rows.
    if (failed === picked.length) return badGateway();
    return jsonResponse({ rows, omitted: picked.length - rows.length });
  } catch {
    return badGateway();
  }
}

export async function onRequestPost(context: Ctx): Promise<Response> {
  const timer = createUpstreamTimer(diagTimingEnabled(context.env));
  return withTiming(await handle(context, timer), timer);
}
