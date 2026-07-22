# Flow 1 Live-Data Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Wire Flow 1 (Availability Check) and store-name search to live daisomall data by replacing the mocks behind the hexagonal seams (`StoreStockRepository` B6, `StoreDirectoryPort` B16) with real adapters fed by a CF Pages Functions proxy that owns auth + CORS + conditional fan-out.

**Architecture:** Client PWA calls internal `/api/*` only. `/api/availability` fans out to SearchGoods (product) · selStr (directYn) · selStrPkupStck (stock+status+restock) · selIntPdStDispInfo (location), returns a normalized `RawStoreObservation`; the client `mapStoreObservation` classifies the 6 states. `/api/stores` proxies selStr search mode. Auth (anonymous JWT → AES-128-CBC → Bearer + X-DM-UID) lives server-side only. **UI / domain / reducer / query-runner / cache are unchanged** — hexagonal seam swap only.

**Tech Stack:** React 18 + TypeScript (strict, `noUncheckedIndexedAccess`), Vite, Vitest, Playwright, Biome, Cloudflare Pages Functions (WebWorker runtime, WebCrypto).

**SSOT for this work:** `docs/superpowers/specs/2026-07-22-flow1-live-data-design.md` (design, approved 2026-07-22). Real-contract dossier: `docs/notes/store-api-observations.md`. Governance: vendor data-contract + impl are **app-owned** (CLAUDE.md §1/§3, 2026-07-21) — record decisions in `docs/notes/open-questions.md §B`, do not escalate to the Bible unless product *philosophy* changes.

## Global Constraints

Every task's requirements implicitly include this section.

- **Language:** answers Korean; **code / identifiers / commit messages English**; UX copy Korean. D068/D069 matching tokens (product name · floor · zone) render as the world renders them (Korean · numerals) — never translate a matching token.
- **Read-only (INDEX §7):** never mutate stock/transactions. Proxy calls only read-only upstreams (SearchGoods GET, selStr/stck/disp POST reads, auth GET). Proxy returns a **whitelisted normalized record only** — never passes upstream/mall commerce fields through.
- **Freshness (D061):** live answers are never demoted. Proxy is `cache-control: no-store`. Observation-age stamping + cache stay in the client query-runner + IndexedDB (unchanged).
- **Hermetic verification (F-a):** every automated test mocks the fetch/proxy boundary with recorded fixtures. **No live daisomall call in any test / CI.** Live smoke is manual (`wrangler pages dev`) only.
- **Security:** `PRE_AUTH_ENC_KEY`, JWT, `x-dm-uid`, Bearer exist **server-side (proxy) only**, injected via env. Never hardcoded, committed, logged, or present in the client bundle. WebCrypto (`crypto.subtle`) only — no `node:crypto`.
- **Immutability:** do not touch `src/domain/*`, `src/infra/query-cache.ts`, `src/infra/cache-storage.ts`, the reducer, or the UI *logic*. Only the seam implementations (adapters), `format.ts` (presentation), the composition root, and the AvailabilitySurface *adapter wiring* line change.
- **Per-commit gate (B8):** `npm run test` · `npm run typecheck` · `npm run lint` · `npm run e2e` all green. Each unit red→green before its commit.
- **TS project rules:** `functions/*.ts` (non-test) are typechecked by `tsc -b` under `functions/tsconfig.json` (lib `ES2022`+`WebWorker`, **no DOM**, `types: []`, `noUncheckedIndexedAccess`). `functions/**/*.test.ts` are **excluded from tsc** and run only by Vitest (jsdom, globals). Keep production function files free of DOM/Node/vitest globals.
- **Invariant (spec §4.1):** `stck === null` ⟺ stock was **deliberately not fetched** (franchise AND no display zone). A direct store always fetches stock; a *fetched-stock failure* returns **502**, never a `stck:null` record — so `mapStoreObservation` rule 5 (notCarried) can never misread a fetch failure.

## How to resume in a fresh session (READ FIRST)

This plan is split into **3 execution SESSIONS**. Each is independently committable and **ends with a full green gate**. Run one session per fresh Claude session to stay well clear of context/response limits.

**On entering a new session:** read `docs/HANDOFF.md` → this plan → scan for the **first unchecked `- [x]`** → resume there. Branch `feat/flow1-live-data` is already created off `main`. `.superpowers/sdd/progress.md` records the running ledger (top entry).

Session boundaries were drawn so **no cross-file dependency straddles a session**, and the app + existing suites stay green at every boundary:

- **SESSION 1 — Server proxy layer (Tasks 1–4 + setup).** New `functions/**` only; **zero `src/` changes** → app + all existing tests untouched and green. Deliverable: `/api/availability`, `/api/stores`, auth lib — hermetically unit-tested.
- **SESSION 2 — Client adapters + format (Tasks 5–9).** New `src/adapters/daisomall/**` + `format.ts` tweaks. **Not yet wired** (composition happens in Session 3) → mocks remain active, app + E2E stay green. Deliverable: adapters + format utils, unit-tested, with the ported 6-state parity oracle.
- **SESSION 3 — Cutover (Tasks 10–14).** Remove stale `newIntSelStr/*` + `functions/api/stock.ts`, add the composition root, wire `AvailabilitySurface`, add the route-intercept E2E, run the full gate + security grep, update docs, local `--no-ff` merge.

Each session below opens with **START HERE** and closes with a **SESSION EXIT GATE** (the verification that must pass before the session's work is considered done).

## File Structure

**New**
- `functions/_lib/daisoUpstream.ts` — upstream host/endpoint config + shared response helpers (`CORS_HEADERS`, `jsonResponse`, `badGateway`).
- `functions/_lib/daisoAuth.ts` — anonymous-JWT → AES-128-CBC(WebCrypto) → Bearer + X-DM-UID handshake.
- `functions/api/availability.ts` (+`.test.ts`) — conditional fan-out orchestrator → `RawStoreObservation`.
- `functions/api/stores.ts` (+`.test.ts`) — selStr search-mode proxy → `{ stores }`.
- `functions/_lib/daisoUpstream.test.ts`, `functions/_lib/daisoAuth.test.ts`.
- `src/adapters/daisomall/rawObservation.ts` (+`.test.ts`) — `RawStoreObservation` type + runtime validator.
- `src/adapters/daisomall/mapStoreObservation.ts` (+`.test.ts`) — normalized record → `AvailabilityAnswer` (ported precedence + franchise refinement).
- `src/adapters/daisomall/observationFixtures.ts` — recorded 6-state + edge fixtures (parity oracle).
- `src/adapters/daisomall/storeStockRepository.ts` (+`.test.ts`) — `StoreStockRepository` calling `/api/availability`.
- `src/adapters/daisomall/storeDirectory.ts` (+`.test.ts`) — `StoreDirectoryPort` calling `/api/stores`.
- `src/adapters/composition.ts` (+`.test.ts`) — production vs mock adapter selection (single wiring point).
- `test/e2e/live-pipeline.spec.ts` — preview + `page.route('**/api/**')` real-pipeline hermetic E2E.
- `.dev.vars.example` — documents `PRE_AUTH_ENC_KEY` / `UPSTREAM_BASE` / `SEARCH_BASE` for local `wrangler pages dev`.

**Modify**
- `src/ui/format.ts` (+`.test.ts`) — 지하 floor, `formatLchDay`, `kmToMeters`.
- `src/ui/AvailabilitySurface.tsx` — swap inline mock construction for composition-root references (UI logic unchanged).
- `playwright.config.ts` — add a `preview` project (prod build) for the route-intercept E2E; keep the existing dev specs.
- `.gitignore` — ignore `.dev.vars`.
- `docs/notes/open-questions.md` (§B), `docs/HANDOFF.md`, `.superpowers/sdd/progress.md`, this plan (checkboxes).

**Remove** (Session 3, after the parity oracle lives in `mapStoreObservation.test.ts`)
- `src/adapters/newIntSelStr/{newIntSelStrAdapter,mapResponse,rawFixtures}.ts` + `{newIntSelStrAdapter,mapResponse}.test.ts` (old mapi single-bundle model, F2 UNVERIFIED).
- `functions/api/stock.ts` + `stock.test.ts` (mapi pass-through).

---

## SESSION 1 — Server proxy layer

**START HERE (Session 1).** Prereq: on branch `feat/flow1-live-data`. This session touches **only `functions/**`** — no `src/` change, so the app and every existing suite stay green throughout. Node ≥ 20 (repo uses v22) provides `crypto.subtle` in the Vitest env.

### Setup S1: local env scaffolding

**Files:** Create `.dev.vars.example`; Modify `.gitignore`.

- [x] **Step 1: Create `.dev.vars.example`** (committed; documents the server-only secrets for `wrangler pages dev`)

```
# Copy to .dev.vars (gitignored) for `wrangler pages dev`. NEVER commit real values.
# Public vendor constant (16 ASCII bytes). Kept in env for rotation/hygiene, not hardcoded.
PRE_AUTH_ENC_KEY=PRE_AUTH_ENC_KEY
# Upstream host overrides (defaults per docs/notes/store-api-observations.md; confirm via live smoke).
UPSTREAM_BASE=https://fapi.daisomall.co.kr
SEARCH_BASE=https://www.daisomall.co.kr
```

- [x] **Step 2: Ignore `.dev.vars`** — append under the `# Env / secrets` block in `.gitignore`:

```
.dev.vars
```

- [x] **Step 3: Commit**

```bash
git add .dev.vars.example .gitignore
git commit -m "chore(functions): document server-only env for local pages dev"
```

### Task 1: Upstream config + shared response helpers

**Files:**
- Create: `functions/_lib/daisoUpstream.ts`
- Test: `functions/_lib/daisoUpstream.test.ts`

**Interfaces:**
- Produces: `interface UpstreamEnv { PRE_AUTH_ENC_KEY: string; UPSTREAM_BASE?: string; SEARCH_BASE?: string }`; `interface UpstreamConfig { fapiBase: string; wwwBase: string; encKey: string }`; `upstreamConfig(env: UpstreamEnv): UpstreamConfig`; `PATHS` (auth/selStr/pkupStck/dispInfo); `searchGoodsUrl(wwwBase, keyword): string`; `CORS_HEADERS`; `jsonResponse(body, status?): Response`; `badGateway(): Response`.

- [x] **Step 1: Write the failing test** → `functions/_lib/daisoUpstream.test.ts`

```ts
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
```

- [x] **Step 2: Run to verify it fails** — `npm run test -- daisoUpstream` → FAIL (module not found).

- [x] **Step 3: Implement** → `functions/_lib/daisoUpstream.ts`

```ts
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
```

- [x] **Step 4: Run to verify it passes** — `npm run test -- daisoUpstream` → PASS. Then `npm run typecheck` → clean.

- [x] **Step 5: Commit**

```bash
git add functions/_lib/daisoUpstream.ts functions/_lib/daisoUpstream.test.ts
git commit -m "feat(functions): upstream config + shared CORS/no-store response helpers"
```

### Task 2: Anonymous-JWT → AES-128-CBC → Bearer auth lib

**Files:**
- Create: `functions/_lib/daisoAuth.ts`
- Test: `functions/_lib/daisoAuth.test.ts`

**Interfaces:**
- Consumes: `PATHS` from `./daisoUpstream`.
- Produces: `interface DaisoAuth { bearer: string; uid: string }`; `encryptJwt(jwt: string, encKey: string, iv: Uint8Array): Promise<string>`; `requestAuth(deps: { fapiBase: string; encKey: string; fetchImpl?: typeof fetch; iv?: Uint8Array }): Promise<DaisoAuth>`.

- [x] **Step 1: Write the failing test** → `functions/_lib/daisoAuth.test.ts`

```ts
import { encryptJwt, requestAuth } from './daisoAuth';

const KEY = 'PRE_AUTH_ENC_KEY'; // 16 ASCII bytes → AES-128
const IV = new Uint8Array(16); // fixed IV for deterministic assertions

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

test('encryptJwt is deterministic and round-trips back to the JWT (AES-128-CBC/PKCS7)', async () => {
  const jwt = 'header.payload.sig';
  const bearer1 = await encryptJwt(jwt, KEY, IV);
  const bearer2 = await encryptJwt(jwt, KEY, IV);
  expect(bearer1).toBe(bearer2);

  const ivB64 = bearer1.slice(0, 24); // base64 of 16 bytes = 24 chars
  expect(b64ToBytes(ivB64)).toEqual(IV);

  // Independently decrypt to prove the ciphertext really is the JWT (no fabrication).
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(KEY),
    { name: 'AES-CBC' },
    false,
    ['decrypt'],
  );
  const pt = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: IV }, key, b64ToBytes(bearer1.slice(24)));
  expect(new TextDecoder().decode(pt)).toBe(jwt);
});

test('requestAuth fetches the JWT + uid and returns a Bearer', async () => {
  const fetchImpl = (async () =>
    new Response('the.jwt.token', {
      status: 200,
      headers: { 'x-dm-uid': 'uid-123' },
    })) as typeof fetch;
  const auth = await requestAuth({ fapiBase: 'https://fapi.x', encKey: KEY, fetchImpl, iv: IV });
  expect(auth.uid).toBe('uid-123');
  expect(auth.bearer).toBe(await encryptJwt('the.jwt.token', KEY, IV));
});

test('requestAuth throws when the auth endpoint fails or omits jwt/uid', async () => {
  const notOk = (async () => new Response('', { status: 500 })) as typeof fetch;
  await expect(requestAuth({ fapiBase: 'x', encKey: KEY, fetchImpl: notOk })).rejects.toThrow();
  const noUid = (async () => new Response('jwt', { status: 200 })) as typeof fetch;
  await expect(requestAuth({ fapiBase: 'x', encKey: KEY, fetchImpl: noUid, iv: IV })).rejects.toThrow();
});
```

- [x] **Step 2: Run to verify it fails** — `npm run test -- daisoAuth` → FAIL.

- [x] **Step 3: Implement** → `functions/_lib/daisoAuth.ts`

```ts
// functions/_lib/daisoAuth.ts
// Server-only anonymous-JWT → AES-128-CBC/PKCS7 → Bearer handshake (SKILL.md observed contract).
// WebCrypto only (Workers runtime). The enc key is a public vendor constant injected via env — never hardcoded.
import { PATHS } from './daisoUpstream';

export interface DaisoAuth {
  bearer: string; // base64(IV) + base64(ciphertext)
  uid: string; // x-dm-uid
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

// Injectable IV for test determinism; production passes none → random 16 bytes.
export async function encryptJwt(jwt: string, encKey: string, iv: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(encKey),
    { name: 'AES-CBC' },
    false,
    ['encrypt'],
  );
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-CBC', iv },
    key,
    new TextEncoder().encode(jwt),
  );
  return toBase64(iv) + toBase64(new Uint8Array(ct));
}

export async function requestAuth(deps: {
  fapiBase: string;
  encKey: string;
  fetchImpl?: typeof fetch;
  iv?: Uint8Array;
}): Promise<DaisoAuth> {
  const doFetch = deps.fetchImpl ?? fetch;
  const res = await doFetch(`${deps.fapiBase}${PATHS.auth}`, { method: 'GET' });
  if (!res.ok) throw new Error(`auth ${res.status}`);
  const jwt = (await res.text()).trim();
  const uid = res.headers.get('x-dm-uid') ?? '';
  if (!jwt || !uid) throw new Error('auth: missing jwt/uid');
  const iv = deps.iv ?? crypto.getRandomValues(new Uint8Array(16));
  return { bearer: await encryptJwt(jwt, deps.encKey, iv), uid };
}
```

- [x] **Step 4: Run to verify it passes** — `npm run test -- daisoAuth` → PASS. `npm run typecheck` → clean (WebWorker lib supplies `crypto`/`btoa`/`TextEncoder`).

- [x] **Step 5: Commit**

```bash
git add functions/_lib/daisoAuth.ts functions/_lib/daisoAuth.test.ts
git commit -m "feat(functions): anonymous-JWT AES-128-CBC Bearer auth handshake (WebCrypto)"
```

### Task 3: `/api/availability` fan-out orchestrator

**Files:**
- Create: `functions/api/availability.ts`
- Test: `functions/api/availability.test.ts`

**Interfaces:**
- Consumes: `requestAuth`, `DaisoAuth` from `../_lib/daisoAuth`; `PATHS`, `UpstreamConfig`, `UpstreamEnv`, `badGateway`, `jsonResponse`, `searchGoodsUrl`, `upstreamConfig` from `../_lib/daisoUpstream`.
- Produces: `onRequestPost(context: { request: Request; env: UpstreamEnv }): Promise<Response>` returning `{ data: RawStoreObservation }` | `{ noMatch: true }` | `502 { error: 'upstream_unavailable' }` | `400 { error: 'bad_request' }`. The `RawStoreObservation` shape here **mirrors** `src/adapters/daisomall/rawObservation.ts` (Task 6) — keep the two in sync.

- [x] **Step 1: Write the failing test** → `functions/api/availability.test.ts`

```ts
import { onRequestPost } from './availability';

const ENV = { PRE_AUTH_ENC_KEY: 'PRE_AUTH_ENC_KEY' };
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

type Handler = (url: string, init?: RequestInit) => Response;
function route(map: Array<[string, Handler]>) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    for (const [frag, h] of map) if (url.includes(frag)) return h(url, init);
    throw new Error(`no route for ${url}`);
  }) as typeof fetch;
}
const authOk: Handler = () =>
  new Response('jwt.token', { status: 200, headers: { 'x-dm-uid': 'uid-1' } });
const searchOk =
  (docs: unknown[]): Handler =>
  () =>
    new Response(JSON.stringify({ resultSet: { result: [{ resultDocuments: docs }] } }), {
      status: 200,
    });
const PROD = { pdNo: '19987', pdNm: '리빙 밀폐용기 1.2L', exhPdNm: '리빙 밀폐용기 1.2L', pdPrc: '2000' };
function expectAuth(init?: RequestInit) {
  const h = (init?.headers ?? {}) as Record<string, string>;
  expect(h.authorization?.startsWith('Bearer ')).toBe(true);
  expect(h['x-dm-uid']).toBe('uid-1');
}
function req(body: unknown) {
  return {
    request: new Request('http://x/api/availability', { method: 'POST', body: JSON.stringify(body) }),
    env: ENV,
  };
}

test('direct store: fans out and returns a normalized inStock observation with no-store', async () => {
  route([
    ['/auth/request', authOk],
    ['SearchGoods', searchOk([PROD])],
    ['/ms/msg/selStr', () => new Response(JSON.stringify({ strCd: '10803', directYn: 'Y' }), { status: 200 })],
    ['/pdo/selIntPdStDispInfo', (_u, init) => (expectAuth(init), new Response(JSON.stringify({ data: [{ zoneNo: '56', stairNo: '11' }] }), { status: 200 }))],
    ['/pd/pdh/selStrPkupStck', (_u, init) => (expectAuth(init), new Response(JSON.stringify({ data: [{ sleStsCd: '1', stck: '50' }] }), { status: 200 }))],
  ]);
  const res = await onRequestPost(req({ strCd: '10803', keyword: '밀폐용기' }));
  expect(res.status).toBe(200);
  expect(res.headers.get('cache-control')).toBe('no-store');
  expect(await res.json()).toEqual({
    data: {
      strCd: '10803', pdNo: '19987', productName: '리빙 밀폐용기 1.2L', price: 2000,
      directYn: 'Y', stck: '50', sleStsCd: '1', mrkGdsYn: null, lchDay: null,
      locations: [{ floor: '11', zone: '56' }],
    },
  });
});

test('franchise with no display zone: stock NOT fetched (stck null), locations empty', async () => {
  let stckCalled = false;
  route([
    ['/auth/request', authOk],
    ['SearchGoods', searchOk([PROD])],
    ['/ms/msg/selStr', () => new Response(JSON.stringify({ directYn: 'N' }), { status: 200 })],
    ['/pdo/selIntPdStDispInfo', () => new Response(JSON.stringify({ data: [] }), { status: 200 })],
    ['/pd/pdh/selStrPkupStck', () => ((stckCalled = true), new Response('{}', { status: 200 }))],
  ]);
  const body = (await (await onRequestPost(req({ strCd: '1', keyword: '밀폐용기' }))).json()) as {
    data: { stck: string | null; directYn: string; locations: unknown[] };
  };
  expect(stckCalled).toBe(false);
  expect(body.data.stck).toBeNull();
  expect(body.data.directYn).toBe('N');
  expect(body.data.locations).toEqual([]);
});

test('franchise WITH a display zone: stock IS fetched (지하 floor preserved raw)', async () => {
  let stckCalled = false;
  route([
    ['/auth/request', authOk],
    ['SearchGoods', searchOk([PROD])],
    ['/ms/msg/selStr', () => new Response(JSON.stringify({ directYn: 'N' }), { status: 200 })],
    ['/pdo/selIntPdStDispInfo', () => new Response(JSON.stringify({ data: [{ zoneNo: '30', stairNo: '-1' }] }), { status: 200 })],
    ['/pd/pdh/selStrPkupStck', () => ((stckCalled = true), new Response(JSON.stringify({ data: [{ stck: '6', sleStsCd: '1' }] }), { status: 200 }))],
  ]);
  const body = (await (await onRequestPost(req({ strCd: '1', keyword: '밀폐용기' }))).json()) as {
    data: { stck: string | null; locations: { floor: string; zone: string }[] };
  };
  expect(stckCalled).toBe(true);
  expect(body.data.stck).toBe('6');
  expect(body.data.locations).toEqual([{ floor: '-1', zone: '30' }]);
});

test('SearchGoods 0 results → { noMatch: true }', async () => {
  route([
    ['/auth/request', authOk],
    ['SearchGoods', searchOk([])],
    ['/ms/msg/selStr', () => new Response(JSON.stringify({ directYn: 'Y' }), { status: 200 })],
  ]);
  const res = await onRequestPost(req({ strCd: '1', keyword: '없는상품' }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ noMatch: true });
});

test('an upstream failure on a required call → 502 upstream_unavailable + CORS', async () => {
  route([
    ['/auth/request', authOk],
    ['SearchGoods', searchOk([PROD])],
    ['/ms/msg/selStr', () => new Response('', { status: 500 })],
    ['/pdo/selIntPdStDispInfo', () => new Response(JSON.stringify({ data: [] }), { status: 200 })],
  ]);
  const res = await onRequestPost(req({ strCd: '1', keyword: '밀폐용기' }));
  expect(res.status).toBe(502);
  expect(await res.json()).toEqual({ error: 'upstream_unavailable' });
  expect(res.headers.get('access-control-allow-origin')).toBe('*');
});

test('a 401 on an authed call reissues auth once and retries', async () => {
  let authCalls = 0;
  let stckCalls = 0;
  route([
    ['/auth/request', () => ((authCalls++), new Response('jwt.token', { status: 200, headers: { 'x-dm-uid': 'uid-1' } }))],
    ['SearchGoods', searchOk([PROD])],
    ['/ms/msg/selStr', () => new Response(JSON.stringify({ directYn: 'Y' }), { status: 200 })],
    ['/pdo/selIntPdStDispInfo', () => new Response(JSON.stringify({ data: [{ zoneNo: '56', stairNo: '11' }] }), { status: 200 })],
    ['/pd/pdh/selStrPkupStck', () => ((stckCalls++), stckCalls === 1 ? new Response('', { status: 401 }) : new Response(JSON.stringify({ data: [{ stck: '50', sleStsCd: '1' }] }), { status: 200 }))],
  ]);
  const body = (await (await onRequestPost(req({ strCd: '1', keyword: '밀폐용기' }))).json()) as {
    data: { stck: string | null };
  };
  expect(authCalls).toBe(2);
  expect(stckCalls).toBe(2);
  expect(body.data.stck).toBe('50');
});

test('direct store with a failing stock fetch → 502 (never a stck:null direct record)', async () => {
  route([
    ['/auth/request', authOk],
    ['SearchGoods', searchOk([PROD])],
    ['/ms/msg/selStr', () => new Response(JSON.stringify({ directYn: 'Y' }), { status: 200 })],
    ['/pdo/selIntPdStDispInfo', () => new Response(JSON.stringify({ data: [{ zoneNo: '56', stairNo: '11' }] }), { status: 200 })],
    ['/pd/pdh/selStrPkupStck', () => new Response('', { status: 500 })],
  ]);
  expect((await onRequestPost(req({ strCd: '1', keyword: '밀폐용기' }))).status).toBe(502);
});

test('mall-only upstream fields never appear in the observation (whitelist by construction)', async () => {
  route([
    ['/auth/request', authOk],
    ['SearchGoods', searchOk([{ ...PROD, soldOutYn: 'N', ONL_STCK_QY: '191' }])],
    ['/ms/msg/selStr', () => new Response(JSON.stringify({ directYn: 'Y', pkupYn: 'Y', pntAcmYn: 'Y' }), { status: 200 })],
    ['/pdo/selIntPdStDispInfo', () => new Response(JSON.stringify({ data: [{ zoneNo: '56', stairNo: '11', storeErp: '10803' }] }), { status: 200 })],
    ['/pd/pdh/selStrPkupStck', () => new Response(JSON.stringify({ data: [{ stck: '50', sleStsCd: '1', pkupYn: 'Y', intUseYn: 'Y' }] }), { status: 200 })],
  ]);
  const body = (await (await onRequestPost(req({ strCd: '10803', keyword: '밀폐용기' }))).json()) as {
    data: Record<string, unknown>;
  };
  expect(Object.keys(body.data).sort()).toEqual(
    ['directYn', 'lchDay', 'locations', 'mrkGdsYn', 'pdNo', 'price', 'productName', 'sleStsCd', 'stck', 'strCd'].sort(),
  );
});

test('missing strCd or keyword → 400', async () => {
  route([]);
  expect((await onRequestPost(req({ keyword: 'x' }))).status).toBe(400);
  expect((await onRequestPost(req({ strCd: '1' }))).status).toBe(400);
});
```

- [x] **Step 2: Run to verify it fails** — `npm run test -- availability` → FAIL (module not found).

- [x] **Step 3: Implement** → `functions/api/availability.ts`

```ts
// functions/api/availability.ts
// Flow-1 fan-out orchestrator: SearchGoods (product) · selStr (directYn) · auth, then conditional
// selIntPdStDispInfo (location) + selStrPkupStck (stock) → a normalized, whitelisted RawStoreObservation.
// The client mapStoreObservation does 6-state classification. Read-only, no-store, server-only secrets.
import { type DaisoAuth, requestAuth } from '../_lib/daisoAuth';
import {
  PATHS,
  type UpstreamConfig,
  type UpstreamEnv,
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
  return { 'content-type': 'application/json', authorization: `Bearer ${auth.bearer}`, 'x-dm-uid': auth.uid };
}
function makeAuthedCall(cfg: UpstreamConfig, initial: DaisoAuth): AuthedCall {
  let auth = initial;
  let reissue: Promise<DaisoAuth> | null = null;
  return async (url, body) => {
    let res = await fetch(url, { method: 'POST', headers: authHeaders(auth), body });
    if (res.status === 401 || res.status === 403) {
      auth = await (reissue ??= requestAuth({ fapiBase: cfg.fapiBase, encKey: cfg.encKey }));
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
async function fetchStock(fapiBase: string, pdNo: string, strCd: string, call: AuthedCall): Promise<StockFields> {
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

export async function onRequestPost(context: { request: Request; env: UpstreamEnv }): Promise<Response> {
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
    };
    return jsonResponse({ data: observation });
  } catch {
    return badGateway();
  }
}
```

- [x] **Step 4: Run to verify it passes** — `npm run test -- availability` → PASS. `npm run typecheck` → clean.

- [x] **Step 5: Commit**

```bash
git add functions/api/availability.ts functions/api/availability.test.ts
git commit -m "feat(functions): /api/availability conditional fan-out orchestrator"
```

### Task 4: `/api/stores` selStr search-mode proxy

**Files:**
- Create: `functions/api/stores.ts`
- Test: `functions/api/stores.test.ts`

**Interfaces:**
- Consumes: `PATHS`, `UpstreamConfig`, `UpstreamEnv`, `badGateway`, `jsonResponse`, `upstreamConfig` from `../_lib/daisoUpstream`.
- Produces: `onRequestPost(context: { request: Request; env: UpstreamEnv }): Promise<Response>` → `{ stores: { strCd: string; strNm: string }[] }` | `502` | `400`.

- [x] **Step 1: Write the failing test** → `functions/api/stores.test.ts`

```ts
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
    expect(JSON.parse(String(init?.body))).toMatchObject({ keyword: '명동', srchYn: 'Y', geolocationAgrYn: 'N' });
    return new Response(
      JSON.stringify({ data: [{ strCd: '11043', strNm: '명동역점', strAddr: 'x', km: '9.9', directYn: 'Y' }] }),
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
  globalThis.fetch = (async () => ((called = true), new Response('{}', { status: 200 }))) as typeof fetch;
  expect(await (await onRequestPost(req({ query: '   ' }))).json()).toEqual({ stores: [] });
  expect(called).toBe(false);
});

test('an upstream failure → 502 upstream_unavailable', async () => {
  globalThis.fetch = (async () => new Response('', { status: 500 })) as typeof fetch;
  const res = await onRequestPost(req({ query: '명동' }));
  expect(res.status).toBe(502);
  expect(await res.json()).toEqual({ error: 'upstream_unavailable' });
});
```

- [x] **Step 2: Run to verify it fails** — `npm run test -- stores` → FAIL.

- [x] **Step 3: Implement** → `functions/api/stores.ts`

```ts
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

export async function onRequestPost(context: { request: Request; env: UpstreamEnv }): Promise<Response> {
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
```

- [x] **Step 4: Run to verify it passes** — `npm run test -- stores` → PASS. `npm run typecheck` → clean.

- [x] **Step 5: Commit**

```bash
git add functions/api/stores.ts functions/api/stores.test.ts
git commit -m "feat(functions): /api/stores selStr search-mode proxy"
```

### SESSION 1 EXIT GATE

- [x] Run the full gate — all must be green:
  - `npm run test` (Vitest, incl. the 4 new function suites; existing suites unchanged)
  - `npm run typecheck` (`tsc -b` incl. `functions/` non-test files under WebWorker lib)
  - `npm run lint` (Biome)
  - `npm run e2e` (unaffected — no `src/` change — but confirm 14/14)
- [x] Confirm **zero `src/` changes** in this session: `git diff --stat main -- src/` is empty.
- [x] Session 1 deliverable complete: the proxy layer (`/api/availability`, `/api/stores`, auth) is fully hermetically tested and the app is byte-for-byte unchanged. **Next session: SESSION 2 (client adapters).**

---

## SESSION 2 — Client adapters + format

**START HERE (Session 2).** Prereq: Session 1 committed. This session adds `src/adapters/daisomall/**` and small `format.ts` tweaks. **Nothing is wired yet** (composition is Session 3), so the mocks stay active and the app + E2E remain green. Depends on Session 1 only for the `RawStoreObservation` shape (re-declared client-side, validated).

### Task 5: `format.ts` — 지하 floor, `formatLchDay`, `kmToMeters`

**Files:**
- Modify: `src/ui/format.ts`
- Modify: `src/ui/format.test.ts`

**Interfaces:**
- Produces: `formatLchDay(iso: string): string`; `kmToMeters(km: number): number`; `formatLocation` now handles basement floors.

- [x] **Step 1: Add the failing tests** — update the import line and append to `src/ui/format.test.ts`:

```ts
import { formatLchDay, formatLocation, formatPrice, formatRelativeTimeKo, kmToMeters } from './format';
```

```ts
test('formatLocation renders a basement floor as "지하 N층 M번"', () => {
  expect(formatLocation({ floor: '-1', zone: '30' })).toBe('지하 1층 30번');
  expect(formatLocation({ floor: '11', zone: '56' })).toBe('11층 56번'); // aboveground unchanged
});

test('formatLchDay renders an ISO date as "M월 D일"', () => {
  expect(formatLchDay('2026-07-15')).toBe('7월 15일');
  expect(formatLchDay('2026-12-03')).toBe('12월 3일');
});

test('kmToMeters rounds kilometers to whole meters', () => {
  expect(kmToMeters(9.9)).toBe(9900);
  expect(kmToMeters(0.12)).toBe(120);
  expect(kmToMeters(0.1204)).toBe(120);
});
```

- [x] **Step 2: Run to verify it fails** — `npm run test -- format` → FAIL.

- [x] **Step 3: Implement** — replace `formatLocation` and append two functions in `src/ui/format.ts`:

```ts
export function formatLocation(location: StoreLocation): string {
  const floor = location.floor.startsWith('-')
    ? `지하 ${location.floor.slice(1)}층`
    : `${location.floor}층`;
  return `${floor} ${location.zone}번`;
}

// Upstream lchDay is 'YYYY-MM-DD'; the Bible copy ("{lchDay} 전후에 들어올 예정") wants "M월 D일"
// (daiso formatLchDay). App-owned presentation decision (open-questions §B).
export function formatLchDay(iso: string): string {
  const parts = iso.split('-');
  return `${Number(parts[1])}월 ${Number(parts[2])}일`;
}

// km→m for the D082 distance label (selStr km is a float). App-owned; surfaced only in the GPS-nearby
// pass (out of scope here) — util + test only.
export function kmToMeters(km: number): number {
  return Math.round(km * 1000);
}
```

- [x] **Step 4: Run to verify it passes** — `npm run test -- format` → PASS (incl. the pre-existing `formatLocation` "11층 56번" test).

- [x] **Step 5: Commit**

```bash
git add src/ui/format.ts src/ui/format.test.ts
git commit -m "feat(ui): 지하 floor, formatLchDay, kmToMeters presentation utils"
```

### Task 6: `RawStoreObservation` type + runtime validator

**Files:**
- Create: `src/adapters/daisomall/rawObservation.ts`
- Test: `src/adapters/daisomall/rawObservation.test.ts`

**Interfaces:**
- Consumes: `UnmappableAnswerError` from `../../domain/errors`.
- Produces: `interface RawStoreObservation { strCd; pdNo; productName: string; price: number; directYn; stck: string|null; sleStsCd: string|null; mrkGdsYn: string|null; lchDay: string|null; locations: { floor: string; zone: string }[] }`; `parseRawObservation(value: unknown): RawStoreObservation` (throws `UnmappableAnswerError` on any shape/type mismatch — JSON is never trusted).

- [x] **Step 1: Write the failing test** → `src/adapters/daisomall/rawObservation.test.ts`

```ts
import { UnmappableAnswerError } from '../../domain/errors';
import { parseRawObservation } from './rawObservation';

const valid = {
  strCd: '10803', pdNo: '19987', productName: '리빙 밀폐용기 1.2L', price: 2000,
  directYn: 'Y', stck: '50', sleStsCd: '1', mrkGdsYn: null, lchDay: null,
  locations: [{ floor: '11', zone: '56' }],
};

test('parseRawObservation accepts a well-formed record', () => {
  expect(parseRawObservation(valid)).toEqual(valid);
});

test('null stock fields are accepted (franchise deliberately-unfetched shape)', () => {
  const franchise = { ...valid, directYn: 'N', stck: null, sleStsCd: null, locations: [] };
  expect(parseRawObservation(franchise)).toEqual(franchise);
});

test('a non-object, missing identity, or wrong-typed field throws UnmappableAnswerError', () => {
  expect(() => parseRawObservation(null)).toThrow(UnmappableAnswerError);
  expect(() => parseRawObservation({ ...valid, pdNo: 123 })).toThrow(UnmappableAnswerError);
  expect(() => parseRawObservation({ ...valid, price: '2000' })).toThrow(UnmappableAnswerError);
  expect(() => parseRawObservation({ ...valid, stck: 50 })).toThrow(UnmappableAnswerError);
  expect(() => parseRawObservation({ ...valid, locations: [{ floor: '1' }] })).toThrow(UnmappableAnswerError);
  expect(() => parseRawObservation({ ...valid, locations: 'x' })).toThrow(UnmappableAnswerError);
});
```

- [x] **Step 2: Run to verify it fails** — `npm run test -- rawObservation` → FAIL.

- [x] **Step 3: Implement** → `src/adapters/daisomall/rawObservation.ts`

```ts
// src/adapters/daisomall/rawObservation.ts
// The proxy→client network contract (mirror of functions/api/availability.ts's RawStoreObservation) plus a
// lightweight runtime validator. JSON is never trusted: any shape/type mismatch → UnmappableAnswerError.
import { UnmappableAnswerError } from '../../domain/errors';

export interface RawStoreObservation {
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
}

function isStrOrNull(v: unknown): v is string | null {
  return v === null || typeof v === 'string';
}

export function parseRawObservation(value: unknown): RawStoreObservation {
  if (!value || typeof value !== 'object') throw new UnmappableAnswerError('observation: not an object');
  const o = value as Record<string, unknown>;
  if (typeof o.strCd !== 'string' || typeof o.pdNo !== 'string' || typeof o.productName !== 'string') {
    throw new UnmappableAnswerError('observation: missing identity');
  }
  if (typeof o.price !== 'number' || typeof o.directYn !== 'string') {
    throw new UnmappableAnswerError('observation: missing price/directYn');
  }
  if (!isStrOrNull(o.stck) || !isStrOrNull(o.sleStsCd) || !isStrOrNull(o.mrkGdsYn) || !isStrOrNull(o.lchDay)) {
    throw new UnmappableAnswerError('observation: bad stock fields');
  }
  if (!Array.isArray(o.locations)) throw new UnmappableAnswerError('observation: locations not array');
  const locations = o.locations.map((l) => {
    const r = l as Record<string, unknown>;
    if (!r || typeof r.floor !== 'string' || typeof r.zone !== 'string') {
      throw new UnmappableAnswerError('observation: bad location');
    }
    return { floor: r.floor, zone: r.zone };
  });
  return {
    strCd: o.strCd, pdNo: o.pdNo, productName: o.productName, price: o.price, directYn: o.directYn,
    stck: o.stck, sleStsCd: o.sleStsCd, mrkGdsYn: o.mrkGdsYn, lchDay: o.lchDay, locations,
  };
}
```

- [x] **Step 4: Run to verify it passes** — `npm run test -- rawObservation` → PASS.

- [x] **Step 5: Commit**

```bash
git add src/adapters/daisomall/rawObservation.ts src/adapters/daisomall/rawObservation.test.ts
git commit -m "feat(adapters): RawStoreObservation contract + runtime validator"
```

### Task 7: `mapStoreObservation` — 6-state precedence (parity oracle)

**Files:**
- Create: `src/adapters/daisomall/mapStoreObservation.ts`
- Create: `src/adapters/daisomall/observationFixtures.ts`
- Test: `src/adapters/daisomall/mapStoreObservation.test.ts`

**Interfaces:**
- Consumes: `UnmappableAnswerError` (errors), `AvailabilityAnswer` (types), `formatLchDay` (Task 5), `RawStoreObservation` (Task 6), `Scenario`/`mockAnswers` (mock fixtures — the parity oracle).
- Produces: `mapStoreObservation(o: RawStoreObservation): AvailabilityAnswer`; `observationFixtures: Record<Scenario, RawStoreObservation>`.

- [x] **Step 1: Write the failing test** → `src/adapters/daisomall/mapStoreObservation.test.ts`

```ts
import { UnmappableAnswerError } from '../../domain/errors';
import { type Scenario, mockAnswers } from '../mock/fixtures';
import { mapStoreObservation } from './mapStoreObservation';
import { observationFixtures } from './observationFixtures';
import type { RawStoreObservation } from './rawObservation';

const scenarios: Scenario[] = [
  'inStock', 'inStockLowQty', 'inStockMultiLocation', 'noLocation',
  'temporarilyOut', 'discontinued', 'notCarried', 'restockArriving', 'franchise',
];

for (const s of scenarios) {
  test(`parity: mapping the ${s} observation reproduces the canonical mock answer`, () => {
    expect(mapStoreObservation(observationFixtures[s])).toEqual(mockAnswers[s]);
  });
}

test('restockArriving formats lchDay from ISO to "M월 D일"', () => {
  expect(mapStoreObservation(observationFixtures.restockArriving)).toEqual({
    kind: 'restockArriving', productName: '리빙 밀폐용기 1.2L', price: 2000, lchDay: '7월 15일',
  });
});

test('an unmapped combination throws UnmappableAnswerError (safe fallback, never a fabricated Success)', () => {
  const weird: RawStoreObservation = {
    ...observationFixtures.franchise,
    directYn: 'N', sleStsCd: null, stck: '0', locations: [{ floor: '3', zone: '9' }],
  };
  expect(() => mapStoreObservation(weird)).toThrow(UnmappableAnswerError);
});

test('a direct store with unfetched stock (stck null) is refused, not read as notCarried (§4.1 invariant guard)', () => {
  expect(() => mapStoreObservation({ ...observationFixtures.notCarried, stck: null })).toThrow(UnmappableAnswerError);
});
```

- [x] **Step 2: Write the fixtures** → `src/adapters/daisomall/observationFixtures.ts`

```ts
// src/adapters/daisomall/observationFixtures.ts
// One RawStoreObservation per canonical scenario — the ported parity oracle for the 6-state mapping
// (replaces newIntSelStr/rawFixtures.ts). Product identity mirrors the mock name/price.
import type { Scenario } from '../mock/fixtures';
import type { RawStoreObservation } from './rawObservation';

const base = { strCd: '10803', pdNo: '19987', productName: '리빙 밀폐용기 1.2L', price: 2000 };

export const observationFixtures: Record<Scenario, RawStoreObservation> = {
  inStock: { ...base, directYn: 'Y', sleStsCd: '1', stck: '50', mrkGdsYn: null, lchDay: null, locations: [{ floor: '11', zone: '56' }] },
  inStockLowQty: { ...base, directYn: 'Y', sleStsCd: '1', stck: '3', mrkGdsYn: null, lchDay: null, locations: [{ floor: '11', zone: '56' }] },
  inStockMultiLocation: { ...base, directYn: 'Y', sleStsCd: '1', stck: '50', mrkGdsYn: null, lchDay: null, locations: [{ floor: '11', zone: '56' }, { floor: '2', zone: '14' }] },
  noLocation: { ...base, directYn: 'Y', sleStsCd: '1', stck: '50', mrkGdsYn: null, lchDay: null, locations: [] },
  temporarilyOut: { ...base, directYn: 'Y', sleStsCd: '1', stck: '0', mrkGdsYn: null, lchDay: null, locations: [] },
  discontinued: { ...base, directYn: 'Y', sleStsCd: '9', stck: '0', mrkGdsYn: null, lchDay: null, locations: [] },
  notCarried: { ...base, directYn: 'Y', sleStsCd: null, stck: '0', mrkGdsYn: null, lchDay: null, locations: [] },
  restockArriving: { ...base, directYn: 'Y', sleStsCd: null, stck: '0', mrkGdsYn: 'Y', lchDay: '2026-07-15', locations: [] },
  franchise: { ...base, directYn: 'N', sleStsCd: null, stck: null, mrkGdsYn: null, lchDay: null, locations: [] },
};
```

- [x] **Step 3: Run to verify it fails** — `npm run test -- mapStoreObservation` → FAIL (mapStoreObservation not found).

- [x] **Step 4: Implement** → `src/adapters/daisomall/mapStoreObservation.ts`

```ts
// src/adapters/daisomall/mapStoreObservation.ts
// Normalized RawStoreObservation → domain AvailabilityAnswer. Ported from newIntSelStr/mapResponse with the
// franchise refinement ("franchise AND no location") and the §4.1 invariant guard. Unmatched → UnmappableAnswerError
// (safe fallback; NEVER a fabricated Success — Engineering §7 read-only, no optimistic availability).
import { UnmappableAnswerError } from '../../domain/errors';
import type { AvailabilityAnswer } from '../../domain/types';
import { formatLchDay } from '../../ui/format';
import type { RawStoreObservation } from './rawObservation';

export function mapStoreObservation(o: RawStoreObservation): AvailabilityAnswer {
  const { productName, price, directYn, sleStsCd, mrkGdsYn, locations } = o;

  // 0. Invariant guard (§4.1): a direct store always fetches stock. stck:null for a direct store would be a
  //    leaked fetch failure — refuse it rather than misread rule 5 as notCarried.
  if (directYn === 'Y' && o.stck === null) {
    throw new UnmappableAnswerError('direct store with unfetched stock');
  }
  const stck = Number(o.stck);

  // 1. Franchise AND no location → stock undeterminable BY DESIGN (orchestrator did not fetch it).
  if (directYn !== 'Y' && locations.length === 0) {
    return { kind: 'franchiseUndeterminable', productName };
  }
  // 2. In stock — qty is an UPPER BOUND (data-contract §4); carry it, never present as an exact count.
  if (stck > 0) {
    return { kind: 'inStock', productName, price, locations, qtyUpperBound: stck };
  }
  // 3. Discontinued — store sleStsCd '9' outranks temporarily-out.
  if (sleStsCd === '9') {
    return { kind: 'discontinued', productName, price };
  }
  // 4. Restock arriving — incoming-goods flag; lchDay 'YYYY-MM-DD' → 'M월 D일'.
  if (mrkGdsYn === 'Y') {
    return { kind: 'restockArriving', productName, price, lchDay: formatLchDay(o.lchDay ?? '') };
  }
  // 5. Not carried — a direct store with a null store status does not carry it.
  if (sleStsCd === null && directYn === 'Y') {
    return { kind: 'notCarried', productName };
  }
  // 6. Temporarily out — carried (status present) but zero on hand; a restock offer stands.
  if (stck === 0 && sleStsCd !== null) {
    return { kind: 'temporarilyOut', productName, price, restockOfferable: true };
  }
  // 7. Unknown combination → safe fallback, NEVER a fabricated Success.
  throw new UnmappableAnswerError(
    `unmapped observation: directYn=${directYn} sleStsCd=${sleStsCd} stck=${o.stck}`,
  );
}
```

- [x] **Step 5: Run to verify it passes** — `npm run test -- mapStoreObservation` → PASS (all 9 parity + edges).

- [x] **Step 6: Commit**

```bash
git add src/adapters/daisomall/mapStoreObservation.ts src/adapters/daisomall/observationFixtures.ts src/adapters/daisomall/mapStoreObservation.test.ts
git commit -m "feat(adapters): mapStoreObservation 6-state precedence + parity oracle"
```

### Task 8: `StoreStockRepository` live adapter

**Files:**
- Create: `src/adapters/daisomall/storeStockRepository.ts`
- Test: `src/adapters/daisomall/storeStockRepository.test.ts`

**Interfaces:**
- Consumes: `NoCatalogMatchError` (errors), `StoreStockRepository` (ports), `mapStoreObservation` (Task 7), `parseRawObservation` (Task 6).
- Produces: `type FetchLike`; `createDaisoStoreStockRepository(deps?: { endpoint?: string; fetchImpl?: FetchLike }): StoreStockRepository` (default endpoint `/api/availability`).

- [x] **Step 1: Write the failing test** → `src/adapters/daisomall/storeStockRepository.test.ts`

```ts
import { NoCatalogMatchError, UnmappableAnswerError } from '../../domain/errors';
import { mockAnswers } from '../mock/fixtures';
import { observationFixtures } from './observationFixtures';
import { type FetchLike, createDaisoStoreStockRepository } from './storeStockRepository';

const store = { strCd: '10803', strNm: '명동역점' };
const ok = (body: unknown): ReturnType<FetchLike> =>
  Promise.resolve({ ok: true, status: 200, json: async () => body });

test('a { data } observation is validated and mapped to the domain answer', async () => {
  const fetchImpl: FetchLike = async (_url, init) => {
    expect(JSON.parse(init.body)).toEqual({ strCd: '10803', keyword: '밀폐용기' });
    return ok({ data: observationFixtures.inStock });
  };
  const repo = createDaisoStoreStockRepository({ fetchImpl });
  expect(await repo.query(store, { keyword: '밀폐용기' })).toEqual(mockAnswers.inStock);
});

test('{ noMatch: true } → NoCatalogMatchError (→ NO_MATCH → Empty)', async () => {
  const repo = createDaisoStoreStockRepository({ fetchImpl: async () => ok({ noMatch: true }) });
  await expect(repo.query(store, { keyword: '없는상품' })).rejects.toBeInstanceOf(NoCatalogMatchError);
});

test('a non-ok response throws (→ FAILURE path)', async () => {
  const repo = createDaisoStoreStockRepository({
    fetchImpl: async () => ({ ok: false, status: 502, json: async () => ({}) }),
  });
  await expect(repo.query(store, { keyword: '밀폐용기' })).rejects.toThrow();
});

test('a malformed observation → UnmappableAnswerError (safe fallback, no fabrication)', async () => {
  const repo = createDaisoStoreStockRepository({ fetchImpl: async () => ok({ data: { strCd: 1 } }) });
  await expect(repo.query(store, { keyword: '밀폐용기' })).rejects.toBeInstanceOf(UnmappableAnswerError);
});
```

- [x] **Step 2: Run to verify it fails** — `npm run test -- storeStockRepository` → FAIL.

- [x] **Step 3: Implement** → `src/adapters/daisomall/storeStockRepository.ts`

```ts
// src/adapters/daisomall/storeStockRepository.ts
// StoreStockRepository (B6) over the internal /api/availability proxy. Validates + maps; never talks to daisomall.
import { NoCatalogMatchError } from '../../domain/errors';
import type { StoreStockRepository } from '../../domain/ports';
import { mapStoreObservation } from './mapStoreObservation';
import { parseRawObservation } from './rawObservation';

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export function createDaisoStoreStockRepository(
  deps: { endpoint?: string; fetchImpl?: FetchLike } = {},
): StoreStockRepository {
  const endpoint = deps.endpoint ?? '/api/availability';
  const doFetch: FetchLike = deps.fetchImpl ?? ((url, init) => fetch(url, init));
  return {
    async query(store, term, signal) {
      const res = await doFetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ strCd: store.strCd, keyword: term.keyword, pdNo: term.pdNo }),
        signal,
      });
      if (!res.ok) throw new Error(`availability ${res.status}`); // → FAILURE path
      const json = (await res.json()) as { noMatch?: boolean; data?: unknown };
      if (json?.noMatch) throw new NoCatalogMatchError([]); // → NO_MATCH → Empty
      return mapStoreObservation(parseRawObservation(json?.data));
    },
  };
}
```

- [x] **Step 4: Run to verify it passes** — `npm run test -- storeStockRepository` → PASS.

- [x] **Step 5: Commit**

```bash
git add src/adapters/daisomall/storeStockRepository.ts src/adapters/daisomall/storeStockRepository.test.ts
git commit -m "feat(adapters): StoreStockRepository over /api/availability"
```

### Task 9: `StoreDirectoryPort` live adapter

**Files:**
- Create: `src/adapters/daisomall/storeDirectory.ts`
- Test: `src/adapters/daisomall/storeDirectory.test.ts`

**Interfaces:**
- Consumes: `StoreDirectoryPort` (ports), `StoreContext` (types).
- Produces: `type FetchLike`; `createDaisoStoreDirectory(deps?: { endpoint?: string; fetchImpl?: FetchLike }): StoreDirectoryPort` (default endpoint `/api/stores`).

- [x] **Step 1: Write the failing test** → `src/adapters/daisomall/storeDirectory.test.ts`

```ts
import { type FetchLike, createDaisoStoreDirectory } from './storeDirectory';

const ok = (body: unknown): ReturnType<FetchLike> =>
  Promise.resolve({ ok: true, status: 200, json: async () => body });

test('maps { stores } to StoreContext[]', async () => {
  const dir = createDaisoStoreDirectory({
    fetchImpl: async (_u, init) => {
      expect(JSON.parse(init.body)).toEqual({ query: '명동' });
      return ok({ stores: [{ strCd: '11043', strNm: '명동역점' }, { strCd: '11044', strNm: '명동중앙점' }] });
    },
  });
  await expect(dir.searchStores('명동')).resolves.toEqual([
    { strCd: '11043', strNm: '명동역점' },
    { strCd: '11044', strNm: '명동중앙점' },
  ]);
});

test('a blank query returns [] without calling the proxy', async () => {
  let called = false;
  const dir = createDaisoStoreDirectory({
    fetchImpl: async () => ((called = true), ok({ stores: [] })),
  });
  await expect(dir.searchStores('   ')).resolves.toEqual([]);
  expect(called).toBe(false);
});

test('a non-ok response or network failure degrades to [] (honest empty, never a crash)', async () => {
  const notOk = createDaisoStoreDirectory({
    fetchImpl: async () => ({ ok: false, status: 502, json: async () => ({}) }),
  });
  await expect(notOk.searchStores('명동')).resolves.toEqual([]);
  const boom = createDaisoStoreDirectory({
    fetchImpl: async () => {
      throw new Error('network');
    },
  });
  await expect(boom.searchStores('명동')).resolves.toEqual([]);
});
```

- [x] **Step 2: Run to verify it fails** — `npm run test -- storeDirectory` → FAIL. (Note the mock `storeDirectory.test.ts` under `src/adapters/mock/` still runs — the `-- storeDirectory` filter matches both; the mock one stays green.)

- [x] **Step 3: Implement** → `src/adapters/daisomall/storeDirectory.ts`

```ts
// src/adapters/daisomall/storeDirectory.ts
// StoreDirectoryPort (B16) over the internal /api/stores proxy. Blank/failed search → honest [] (D082 sheet
// shows no results, never crashes).
import type { StoreDirectoryPort } from '../../domain/ports';
import type { StoreContext } from '../../domain/types';

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export function createDaisoStoreDirectory(
  deps: { endpoint?: string; fetchImpl?: FetchLike } = {},
): StoreDirectoryPort {
  const endpoint = deps.endpoint ?? '/api/stores';
  const doFetch: FetchLike = deps.fetchImpl ?? ((url, init) => fetch(url, init));
  return {
    async searchStores(query) {
      const q = query.trim();
      if (!q) return [];
      try {
        const res = await doFetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ query: q }),
        });
        if (!res.ok) return [];
        const json = (await res.json()) as { stores?: Array<{ strCd?: unknown; strNm?: unknown }> };
        const stores: StoreContext[] = (json?.stores ?? [])
          .filter(
            (s): s is { strCd: string; strNm: string } =>
              typeof s?.strCd === 'string' && typeof s?.strNm === 'string',
          )
          .map((s) => ({ strCd: s.strCd, strNm: s.strNm }));
        return stores;
      } catch {
        return []; // network failure → honest empty
      }
    },
  };
}
```

- [x] **Step 4: Run to verify it passes** — `npm run test -- storeDirectory` → PASS (both the new daisomall suite and the mock suite).

- [x] **Step 5: Commit**

```bash
git add src/adapters/daisomall/storeDirectory.ts src/adapters/daisomall/storeDirectory.test.ts
git commit -m "feat(adapters): StoreDirectoryPort over /api/stores"
```

### SESSION 2 EXIT GATE

- [x] Full gate green: `npm run test` · `npm run typecheck` · `npm run lint` · `npm run e2e` (14/14).
- [x] Confirm the adapters are **not yet wired**: `src/adapters/composition.ts` does not exist and `git diff --stat main -- src/ui/AvailabilitySurface.tsx` is empty → mocks still active, app + E2E unchanged.
- [x] Session 2 deliverable complete: live adapters + format utils exist and are unit-tested, with the 6-state parity oracle preserved. **Next session: SESSION 3 (cutover).**

---

## SESSION 3 — Cutover (remove stale · compose · wire · E2E · gate · docs · merge)

**START HERE (Session 3).** Prereq: Sessions 1 + 2 committed. This session removes the stale adapters, adds the composition root, wires `AvailabilitySurface`, adds the route-intercept E2E, runs the full gate + security grep, updates docs, and merges locally.

### Task 10: Remove the stale `newIntSelStr` + `stock.ts` adapters

The 6-state parity oracle now lives in `mapStoreObservation.test.ts` (Task 7), so the old mapi single-bundle model (F2 UNVERIFIED) can go.

**Files:** Remove `src/adapters/newIntSelStr/{newIntSelStrAdapter,mapResponse,rawFixtures}.ts` + `{newIntSelStrAdapter,mapResponse}.test.ts`; `functions/api/stock.ts` + `stock.test.ts`.

- [x] **Step 1: Confirm nothing in `src`/`functions` imports them** (docs/plan mentions are fine):

Run: `git grep -nE "from '.*(newIntSelStr|api/stock)|createNewIntSelStrAdapter|nullIdentityResolver" -- src functions`
Expected: only matches inside the files about to be deleted (no external importer).

- [x] **Step 2: Delete the files**

```bash
git rm src/adapters/newIntSelStr/newIntSelStrAdapter.ts src/adapters/newIntSelStr/newIntSelStrAdapter.test.ts \
  src/adapters/newIntSelStr/mapResponse.ts src/adapters/newIntSelStr/mapResponse.test.ts \
  src/adapters/newIntSelStr/rawFixtures.ts \
  functions/api/stock.ts functions/api/stock.test.ts
```

- [x] **Step 3: Run the full suite to prove parity survived the removal**

Run: `npm run test` → PASS (the 9-scenario parity now asserted by `mapStoreObservation.test.ts`). `npm run typecheck` → clean.

- [x] **Step 4: Commit**

```bash
git commit -m "refactor(adapters): remove stale newIntSelStr + stock.ts (precedence ported to mapStoreObservation)"
```

### Task 11: Composition root + wire `AvailabilitySurface`

**Files:**
- Create: `src/adapters/composition.ts`
- Test: `src/adapters/composition.test.ts`
- Modify: `src/ui/AvailabilitySurface.tsx` (adapter wiring only — no UI logic change)

**Interfaces:**
- Consumes: the daisomall + mock factories.
- Produces: `createStoreStockRepository(): StoreStockRepository`; `createStoreDirectory(): StoreDirectoryPort` — real `/api` adapters under `import.meta.env.PROD`, mocks otherwise.

- [x] **Step 1: Write the failing test** → `src/adapters/composition.test.ts`

```ts
import { mockAnswers } from './mock/fixtures';
import { createStoreDirectory, createStoreStockRepository } from './composition';

test('DEV/test build wires the keyword mock repository', async () => {
  const repo = createStoreStockRepository();
  expect(await repo.query({ strCd: '1', strNm: 'x' }, { keyword: '밀폐용기' })).toEqual(mockAnswers.inStock);
});

test('DEV/test build wires the mock store directory', async () => {
  const dir = createStoreDirectory();
  await expect(dir.searchStores('명동')).resolves.toEqual([
    { strCd: '001', strNm: '명동역점' },
    { strCd: '002', strNm: '명동중앙점' },
  ]);
});

test('PROD build wires the live /api/availability adapter', async () => {
  vi.stubEnv('PROD', true);
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (url: RequestInfo | URL) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ noMatch: true }), { status: 200 });
  }) as typeof fetch;
  try {
    await createStoreStockRepository()
      .query({ strCd: '1', strNm: 'x' }, { keyword: 'x' })
      .catch(() => {});
    expect(calls.some((u) => u.includes('/api/availability'))).toBe(true);
  } finally {
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
  }
});
```

- [x] **Step 2: Run to verify it fails** — `npm run test -- composition` → FAIL.

- [x] **Step 3: Implement** → `src/adapters/composition.ts`

```ts
// src/adapters/composition.ts — single production wiring point. PROD builds the real /api adapters; DEV/test
// keep the mocks so `vite dev` + Vitest + the Playwright dev sweep run without a live /api server.
import type { StoreDirectoryPort, StoreStockRepository } from '../domain/ports';
import { createDaisoStoreDirectory } from './daisomall/storeDirectory';
import { createDaisoStoreStockRepository } from './daisomall/storeStockRepository';
import { createKeywordMockRepository } from './mock/mockRepository';
import { createMockStoreDirectory } from './mock/storeDirectory';

export function createStoreStockRepository(): StoreStockRepository {
  return import.meta.env.PROD ? createDaisoStoreStockRepository() : createKeywordMockRepository();
}

export function createStoreDirectory(): StoreDirectoryPort {
  return import.meta.env.PROD ? createDaisoStoreDirectory() : createMockStoreDirectory();
}
```

- [x] **Step 4: Run to verify it passes** — `npm run test -- composition` → PASS.

- [x] **Step 5: Wire `AvailabilitySurface.tsx`** — four edits, UI logic untouched:

Replace the mock import on line ~5:
```ts
import { createKeywordMockRepository, createMockRepository } from '../adapters/mock/mockRepository';
```
with:
```ts
import { createMockRepository } from '../adapters/mock/mockRepository';
```

Replace the mock store-directory import on line ~6:
```ts
import { createMockStoreDirectory } from '../adapters/mock/storeDirectory';
```
with:
```ts
import { createStoreDirectory, createStoreStockRepository } from '../adapters/composition';
```

Replace the directory construction (~line 26):
```ts
const storeDirectory = createMockStoreDirectory();
```
with:
```ts
const storeDirectory = createStoreDirectory();
```

Replace the live runner's repo (~line 80) inside `liveQueryRunner`:
```ts
    repo: createKeywordMockRepository(),
```
with:
```ts
    repo: createStoreStockRepository(),
```

(`createMockRepository` stays — the DEV-only `?scenario=` sweep still uses it. In Vitest/dev `import.meta.env.PROD` is false, so composition returns the same mocks → the whole existing unit + E2E dev suite behaves identically.)

- [x] **Step 6: Run the full suite** — `npm run test` · `npm run typecheck` · `npm run lint` · `npm run e2e` all green (dev pipeline still on mocks → unchanged behavior).

- [x] **Step 7: Commit**

```bash
git add src/adapters/composition.ts src/adapters/composition.test.ts src/ui/AvailabilitySurface.tsx
git commit -m "feat(app): composition root selects live /api adapters in prod builds"
```

### Task 12: Route-intercept E2E (real pipeline, hermetic)

Validates browser → real adapter → `/api/*` (intercepted) → mapping → UI against a **production build** (where `import.meta.env.PROD` is true, so composition wires the real adapters). `vite preview` serves static `dist/`; `page.route` fulfills `/api/*` with fixtures, so no live server/SW is involved.

**Files:**
- Modify: `playwright.config.ts`
- Create: `test/e2e/live-pipeline.spec.ts`

- [x] **Step 1: Add the `preview` project to `playwright.config.ts`** (replace the whole file):

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  webServer: [
    { command: 'npm run dev', port: 5173, reuseExistingServer: true },
    {
      command: 'npm run build && npm run preview -- --port 4173 --strictPort',
      url: 'http://localhost:4173',
      reuseExistingServer: true,
      timeout: 180_000,
    },
  ],
  projects: [
    {
      name: 'dev',
      testMatch: /(states|interactive)\.spec\.ts$/,
      use: { baseURL: 'http://localhost:5173' },
    },
    {
      name: 'preview',
      testMatch: /live-pipeline\.spec\.ts$/,
      use: { baseURL: 'http://localhost:4173', serviceWorkers: 'block' },
    },
  ],
});
```

- [x] **Step 2: Write the E2E spec** → `test/e2e/live-pipeline.spec.ts`

```ts
// test/e2e/live-pipeline.spec.ts — prod build (real adapters) + page.route fixtures at the /api boundary.
// Exercises browser → createDaisoStore* → fetch /api/* → parse/map → UI, hermetically (no live daisomall).
import { expect, test } from '@playwright/test';

const RAW_INSTOCK = {
  strCd: '001', pdNo: '19987', productName: '리빙 밀폐용기 1.2L', price: 2000,
  directYn: 'Y', stck: '50', sleStsCd: '1', mrkGdsYn: null, lchDay: null,
  locations: [{ floor: '11', zone: '56' }],
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('daiso.storeContext', JSON.stringify({ strCd: '001', strNm: '명동역점' }));
  });
});

test('real adapter → /api/availability (fixture) → mapStoreObservation → inStock surface', async ({ page }) => {
  await page.route('**/api/availability', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: RAW_INSTOCK }) }),
  );
  await page.goto('/');
  const input = page.getByLabel('상품 검색');
  await input.fill('밀폐용기');
  await input.press('Enter');
  await expect(page.getByText('이 매장에 있어요').first()).toBeVisible();
  await expect(page.getByText('11층 56번')).toBeVisible();
});

test('proxy noMatch → Bible empty state', async ({ page }) => {
  await page.route('**/api/availability', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ noMatch: true }) }),
  );
  await page.goto('/');
  await page.getByLabel('상품 검색').fill('없는상품');
  await page.getByLabel('상품 검색').press('Enter');
  await expect(page.getByText(/등록된 상품을 찾지 못했어요/).first()).toBeVisible();
});

test('store search hits /api/stores (fixture) and lists the store', async ({ page }) => {
  await page.route('**/api/stores', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ stores: [{ strCd: '003', strNm: '을지로점' }] }) }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: '매장 변경' }).click();
  await page.getByPlaceholder('매장명 또는 지역명으로 검색').fill('을지로');
  await expect(page.getByRole('button', { name: '을지로점' })).toBeVisible();
});
```

- [x] **Step 3: Run the new project** — `npx playwright test --project=preview` → 3 passing. Then `npm run e2e` → all projects green (dev sweep 14 + preview 3).

- [x] **Step 4: Commit**

```bash
git add playwright.config.ts test/e2e/live-pipeline.spec.ts
git commit -m "test(e2e): route-intercept live pipeline against the prod build"
```

### Task 13: Full gate + security grep

- [x] **Step 1: Run the whole gate** — all green:
  - `npm run test` · `npm run typecheck` · `npm run lint` · `npm run e2e`

- [x] **Step 2: Prove no secrets reach the client** (server-only invariant):

```bash
npm run build   # refresh dist/
# Client source must never reference the key or the uid header:
git grep -nE "PRE_AUTH_ENC_KEY|x-dm-uid" -- src && echo "LEAK in src" || echo "src clean"
# The built client bundle must be clean too (functions/ are NOT bundled into dist/):
grep -rnE "PRE_AUTH_ENC_KEY|x-dm-uid" dist/ && echo "LEAK in dist" || echo "dist clean"
```
Expected: `src clean` / `dist clean`. If either leaks, stop and fix before proceeding.

- [x] **Step 3: Confirm the read-only + no-store invariants hold** — every proxy `Response` carries `cache-control: no-store` (asserted in the function tests); no upstream call mutates (all are reads). No commit needed unless a fix was required.

### Task 14: Docs + local merge

**Files:** Modify `docs/notes/open-questions.md`, `.superpowers/sdd/progress.md`, `docs/HANDOFF.md`, and check the boxes in this plan.

- [x] **Step 1: Record the app-owned decisions** — append to `docs/notes/open-questions.md` §B:

```markdown
> **2026-07-22 확정 — Flow 1 live-data 배선** (플랜 `docs/superpowers/plans/2026-07-22-flow1-live-data.md`; 도시어 `store-api-observations.md`). 앱 소유 결정(Bible D-번호 미소비).

| # | 결정 | 확정 | 근거/검증 |
|---|---|---|---|
| B21 | 6상태 합성 위치 | 클라이언트 `mapStoreObservation` | 프록시=인증·CORS·조건부 팬아웃+정규화 raw; 매핑 유닛 TDD. |
| B22 | 프록시 아키텍처 | CF Pages Functions `/api/availability`·`/api/stores` | 클라는 내부 /api만; JWT·AES키·uid 서버 전용(env); 화이트리스트 반환. |
| B23 | 인증 | 익명 JWT→AES-128-CBC(WebCrypto)→Bearer+X-DM-UID, 401/403 1회 재발급 | SKILL.md 관측; 키=env `PRE_AUTH_ENC_KEY`(하드코딩·커밋 금지). |
| B24 | franchise 판정 정제 | "가맹 AND 위치없음"=franchiseUndeterminable | SCR_MSG_0015 로직; 철학 불변(정직한 미확정) → Bible 미에스컬레이션. |
| B25 | stck:null 불변식 | null ⟺ 의도적 미조회(가맹+무존); 직영 재고실패→502 | rule 0 guard가 fetch 실패의 notCarried 오분류 차단. |
| B26 | 포맷 결정 | 지하 N층 · lchDay 'YYYY-MM-DD'→'M월 D일' · km→m(round×1000) | format.ts TDD; km→m는 GPS-근처 패스에서 표면화. |
| B27 | 호스트 정합 | 기본 fapi(auth/selStr/stck/disp)+www(SearchGoods), env 오버라이드 | 라이브 스모크로 확정. |

**미해결(라이브 스모크 / data-owner 확인 — 심 뒤 격리):** `sleStsCd` 매장 코드 전체 열거('9'/null 외 qty 폴백 격리) · `stck` 종류(진열 vs 픽업예약) · selStrPkupStck 빈 `data[]` 의미(직영 notCarried 가정) · selStr 상세 응답 래핑(data 객체 vs 배열; extractDirectYn 양쪽 처리) · 매장검색 좌표 optional 가정 · ToS/robots(배포 전, 헤르메틱 유지로 CI 회피).
```

- [x] **Step 2: Prepend a ledger entry** to `.superpowers/sdd/progress.md` (fill the real gate counts + merge commit):

```markdown
- **FLOW 1 LIVE-DATA — IMPLEMENTED (2026-07-22), branch feat/flow1-live-data → main.** Plan
  `docs/superpowers/plans/2026-07-22-flow1-live-data.md` (3-session split, TDD). Proxy layer (functions/_lib
  daisoUpstream+daisoAuth WebCrypto Bearer; functions/api availability conditional fan-out + stores) + client
  daisomall adapters (rawObservation validator, mapStoreObservation 6-state + parity oracle, storeStockRepository,
  storeDirectory) + format (지하/lchDay/km→m) + composition root + AvailabilitySurface wiring + preview
  route-intercept E2E. Removed stale newIntSelStr/* + functions/api/stock.ts (precedence ported). Hermetic
  (fetch/proxy boundary mocked; NO live daisomall). §4.1 stck:null invariant + rule-0 guard. Gate: test <N>/<N>,
  typecheck clean, lint clean, e2e <M>/<M> (dev 14 + preview 3). Secrets server-only (grep-verified absent from
  src+dist). App decisions open-questions §B21–B27; unresolved items isolated behind seam. Merge --no-ff <commit>.
```

- [x] **Step 3: Refresh `docs/HANDOFF.md`** 다음 작업 → live smoke (`wrangler pages dev` with a real `.dev.vars`) to confirm host alignment (B27) + the unresolved data-owner items, then the out-of-scope passes (GPS-nearby real wiring, AI interpretation, barcode).

- [x] **Step 4: Check every `- [x]` box in this plan** (all tasks done) and commit docs:

```bash
git add docs/notes/open-questions.md docs/HANDOFF.md docs/superpowers/plans/2026-07-22-flow1-live-data.md
git commit -m "docs(flow1): record live-data app decisions (B21–B27) + refresh handoff/plan"
```
(`.superpowers/` is gitignored — update `progress.md` as a local ledger; it will not appear in the commit, which is expected.)

- [x] **Step 5: Local merge** — invoke **superpowers:finishing-a-development-branch** and choose the local `--no-ff` merge:

```bash
git checkout main
git merge --no-ff feat/flow1-live-data -m "merge: Flow 1 live-data wiring (proxy + adapters + composition + E2E)"
npm run test && npm run typecheck && npm run lint && npm run e2e   # re-run the gate on main
```

### SESSION 3 EXIT GATE (project done)

- [x] Full gate green on `main` after the merge.
- [x] Secrets absent from `src` + `dist` (grep). Read-only + no-store invariants asserted in tests.
- [x] Docs updated (open-questions §B21–B27, progress ledger, HANDOFF). Plan checkboxes all ticked.
- [x] **Flow 1 is live-data-wired.** Remaining work is out-of-scope follow-ups (live smoke, GPS-nearby, AI, barcode).

---

## Spec Coverage Map (self-review)

| Spec §2026-07-22 decision | Task(s) |
|---|---|
| F-a hermetic (fetch/proxy boundary mocked) | all tests; Task 12 route-intercept |
| F-b scope = availability + store search | Tasks 3, 4, 8, 9 |
| F-c client-side 6-state synthesis | Task 7 (`mapStoreObservation`) |
| A-1 remove stale `newIntSelStr`/`stock.ts` + port precedence | Tasks 7 (port) + 10 (remove) |
| A-2 km→m util only | Task 5 (`kmToMeters`) |
| A-3 route-intercept E2E | Task 12 |
| §4.1 stck:null invariant + guard | Tasks 3 (proxy) + 7 (rule 0) |
| §5 auth (WebCrypto, env key, 401 reissue) | Tasks 2 + 3 |
| §6.1 precedence + franchise refinement | Task 7 |
| §7 지하 / lchDay format | Task 5 |
| §8 failure/offline/read-only | Tasks 3, 4, 8, 9 (502/degrade); query-runner unchanged |
| §9 composition root + env | Tasks 11 + Setup S1 |
| §10 tests (adapter/proxy/auth/E2E + commit gate) | Tasks 1–4, 6–9, 12, 13 |
| §12 governance routing (app-owned records) | Task 14 (open-questions §B21–B27) |
| §13 parity/philosophy verification | Task 7 (parity oracle), Task 13 (security/no-store/read-only) |
