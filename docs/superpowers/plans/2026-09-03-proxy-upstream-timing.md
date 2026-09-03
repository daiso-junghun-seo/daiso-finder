# Proxy Upstream Timing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the proxy report how long each upstream vendor call took, so the `?debug=1` panel can split path latency (tunnel + Node HTTP) from vendor latency.

**Architecture:** Each handler creates an `UpstreamTimer`, wraps every upstream `fetch` in `timer.leg(name, thunk)`, and attaches a `Server-Timing` header at a single wrapper point around the handler body. The client reads that header through a structural probe (never widening `FetchLike`), stores it on `NetworkEntry.upstream`, and the panel renders the handler wall clock on the main line plus a leg breakdown on an indented second line.

**Tech Stack:** TypeScript, Vitest, Cloudflare Pages Functions shape (`onRequestPost`) run in Node by `scripts/dev-proxy.mjs`, Biome.

**Spec:** [`docs/superpowers/specs/2026-09-03-proxy-upstream-timing-design.md`](../specs/2026-09-03-proxy-upstream-timing-design.md)

## Global Constraints

- **Answers to the user in Korean; code, identifiers, comments and commit messages in English.** UX copy is Korean. Panel labels are Korean (`상류`, `검색`, `매장`, `인증`, `진열`, `재고`).
- **Windows 11 / PowerShell.** No Linux command or path examples anywhere, including comments and docs.
- **No fabrication.** Unmeasured → `null`/absent, never `0` and never an empty stand-in. Nullish checks use `== null` / `=== null`, never truthiness, so a measured `0` still renders.
- **Read-only against vendor data.** This wave adds no request, changes no request, and mutates nothing.
- **`FetchLike` is NOT widened** (§B30-18 ⑧). Repo-wide test doubles implement exactly `{ ok, status, json }`. Reading headers uses a structural probe with **no `as`, no `as unknown as`, no `@ts-expect-error`**.
- **`DIAG_TIMING` defaults to OFF.** `scripts/dev-proxy.mjs` is both the local dev server and the production server, so the split is env-only and defaulting on would be fail-open.
- **Unchanged, verify at review:** six states, transitions, Zustand wiring, UX copy, CSS, scan path, `parseRawObservation`/`mapStoreObservation`, `AVAILABILITY_ATTEMPTS = 3`, `AVAILABILITY_ATTEMPT_TIMEOUT_MS = 1800`, `query-cache`'s 2000 ms, `jsonResponse`/`badGateway` signatures, `NETWORK_LIMIT = 12`.
- **Every task ends with `npm run test` AND `npm run lint` AND `npm run typecheck` before committing.** Lint is not a test; a previous wave shipped an import-order defect because a task ran only `npm run test`.
- **Never use `git checkout --` to undo experimental edits.** Copy the file aside first (`Copy-Item src\x.ts $env:TEMP\x.bak`) and restore from that copy. A previous session destroyed its own implementation this way.

---

## Task 1: Server-side timer module

**Files:**
- Create: `functions/_lib/timing.ts`
- Test: `functions/_lib/timing.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `interface DiagEnv { DIAG_TIMING?: string }`, `diagTimingEnabled(env: DiagEnv): boolean`, `interface UpstreamTimer { leg<T>(name: string, run: () => Promise<T>): Promise<T>; header(): string | null }`, `createUpstreamTimer(enabled: boolean, now?: () => number): UpstreamTimer`, `withTiming(response: Response, timer: UpstreamTimer): Response`.

- [ ] **Step 1: Write the failing tests**

Create `functions/_lib/timing.test.ts`:

```ts
import { createUpstreamTimer, diagTimingEnabled, withTiming } from './timing';

// A deterministic clock: each call returns the next value. Tests assert exact durations, so a real
// clock would make them flaky and would prove nothing about the arithmetic.
function clock(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

test('diagTimingEnabled is opt-in: only the exact string "1" turns it on', () => {
  expect(diagTimingEnabled({ DIAG_TIMING: '1' })).toBe(true);
  expect(diagTimingEnabled({})).toBe(false);
  expect(diagTimingEnabled({ DIAG_TIMING: '' })).toBe(false);
  expect(diagTimingEnabled({ DIAG_TIMING: '0' })).toBe(false);
  expect(diagTimingEnabled({ DIAG_TIMING: 'true' })).toBe(false);
});

test('a disabled timer records nothing and passes the thunk result through untouched', async () => {
  const timer = createUpstreamTimer(false, clock([0, 100, 500]));
  await expect(timer.leg('str', async () => 'value')).resolves.toBe('value');
  expect(timer.header()).toBeNull();
});

test('a disabled timer still propagates a rejection unchanged', async () => {
  const timer = createUpstreamTimer(false);
  const boom = new Error('upstream down');
  await expect(timer.leg('str', () => Promise.reject(boom))).rejects.toBe(boom);
});

test('header carries total plus each completed leg, in call order', async () => {
  // created@0, legA 10->30 (20ms), legB 30->75 (45ms), header@100
  const timer = createUpstreamTimer(true, clock([0, 10, 30, 30, 75, 100]));
  await timer.leg('search', async () => 1);
  await timer.leg('str', async () => 2);
  expect(timer.header()).toBe('total;dur=100, search;dur=20, str;dur=45');
});

test('an enabled timer emits total even when no leg ran (the early-400 shape)', () => {
  // report.ts's reading rule -- "no 상류 anywhere means the flag is off" -- depends on this.
  const timer = createUpstreamTimer(true, clock([0, 7]));
  expect(timer.header()).toBe('total;dur=7');
});

test('a leg that throws is still recorded, and the rejection is re-thrown unchanged', async () => {
  const timer = createUpstreamTimer(true, clock([0, 5, 45, 60]));
  const boom = new Error('pkupStck 502');
  await expect(timer.leg('stck', () => Promise.reject(boom))).rejects.toBe(boom);
  expect(timer.header()).toBe('total;dur=60, stck;dur=40');
});

test('a leg still in flight when header() is called is absent, not zero', async () => {
  const timer = createUpstreamTimer(true, clock([0, 5, 20]));
  let release: (v: string) => void = () => {};
  const pending = timer.leg('auth', () => new Promise<string>((r) => (release = r)));
  expect(timer.header()).toBe('total;dur=20');
  release('done');
  await pending;
});

test('withTiming attaches server-timing and the CORS expose header when enabled', () => {
  const timer = createUpstreamTimer(true, clock([0, 42]));
  const res = withTiming(new Response('{}', { status: 200 }), timer);
  expect(res.headers.get('server-timing')).toBe('total;dur=42');
  expect(res.headers.get('access-control-expose-headers')).toBe('server-timing');
});

test('withTiming returns the response untouched when the timer is disabled', () => {
  const res = withTiming(new Response('{}', { status: 200 }), createUpstreamTimer(false));
  expect(res.headers.get('server-timing')).toBeNull();
  expect(res.headers.get('access-control-expose-headers')).toBeNull();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run functions/_lib/timing.test.ts`
Expected: FAIL — `Failed to resolve import "./timing"`.

- [ ] **Step 3: Write the implementation**

Create `functions/_lib/timing.ts`:

```ts
// functions/_lib/timing.ts — upstream latency instrumentation for the ?debug=1 panel.
// Why this exists: every latency this repo has measured crossed localtunnel, and the proxy never
// reported its own upstream duration, so path latency and vendor latency could not be separated.
// See docs/notes/open-questions.md §B30-18 ② and the design spec dated 2026-09-03.

export interface DiagEnv {
  DIAG_TIMING?: string;
}

// Explicit opt-in, defaulting to off. scripts/dev-proxy.mjs is BOTH the local dev server and the
// production one (its own header comment says so), so dev and production can differ only by env.
// Defaulting this on would make the exposure control fail-open: forget one env line in production and
// the header ships. Only the exact string '1' enables it, so a stray 'false' or '0' cannot turn it on.
export function diagTimingEnabled(env: DiagEnv): boolean {
  return env.DIAG_TIMING === '1';
}

export interface UpstreamTimer {
  leg<T>(name: string, run: () => Promise<T>): Promise<T>;
  header(): string | null;
}

export function createUpstreamTimer(enabled: boolean, now: () => number = Date.now): UpstreamTimer {
  // The ONLY branch in this module's usage. Call sites are unconditional: a disabled timer is a pure
  // pass-through, so instrumenting a handler cannot change what it does.
  if (!enabled) {
    return { leg: <T>(_name: string, run: () => Promise<T>) => run(), header: () => null };
  }
  const startedAt = now();
  const legs: { name: string; ms: number }[] = [];
  return {
    async leg<T>(name: string, run: () => Promise<T>): Promise<T> {
      const legStarted = now();
      try {
        return await run();
      } finally {
        // finally, not .then(): a leg that threw still spent real time, and how far a 502 got is
        // exactly what the failing case needs to show.
        legs.push({ name, ms: now() - legStarted });
      }
    },
    header(): string {
      // `total` is present whenever enabled, even with zero completed legs (an early 400 returns
      // before any upstream call). report.ts's reading rule -- "no 상류 on any line means the flag is
      // off" -- depends on that, so this must never collapse to null while enabled.
      const parts = [`total;dur=${now() - startedAt}`];
      for (const leg of legs) parts.push(`${leg.name};dur=${leg.ms}`);
      return parts.join(', ');
    },
  };
}

// ONE attach point per handler rather than one per return statement. The three handlers have 22 exit
// paths between them; threading a timer argument through each is a defect waiting to happen, and a
// missed path fails SILENTLY -- that line simply has no 상류, which is indistinguishable from the
// flag being off. Wrapping the handler body removes the failure mode instead of testing around it.
export function withTiming(response: Response, timer: UpstreamTimer): Response {
  const value = timer.header();
  if (value === null) return response;
  response.headers.set('server-timing', value);
  // Without this the header is invisible to script on a cross-origin read -- the SERVE_STATIC=0 +
  // ALLOW_ORIGIN mode. That failure is silent (상류 simply never appears), so it is set here rather
  // than left as something that mode has to remember.
  response.headers.set('access-control-expose-headers', 'server-timing');
  return response;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run functions/_lib/timing.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Prove the tests have teeth**

Make each mutation, confirm at least one test fails, then restore from your backup copy (`Copy-Item functions\_lib\timing.ts $env:TEMP\timing.bak` first — **never** `git checkout --`):

1. `legs.push(...)` moved out of `finally` into the try (after `return await run()` — i.e. delete `finally` and push before returning) → the throwing-leg test must fail.
2. `header()` returns `null` when `legs.length === 0` → the early-400 test must fail.
3. `diagTimingEnabled` uses `Boolean(env.DIAG_TIMING)` → the `'0'`/`'false'` cases must fail.
4. `withTiming` drops the `access-control-expose-headers` line → its test must fail.

- [ ] **Step 6: Full gate and commit**

```powershell
npm run test; npm run typecheck; npm run lint
git add functions/_lib/timing.ts functions/_lib/timing.test.ts
git commit -m "feat(proxy): time upstream legs and the handler wall clock"
```

---

## Task 2: Wire `/api/stores` and `/api/search`, plus dev-proxy env

**Files:**
- Modify: `functions/api/stores.ts`, `functions/api/search.ts`
- Modify: `scripts/dev-proxy.mjs` (`resolveUpstreamEnv`, the env doc block, the startup banner)
- Modify: `docs/deploy/gpu01-node-proxy.md`
- Test: `functions/api/stores.test.ts`, `functions/api/search.test.ts`

**Interfaces:**
- Consumes: `createUpstreamTimer`, `diagTimingEnabled`, `withTiming`, `DiagEnv` from `functions/_lib/timing.ts` (Task 1).
- Produces: the established handler shape — an inner `handle(context, timer)` plus a thin exported `onRequestPost` — that Task 3 repeats for `/api/availability`. Leg names `str` (selStr) and `search` (SearchGoods).

- [ ] **Step 1: Write the failing tests**

Append to `functions/api/search.test.ts`:

```ts
test('emits Server-Timing with the search leg when DIAG_TIMING=1', async () => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ resultSet: { result: [{ resultDocuments: [] }] } }), {
      status: 200,
    })) as typeof fetch;
  const res = await onRequestPost({
    request: new Request('http://x/api/search', {
      method: 'POST',
      body: JSON.stringify({ keyword: '밀폐용기' }),
    }),
    env: { PRE_AUTH_ENC_KEY: 'k', DIAG_TIMING: '1' },
  });
  const timing = res.headers.get('server-timing');
  expect(timing).toMatch(/(^|, )total;dur=\d+/);
  expect(timing).toMatch(/(^|, )search;dur=\d+/);
});

test('emits no Server-Timing without DIAG_TIMING', async () => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ resultSet: { result: [{ resultDocuments: [] }] } }), {
      status: 200,
    })) as typeof fetch;
  const res = await onRequestPost(req({ keyword: '밀폐용기' }));
  expect(res.headers.get('server-timing')).toBeNull();
});

test('a 502 still reports how far it got', async () => {
  globalThis.fetch = (async () => new Response('nope', { status: 500 })) as typeof fetch;
  const res = await onRequestPost({
    request: new Request('http://x/api/search', {
      method: 'POST',
      body: JSON.stringify({ keyword: '밀폐용기' }),
    }),
    env: { PRE_AUTH_ENC_KEY: 'k', DIAG_TIMING: '1' },
  });
  expect(res.status).toBe(502);
  // The leg is present because it COMPLETED (with a non-ok response); this is the case the header
  // exists for, and losing it would blind exactly the failure worth measuring.
  expect(res.headers.get('server-timing')).toMatch(/search;dur=\d+/);
});

test('an early 400 carries total with no legs', async () => {
  const res = await onRequestPost({
    request: new Request('http://x/api/search', { method: 'POST', body: 'not json' }),
    env: { PRE_AUTH_ENC_KEY: 'k', DIAG_TIMING: '1' },
  });
  expect(res.status).toBe(400);
  expect(res.headers.get('server-timing')).toMatch(/^total;dur=\d+$/);
});
```

Append to `functions/api/stores.test.ts` (adapt `req`/`ENV` to whatever that file already defines; the assertions are what matter):

```ts
test('search mode emits Server-Timing with the str leg when DIAG_TIMING=1', async () => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ data: [] }), { status: 200 })) as typeof fetch;
  const res = await onRequestPost({
    request: new Request('http://x/api/stores', {
      method: 'POST',
      body: JSON.stringify({ query: '강남' }),
    }),
    env: { PRE_AUTH_ENC_KEY: 'k', DIAG_TIMING: '1' },
  });
  expect(res.headers.get('server-timing')).toMatch(/str;dur=\d+/);
  expect(res.headers.get('access-control-expose-headers')).toBe('server-timing');
});

test('nearby mode emits the str leg too', async () => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ data: [] }), { status: 200 })) as typeof fetch;
  const res = await onRequestPost({
    request: new Request('http://x/api/stores', {
      method: 'POST',
      body: JSON.stringify({ lat: 37.5, lng: 127.0 }),
    }),
    env: { PRE_AUTH_ENC_KEY: 'k', DIAG_TIMING: '1' },
  });
  expect(res.headers.get('server-timing')).toMatch(/str;dur=\d+/);
});

test('the no-coordinates early return carries total with no legs', async () => {
  const res = await onRequestPost({
    request: new Request('http://x/api/stores', { method: 'POST', body: JSON.stringify({}) }),
    env: { PRE_AUTH_ENC_KEY: 'k', DIAG_TIMING: '1' },
  });
  expect(res.headers.get('server-timing')).toMatch(/^total;dur=\d+$/);
});

test('emits no Server-Timing without DIAG_TIMING', async () => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ data: [] }), { status: 200 })) as typeof fetch;
  const res = await onRequestPost(req({ query: '강남' }));
  expect(res.headers.get('server-timing')).toBeNull();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run functions/api/search.test.ts functions/api/stores.test.ts`
Expected: FAIL — `expected null to match /search;dur=\d+/` and similar.

- [ ] **Step 3: Restructure both handlers**

In `functions/api/search.ts`, change the import line to add the timing module and rename the existing exported function body into an inner one:

```ts
import {
  type DiagEnv,
  type UpstreamTimer,
  createUpstreamTimer,
  diagTimingEnabled,
  withTiming,
} from '../_lib/timing';
```

Then replace `export async function onRequestPost(context: {...})` with:

```ts
type Ctx = { request: Request; env: UpstreamEnv & DiagEnv };

// The handler body is inner so the header is attached at exactly ONE place. This file has six return
// statements; threading a timer argument into each is how a path silently loses its timing.
async function handle(context: Ctx, timer: UpstreamTimer): Promise<Response> {
```

…keeping the entire existing body unchanged except the one upstream call, which becomes:

```ts
    const res = await timer.leg('search', () =>
      fetch(searchGoodsUrl(cfg.wwwBase, keyword), { method: 'GET' }),
    );
```

and adding at the end of the file:

```ts
export async function onRequestPost(context: Ctx): Promise<Response> {
  const timer = createUpstreamTimer(diagTimingEnabled(context.env));
  return withTiming(await handle(context, timer), timer);
}
```

In `functions/api/stores.ts` do exactly the same restructuring (`type Ctx`, inner `handle(context, timer)`, exported wrapper at the end), and wrap **both** `fetch` calls. Search mode (line ~39) becomes:

```ts
      const res = await timer.leg('str', () =>
        fetch(`${cfg.fapiBase}${PATHS.selStr}`, {
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
        }),
      );
```

Nearby mode (line ~68) becomes:

```ts
    const res = await timer.leg('str', () =>
      fetch(`${cfg.fapiBase}${PATHS.selStr}`, {
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
      }),
    );
```

Both request bodies are **byte-for-byte what they are today** — the only change is the wrapper. `curLitd` is the vendor's spelling, not a typo; do not "fix" it.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run functions/api/search.test.ts functions/api/stores.test.ts`
Expected: PASS, including every pre-existing test in both files.

- [ ] **Step 5: Pass DIAG_TIMING through dev-proxy**

In `scripts/dev-proxy.mjs`, add to the env doc block near line 26:

```js
//   DIAG_TIMING       '1' adds Server-Timing (upstream leg durations)   default off
```

Add to `resolveUpstreamEnv()`'s returned object:

```js
    DIAG_TIMING: process.env.DIAG_TIMING || fileVars.DIAG_TIMING || undefined,
```

And add a startup-banner line so a tester who forgot the flag learns it at launch rather than from an empty panel — insert next to the existing `serves …` line (~line 244):

```js
    `  upstream timing: ${process.env.DIAG_TIMING === '1' ? 'ON (Server-Timing)' : 'off'}`,
```

- [ ] **Step 6: Document the flag in the runbook**

In `docs/deploy/gpu01-node-proxy.md`, add `DIAG_TIMING` to the environment-variable table/list with exactly this meaning: *optional; `'1'` adds a `Server-Timing` response header carrying upstream leg durations. **Leave it unset in production** — it is a diagnostics aid for local device sessions, and the header would otherwise advertise which vendor endpoints the proxy calls.*

- [ ] **Step 7: Full gate and commit**

```powershell
npm run test; npm run typecheck; npm run lint
git add functions/api/search.ts functions/api/stores.ts functions/api/search.test.ts functions/api/stores.test.ts scripts/dev-proxy.mjs docs/deploy/gpu01-node-proxy.md
git commit -m "feat(proxy): report stores and search upstream timing behind DIAG_TIMING"
```

---

## Task 3: Wire `/api/availability` (five legs)

**Files:**
- Modify: `functions/api/availability.ts`
- Test: `functions/api/availability.test.ts`

**Interfaces:**
- Consumes: `createUpstreamTimer`, `diagTimingEnabled`, `withTiming`, `DiagEnv`, `UpstreamTimer` (Task 1); the inner-`handle` shape established in Task 2.
- Produces: leg names `search`, `str`, `auth`, `disp`, `stck` — the exact strings `src/diagnostics/report.ts` maps to Korean labels in Task 7.

- [ ] **Step 1: Write the failing tests**

Append to `functions/api/availability.test.ts`. It already has `route()`, `authOk`, `searchOk`, `PROD`, `locStck` and `req()` — reuse them, and add one env-carrying request helper next to `req`:

```ts
function reqDiag(body: unknown) {
  return {
    request: new Request('http://x/api/availability', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    env: { ...ENV, DIAG_TIMING: '1' },
  };
}
```

```ts
test('a direct-store lookup reports all five legs', async () => {
  route([
    ['/auth/request', authOk],
    ['SearchGoods', searchOk([PROD])],
    ...locStck,
  ]);
  const res = await onRequestPost(reqDiag({ strCd: '10803', keyword: '밀폐용기' }));
  const timing = res.headers.get('server-timing') ?? '';
  expect(timing).toMatch(/(^|, )total;dur=\d+/);
  for (const leg of ['search', 'str', 'auth', 'disp', 'stck']) {
    expect(timing).toMatch(new RegExp(`(^|, )${leg};dur=\d+`));
  }
});

test('noMatch does not report legs that were still in flight', async () => {
  // The in-flight condition must be GUARANTEED, not incidental. searchGoods and fetchDirectYn have
  // identical microtask depth (await fetch, then await res.json()) and start in the same synchronous
  // tick, so with ordinary mocks selStr settles BEFORE the noMatch return and this test would pass
  // or fail on scheduling rather than on the rule it claims to check. Parking selStr and auth
  // forever makes the rule the only thing under test.
  const never = new Promise<Response>(() => {});
  globalThis.fetch = ((input: RequestInfo | URL) =>
    String(input).includes('SearchGoods')
      ? Promise.resolve(
          new Response(JSON.stringify({ resultSet: { result: [{ resultDocuments: [] }] } }), {
            status: 200,
          }),
        )
      : never) as typeof fetch;
  const res = await onRequestPost(reqDiag({ strCd: '10803', keyword: '없는상품' }));
  expect(((await res.json()) as { noMatch?: boolean }).noMatch).toBe(true);
  const timing = res.headers.get('server-timing') ?? '';
  expect(timing).toMatch(/search;dur=\d+/);
  expect(timing).not.toMatch(/str;dur=/);
  expect(timing).not.toMatch(/auth;dur=/);
});

test('a franchise store with no display zone omits stck entirely', async () => {
  // stck is never called in that branch. It must be ABSENT, not 0 -- a 0 would claim a measurement
  // nobody made.
  route([
    ['/auth/request', authOk],
    ['SearchGoods', searchOk([PROD])],
    ['/ms/msg/selStr', () => new Response(JSON.stringify({ directYn: 'N' }), { status: 200 })],
    ['/pdo/selIntPdStDispInfo', () => new Response(JSON.stringify({ data: [] }), { status: 200 })],
  ]);
  const res = await onRequestPost(reqDiag({ strCd: '10803', keyword: '밀폐용기' }));
  const timing = res.headers.get('server-timing') ?? '';
  expect(timing).toMatch(/disp;dur=\d+/);
  expect(timing).not.toMatch(/stck;dur=/);
});

test('a 502 reports the legs that completed before the failure', async () => {
  route([
    ['/auth/request', authOk],
    ['SearchGoods', searchOk([PROD])],
    ['/ms/msg/selStr', () => new Response(JSON.stringify({ directYn: 'Y' }), { status: 200 })],
    [
      '/pdo/selIntPdStDispInfo',
      () => new Response(JSON.stringify({ data: [{ zoneNo: '56', stairNo: '11' }] }), { status: 200 }),
    ],
    ['/pd/pdh/selStrPkupStck', () => new Response('nope', { status: 500 })],
  ]);
  const res = await onRequestPost(reqDiag({ strCd: '10803', keyword: '밀폐용기' }));
  expect(res.status).toBe(502);
  // The leg completed (with a non-ok response) before the throw, so it is reported. This is the case
  // the header exists for, and losing it would blind exactly the failure worth measuring.
  expect(res.headers.get('server-timing')).toMatch(/stck;dur=\d+/);
});

test('emits no Server-Timing without DIAG_TIMING', async () => {
  route([['/auth/request', authOk], ['SearchGoods', searchOk([PROD])], ...locStck]);
  const res = await onRequestPost(req({ strCd: '10803', keyword: '밀폐용기' }));
  expect(res.headers.get('server-timing')).toBeNull();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run functions/api/availability.test.ts`
Expected: FAIL — `expected null to match /total;dur=\d+/`.

- [ ] **Step 3: Restructure the handler and wrap the five legs**

Add the same import block and `type Ctx` as Task 2, rename the exported body to `async function handle(context: Ctx, timer: UpstreamTimer): Promise<Response>`, and add the exported wrapper at the end of the file:

```ts
export async function onRequestPost(context: Ctx): Promise<Response> {
  const timer = createUpstreamTimer(diagTimingEnabled(context.env));
  return withTiming(await handle(context, timer), timer);
}
```

Wrap the five upstream calls **at their call sites** — the helper functions `searchGoods`, `fetchDirectYn`, `requestAuth`, `fetchLocations` and `fetchStock` keep their signatures unchanged:

```ts
  // Wave 1 (parallel): product identity, franchise flag, auth handshake.
  const productP = timer.leg('search', () => searchGoods(cfg.wwwBase, keyword, body.pdNo));
  const directYnP = timer.leg('str', () => fetchDirectYn(cfg.fapiBase, strCd));
  const authP = timer.leg('auth', () =>
    requestAuth({ fapiBase: cfg.fapiBase, encKey: cfg.encKey }),
  );
```

The existing `directYnP.catch(() => {})` / `authP.catch(() => {})` guards stay exactly as they are — they now attach to the wrapped promises, which is the same protection against a late rejection.

In the direct branch:

```ts
      [locations, stock] = await Promise.all([
        timer.leg('disp', () => fetchLocations(cfg.fapiBase, pdNo, strCd, call)),
        timer.leg('stck', () => fetchStock(cfg.fapiBase, pdNo, strCd, call)),
      ]);
```

In the franchise branch:

```ts
      locations = await timer.leg('disp', () => fetchLocations(cfg.fapiBase, pdNo, strCd, call));
      stock =
        locations.length > 0
          ? await timer.leg('stck', () => fetchStock(cfg.fapiBase, pdNo, strCd, call))
          : null;
```

Add this comment above the `makeAuthedCall` usage:

```ts
    // NOTE: makeAuthedCall retries the same call once after re-issuing the token on a 401, so the
    // disp/stck legs fold BOTH round trips into one number. Do not read a leg as per-round-trip
    // latency. Recorded as a limitation in the design spec §8-1; a separate marker was declined.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run functions/api/availability.test.ts`
Expected: PASS, including every pre-existing test in the file.

- [ ] **Step 5: Prove the in-flight rule has teeth**

Back the file up (`Copy-Item functions\api\availability.ts $env:TEMP\availability.bak`), then change the noMatch return to await the two in-flight promises first:

```ts
  if (product === null) {
    await Promise.allSettled([directYnP, authP]);
    return jsonResponse({ noMatch: true });
  }
```

The "noMatch does not report legs that were still in flight" test must FAIL. Restore from the backup copy — **not** with `git checkout --`.

- [ ] **Step 6: Full gate and commit**

```powershell
npm run test; npm run typecheck; npm run lint
git add functions/api/availability.ts functions/api/availability.test.ts
git commit -m "feat(proxy): time the availability fan-out's five upstream legs"
```

---

## Task 4: Client-side Server-Timing reader

**Files:**
- Create: `src/diagnostics/serverTiming.ts`
- Test: `src/diagnostics/serverTiming.test.ts`

**Interfaces:**
- Consumes: nothing (pure module).
- Produces: `interface UpstreamLeg { name: string; ms: number }`, `interface UpstreamTiming { totalMs: number | null; legs: ReadonlyArray<UpstreamLeg> }`, `parseServerTiming(value: string | null): UpstreamTiming | null`, `readServerTiming(res: object): UpstreamTiming | null`. Tasks 5, 6 and 7 all import from here.

- [ ] **Step 1: Write the failing tests**

Create `src/diagnostics/serverTiming.test.ts`:

```ts
import serverTimingSource from './serverTiming?raw';
import { parseServerTiming, readServerTiming } from './serverTiming';

test('parses total and legs in order', () => {
  expect(parseServerTiming('total;dur=412, search;dur=88, stck;dur=310')).toEqual({
    totalMs: 412,
    legs: [
      { name: 'search', ms: 88 },
      { name: 'stck', ms: 310 },
    ],
  });
});

test('a header with only total yields no legs rather than a fabricated one', () => {
  expect(parseServerTiming('total;dur=7')).toEqual({ totalMs: 7, legs: [] });
});

test('legs without a total keep totalMs null instead of summing them', () => {
  // Summing is forbidden: disp and stck run in Promise.all, so a sum exceeds the wall clock and
  // drives the residual negative. See the design spec §7.
  expect(parseServerTiming('search;dur=88, stck;dur=310')).toEqual({
    totalMs: null,
    legs: [
      { name: 'search', ms: 88 },
      { name: 'stck', ms: 310 },
    ],
  });
});

test('a measured zero survives', () => {
  expect(parseServerTiming('total;dur=0, str;dur=0')).toEqual({
    totalMs: 0,
    legs: [{ name: 'str', ms: 0 }],
  });
});

test('malformed entries are dropped, never defaulted', () => {
  expect(parseServerTiming('total;dur=412, broken, str;dur=abc, ;dur=5, disp;dur=94')).toEqual({
    totalMs: 412,
    legs: [{ name: 'disp', ms: 94 }],
  });
});

test('an absent or unparseable header is null, not an empty object', () => {
  expect(parseServerTiming(null)).toBeNull();
  expect(parseServerTiming('')).toBeNull();
  expect(parseServerTiming('nonsense')).toBeNull();
});

test('readServerTiming returns null for an object with no headers (the FetchLike doubles)', () => {
  expect(readServerTiming({ ok: true, status: 200, json: async () => ({}) })).toBeNull();
  expect(readServerTiming({ headers: null })).toBeNull();
  expect(readServerTiming({ headers: {} })).toBeNull();
  expect(readServerTiming({ headers: { get: 'not a function' } })).toBeNull();
});

test('readServerTiming reads a real Response', () => {
  const res = new Response('{}', { headers: { 'server-timing': 'total;dur=412, str;dur=61' } });
  expect(readServerTiming(res)).toEqual({ totalMs: 412, legs: [{ name: 'str', ms: 61 }] });
});

test('readServerTiming survives a headers.get that throws', () => {
  expect(
    readServerTiming({
      headers: {
        get() {
          throw new Error('nope');
        },
      },
    }),
  ).toBeNull();
});

test('the header probe is structural — no casts', () => {
  // A source-text guard, because the discipline being protected is invisible to a behavior test:
  // widening FetchLike or reaching for `as unknown as` would make every test above still pass while
  // breaking the repo-wide doubles that implement exactly { ok, status, json } (§B30-18 ⑧).
  const withoutComments = serverTimingSource
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
  expect(withoutComments).not.toMatch(/as unknown as/);
  expect(withoutComments).not.toMatch(/@ts-expect-error/);
  expect(withoutComments).not.toMatch(/\bas\s+\{/);
  expect(withoutComments).toContain("'headers' in res");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/diagnostics/serverTiming.test.ts`
Expected: FAIL — `Failed to resolve import "./serverTiming"`.

- [ ] **Step 3: Write the implementation**

Create `src/diagnostics/serverTiming.ts`:

```ts
// src/diagnostics/serverTiming.ts — reads the proxy's Server-Timing header into an observation.
// The proxy reports one `total` (its handler wall clock) plus one entry per upstream leg. See
// functions/_lib/timing.ts for the producer and the design spec dated 2026-09-03 for why the panel
// must never sum the legs.

export interface UpstreamLeg {
  name: string;
  ms: number;
}

export interface UpstreamTiming {
  // The server's own wall clock. NEVER a sum of `legs`: disp and stck run in parallel, so a sum
  // exceeds the real elapsed time and would drive the panel's residual negative.
  totalMs: number | null;
  legs: ReadonlyArray<UpstreamLeg>;
}

const TOTAL_NAME = 'total';
const DUR_PREFIX = 'dur=';

export function parseServerTiming(value: string | null): UpstreamTiming | null {
  if (value === null) return null;
  let totalMs: number | null = null;
  const legs: UpstreamLeg[] = [];
  for (const raw of value.split(',')) {
    const [namePart, ...params] = raw.split(';');
    const name = namePart.trim();
    if (name === '') continue;
    const dur = params.map((p) => p.trim()).find((p) => p.startsWith(DUR_PREFIX));
    if (dur === undefined) continue;
    const ms = Number(dur.slice(DUR_PREFIX.length));
    // A malformed duration is DROPPED, never coerced to 0 -- a fabricated zero would read exactly
    // like an instant upstream call.
    if (!Number.isFinite(ms)) continue;
    if (name === TOTAL_NAME) totalMs = ms;
    else legs.push({ name, ms });
  }
  if (totalMs === null && legs.length === 0) return null; // nothing observed, not an empty stand-in
  return { totalMs, legs };
}

// Structural probe, mirroring readErrorBody's hasTextBody. FetchLike declares no headers because
// test doubles across this repo implement exactly { ok, status, json }, and widening the type would
// break every one of them (§B30-18 ⑧). Successive `in` checks narrow `object` step by step, which is
// what makes the property accesses legal with no cast at all.
function hasHeaders(res: object): res is { headers: { get(name: string): string | null } } {
  return (
    'headers' in res &&
    typeof res.headers === 'object' &&
    res.headers !== null &&
    'get' in res.headers &&
    typeof res.headers.get === 'function'
  );
}

export function readServerTiming(res: object): UpstreamTiming | null {
  if (!hasHeaders(res)) return null;
  try {
    return parseServerTiming(res.headers.get('server-timing'));
  } catch {
    return null; // an unreadable header is not an observation, and must not fail the lookup
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/diagnostics/serverTiming.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Prove the tests have teeth**

Back the file up first, then mutate and confirm a failure each time:

1. `if (!Number.isFinite(ms)) continue;` → `if (!Number.isFinite(ms)) ms = 0;` → the malformed-entries test must fail.
2. `if (totalMs === null && legs.length === 0) return null;` deleted → the absent-header test must fail.
3. `totalMs` computed as the sum of legs when absent → the "legs without a total" test must fail.
4. `hasHeaders` reduced to `'headers' in res` → the `{ headers: null }` and `{ headers: {} }` cases must fail.

Restore from the backup copy.

- [ ] **Step 6: Full gate and commit**

```powershell
npm run test; npm run typecheck; npm run lint
git add src/diagnostics/serverTiming.ts src/diagnostics/serverTiming.test.ts
git commit -m "feat(diag): parse the proxy's Server-Timing into an upstream observation"
```

---

## Task 5: Carry the observation on `NetworkEntry`, and read it in the generic wrapper

**Files:**
- Modify: `src/diagnostics/bus.ts` (the `NetworkEntry` interface)
- Modify: `src/adapters/composition.ts` (`createDiagnosticFetch`)
- Test: `src/adapters/composition.test.ts`

**Interfaces:**
- Consumes: `UpstreamTiming`, `readServerTiming` (Task 4).
- Produces: `NetworkEntry.upstream?: UpstreamTiming`, which Tasks 6 and 7 both rely on.

- [ ] **Step 1: Write the failing test**

Append to `src/adapters/composition.test.ts`. That file already imports `getSnapshot` and `resetDiagnostics` from `../diagnostics/bus` and already stubs `globalThis.fetch` for its `createDiagnosticFetch` tests — follow the stub/restore pattern it uses there (around line 293).

```ts
test('createDiagnosticFetch publishes the upstream timing the response carried', async () => {
  resetDiagnostics();
  globalThis.fetch = (async () =>
    new Response('{}', {
      status: 200,
      headers: { 'server-timing': 'total;dur=412, str;dur=61' },
    })) as typeof fetch;
  await createDiagnosticFetch(() => 0)('/api/stores', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  expect(getSnapshot().network[0].upstream).toEqual({
    totalMs: 412,
    legs: [{ name: 'str', ms: 61 }],
  });
});

test('a response with no Server-Timing publishes no upstream field at all', async () => {
  resetDiagnostics();
  globalThis.fetch = (async () => new Response('{}', { status: 200 })) as typeof fetch;
  await createDiagnosticFetch(() => 0)('/api/stores', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  // Absent, not an empty object: the panel must be able to tell "not observed" from "observed empty".
  expect(getSnapshot().network[0].upstream).toBeUndefined();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/adapters/composition.test.ts`
Expected: FAIL — `expected undefined to equal { totalMs: 412, ... }`.

- [ ] **Step 3: Add the field and read it**

In `src/diagnostics/bus.ts`, add the import and the field to `NetworkEntry` (directly after `errorBody`):

```ts
import type { UpstreamTiming } from './serverTiming';
```

```ts
  // What the proxy reported about its OWN upstream work, when it reported anything. Absent = not
  // observed: the flag was off, the proxy is older than this field, or the response never arrived
  // (a cancelled duplicate carries no headers). `totalMs` is the server's wall clock and is NEVER a
  // sum of `legs` -- see serverTiming.ts.
  upstream?: UpstreamTiming;
```

In `src/adapters/composition.ts`, add `import { readServerTiming } from '../diagnostics/serverTiming';` and change the success publish only:

```ts
      const response = await fetch(url, init);
      publishNetwork({
        path: url,
        status: response.status,
        ms: now() - started,
        upstream: readServerTiming(response) ?? undefined,
      });
```

The catch branch is **unchanged** — a request that never produced a response has no header to read, and inventing a field there would be a claim nobody observed.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/adapters/composition.test.ts`
Expected: PASS.

- [ ] **Step 5: Full gate and commit**

```powershell
npm run test; npm run typecheck; npm run lint
git add src/diagnostics/bus.ts src/adapters/composition.ts src/adapters/composition.test.ts
git commit -m "feat(diag): carry upstream timing on NetworkEntry and read it in the fetch wrapper"
```

---

## Task 6: Read the header in the availability adapter

**Files:**
- Modify: `src/adapters/daisomall/storeStockRepository.ts` (the local `publish` helper and its two call sites)
- Test: `src/adapters/daisomall/storeStockRepository.test.ts`

**Interfaces:**
- Consumes: `readServerTiming`, `UpstreamTiming` (Task 4); `NetworkEntry.upstream` (Task 5).
- Produces: nothing new.

- [ ] **Step 1: Write the failing tests**

Append to `src/adapters/daisomall/storeStockRepository.test.ts`. That file already has `store`, `ok(body)`, `observationFixtures`, `mockAnswers`, `getSnapshot` and `resetDiagnostics` (reset runs in its `beforeEach`). Add one helper beside `ok`:

```ts
// Like ok(), but with the headers a real Response carries. ok() deliberately has none, which is what
// most doubles in this file look like — and that shape is itself covered by the third test below.
const okTimed = (body: unknown, timing: string): ReturnType<FetchLike> =>
  Promise.resolve({
    ok: true,
    status: 200,
    headers: { get: (name: string) => (name === 'server-timing' ? timing : null) },
    json: async () => body,
  });
```

```ts
test('an ok attempt publishes the upstream timing the proxy reported', async () => {
  // /api/availability does NOT go through createDiagnosticFetch -- this adapter self-publishes
  // (§B30-18) -- so the header has to be read here too, and this test is what proves it is.
  const repo = createDaisoStoreStockRepository({
    fetchImpl: async () =>
      okTimed({ data: observationFixtures.inStock }, 'total;dur=1169, search;dur=88, stck;dur=310'),
  });
  expect(await repo.query(store, { keyword: '밀폐용기' })).toEqual(mockAnswers.inStock);
  expect(getSnapshot().network.find((e) => e.outcome === 'ok')?.upstream).toEqual({
    totalMs: 1169,
    legs: [
      { name: 'search', ms: 88 },
      { name: 'stck', ms: 310 },
    ],
  });
});

test('a failed attempt publishes upstream timing too', async () => {
  // The 502 case is the one most worth measuring; losing it here would blind exactly that.
  const repo = createDaisoStoreStockRepository({
    fetchImpl: async () => ({
      ok: false,
      status: 502,
      headers: { get: () => 'total;dur=800, search;dur=88' },
      json: async () => ({}),
      text: async () => '{"error":"upstream_unavailable"}',
    }),
  });
  await expect(repo.query(store, { keyword: '밀폐용기' })).rejects.toBeInstanceOf(Error);
  expect(getSnapshot().network.find((e) => e.outcome === 'httpError')?.upstream).toEqual({
    totalMs: 800,
    legs: [{ name: 'search', ms: 88 }],
  });
});

test('a double without headers publishes no upstream field', async () => {
  // The shape most doubles in this file have. This is what proves the structural probe holds rather
  // than throwing on the { ok, status, json } doubles FetchLike is deliberately narrowed to.
  const repo = createDaisoStoreStockRepository({
    fetchImpl: async () => ok({ data: observationFixtures.inStock }),
  });
  await repo.query(store, { keyword: '밀폐용기' });
  expect(getSnapshot().network.find((e) => e.outcome === 'ok')?.upstream).toBeUndefined();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/adapters/daisomall/storeStockRepository.test.ts`
Expected: FAIL — `expected undefined to equal { totalMs: 1169, ... }`.

- [ ] **Step 3: Read the header at both publish sites**

Add `import { readServerTiming } from '../../diagnostics/serverTiming';` and `import type { UpstreamTiming } from '../../diagnostics/serverTiming';` (merge into one import statement; Biome's `organizeImports` will order it).

Extend the local `publish` helper with a fourth parameter:

```ts
        const publish = (
          status: number | 'error',
          outcome: NetworkOutcome,
          errorBody?: string,
          upstream?: UpstreamTiming,
        ): void => {
          if (published) return;
          published = true;
          publishNetwork({
            path: endpoint,
            status,
            ms: now() - started,
            attempt: { index: index + 1, total },
            outcome,
            errorBody,
            upstream,
          });
        };
```

Then, in the try block, read it once and pass it on both paths:

```ts
          // Read ONCE, before either publish: both paths report the same response, and reading the
          // header twice would be two probes of the same fact.
          const upstream = readServerTiming(res) ?? undefined;
          if (!res.ok) {
            publish(res.status, 'httpError', await readErrorBody(res), upstream);
            throw new Error(`availability ${res.status}`); // → FAILURE path
          }
          publish(res.status, 'ok', undefined, upstream);
```

Everything else in the block — the publish-before-`json()` ordering, the `published` guard, the error-body rules — is **unchanged**.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/adapters/daisomall/storeStockRepository.test.ts`
Expected: PASS, including every pre-existing test.

- [ ] **Step 5: Full gate and commit**

```powershell
npm run test; npm run typecheck; npm run lint
git add src/adapters/daisomall/storeStockRepository.ts src/adapters/daisomall/storeStockRepository.test.ts
git commit -m "feat(diag): read upstream timing on both availability publish paths"
```

---

## Task 7: Render it in the panel

**Files:**
- Modify: `src/diagnostics/report.ts` (`networkLines`, plus a new label map and leg renderer)
- Test: `src/diagnostics/report.test.ts`

**Interfaces:**
- Consumes: `NetworkEntry.upstream` (Task 5); the leg names emitted in Tasks 2 and 3.
- Produces: the panel's rendered form — the last consumer.

- [ ] **Step 1: Write the failing tests**

Append to `src/diagnostics/report.test.ts`, in its network-lines section. That file already has `networkReport(network)` (line ~445), which returns the panel's network lines as a `string[]` — use it, and assert with `toEqual` so an unexpected extra line fails rather than passing a substring check.

```ts
test('the main line carries the server wall clock and the legs go on an indented line', () => {
  expect(
    networkReport([
      {
        path: '/api/availability',
        status: 200,
        ms: 1169,
        attempt: { index: 1, total: 3 },
        outcome: 'ok',
        upstream: {
          totalMs: 412,
          legs: [
            { name: 'search', ms: 88 },
            { name: 'str', ms: 61 },
            { name: 'auth', ms: 96 },
            { name: 'disp', ms: 94 },
            { name: 'stck', ms: 310 },
          ],
        },
      },
    ]),
  ).toEqual([
    '  /api/availability #1/3 · 200 · 1169ms · 상류 412ms',
    '    검색 88 · 매장 61 · 인증 96 · 진열 94 · 재고 310',
  ]);
});

test('an unknown leg name is printed verbatim rather than dropped or renamed', () => {
  // The panel must not silently swallow a fact the server reported just because this label map has
  // not caught up with a new leg.
  expect(
    networkReport([
      {
        path: '/api/availability',
        status: 200,
        ms: 500,
        upstream: { totalMs: 200, legs: [{ name: 'newleg', ms: 42 }] },
      },
    ]),
  ).toEqual(['  /api/availability · 200 · 500ms · 상류 200ms', '    newleg 42']);
});

test('a measured zero renders as 0, not as missing', () => {
  expect(
    networkReport([{ path: '/api/stores', status: 200, ms: 5, upstream: { totalMs: 0, legs: [] } }]),
  ).toEqual(['  /api/stores · 200 · 5ms · 상류 0ms']);
});

test('total present with no legs renders no second line', () => {
  expect(
    networkReport([{ path: '/api/search', status: 400, ms: 9, upstream: { totalMs: 3, legs: [] } }]),
  ).toEqual(['  /api/search · 400 · 9ms · 상류 3ms']);
});

test('an entry with no upstream renders exactly as before', () => {
  expect(
    networkReport([
      {
        path: '/api/availability',
        status: 'error',
        ms: 1171,
        attempt: { index: 2, total: 3 },
        outcome: 'aborted',
      },
    ]),
  ).toEqual(['  /api/availability #2/3 · 취소 · 1171ms']);
});

test('상류 comes before errorBody, never after', () => {
  // errorBody's own rule is that it is appended LAST so a long body cannot push anything off the
  // readable start of the line. Appending 상류 after it would break that rule.
  expect(
    networkReport([
      {
        path: '/api/availability',
        status: 502,
        ms: 900,
        outcome: 'httpError',
        errorBody: '{"error":"upstream_unavailable"}',
        upstream: { totalMs: 700, legs: [] },
      },
    ]),
  ).toEqual([
    '  /api/availability · 502 질의 실패 · 900ms · 상류 700ms · {"error":"upstream_unavailable"}',
  ]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/diagnostics/report.test.ts`
Expected: FAIL — the expected substrings are absent.

- [ ] **Step 3: Implement the rendering**

In `src/diagnostics/report.ts`, add above `networkLines`:

```ts
// Korean labels for the legs the proxy emits today (functions/api/*.ts). An unknown name falls
// through to itself: the panel reports what the server said, and a label map that has not caught up
// must not make a measured leg disappear.
const LEG_LABELS: Record<string, string> = {
  search: '검색',
  str: '매장',
  auth: '인증',
  disp: '진열',
  stck: '재고',
};

function legText(legs: ReadonlyArray<UpstreamLeg>): string {
  return legs.map((leg) => `${LEG_LABELS[leg.name] ?? leg.name} ${leg.ms}`).join(' · ');
}
```

with `import type { UpstreamLeg } from './serverTiming';` at the top.

Replace `networkLines` with:

```ts
function networkLines(entries: NetworkEntry[]): string[] {
  if (entries.length === 0) return ['  (없음)'];
  return entries.flatMap((e) => {
    // `#2/3` groups one lookup's raced requests so three entries read as one lookup rather than three.
    const attempt = e.attempt ? ` #${e.attempt.index}/${e.attempt.total}` : '';
    // The SERVER's wall clock, never a sum of the legs below: disp and stck run in parallel, so a sum
    // exceeds it and would make the residual (this line's ms minus 상류) go negative. `== null` and
    // not a truthiness check, so a measured 0 still renders.
    const upstream = e.upstream?.totalMs == null ? '' : ` · 상류 ${e.upstream.totalMs}ms`;
    // Appended LAST, and already flattened + capped by the publisher (ERROR_BODY_MAX_CHARS), so a long
    // body cannot push the path, outcome or duration off the readable start of the line.
    const body = e.errorBody ? ` · ${e.errorBody}` : '';
    const main = `  ${e.path}${attempt} · ${networkStatus(e)} · ${e.ms}ms${upstream}${body}`;
    const legs = e.upstream?.legs ?? [];
    return legs.length === 0 ? [main] : [main, `    ${legText(legs)}`];
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/diagnostics/report.test.ts`
Expected: PASS, including every pre-existing report test.

- [ ] **Step 5: Prove the tests have teeth**

Back the file up, then mutate and confirm a failure each time:

1. `e.upstream?.totalMs == null` → `!e.upstream?.totalMs` → the measured-zero test must fail.
2. `${upstream}${body}` → `${body}${upstream}` → the ordering test must fail.
3. `LEG_LABELS[leg.name] ?? leg.name` → `LEG_LABELS[leg.name]` → the unknown-leg test must fail (renders `undefined 42`).
4. `legs.length === 0 ? [main] : [...]` → always return both → the no-second-line test must fail.

Restore from the backup copy.

- [ ] **Step 6: Full gate and commit**

```powershell
npm run test; npm run typecheck; npm run lint
git add src/diagnostics/report.ts src/diagnostics/report.test.ts
git commit -m "feat(diag): render upstream wall clock and per-leg breakdown in the panel"
```

---

## Task 8: Records

**Files:**
- Modify: `docs/notes/open-questions.md` (new §B30-24 row; a pointer from §B30-18 ②)
- Modify: `docs/HANDOFF.md` (current-state paragraph, measured gate numbers, the device-session procedure)

**Interfaces:**
- Consumes: the measured gate figures from Task 7's run.
- Produces: nothing code-facing.

- [ ] **Step 1: Measure the gate, on this branch, yourself**

```powershell
npm run test; npm run typecheck; npm run lint; npm run build; npm run e2e
```

Write down the actual numbers: test count, Playwright count, entry JS kB and gzip, precache entry count and KiB. **Do not copy a predicted number into the record** — the previous wave's plan predicted 555 tests and 8 new ones and was wrong on both; 558 was recorded because it was measured.

- [ ] **Step 2: Add §B30-24 to `docs/notes/open-questions.md`**

Add a row to the §B table in the same style as §B30-23, recording: the decision (proxy reports upstream leg durations plus its handler wall clock via `Server-Timing`, behind `DIAG_TIMING`, default off); why (§B30-18 ② named this the next step, and the 2000 ms cap cannot be argued without separating path from vendor latency); and these numbered points:

1. **`상류` is the server's wall clock, never a sum of legs** — `disp`/`stck` run in `Promise.all` and wave 1 fires three calls at once, so a sum exceeds the elapsed time and drives the residual negative. Σlegs > 상류 is evidence that parallelism works, not an error.
2. **A leg still in flight at response time is absent, not zero** — `noMatch` and `badGateway` answer while `str`/`auth` are unresolved, and `stck` is never called for a franchise store with no display zone. Waiting for them would corrupt the measurement the header exists to make.
3. **Default off, and why it must be** — `scripts/dev-proxy.mjs` is both the dev and the production server, so the split is env-only; defaulting on would be a fail-open exposure control.
4. **One attach point, not 22** — the spec originally threaded the timer through `jsonResponse` and called per-exit-path tests "the only defence"; counting the exit paths (22 across three handlers) showed the failure would be silent, so the handler body was wrapped instead. The spec was corrected rather than diverged from.
5. **Recorded limitation**: `makeAuthedCall` retries once after a 401 re-issue, so `disp`/`stck` fold two round trips into one number. An owner decision on 2026-09-03 declined a separate marker.
6. **Recorded limitation**: `total` is the handler wall clock and includes the proxy's own JSON work, so the residual `client ms − total` is tunnel + Node HTTP overhead, not proxy compute.
7. The measured gate from Step 1.

Then add one sentence to §B30-18 ② pointing at §B30-24 as the step it named being taken — that paragraph currently ends by naming an action nobody had done yet.

- [ ] **Step 3: Update `docs/HANDOFF.md`**

Add a current-state paragraph in the same shape as the existing ones (branch name, commit range in **inclusive form** `<first>^..<last>` with the commit count stated, measured gate, what is unchanged, record pointer). Add `DIAG_TIMING` to the device-session procedure so the launch line reads:

```powershell
$env:HOST='0.0.0.0'; $env:DIAG_TIMING='1'; npm run dev:live
```

and add the reading rule: **if a completed lookup shows no `상류` on any line, the flag is off.**

- [ ] **Step 4: Commit**

```powershell
git add docs/notes/open-questions.md docs/HANDOFF.md
git commit -m "docs(diag): record the upstream timing decision and its two limitations"
```

---

## Done criteria

- `npm run test`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run e2e` all green, with the numbers **measured and recorded**, not predicted.
- `$env:DIAG_TIMING='1'; npm run dev:live` prints `upstream timing: ON` at startup, and a lookup in `?debug=1` shows `상류` plus a leg line.
- Without the flag, no response carries `server-timing` and the panel renders exactly as it did before this branch.
- A whole-branch independent review runs before any merge to `main` — per this repo's standing rule, the branch is not merged on the strength of per-task reviews alone.
