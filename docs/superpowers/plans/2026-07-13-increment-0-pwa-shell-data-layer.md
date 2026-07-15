# Increment 0 — PWA Shell + Data Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the PWA shell and the freshness-native data layer so a mock adapter can drive all six Flow-1 answer states end-to-end through a pure domain core — with zero blank screens and no real network yet.

**Architecture:** Hexagonal-lite. A pure `domain/` core (types, state-machine reducer, freshness, ports, policy) that knows nothing about React or network; `adapters/` behind a single `StoreStockRepository` port (mock only, this increment); `infra/` for the freshness-native query orchestration, IndexedDB cache, store-context persistence, and Service Worker; a thin `ui/` layer (Zustand hosts the domain reducer, one state-driven surface, no router). A no-cache Cloudflare Pages Function proxies the DAISO core API (built and probed here; consumed for real in Increment 1).

**Tech Stack:** Vite + React 18 + TypeScript 5, Zustand, vite-plugin-pwa (Workbox), Cloudflare Pages Functions (Workers runtime), Vitest + @testing-library/react + Playwright, Biome (lint + format). Package manager: npm. Node 20 LTS.

## Global Constraints

_Every task's requirements implicitly include this section. Values are copied verbatim from the Increment 0+1 design spec and the Product Bible Flow-1 documents (SSOT). Product requirements are **linked, never restated** — the Bible wins on any conflict._

- **Read-only boundary** (INDEX §7): never mutate inventory or transactions. No optimistic UI on availability — a missing signal produces Partial, never a fabricated Success (Engineering §7; this product's stricter-than-Canon rule).
- **Anonymous, no-login first answer** (Anti-goal 4): no gate/onboarding/interstitial before the answer. The only login wall is restock notification (a post-answer action).
- **Offline / weak network is the primary design target** (Experience §6): the cached subset is the offline answer path. **Blank screens are prohibited in every state.** Cache-served answers depend on no network round-trip.
- **Freshness = the age of OUR observation** (D061): live answer stamped at query moment; cached answer stamped at cache-write moment. The staleness threshold applies to **cache age only — a live answer is never demoted.** Never stamp a backend stock age (Confidence Theater, prohibited).
- **No periodic refresh timers ever** (Experience §1.6 downstream contract): refresh triggers are entry / app-resume / pull-to-refresh / `다시 확인` only.
- **Matching tokens are never translated** (D069): Korean product names and numeric floor/zone render as the world renders them (`11층 56번`); only comprehension text is user-language.
- **Store Context is user-owned** (D082): defaults to the last-selected store; GPS only *recommends* nearby stores and never sets or auto-confirms the store; a geolocation failure never blocks search and never changes the current store; QR is not an entry mechanism.
- **Data-owner-unresolved items stay behind the shim** (design spec §7): staleness threshold, low-qty cutoff, discontinued scope, missing/malformed rows, hldyDt semantics, restock-subscription API, input-side search aliases. Placeholder + mock; no app-level guess (CLAUDE.md §3).
- **Performance budgets** (Engineering §3, regression = bug): FCP < 1.8s · LCP < 2.5s · INP < 200ms · CLS < 0.1 · tap feedback < 100ms · skeleton < 100ms after submit · submit → first result ≤ 2s (Hypothesis, field-validated) · state transition 150–300ms (immediate cut under reduce-motion) · cache-served answer = 0 network round-trips.
- **Accessibility** WCAG 2.2 AA (Interface §6): touch targets ≥ 44×44pt (recommend 48), spacing ≥ 8pt; body ≥ 16px / line-height 1.5; contrast body ≥ 4.5:1, large ≥ 3:1 (light + dark); 200% scale survives; reduce-motion respected; **state never conveyed by color alone**.
- **Language:** answers/prose Korean; **code, identifiers, commit messages English**; UX copy Korean (Bible copy is FINAL — transcribe verbatim, never paraphrase).
- **Environment:** Windows 11 / PowerShell. No Linux path/command examples. Commit only when the user asks; implementation lands on a branch (main is docs-only by convention).
- **App-level decisions** (open-questions §B, no Bible D-number consumed): B1 Vite · B2 React+TS · B3 vite-plugin-pwa/Workbox · B4 no router, state-driven · B5 freshness-native custom + Zustand · B6 single `StoreStockRepository` port + injected policy · B7 Vitest+TL+Playwright+TDD · B8 pre-commit gate Biome + tsc + Vitest · B10 Cloudflare Pages + Workers proxy. **B9 (iOS Safari PWA limits) and B11 (CORS/proxy necessity) are verified in this increment (Task 15).**

---

## File Structure

```text
repo/                                 (existing CLAUDE.md, AGENTS.md, README.md, docs/ kept)
  package.json                        npm scripts + deps
  tsconfig.json · tsconfig.node.json  strict TS
  vite.config.ts                      Vite + vite-plugin-pwa + Vitest config
  biome.json                          lint + format (pre-commit gate)
  playwright.config.ts                E2E config
  wrangler.jsonc                      Cloudflare Pages/Workers config
  index.html                          app entry
  functions/
    api/stock.ts                      Cloudflare Pages Function — no-cache proxy (Task 11)
  src/
    domain/                           PURE — no React, no network, 100% unit-tested
      types.ts                        AvailabilityAnswer union, StoreContext, StoreLocation, Freshness, events, UI state
      guards.ts                       discriminated-union type guards
      freshness.ts                    classifyFreshness (live never demoted)
      state-machine.ts                reduce() — Interface §3 transition table
      ports.ts                        StoreStockRepository + sub-ports
      policy.ts                       DataOwnerPolicy (config shim) + strategy fn types + defaults
      errors.ts                       NoCatalogMatchError (→ NO_MATCH) · UnmappableAnswerError (→ safe fallback)
    adapters/
      mock/
        fixtures.ts                   one canonical AvailabilityAnswer per scenario
        mockRepository.ts             StoreStockRepository impl over fixtures
      geolocation/
        browserGeolocation.ts         GeolocationPort — recommend-only (D082)
    infra/
      query-cache.ts                  freshness-native fetch orchestration (2s abort + stamp + cache-on-fail classify)
      cache-storage.ts                IndexedDB read/write (answer cache + catalog subset)
      store-context.ts                last-selected store persistence
      sw/
        catalog-subset.ts             background catalog-subset population (D061-governed)
    ui/
      AvailabilitySurface.tsx         single surface — renders current UI state
      store.ts                        Zustand store hosting the domain reducer
      components/
        GlassSurface.tsx              D083 primitive skeleton (solid-first)
      a11y/
        LiveRegion.tsx                polite live region
        focusOrder.ts                 focus-order helper
    styles/
      tokens.css                      color/type/spacing tokens (light/dark)
      glass.css                       glass + solid fallback + reduced-transparency + reduced-motion
    main.tsx                          React mount + SW registration
  test/
    fixtures/                         raw-payload fixtures land here in Increment 1
    e2e/
      states.spec.ts                  Playwright: all states reachable, no blank screen
  docs/
    notes/
      field-probe-inc0.md            B9 (iOS Safari PWA) + B11 (CORS/proxy) probe results (Task 15)
```

**Shared type contract (authored in Task 2, consumed by every later task and by the Increment 1 plan):**

```ts
// src/domain/types.ts — the names below are load-bearing across both increments
export type Money = number;            // KRW integer; rendered "2,000원"

export interface StoreLocation {
  floor: string;                       // raw stairNo; rendered `${floor}층`
  zone: string;                        // raw zoneNo;  rendered `${zone}번`
}

export type AvailabilityAnswer =
  // qtyUpperBound = Number(qty), always the OBSERVED upper bound (data-contract §4: qty is a bound, not exact).
  // The domain always carries it; whether to surface "재고 N개 이하" is a PRESENTATION gate on policy.lowQtyCutoff
  // (Increment 1) — the provisional A3 cutoff stays out of the domain mapping and fixtures.
  | { kind: 'inStock'; productName: string; price: Money; locations: StoreLocation[]; qtyUpperBound: number }
  | { kind: 'temporarilyOut'; productName: string; price: Money; restockOfferable: boolean }
  | { kind: 'discontinued'; productName: string; price: Money }
  | { kind: 'notCarried'; productName: string }
  | { kind: 'restockArriving'; productName: string; price: Money; lchDay: string }
  | { kind: 'franchiseUndeterminable'; productName: string };

export interface StoreContext { strCd: string; strNm: string }  // strNm e.g. "명동역점"

export type FreshnessClass = 'live' | 'cachedWithinThreshold' | 'cachedBeyondThreshold';
export interface Freshness { class: FreshnessClass; observedAt: number }  // observedAt = when WE observed (epoch ms)

export type CacheOutcome =
  | { kind: 'withinThreshold'; answer: AvailabilityAnswer; freshness: Freshness }
  | { kind: 'beyondThreshold'; answer: AvailabilityAnswer; freshness: Freshness }
  | { kind: 'noCache' };

export type StoreEvent =
  | { type: 'SUBMIT'; query: string }
  | { type: 'RESULT'; answer: AvailabilityAnswer; freshness: Freshness }
  | { type: 'NO_MATCH'; query: string; suggestions: string[] }
  | { type: 'FAILURE'; cache: CacheOutcome }
  | { type: 'SLOW' }
  | { type: 'SELECT_CANDIDATE'; query: string }
  | { type: 'DISMISS_AI' }
  | { type: 'CHANGE_STORE'; store: StoreContext };

export type UiState =
  | { state: 'default' }
  | { state: 'loading'; query: string; slow: boolean }
  | { state: 'empty'; query: string; suggestions: string[] }
  | { state: 'error'; variant: 'cached'; answer: AvailabilityAnswer; freshness: Freshness }
  | { state: 'error'; variant: 'noCache' }
  | { state: 'success'; answer: AvailabilityAnswer; freshness: Freshness }
  | { state: 'partial'; trigger: 'franchise' | 'locationMissing' | 'staleCache'; answer: AvailabilityAnswer; freshness: Freshness | null };
```

---

## Task 1: Toolchain & PWA shell scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `biome.json`, `index.html`, `src/main.tsx`, `src/ui/AvailabilitySurface.tsx`, `src/styles/tokens.css`
- Test: `src/ui/AvailabilitySurface.test.tsx`

**Interfaces:**
- Produces: `AvailabilitySurface` React component (renders the Default headline for now); npm scripts `dev`, `build`, `test`, `lint`, `typecheck`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/ui/AvailabilitySurface.test.tsx
import { render, screen } from '@testing-library/react';
import { AvailabilitySurface } from './AvailabilitySurface';

test('default surface shows the purpose headline', () => {
  render(<AvailabilitySurface />);
  expect(screen.getByText('이 매장에 있는지 바로 확인해 보세요')).toBeInTheDocument();
});
```

- [ ] **Step 2: Scaffold the toolchain so the test can run**

`package.json` (npm; scripts are the pre-commit gate: `lint` + `typecheck` + `test`):

```json
{
  "name": "daiso-finder",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -b --noEmit",
    "lint": "biome check .",
    "e2e": "playwright test"
  },
  "dependencies": { "react": "^18.3.1", "react-dom": "^18.3.1", "zustand": "^4.5.5" },
  "devDependencies": {
    "@biomejs/biome": "^1.9.4",
    "@playwright/test": "^1.47.0",
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.1",
    "@types/react": "^18.3.5",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "fake-indexeddb": "^6.0.0",
    "jsdom": "^25.0.0",
    "typescript": "^5.6.2",
    "vite": "^5.4.0",
    "vite-plugin-pwa": "^0.20.5",
    "vitest": "^2.1.1"
  }
}
```

`vite.config.ts` (Vite + React + vite-plugin-pwa app-shell precache + Vitest):

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      manifest: {
        name: 'DAISO Finder',
        short_name: 'DAISO Finder',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#ffffff',
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}'] },
    }),
  ],
  test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test-setup.ts'] },
});
```

`src/test-setup.ts`: `import '@testing-library/jest-dom';`

`tsconfig.json`: strict, `"jsx": "react-jsx"`, `"moduleResolution": "bundler"`, `"strict": true`, `"noUncheckedIndexedAccess": true`.

`biome.json`: enable recommended lint + formatter.

`index.html`: root div + `<script type="module" src="/src/main.tsx">`.

`src/styles/tokens.css`: minimal `:root` tokens + `@media (prefers-color-scheme: dark)` (body ≥ 16px, line-height 1.5).

`src/main.tsx`: mount `<AvailabilitySurface />` into `#root`; register SW (`import { registerSW } from 'virtual:pwa-register'; registerSW();`).

`src/ui/AvailabilitySurface.tsx`:

```tsx
export function AvailabilitySurface() {
  return <h1>이 매장에 있는지 바로 확인해 보세요</h1>;
}
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npm install && npm run test`
Expected: PASS (1 test).

- [ ] **Step 4: Verify the build emits a PWA (manifest + service worker)**

Run: `npm run build`
Expected: `dist/` contains `manifest.webmanifest` and a generated `sw.js`. `npm run typecheck` and `npm run lint` both pass.

- [ ] **Step 5: Commit**

```powershell
git checkout -b feat/increment-0-shell
git add package.json tsconfig.json tsconfig.node.json vite.config.ts biome.json index.html src test
git commit -m "chore: scaffold Vite + React + TS PWA shell with test toolchain"
```

---

## Task 2: Domain types + guards

**Files:**
- Create: `src/domain/types.ts` (verbatim from the Shared type contract above), `src/domain/guards.ts`
- Test: `src/domain/guards.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: all types in the Shared type contract; guards `isInStock(a): a is Extract<AvailabilityAnswer,{kind:'inStock'}>`, `hasLocation(a): boolean`, `isNegative(a): boolean` (temporarilyOut | discontinued | notCarried | restockArriving).

- [ ] **Step 1: Write the failing test**

```ts
// src/domain/guards.test.ts
import { hasLocation, isNegative } from './guards';
import type { AvailabilityAnswer } from './types';

const inStockNoLoc: AvailabilityAnswer = { kind: 'inStock', productName: 'X', price: 2000, locations: [], qtyUpperBound: 50 };
const inStockLoc: AvailabilityAnswer = { kind: 'inStock', productName: 'X', price: 2000, locations: [{ floor: '11', zone: '56' }], qtyUpperBound: 50 };

test('hasLocation is false for in-stock with no locations', () => {
  expect(hasLocation(inStockLoc)).toBe(true);
  expect(hasLocation(inStockNoLoc)).toBe(false);
});
test('isNegative covers the four negative answers, not in-stock', () => {
  expect(isNegative({ kind: 'discontinued', productName: 'X', price: 2000 })).toBe(true);
  expect(isNegative(inStockLoc)).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/guards.test.ts`
Expected: FAIL — cannot find module `./guards`.

- [ ] **Step 3: Write minimal implementation**

Create `src/domain/types.ts` with the Shared type contract verbatim. Then:

```ts
// src/domain/guards.ts
import type { AvailabilityAnswer } from './types';

export const isInStock = (a: AvailabilityAnswer): a is Extract<AvailabilityAnswer, { kind: 'inStock' }> => a.kind === 'inStock';
export const hasLocation = (a: AvailabilityAnswer): boolean => isInStock(a) && a.locations.length > 0;
export const isNegative = (a: AvailabilityAnswer): boolean =>
  a.kind === 'temporarilyOut' || a.kind === 'discontinued' || a.kind === 'notCarried' || a.kind === 'restockArriving';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/domain/guards.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/domain/types.ts src/domain/guards.ts src/domain/guards.test.ts
git commit -m "feat(domain): add availability answer types and guards"
```

---

## Task 3: Freshness — classify with live-never-demoted invariant

**Files:**
- Create: `src/domain/freshness.ts`
- Test: `src/domain/freshness.test.ts`

**Interfaces:**
- Consumes: `Freshness`, `FreshnessClass` from `types.ts`.
- Produces: `classifyFreshness(params: { observedAt: number; now: number; isLive: boolean; thresholdMs: number }): FreshnessClass`.

- [ ] **Step 1: Write the failing test**

```ts
// src/domain/freshness.test.ts
import { classifyFreshness } from './freshness';

const HOUR = 3_600_000;
test('a live answer is always live and is never demoted, regardless of age', () => {
  expect(classifyFreshness({ observedAt: 0, now: 999 * HOUR, isLive: true, thresholdMs: HOUR })).toBe('live');
});
test('cache within the threshold is withinThreshold', () => {
  expect(classifyFreshness({ observedAt: 0, now: HOUR, isLive: false, thresholdMs: 2 * HOUR })).toBe('cachedWithinThreshold');
});
test('cache older than the threshold is beyondThreshold', () => {
  expect(classifyFreshness({ observedAt: 0, now: 3 * HOUR, isLive: false, thresholdMs: 2 * HOUR })).toBe('cachedBeyondThreshold');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/freshness.test.ts`
Expected: FAIL — cannot find module `./freshness`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/domain/freshness.ts
import type { FreshnessClass } from './types';

export function classifyFreshness(params: { observedAt: number; now: number; isLive: boolean; thresholdMs: number }): FreshnessClass {
  if (params.isLive) return 'live';                       // live is never demoted (D061)
  const age = params.now - params.observedAt;
  return age <= params.thresholdMs ? 'cachedWithinThreshold' : 'cachedBeyondThreshold';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/domain/freshness.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```powershell
git add src/domain/freshness.ts src/domain/freshness.test.ts
git commit -m "feat(domain): add freshness classification with live-never-demoted invariant"
```

---

## Task 4: State-machine reducer (Interface §3 transition table, 1:1)

**Files:**
- Create: `src/domain/state-machine.ts`
- Test: `src/domain/state-machine.test.ts`

**Interfaces:**
- Consumes: `UiState`, `StoreEvent`, `AvailabilityAnswer`, `Freshness`, `CacheOutcome` from `types.ts`; `hasLocation`, `isNegative` from `guards.ts`.
- Produces: `initialState: UiState` (= `{ state: 'default' }`); `reduce(state: UiState, event: StoreEvent): UiState`.

Transition table (verbatim from Interface §3 / design spec §6.2):

```text
default   --(SUBMIT | SELECT_CANDIDATE)------------------------→ loading (slow:false)
loading   --(SLOW)-------------------------------------------→ loading (slow:true)
loading   --(RESULT inStock, locations present)-------------→ success
loading   --(RESULT inStock, no locations)-----------------→ partial (locationMissing)
loading   --(RESULT temporarilyOut|discontinued|notCarried|restockArriving)→ success
loading   --(RESULT franchiseUndeterminable)---------------→ partial (franchise)
loading   --(NO_MATCH)--------------------------------------→ empty
loading   --(FAILURE withinThreshold)----------------------→ error (cached)
loading   --(FAILURE beyondThreshold)----------------------→ partial (staleCache)
loading   --(FAILURE noCache)------------------------------→ error (noCache)
any       --(SUBMIT | SELECT_CANDIDATE)---------------------→ loading (re-search)
any       --(CHANGE_STORE)---------------------------------→ default
```

- [ ] **Step 1: Write the failing test (one assertion per table row)**

```ts
// src/domain/state-machine.test.ts
import { initialState, reduce } from './state-machine';
import type { AvailabilityAnswer, Freshness } from './types';

const live: Freshness = { class: 'live', observedAt: 1000 };
const loading = reduce(initialState, { type: 'SUBMIT', query: '밀폐용기' });
const answer = (a: AvailabilityAnswer) => reduce(loading, { type: 'RESULT', answer: a, freshness: live });

test('default + SUBMIT → loading', () => expect(loading).toEqual({ state: 'loading', query: '밀폐용기', slow: false }));
test('loading + SLOW → loading slow', () => expect(reduce(loading, { type: 'SLOW' })).toMatchObject({ state: 'loading', slow: true }));
test('in stock with location → success', () =>
  expect(answer({ kind: 'inStock', productName: 'X', price: 2000, locations: [{ floor: '11', zone: '56' }], qtyUpperBound: 50 }).state).toBe('success'));
test('in stock without location → partial(locationMissing)', () =>
  expect(answer({ kind: 'inStock', productName: 'X', price: 2000, locations: [], qtyUpperBound: 50 })).toMatchObject({ state: 'partial', trigger: 'locationMissing' }));
test('temporarily out → success', () =>
  expect(answer({ kind: 'temporarilyOut', productName: 'X', price: 2000, restockOfferable: true }).state).toBe('success'));
test('franchise → partial(franchise)', () =>
  expect(answer({ kind: 'franchiseUndeterminable', productName: 'X' })).toMatchObject({ state: 'partial', trigger: 'franchise' }));
test('no match → empty', () =>
  expect(reduce(loading, { type: 'NO_MATCH', query: '락앤락같은통', suggestions: ['밀폐용기'] })).toMatchObject({ state: 'empty', suggestions: ['밀폐용기'] }));
test('failure within threshold → error(cached)', () => {
  const a: AvailabilityAnswer = { kind: 'inStock', productName: 'X', price: 2000, locations: [{ floor: '11', zone: '56' }], qtyUpperBound: 50 };
  expect(reduce(loading, { type: 'FAILURE', cache: { kind: 'withinThreshold', answer: a, freshness: { class: 'cachedWithinThreshold', observedAt: 5 } } }))
    .toMatchObject({ state: 'error', variant: 'cached' });
});
test('failure beyond threshold → partial(staleCache)', () => {
  const a: AvailabilityAnswer = { kind: 'inStock', productName: 'X', price: 2000, locations: [{ floor: '11', zone: '56' }], qtyUpperBound: 50 };
  expect(reduce(loading, { type: 'FAILURE', cache: { kind: 'beyondThreshold', answer: a, freshness: { class: 'cachedBeyondThreshold', observedAt: 5 } } }))
    .toMatchObject({ state: 'partial', trigger: 'staleCache' });
});
test('failure no cache → error(noCache)', () =>
  expect(reduce(loading, { type: 'FAILURE', cache: { kind: 'noCache' } })).toEqual({ state: 'error', variant: 'noCache' }));
test('any answer + SUBMIT → loading (re-search)', () => {
  const s = answer({ kind: 'inStock', productName: 'X', price: 2000, locations: [{ floor: '11', zone: '56' }], qtyUpperBound: 50 });
  expect(reduce(s, { type: 'SUBMIT', query: '수납 바구니' }).state).toBe('loading');
});
test('CHANGE_STORE → default', () =>
  expect(reduce(loading, { type: 'CHANGE_STORE', store: { strCd: '1', strNm: '명동역점' } })).toEqual({ state: 'default' }));
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/state-machine.test.ts`
Expected: FAIL — cannot find module `./state-machine`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/domain/state-machine.ts
import type { UiState, StoreEvent } from './types';
import { hasLocation } from './guards';

export const initialState: UiState = { state: 'default' };

export function reduce(state: UiState, event: StoreEvent): UiState {
  switch (event.type) {
    case 'SUBMIT':
    case 'SELECT_CANDIDATE':
      return { state: 'loading', query: event.query, slow: false };
    case 'CHANGE_STORE':
      return { state: 'default' };
    case 'SLOW':
      return state.state === 'loading' ? { ...state, slow: true } : state;
    case 'NO_MATCH':
      return { state: 'empty', query: event.query, suggestions: event.suggestions.slice(0, 3) };
    case 'RESULT': {
      const { answer, freshness } = event;
      if (answer.kind === 'inStock' && !hasLocation(answer)) return { state: 'partial', trigger: 'locationMissing', answer, freshness };
      if (answer.kind === 'franchiseUndeterminable') return { state: 'partial', trigger: 'franchise', answer, freshness };
      return { state: 'success', answer, freshness };
    }
    case 'FAILURE': {
      const c = event.cache;
      if (c.kind === 'withinThreshold') return { state: 'error', variant: 'cached', answer: c.answer, freshness: c.freshness };
      if (c.kind === 'beyondThreshold') return { state: 'partial', trigger: 'staleCache', answer: c.answer, freshness: c.freshness };
      return { state: 'error', variant: 'noCache' };
    }
    case 'DISMISS_AI':
      return state;
    default:
      return state;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/domain/state-machine.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```powershell
git add src/domain/state-machine.ts src/domain/state-machine.test.ts
git commit -m "feat(domain): add state-machine reducer for the six answer states"
```

---

## Task 5: Ports + DataOwnerPolicy shim + placeholders

**Files:**
- Create: `src/domain/ports.ts`, `src/domain/policy.ts`, `src/domain/errors.ts`
- Test: `src/domain/policy.test.ts`

**Interfaces:**
- Consumes: `AvailabilityAnswer`, `StoreContext` from `types.ts`.
- Produces:
  - `StoreStockRepository` — `query(store: StoreContext, term: { keyword?: string; pdNo?: string }, signal?: AbortSignal): Promise<AvailabilityAnswer>`. **Contract:** resolves an `AvailabilityAnswer`; throws `NoCatalogMatchError` when the keyword matches no catalog product; throws `UnmappableAnswerError` (or any other error) for a payload it cannot safely map or a network failure.
  - Sub-ports: `GeolocationPort` — `getNearbyStores(): Promise<Array<StoreContext & { distanceM: number }>>`; `RestockSubscriptionPort` — `subscribe(pdNo: string, store: StoreContext): Promise<void>`; `SearchAliasResolverPort` — `resolve(query: string): string | null`.
  - `DataOwnerPolicy` (config shim) + `defaultPolicy` placeholder + `nullAliasResolver` + discontinued-scope strategy type.
  - `NoCatalogMatchError` (carries `suggestions: string[]`) and `UnmappableAnswerError` (typed outcomes the query orchestrator routes on; the Increment 1 real adapter throws them).

- [ ] **Step 1: Write the failing test**

```ts
// src/domain/policy.test.ts
import { defaultPolicy, nullAliasResolver } from './policy';

test('placeholder policy carries data-owner-unresolved values, clearly marked provisional', () => {
  expect(defaultPolicy.stalenessThresholdMs).toBeGreaterThan(0);        // A2 — provisional
  expect(defaultPolicy.lowQtyCutoff).toBeGreaterThan(0);                // A3 — provisional
  expect(defaultPolicy.discontinuedScope).toBe('store');               // A7 — switchable
  expect(defaultPolicy.provisional).toBe(true);                        // never treated as a ratified value
});
test('alias resolver is a null impl until data owners supply aliases (A4)', () => {
  expect(nullAliasResolver.resolve('lock and lock')).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/policy.test.ts`
Expected: FAIL — cannot find module `./policy`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/domain/ports.ts
import type { AvailabilityAnswer, StoreContext } from './types';

export interface StoreStockRepository {
  query(store: StoreContext, term: { keyword?: string; pdNo?: string }, signal?: AbortSignal): Promise<AvailabilityAnswer>;
}
export interface GeolocationPort { getNearbyStores(): Promise<Array<StoreContext & { distanceM: number }>>; }
export interface RestockSubscriptionPort { subscribe(pdNo: string, store: StoreContext): Promise<void>; }
export interface SearchAliasResolverPort { resolve(query: string): string | null; }
```

```ts
// src/domain/errors.ts — typed query outcomes the freshness orchestrator routes on.
// NoCatalogMatchError = the keyword matched no catalog product → NO_MATCH → Empty. It is NOT a network failure and
//   must never serve stale cache. UnmappableAnswerError = a payload that cannot be safely mapped (unknown sleStsCd
//   combo, absent store row) → safe fallback (Error/Partial via the cache path), NEVER a fabricated Success
//   (design spec §6.3; Engineering §7 read-only, no optimistic availability).
export class NoCatalogMatchError extends Error {
  constructor(public readonly suggestions: string[] = []) {
    super('no catalog match');
    this.name = 'NoCatalogMatchError';
  }
}
export class UnmappableAnswerError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'UnmappableAnswerError';
  }
}
```

(These trivial error classes carry no logic of their own; they are exercised by the Task 8 query-runner test below and by the Increment 1 adapter tests.)

```ts
// src/domain/policy.ts — data-owner-unresolved values live here behind the shim (design spec §7). NOT app-decided.
import type { SearchAliasResolverPort } from './ports';

export type DiscontinuedScope = 'store' | 'chain';   // A7 — switchable without rewriting the Flow 3 matrix

export interface DataOwnerPolicy {
  stalenessThresholdMs: number;   // A2 — provisional placeholder; confirm with data owner, then Bible records it
  lowQtyCutoff: number;           // A3 — provisional placeholder
  discontinuedScope: DiscontinuedScope; // A7 — provisional
  provisional: true;              // marks every value above as un-ratified
}

export const defaultPolicy: DataOwnerPolicy = {
  stalenessThresholdMs: 6 * 3_600_000,  // provisional 6h — placeholder only
  lowQtyCutoff: 5,                       // provisional — placeholder only
  discontinuedScope: 'store',            // provisional — placeholder only
  provisional: true,
};

export const nullAliasResolver: SearchAliasResolverPort = { resolve: () => null };  // A4
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/domain/policy.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```powershell
git add src/domain/ports.ts src/domain/policy.ts src/domain/errors.ts src/domain/policy.test.ts
git commit -m "feat(domain): add repository/sub-ports, data-owner policy shim, and typed query errors"
```

---

## Task 6: Mock adapter + canonical fixtures (all answer variants)

**Files:**
- Create: `src/adapters/mock/fixtures.ts`, `src/adapters/mock/mockRepository.ts`
- Test: `src/adapters/mock/mockRepository.test.ts`

**Interfaces:**
- Consumes: `StoreStockRepository` from `ports.ts`; `AvailabilityAnswer` from `types.ts`.
- Produces: `mockAnswers` — a `Record<Scenario, AvailabilityAnswer>` where `Scenario = 'inStock' | 'inStockLowQty' | 'inStockMultiLocation' | 'noLocation' | 'temporarilyOut' | 'discontinued' | 'notCarried' | 'restockArriving' | 'franchise'`; `createMockRepository(scenario: Scenario, opts?: { latencyMs?: number; fail?: boolean; noMatch?: boolean }): StoreStockRepository`. `fail: true` throws a generic network error (→ FAILURE); `noMatch: true` throws `NoCatalogMatchError` (→ NO_MATCH → Empty). **These fixtures are the canonical expected domain outputs — the Increment 1 real adapter's parity test asserts against them.**

- [ ] **Step 1: Write the failing test**

```ts
// src/adapters/mock/mockRepository.test.ts
import { createMockRepository } from './mockRepository';
import { mockAnswers } from './fixtures';

const store = { strCd: '1', strNm: '명동역점' };

test('every scenario is represented', () => {
  expect(Object.keys(mockAnswers)).toEqual(
    expect.arrayContaining(['inStock', 'inStockLowQty', 'inStockMultiLocation', 'noLocation', 'temporarilyOut', 'discontinued', 'notCarried', 'restockArriving', 'franchise']),
  );
});
test('mock repository resolves the requested scenario answer', async () => {
  const repo = createMockRepository('temporarilyOut');
  await expect(repo.query(store, { keyword: '밀폐용기' })).resolves.toEqual(mockAnswers.temporarilyOut);
});
test('mock repository can simulate a failure for the offline path', async () => {
  const repo = createMockRepository('inStock', { fail: true });
  await expect(repo.query(store, { keyword: '밀폐용기' })).rejects.toThrow();
});
test('mock repository can simulate a no-catalog-match (→ NO_MATCH → Empty)', async () => {
  const { NoCatalogMatchError } = await import('../../domain/errors');
  const repo = createMockRepository('inStock', { noMatch: true });
  await expect(repo.query(store, { keyword: '없는상품' })).rejects.toBeInstanceOf(NoCatalogMatchError);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/adapters/mock/mockRepository.test.ts`
Expected: FAIL — cannot find module `./mockRepository`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/adapters/mock/fixtures.ts
import type { AvailabilityAnswer } from '../../domain/types';

export type Scenario =
  | 'inStock' | 'inStockLowQty' | 'inStockMultiLocation' | 'noLocation'
  | 'temporarilyOut' | 'discontinued' | 'notCarried' | 'restockArriving' | 'franchise';

const NAME = '리빙 밀폐용기 1.2L';
export const mockAnswers: Record<Scenario, AvailabilityAnswer> = {
  inStock: { kind: 'inStock', productName: NAME, price: 2000, locations: [{ floor: '11', zone: '56' }], qtyUpperBound: 50 },
  inStockLowQty: { kind: 'inStock', productName: NAME, price: 2000, locations: [{ floor: '11', zone: '56' }], qtyUpperBound: 3 },
  inStockMultiLocation: { kind: 'inStock', productName: NAME, price: 2000, locations: [{ floor: '11', zone: '56' }, { floor: '2', zone: '14' }], qtyUpperBound: 50 },
  noLocation: { kind: 'inStock', productName: NAME, price: 2000, locations: [], qtyUpperBound: 50 },
  temporarilyOut: { kind: 'temporarilyOut', productName: NAME, price: 2000, restockOfferable: true },
  discontinued: { kind: 'discontinued', productName: NAME, price: 2000 },
  notCarried: { kind: 'notCarried', productName: NAME },
  restockArriving: { kind: 'restockArriving', productName: NAME, price: 2000, lchDay: '7월 15일' },
  franchise: { kind: 'franchiseUndeterminable', productName: NAME },
};
```

```ts
// src/adapters/mock/mockRepository.ts
import type { StoreStockRepository } from '../../domain/ports';
import { NoCatalogMatchError } from '../../domain/errors';
import { mockAnswers, type Scenario } from './fixtures';

export function createMockRepository(
  scenario: Scenario,
  opts: { latencyMs?: number; fail?: boolean; noMatch?: boolean } = {},
): StoreStockRepository {
  return {
    async query() {
      if (opts.latencyMs) await new Promise((r) => setTimeout(r, opts.latencyMs));
      if (opts.noMatch) throw new NoCatalogMatchError([]);   // keyword matched no catalog product → NO_MATCH
      if (opts.fail) throw new Error('mock network failure'); // network/timeout → FAILURE
      return mockAnswers[scenario];
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/adapters/mock/mockRepository.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```powershell
git add src/adapters/mock src/adapters/mock/mockRepository.test.ts
git commit -m "feat(adapters): add mock store-stock repository with canonical fixtures"
```

---

## Task 7: Cache storage (IndexedDB, read-only serving)

**Files:**
- Create: `src/infra/cache-storage.ts`
- Test: `src/infra/cache-storage.test.ts`

**Interfaces:**
- Consumes: `AvailabilityAnswer` from `types.ts`.
- Produces: `CacheStorage` interface + `createIndexedDbCache(): CacheStorage`, where `CacheStorage` = `{ readAnswer(key: string): Promise<{ answer: AvailabilityAnswer; observedAt: number } | null>; writeAnswer(key: string, answer: AvailabilityAnswer, observedAt: number): Promise<void>; }`. Key = `${strCd}:${keyword|pdNo}`.

- [ ] **Step 1: Write the failing test** (uses `fake-indexeddb`)

```ts
// src/infra/cache-storage.test.ts
import 'fake-indexeddb/auto';
import { createIndexedDbCache } from './cache-storage';
import type { AvailabilityAnswer } from '../domain/types';

const answer: AvailabilityAnswer = { kind: 'inStock', productName: 'X', price: 2000, locations: [{ floor: '11', zone: '56' }], qtyUpperBound: 50 };

test('written answer is read back with its observedAt stamp', async () => {
  const cache = createIndexedDbCache();
  await cache.writeAnswer('1:밀폐용기', answer, 1_700_000_000_000);
  await expect(cache.readAnswer('1:밀폐용기')).resolves.toEqual({ answer, observedAt: 1_700_000_000_000 });
});
test('missing key reads back null (no cache path)', async () => {
  const cache = createIndexedDbCache();
  await expect(cache.readAnswer('1:없는상품')).resolves.toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/infra/cache-storage.test.ts`
Expected: FAIL — cannot find module `./cache-storage`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/infra/cache-storage.ts
import type { AvailabilityAnswer } from '../domain/types';

export interface CacheStorage {
  readAnswer(key: string): Promise<{ answer: AvailabilityAnswer; observedAt: number } | null>;
  writeAnswer(key: string, answer: AvailabilityAnswer, observedAt: number): Promise<void>;
}

const DB = 'daiso-finder', STORE = 'answers', VERSION = 1;
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then((db) => new Promise<T>((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}
export function createIndexedDbCache(): CacheStorage {
  return {
    async readAnswer(key) { return (await tx('readonly', (s) => s.get(key))) ?? null; },
    async writeAnswer(key, answer, observedAt) { await tx('readwrite', (s) => s.put({ answer, observedAt }, key)); },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/infra/cache-storage.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```powershell
git add src/infra/cache-storage.ts src/infra/cache-storage.test.ts
git commit -m "feat(infra): add IndexedDB answer cache (read-only serving)"
```

---

## Task 8: Query-cache orchestrator (freshness-native, 2s abort, cache-on-fail classify)

**Files:**
- Create: `src/infra/query-cache.ts`
- Test: `src/infra/query-cache.test.ts`

**Interfaces:**
- Consumes: `StoreStockRepository` (ports), `CacheStorage` (Task 7), `classifyFreshness` (Task 3), `DataOwnerPolicy` (Task 5), `NoCatalogMatchError` (Task 5 errors), `StoreContext`, `AvailabilityAnswer`, `StoreEvent`, `CacheOutcome` (types).
- Produces: `createQueryRunner(deps: { repo: StoreStockRepository; cache: CacheStorage; policy: DataOwnerPolicy; now: () => number; timeoutMs?: number }): { run(store: StoreContext, term: { keyword?: string; pdNo?: string }): Promise<StoreEvent> }`. Returns a **`RESULT`** event (live, stamped `now`, cache written) on success; a **`NO_MATCH`** event when the repository throws `NoCatalogMatchError` (keyword matched no product — never serves stale cache); or a **`FAILURE`** event carrying the classified `CacheOutcome` on timeout / mapping failure / any other error. `timeoutMs` default 2000. `now` is injected (never `Date.now()` inline) for testability.

- [ ] **Step 1: Write the failing test**

```ts
// src/infra/query-cache.test.ts
import { createQueryRunner } from './query-cache';
import { createMockRepository } from '../adapters/mock/mockRepository';
import { mockAnswers } from '../adapters/mock/fixtures';
import type { CacheStorage } from './cache-storage';
import { defaultPolicy } from '../domain/policy';

const store = { strCd: '1', strNm: '명동역점' };
const memCache = (): CacheStorage => {
  const m = new Map<string, { answer: any; observedAt: number }>();
  return { async readAnswer(k) { return m.get(k) ?? null; }, async writeAnswer(k, answer, observedAt) { m.set(k, { answer, observedAt }); } };
};

test('success → RESULT stamped live at now, and the answer is cached', async () => {
  const cache = memCache();
  const run = createQueryRunner({ repo: createMockRepository('inStock'), cache, policy: defaultPolicy, now: () => 5000 });
  const ev = await run.run(store, { keyword: '밀폐용기' });
  expect(ev).toEqual({ type: 'RESULT', answer: mockAnswers.inStock, freshness: { class: 'live', observedAt: 5000 } });
  expect(await cache.readAnswer('1:밀폐용기')).toEqual({ answer: mockAnswers.inStock, observedAt: 5000 });
});
test('failure with fresh cache → FAILURE withinThreshold', async () => {
  const cache = memCache();
  await cache.writeAnswer('1:밀폐용기', mockAnswers.inStock, 4000);
  const run = createQueryRunner({ repo: createMockRepository('inStock', { fail: true }), cache, policy: { ...defaultPolicy, stalenessThresholdMs: 10_000 }, now: () => 8000 });
  const ev = await run.run(store, { keyword: '밀폐용기' });
  expect(ev).toMatchObject({ type: 'FAILURE', cache: { kind: 'withinThreshold' } });
});
test('failure with stale cache → FAILURE beyondThreshold', async () => {
  const cache = memCache();
  await cache.writeAnswer('1:밀폐용기', mockAnswers.inStock, 0);
  const run = createQueryRunner({ repo: createMockRepository('inStock', { fail: true }), cache, policy: { ...defaultPolicy, stalenessThresholdMs: 1000 }, now: () => 8000 });
  expect(await run.run(store, { keyword: '밀폐용기' })).toMatchObject({ type: 'FAILURE', cache: { kind: 'beyondThreshold' } });
});
test('failure with no cache → FAILURE noCache', async () => {
  const run = createQueryRunner({ repo: createMockRepository('inStock', { fail: true }), cache: memCache(), policy: defaultPolicy, now: () => 8000 });
  expect(await run.run(store, { keyword: '없는상품' })).toEqual({ type: 'FAILURE', cache: { kind: 'noCache' } });
});
test('a timeout beyond timeoutMs is treated as a failure', async () => {
  const run = createQueryRunner({ repo: createMockRepository('inStock', { latencyMs: 50 }), cache: memCache(), policy: defaultPolicy, now: () => 8000, timeoutMs: 10 });
  expect(await run.run(store, { keyword: '밀폐용기' })).toMatchObject({ type: 'FAILURE' });
});
test('no catalog match → NO_MATCH (never serves stale cache)', async () => {
  const cache = memCache();
  await cache.writeAnswer('1:없는상품', mockAnswers.inStock, 0);   // a stale cache exists…
  const run = createQueryRunner({ repo: createMockRepository('inStock', { noMatch: true }), cache, policy: defaultPolicy, now: () => 8000 });
  // …but a no-match must NOT be dressed up as a cached failure; it is Empty.
  expect(await run.run(store, { keyword: '없는상품' })).toEqual({ type: 'NO_MATCH', query: '없는상품', suggestions: [] });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/infra/query-cache.test.ts`
Expected: FAIL — cannot find module `./query-cache`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/infra/query-cache.ts
import type { StoreStockRepository } from '../domain/ports';
import type { CacheStorage } from './cache-storage';
import type { DataOwnerPolicy } from '../domain/policy';
import { classifyFreshness } from '../domain/freshness';
import { NoCatalogMatchError } from '../domain/errors';
import type { StoreContext, StoreEvent, CacheOutcome, Freshness } from '../domain/types';

export function createQueryRunner(deps: {
  repo: StoreStockRepository; cache: CacheStorage; policy: DataOwnerPolicy; now: () => number; timeoutMs?: number;
}) {
  const timeoutMs = deps.timeoutMs ?? 2000;
  return {
    async run(store: StoreContext, term: { keyword?: string; pdNo?: string }): Promise<StoreEvent> {
      const key = `${store.strCd}:${term.keyword ?? term.pdNo ?? ''}`;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const answer = await deps.repo.query(store, term, ctrl.signal);
        clearTimeout(timer);
        const observedAt = deps.now();
        await deps.cache.writeAnswer(key, answer, observedAt);
        const freshness: Freshness = { class: 'live', observedAt };   // live is never demoted
        return { type: 'RESULT', answer, freshness };
      } catch (err) {
        clearTimeout(timer);
        // A no-catalog-match is a successful query with zero results, NOT a network failure: it must not serve
        // stale cache. Route it straight to NO_MATCH → Empty. Everything else (UnmappableAnswerError, network,
        // timeout/abort) falls through to the cache-classify failure path.
        if (err instanceof NoCatalogMatchError) {
          return { type: 'NO_MATCH', query: term.keyword ?? term.pdNo ?? '', suggestions: err.suggestions };
        }
        const cached = await deps.cache.readAnswer(key);
        if (!cached) return { type: 'FAILURE', cache: { kind: 'noCache' } };
        const cls = classifyFreshness({ observedAt: cached.observedAt, now: deps.now(), isLive: false, thresholdMs: deps.policy.stalenessThresholdMs });
        const freshness: Freshness = { class: cls, observedAt: cached.observedAt };
        const cache: CacheOutcome = cls === 'cachedWithinThreshold'
          ? { kind: 'withinThreshold', answer: cached.answer, freshness }
          : { kind: 'beyondThreshold', answer: cached.answer, freshness };
        return { type: 'FAILURE', cache };
      }
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/infra/query-cache.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```powershell
git add src/infra/query-cache.ts src/infra/query-cache.test.ts
git commit -m "feat(infra): add freshness-native query runner with cache-on-failure classification"
```

---

## Task 9: Store-context persistence + geolocation port (recommend-only, D082)

**Files:**
- Create: `src/infra/store-context.ts`, `src/adapters/geolocation/browserGeolocation.ts`
- Test: `src/infra/store-context.test.ts`

**Interfaces:**
- Consumes: `StoreContext` (types), `GeolocationPort` (ports).
- Produces: `loadStoreContext(): StoreContext | null` and `saveStoreContext(store: StoreContext): void` (localStorage, key `daiso.storeContext`); `createBrowserGeolocation(nav?: { geolocation?: Geolocation }): GeolocationPort` whose `getNearbyStores()` **rejects/returns [] on denial or absence and never throws into the search path**.

- [ ] **Step 1: Write the failing test**

```ts
// src/infra/store-context.test.ts
import { loadStoreContext, saveStoreContext } from './store-context';
import { createBrowserGeolocation } from '../adapters/geolocation/browserGeolocation';

beforeEach(() => localStorage.clear());

test('no store selected yet → null (first run leads to store search, never a search block)', () => {
  expect(loadStoreContext()).toBeNull();
});
test('the last-selected store persists and is the default', () => {
  saveStoreContext({ strCd: '1', strNm: '명동역점' });
  expect(loadStoreContext()).toEqual({ strCd: '1', strNm: '명동역점' });
});
test('geolocation absence yields an empty recommendation list, not a thrown error (D082)', async () => {
  const geo = createBrowserGeolocation({});          // no navigator.geolocation
  await expect(geo.getNearbyStores()).resolves.toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/infra/store-context.test.ts`
Expected: FAIL — cannot find modules.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/infra/store-context.ts
import type { StoreContext } from '../domain/types';
const KEY = 'daiso.storeContext';
export function loadStoreContext(): StoreContext | null {
  const raw = localStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as StoreContext) : null;
}
export function saveStoreContext(store: StoreContext): void { localStorage.setItem(KEY, JSON.stringify(store)); }
```

```ts
// src/adapters/geolocation/browserGeolocation.ts
import type { GeolocationPort } from '../../domain/ports';
// GPS RECOMMENDS ONLY (D082): never sets the store; failure/denial → empty list, search is never blocked.
export function createBrowserGeolocation(nav: { geolocation?: Geolocation } = navigator): GeolocationPort {
  return {
    async getNearbyStores() {
      if (!nav.geolocation) return [];
      // Increment 1 wires real coordinates → nearby-store lookup; here the seam returns [] safely.
      return [];
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/infra/store-context.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```powershell
git add src/infra/store-context.ts src/adapters/geolocation src/infra/store-context.test.ts
git commit -m "feat(infra): persist user-owned store context; geolocation recommends only (D082)"
```

---

## Task 10: UI store (Zustand hosts the domain reducer)

**Files:**
- Create: `src/ui/store.ts`
- Test: `src/ui/store.test.ts`

**Interfaces:**
- Consumes: `reduce`, `initialState` (state-machine); `UiState`, `StoreEvent` (types).
- Produces: `useAvailabilityStore` — a Zustand store `{ ui: UiState; dispatch(event: StoreEvent): void }`. The store is a thin host — all transitions go through the pure `reduce`.

- [ ] **Step 1: Write the failing test**

```ts
// src/ui/store.test.ts
import { useAvailabilityStore } from './store';

test('dispatch routes through the pure reducer', () => {
  useAvailabilityStore.getState().dispatch({ type: 'SUBMIT', query: '밀폐용기' });
  expect(useAvailabilityStore.getState().ui).toMatchObject({ state: 'loading', query: '밀폐용기' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/store.test.ts`
Expected: FAIL — cannot find module `./store`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/ui/store.ts
import { create } from 'zustand';
import { reduce, initialState } from '../domain/state-machine';
import type { UiState, StoreEvent } from '../domain/types';

interface AvailabilityStore { ui: UiState; dispatch: (event: StoreEvent) => void; }
export const useAvailabilityStore = create<AvailabilityStore>((set) => ({
  ui: initialState,
  dispatch: (event) => set((s) => ({ ui: reduce(s.ui, event) })),
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/ui/store.ts src/ui/store.test.ts
git commit -m "feat(ui): add Zustand store hosting the domain reducer"
```

---

## Task 11: Cloudflare Pages Function proxy (no-cache pass-through + CORS + mall-field strip)

**Files:**
- Create: `functions/api/stock.ts`, `wrangler.jsonc`
- Test: `functions/api/stock.test.ts`

**Interfaces:**
- Produces: `onRequestPost(context)` — reads the request body, forwards `POST https://mapi.daisomall.co.kr/ms/msg/newIntSelStr`, returns the response with `Access-Control-Allow-Origin`, **no caching, no re-ranking, no business logic**, and defensively strips mall-only fields (`pkupYn, bassPkupStrYn, pntAcmYn, pntUseYn, intUseYn`). Also exports `stripMallOnlyFields(json)` for unit testing.

- [ ] **Step 1: Write the failing test**

```ts
// functions/api/stock.test.ts
import { stripMallOnlyFields } from './stock';

test('mall-only commerce fields are stripped at the proxy boundary', () => {
  const upstream = { data: { msStrVOList: [{ strCd: '1', qty: '3', pkupYn: 'Y', pntAcmYn: 'Y', intUseYn: 'Y' }] } };
  const out = stripMallOnlyFields(upstream);
  const row = out.data.msStrVOList[0];
  expect(row.qty).toBe('3');
  expect('pkupYn' in row).toBe(false);
  expect('pntAcmYn' in row).toBe(false);
  expect('intUseYn' in row).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run functions/api/stock.test.ts`
Expected: FAIL — cannot find module `./stock`.

- [ ] **Step 3: Write minimal implementation**

```ts
// functions/api/stock.ts — no-cache pass-through relay only (design spec §3). No caching/business logic/logging of sensitive data.
const UPSTREAM = 'https://mapi.daisomall.co.kr/ms/msg/newIntSelStr';
const MALL_ONLY = ['pkupYn', 'bassPkupStrYn', 'pntAcmYn', 'pntUseYn', 'intUseYn'];

export function stripMallOnlyFields(json: any): any {
  const rows = json?.data?.msStrVOList;
  if (Array.isArray(rows)) {
    for (const row of rows) for (const f of MALL_ONLY) delete row[f];
  }
  return json;
}

export async function onRequestPost(context: { request: Request }): Promise<Response> {
  const body = await context.request.text();
  const upstream = await fetch(UPSTREAM, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
  const json = stripMallOnlyFields(await upstream.json());
  return new Response(JSON.stringify(json), {
    status: upstream.status,
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'no-store' },
  });
}
```

`wrangler.jsonc`: `{ "name": "daiso-finder", "compatibility_date": "2024-09-01", "pages_build_output_dir": "dist" }`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run functions/api/stock.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add functions/api/stock.ts functions/api/stock.test.ts wrangler.jsonc
git commit -m "feat(proxy): add no-cache Cloudflare Pages Function relay stripping mall-only fields"
```

---

## Task 12: Service Worker catalog-subset background population (D061-governed)

**Files:**
- Create: `src/infra/sw/catalog-subset.ts`
- Test: `src/infra/sw/catalog-subset.test.ts`

**Interfaces:**
- Consumes: `StoreStockRepository` (ports), `CacheStorage` (Task 7), `StoreContext` (types).
- Produces: `populateCatalogSubset(deps: { store: StoreContext; skus: string[]; repo: StoreStockRepository; cache: CacheStorage; now: () => number }): Promise<number>` — populates the per-store catalog subset **in the background, never on the first-answer critical path**, stamping each entry with the observation time (D061), returns the count written. Replaced on `매장 변경`; lifetime governed by the freshness policy, **not a Workbox TTL**.

- [ ] **Step 1: Write the failing test**

```ts
// src/infra/sw/catalog-subset.test.ts
import { populateCatalogSubset } from './catalog-subset';
import { createMockRepository } from '../../adapters/mock/mockRepository';
import type { CacheStorage } from '../cache-storage';

const memCache = (): CacheStorage & { size: () => number } => {
  const m = new Map<string, any>();
  return { async readAnswer(k) { return m.get(k) ?? null; }, async writeAnswer(k, answer, observedAt) { m.set(k, { answer, observedAt }); }, size: () => m.size };
};

test('background population writes one stamped entry per SKU', async () => {
  const cache = memCache();
  const n = await populateCatalogSubset({ store: { strCd: '1', strNm: '명동역점' }, skus: ['a', 'b', 'c'], repo: createMockRepository('inStock'), cache, now: () => 5000 });
  expect(n).toBe(3);
  expect(cache.size()).toBe(3);
  expect(await cache.readAnswer('1:a')).toMatchObject({ observedAt: 5000 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/infra/sw/catalog-subset.test.ts`
Expected: FAIL — cannot find module `./catalog-subset`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/infra/sw/catalog-subset.ts
import type { StoreStockRepository } from '../../domain/ports';
import type { CacheStorage } from '../cache-storage';
import type { StoreContext } from '../../domain/types';

// Populated in the BACKGROUND after Store Context is set; never on the first-answer critical path.
// Entry lifetime is governed by the freshness policy (D061), not an independent Workbox TTL.
export async function populateCatalogSubset(deps: {
  store: StoreContext; skus: string[]; repo: StoreStockRepository; cache: CacheStorage; now: () => number;
}): Promise<number> {
  let written = 0;
  for (const sku of deps.skus) {
    try {
      const answer = await deps.repo.query(deps.store, { pdNo: sku });
      await deps.cache.writeAnswer(`${deps.store.strCd}:${sku}`, answer, deps.now());
      written += 1;
    } catch { /* background best-effort; never blocks the first answer */ }
  }
  return written;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/infra/sw/catalog-subset.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/infra/sw/catalog-subset.ts src/infra/sw/catalog-subset.test.ts
git commit -m "feat(sw): populate per-store catalog subset in background, freshness-governed"
```

---

## Task 13: GlassSurface primitive skeleton (D083, solid-first)

**Files:**
- Create: `src/ui/components/GlassSurface.tsx`, `src/styles/glass.css`
- Test: `src/ui/components/GlassSurface.test.tsx`

**Interfaces:**
- Produces: `<GlassSurface as?='div'|'section' className?>` — renders a solid, opaque surface by default and layers glass only as a progressive enhancement. Under `prefers-reduced-transparency: reduce` it renders solid with no `backdrop-filter`. A contrast-guaranteeing layer is always present so effective text contrast ≥ 4.5:1 (Interface §5, non-negotiable).

- [ ] **Step 1: Write the failing test**

```tsx
// src/ui/components/GlassSurface.test.tsx
import { render } from '@testing-library/react';
import { GlassSurface } from './GlassSurface';

test('renders a solid base surface with the contrast-guarantee layer', () => {
  const { container } = render(<GlassSurface>답</GlassSurface>);
  const el = container.firstChild as HTMLElement;
  expect(el).toHaveClass('glass-surface');
  expect(el.dataset.solidBase).toBe('true');   // solid is the base; glass is progressive enhancement
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/components/GlassSurface.test.tsx`
Expected: FAIL — cannot find module `./GlassSurface`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/ui/components/GlassSurface.tsx
import type { PropsWithChildren } from 'react';
import '../../styles/glass.css';

export function GlassSurface({ children, className = '' }: PropsWithChildren<{ className?: string }>) {
  return <div className={`glass-surface ${className}`.trim()} data-solid-base="true">{children}</div>;
}
```

```css
/* src/styles/glass.css — solid is the base layer; glass is a progressive enhancement gated by budgets. */
.glass-surface { background: var(--surface-solid); color: var(--text-primary); position: relative; }
@supports (backdrop-filter: blur(1px)) {
  .glass-surface { background: var(--surface-glass-tint); backdrop-filter: blur(var(--glass-blur)); } /* contrast-guarantee tint */
}
@media (prefers-reduced-transparency: reduce) {
  .glass-surface { background: var(--surface-solid) !important; backdrop-filter: none !important; }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/components/GlassSurface.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/ui/components/GlassSurface.tsx src/styles/glass.css src/ui/components/GlassSurface.test.tsx
git commit -m "feat(ui): add D083 GlassSurface primitive (solid-first, reduced-transparency fallback)"
```

---

## Task 14: a11y + performance skeleton (live region, focus order, reduced-motion)

**Files:**
- Create: `src/ui/a11y/LiveRegion.tsx`, `src/ui/a11y/focusOrder.ts`
- Modify: `src/styles/tokens.css` (add reduced-motion rule)
- Test: `src/ui/a11y/LiveRegion.test.tsx`

**Interfaces:**
- Produces: `<LiveRegion message={string} />` — a `aria-live="polite"` region; `FOCUS_ORDER: readonly string[]` = `['store-line','answer-card','cta','candidates','search-bar']` (Interface §6 order).

- [ ] **Step 1: Write the failing test**

```tsx
// src/ui/a11y/LiveRegion.test.tsx
import { render, screen } from '@testing-library/react';
import { LiveRegion } from './LiveRegion';
import { FOCUS_ORDER } from './focusOrder';

test('announces politely', () => {
  render(<LiveRegion message="이 매장에 있어요" />);
  const region = screen.getByText('이 매장에 있어요');
  expect(region).toHaveAttribute('aria-live', 'polite');
});
test('focus order matches Interface §6', () => {
  expect(FOCUS_ORDER).toEqual(['store-line', 'answer-card', 'cta', 'candidates', 'search-bar']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/a11y/LiveRegion.test.tsx`
Expected: FAIL — cannot find modules.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/ui/a11y/LiveRegion.tsx
export function LiveRegion({ message }: { message: string }) {
  return <div aria-live="polite" role="status">{message}</div>;
}
```

```ts
// src/ui/a11y/focusOrder.ts
export const FOCUS_ORDER = ['store-line', 'answer-card', 'cta', 'candidates', 'search-bar'] as const;
```

Add to `src/styles/tokens.css`:

```css
@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; transition: none !important; }  /* immediate cuts (Interface §3) */
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/a11y/LiveRegion.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```powershell
git add src/ui/a11y src/styles/tokens.css src/ui/a11y/LiveRegion.test.tsx
git commit -m "feat(a11y): add polite live region, focus-order constant, reduced-motion cuts"
```

---

## Task 15: Increment 0 integration — mock-driven surface + no-blank-screen E2E + B9/B11 field probe

**Files:**
- Modify: `src/ui/AvailabilitySurface.tsx` (wire the mock pipeline behind a dev-only scenario switch), `src/main.tsx`
- Create: `test/e2e/states.spec.ts`, `docs/notes/field-probe-inc0.md`
- Test: `test/e2e/states.spec.ts` (Playwright)

**Interfaces:**
- Consumes: `useAvailabilityStore` (Task 10), `createQueryRunner` (Task 8), `createMockRepository` (Task 6), `loadStoreContext`/`saveStoreContext` (Task 9), `GlassSurface` (Task 13), `LiveRegion` (Task 14).
- Produces: an `AvailabilitySurface` that, given a mock repository, renders a non-blank surface for every UI state (a bare-bones renderer — the FINAL Flow-1 copy and card anatomy land in the Increment 1 plan). A dev-only `?scenario=` switch drives each state for the E2E sweep.

- [ ] **Step 1: Write the failing E2E test**

```ts
// test/e2e/states.spec.ts
import { test, expect } from '@playwright/test';

const scenarios = ['inStock', 'noLocation', 'temporarilyOut', 'discontinued', 'notCarried', 'restockArriving', 'franchise', 'empty', 'errorCached', 'errorNoCache'];

for (const scenario of scenarios) {
  test(`state "${scenario}" renders a non-blank surface (no dead end)`, async ({ page }) => {
    await page.goto(`/?scenario=${scenario}`);
    const main = page.locator('main');
    await expect(main).toBeVisible();
    await expect(main).not.toBeEmpty();                 // Blank screens prohibited in every state
  });
}
```

`playwright.config.ts`: `webServer: { command: 'npm run dev', port: 5173, reuseExistingServer: true }`, `use: { baseURL: 'http://localhost:5173' }`.

- [ ] **Step 2: Run E2E to verify it fails**

Run: `npx playwright install --with-deps chromium` then `npm run e2e`
Expected: FAIL — the surface does not yet render the scenarios.

- [ ] **Step 3: Wire the mock pipeline into the surface (minimal renderer)**

In `AvailabilitySurface.tsx`, on mount read `?scenario=`, build a `createMockRepository(scenario)` (or `{ fail: true }` for the error scenarios), run `createQueryRunner(...).run(...)`, `dispatch` the resulting event, and render each `ui.state` with a minimal, non-blank block inside a `<main>` (a single `GlassSurface` + `LiveRegion` showing the state name). Keep copy minimal — **final Flow-1 copy is Increment 1.** Default store defaults to `{ strCd: '0', strNm: '명동역점' }` when `loadStoreContext()` is null (a placeholder store for the Inc-0 sweep only).

- [ ] **Step 4: Run E2E to verify it passes**

Run: `npm run e2e`
Expected: PASS (10 scenarios, each renders a non-blank `<main>`).

- [ ] **Step 5: Run the B9 / B11 field probes and record results**

Run the CORS/proxy probe (B11): with the data owner's confirmation or a controlled test, determine whether the browser can call `newIntSelStr` directly or requires the proxy. Run the B9 probe: install the PWA on iOS Safari and check Service Worker caching, camera/barcode access, and behavior on an unstable store network. Record both in `docs/notes/field-probe-inc0.md` with the observed outcome and its consequence for Increment 1. **Do not guess — if the probe cannot run, record it as still-open and keep the proxy default (design spec §2, §13).**

- [ ] **Step 6: Commit**

```powershell
git add src/ui/AvailabilitySurface.tsx src/main.tsx test/e2e/states.spec.ts playwright.config.ts docs/notes/field-probe-inc0.md
git commit -m "feat(ui): drive all six states from the mock pipeline; add no-blank-screen E2E and B9/B11 field-probe notes"
```

---

## Increment 0 Definition of Done

- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run e2e` all green (the pre-commit gate, B8).
- The pure `domain/` core (types, guards, freshness, state-machine, ports, policy) is 100% unit-tested with the full Interface §3 transition table covered.
- The freshness-native `query-cache` produces the correct `RESULT`/`FAILURE` event for live, within-threshold, beyond-threshold, and no-cache paths — with a live answer never demoted.
- The mock repository drives all six states end-to-end through the real domain core; the Playwright sweep proves **no blank screen** in any state.
- The no-cache proxy exists and strips mall-only fields; B9 (iOS Safari PWA) and B11 (CORS/proxy) probe outcomes are recorded in `docs/notes/field-probe-inc0.md`.
- Data-owner-unresolved values sit behind `DataOwnerPolicy` marked `provisional: true`; no app-level guess was committed.

**Next:** the Increment 1 plan (`2026-07-13-increment-1-flow-1-availability-check.md`) consumes these exact interfaces to build the real `newIntSelStr` adapter, the final Flow-1 copy and card anatomy, the three entry paths, the AI interpretation layer, the store-selection sheet, and the D083 glass finish.
