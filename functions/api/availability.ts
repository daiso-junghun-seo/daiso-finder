// functions/api/availability.ts
// Flow-1 fan-out orchestrator: SearchGoods (product) · selStr (directYn) · auth, then conditional
// selIntPdStDispInfo (location) + selStrPkupStck (stock) → a normalized, whitelisted RawStoreObservation.
// The client mapStoreObservation does 6-state classification. Read-only, no-store, server-only secrets.
import { type DaisoAuth, requestAuth } from '../_lib/daisoAuth';
import {
  PATHS,
  type UpstreamConfig,
  type UpstreamEnv,
  absolutizeImageUrl,
  badGateway,
  jsonResponse,
  searchGoodsUrl,
  upstreamConfig,
} from '../_lib/daisoUpstream';

// Network contract with the client — mirror of src/adapters/daisomall/rawObservation.ts (keep in sync;
// the client's parseRawObservation validator is the enforcement point).
interface RawStoreObservation {
  strCd: string;
  pdNo: string;
  productName: string;
  price: number;
  directYn: string;
  stck: string | null;
  sleStsCd: string | null;
  mrkGdsYn: string | null;
  lchDay: string | null;
  locations: { floor: string; zone: string }[];
  imageUrl: string | null;
}
interface ReqBody {
  strCd?: string;
  keyword?: string;
  pdNo?: string;
}
interface Product {
  pdNo: string;
  productName: string;
  price: number;
  imageUrl: string | null;
}
interface StockFields {
  stck: string;
  sleStsCd: string | null;
  mrkGdsYn: string | null;
  lchDay: string | null;
}

interface SearchDoc {
  pdNo?: unknown;
  pdNm?: unknown;
  exhPdNm?: unknown;
  pdPrc?: unknown;
  pdImgUrl?: unknown;
}
interface SearchGoodsPayload {
  resultSet?: { result?: Array<{ resultDocuments?: SearchDoc[] }> };
}
function firstProductDoc(p: SearchGoodsPayload): SearchDoc | null {
  for (const g of p?.resultSet?.result ?? []) {
    const docs = g?.resultDocuments ?? [];
    if (docs.length > 0 && docs[0]) return docs[0];
  }
  return null;
}
async function searchGoods(wwwBase: string, keyword: string): Promise<Product | null> {
  const res = await fetch(searchGoodsUrl(wwwBase, keyword), { method: 'GET' });
  if (!res.ok) throw new Error(`SearchGoods ${res.status}`);
  const doc = firstProductDoc((await res.json()) as SearchGoodsPayload);
  if (!doc) return null; // 0 results → noMatch
  const price = Number(doc.pdPrc);
  return {
    pdNo: String(doc.pdNo ?? ''),
    productName: String(doc.exhPdNm ?? doc.pdNm ?? ''),
    price: Number.isFinite(price) ? price : 0,
    imageUrl: absolutizeImageUrl(doc.pdImgUrl),
  };
}

function extractDirectYn(j: unknown): string {
  const root = (j as { data?: unknown })?.data ?? j;
  const row = Array.isArray(root) ? root[0] : root;
  const dy = (row as { directYn?: unknown })?.directYn;
  return typeof dy === 'string' ? dy : '';
}
async function fetchDirectYn(fapiBase: string, strCd: string): Promise<string> {
  const res = await fetch(`${fapiBase}${PATHS.selStr}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ inclusiveStrCd: strCd }),
  });
  if (!res.ok) throw new Error(`selStr ${res.status}`);
  return extractDirectYn(await res.json());
}

type AuthedCall = (url: string, body: string) => Promise<Response>;
function authHeaders(auth: DaisoAuth): Record<string, string> {
  return {
    'content-type': 'application/json',
    authorization: `Bearer ${auth.bearer}`,
    'x-dm-uid': auth.uid,
  };
}
function makeAuthedCall(cfg: UpstreamConfig, initial: DaisoAuth): AuthedCall {
  let auth = initial;
  let reissue: Promise<DaisoAuth> | null = null;
  return async (url, body) => {
    let res = await fetch(url, { method: 'POST', headers: authHeaders(auth), body });
    if (res.status === 401 || res.status === 403) {
      if (!reissue) reissue = requestAuth({ fapiBase: cfg.fapiBase, encKey: cfg.encKey });
      auth = await reissue;
      res = await fetch(url, { method: 'POST', headers: authHeaders(auth), body });
    }
    return res;
  };
}

interface DispRow {
  stairNo?: unknown;
  zoneNo?: unknown;
}
async function fetchLocations(fapiBase: string, pdNo: string, strCd: string, call: AuthedCall) {
  const res = await call(`${fapiBase}${PATHS.dispInfo}`, JSON.stringify({ pdNo, strCd }));
  if (!res.ok) throw new Error(`dispInfo ${res.status}`);
  const j = (await res.json()) as { data?: DispRow[] };
  // Only rows with a non-empty display zone are usable locations, so hasZone === (locations.length > 0),
  // aligning the franchise stock-fetch decision with mapStoreObservation rule 1.
  return (j?.data ?? [])
    .filter((r) => String(r?.zoneNo ?? '').trim() !== '')
    .map((r) => ({ floor: String(r?.stairNo ?? ''), zone: String(r?.zoneNo) }));
}

interface StckRow {
  stck?: unknown;
  sleStsCd?: unknown;
  mrkGdsYn?: unknown;
  lchDay?: unknown;
}
async function fetchStock(
  fapiBase: string,
  pdNo: string,
  strCd: string,
  call: AuthedCall,
): Promise<StockFields> {
  const res = await call(`${fapiBase}${PATHS.pkupStck}`, JSON.stringify([{ pdNo, strCd }]));
  if (!res.ok) throw new Error(`pkupStck ${res.status}`); // fetched-but-failed → 502, never a stck:null record
  const j = (await res.json()) as { data?: StckRow[] };
  const row = j?.data?.[0];
  // A present row → use it. An ok-but-empty result = the store returned no stock line (direct → notCarried).
  // stck stays non-null either way so the §4.1 invariant holds (direct records never carry stck:null).
  return {
    stck: row?.stck == null ? '0' : String(row.stck),
    sleStsCd: row?.sleStsCd == null ? null : String(row.sleStsCd),
    mrkGdsYn: row?.mrkGdsYn == null ? null : String(row.mrkGdsYn),
    lchDay: row?.lchDay == null ? null : String(row.lchDay),
  };
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
  let body: ReqBody;
  try {
    body = JSON.parse(await context.request.text()) as ReqBody;
  } catch {
    return jsonResponse({ error: 'bad_request' }, 400);
  }
  const { strCd, keyword } = body;
  if (!strCd || !keyword) return jsonResponse({ error: 'bad_request' }, 400);

  // Wave 1 (parallel): product identity, franchise flag, auth handshake.
  const productP = searchGoods(cfg.wwwBase, keyword);
  const directYnP = fetchDirectYn(cfg.fapiBase, strCd);
  const authP = requestAuth({ fapiBase: cfg.fapiBase, encKey: cfg.encKey });
  directYnP.catch(() => {}); // guard late rejections while we resolve product first
  authP.catch(() => {});

  const product = await productP.catch(() => undefined);
  if (product === undefined) return badGateway(); // SearchGoods unreachable/non-ok/non-JSON
  if (product === null) return jsonResponse({ noMatch: true }); // 0 results → NO_MATCH → Empty

  try {
    const [directYn, auth] = await Promise.all([directYnP, authP]);
    const pdNo = body.pdNo ?? product.pdNo;
    const call = makeAuthedCall(cfg, auth);

    let locations: { floor: string; zone: string }[];
    let stock: StockFields | null;
    if (directYn === 'Y') {
      // Direct: location ∥ stock. A fetched-stock failure throws → 502 (never a stck:null direct record).
      [locations, stock] = await Promise.all([
        fetchLocations(cfg.fapiBase, pdNo, strCd, call),
        fetchStock(cfg.fapiBase, pdNo, strCd, call),
      ]);
    } else {
      // Franchise: location first; stock only if a display zone exists (SCR_MSG_0015 logic).
      locations = await fetchLocations(cfg.fapiBase, pdNo, strCd, call);
      stock = locations.length > 0 ? await fetchStock(cfg.fapiBase, pdNo, strCd, call) : null;
    }

    const observation: RawStoreObservation = {
      strCd,
      pdNo,
      productName: product.productName,
      price: product.price,
      directYn,
      stck: stock?.stck ?? null, // null ⟺ deliberately unfetched (franchise + no zone)
      sleStsCd: stock?.sleStsCd ?? null,
      mrkGdsYn: stock?.mrkGdsYn ?? null,
      lchDay: stock?.lchDay ?? null,
      locations,
      imageUrl: product.imageUrl,
    };
    return jsonResponse({ data: observation });
  } catch {
    return badGateway();
  }
}
