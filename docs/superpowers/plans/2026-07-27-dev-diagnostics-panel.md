# On-Screen Diagnostics Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a `?debug=1`-gated on-screen diagnostics bar that reports camera, decoder, app-state and network facts without a browser console, then fix the `getUserMedia` resolution constraint and measure the change with it.

**Architecture:** A singleton diagnostics bus (`src/diagnostics/`) that adapters publish observations into and a lazily-loaded bottom bar subscribes to via `useSyncExternalStore`. App state is NOT republished onto the bus — the panel reads Zustand directly. Every publish is a no-op unless the debug flag resolved true at module init, and the panel component itself is a `lazy()` chunk so a disabled build never downloads it.

**Tech Stack:** React 18.3 (`useSyncExternalStore`, `lazy`/`Suspense`), TypeScript strict, Zustand 4, Vitest + Testing Library, Playwright, Biome, Vite 5.

**Spec:** [`../specs/2026-07-27-dev-diagnostics-panel-design.md`](../specs/2026-07-27-dev-diagnostics-panel-design.md)

## Global Constraints

- **No fabrication.** An unmeasured value renders as an explicit marker, never as a plausible default. `nativePolls: null` → `측정 불가 (zxing 내부 루프)`. Track keys absent from `getSettings()` → `미보고`. `supportedFormats: null` (query failed/absent) and `[]` (supported-none) must render as **different** strings.
- **Diagnostics never change app behaviour.** No judgement, state transition, request payload, or response may differ because the panel is on. The instrumented fetch returns the response object unchanged and re-throws the original error.
- **No secrets, no bodies.** Network entries carry `pathname` + status + duration only. Never query strings, headers, request/response bodies. Camera errors carry `error.name` only — never `message` or stack.
- **Disabled = zero cost.** `publishScanner` / `publishNetwork` / `beginScannerRun` return on line 1 when the flag is false. The panel module is never imported when disabled.
- **Nothing throws.** `resolveDebugEnabled`, every `publish*`, `collectEnvironment` and the track reader swallow their own failures and resolve to `null`/false. A diagnostics failure must never break the app.
- **`getSnapshot()` returns a stable reference** between publishes. Returning a fresh object per call causes an infinite React render loop.
- **Copy: `ideal` only.** The §8 constraint fix uses `width/height: { ideal: … }`. `exact` or `min` would raise `OverconstrainedError` on cameras that cannot hit the target, converting a blurry-but-working camera into total failure — the opposite of the owner's 2026-07-27 decision not to exclude desktops.
- **Language:** code, identifiers, comments and commit messages in English. User-visible panel strings in Korean.
- **Verification gate for every task:** `npm test` (Vitest), `npm run typecheck`, `npm run lint` must all pass before commit.
- **Local only.** No push, no deploy, no PR — the ToS/robots gate has not cleared.

---

## File Structure

**Create**

| File | Responsibility |
|---|---|
| `src/diagnostics/enabled.ts` | Resolve + persist the `?debug=1` flag once at module init |
| `src/diagnostics/enabled.test.ts` | Tests for the above |
| `src/diagnostics/bus.ts` | Snapshot store: publish / subscribe / getSnapshot, no-op when disabled |
| `src/diagnostics/bus.test.ts` | Tests for the above |
| `src/diagnostics/report.ts` | Pure formatters: `collectEnvironment`, `summaryLine`, `buildReport` |
| `src/diagnostics/report.test.ts` | Tests for the above |
| `src/ui/components/DiagnosticsBar.tsx` | The bottom bar (default export, for `lazy`) |
| `src/ui/components/DiagnosticsBar.test.tsx` | Tests for the above |
| `src/styles/diagnostics.css` | Panel styles, imported by the component so it lands in the lazy chunk |

**Modify**

| File | Change |
|---|---|
| `src/adapters/barcode/browserScanner.ts` | Publish observations; extract `scan()` body so the outcome is published once |
| `src/adapters/barcode/browserScanner.test.ts` | Add instrumentation tests |
| `src/adapters/composition.ts` | Add `createDiagnosticFetch`; inject into the four PROD vendor factories |
| `src/adapters/composition.test.ts` | Add instrumentation tests |
| `src/main.tsx` | Lazily mount the bar as a sibling of `<AvailabilitySurface />` |
| `test/e2e/interactive.spec.ts` | E2E: bar present with `?debug=1`, absent without |
| `docs/notes/open-questions.md` | Record §B31 |
| `docs/HANDOFF.md` | Refresh the resume record |

---

## Task 1: Debug flag resolution

**Files:**
- Create: `src/diagnostics/enabled.ts`
- Test: `src/diagnostics/enabled.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `DEBUG_PARAM: 'debug'`, `DEBUG_STORAGE_KEY: 'daiso-finder:debug'`, `resolveDebugEnabled(search: string, storage: Storage | null): boolean`, `isDiagnosticsEnabled(): boolean`.

**Context:** `?debug=1` must survive in-app navigation, so it is mirrored into `sessionStorage`. `?debug=0` is the explicit off switch. Safari private mode can throw on storage access — that must not break booting.

- [ ] **Step 1: Write the failing test**

```ts
// src/diagnostics/enabled.test.ts
import { DEBUG_STORAGE_KEY, resolveDebugEnabled } from './enabled';

function memoryStorage(seed: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

function throwingStorage(): Storage {
  return {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
    removeItem: () => {
      throw new Error('blocked');
    },
    clear: () => {},
    key: () => null,
    length: 0,
  } as unknown as Storage;
}

test('?debug=1 enables and persists', () => {
  const storage = memoryStorage();
  expect(resolveDebugEnabled('?debug=1', storage)).toBe(true);
  expect(storage.getItem(DEBUG_STORAGE_KEY)).toBe('1');
});

test('?debug=0 disables and clears the persisted flag', () => {
  const storage = memoryStorage({ [DEBUG_STORAGE_KEY]: '1' });
  expect(resolveDebugEnabled('?debug=0', storage)).toBe(false);
  expect(storage.getItem(DEBUG_STORAGE_KEY)).toBeNull();
});

test('no parameter falls back to the persisted flag', () => {
  expect(resolveDebugEnabled('', memoryStorage({ [DEBUG_STORAGE_KEY]: '1' }))).toBe(true);
  expect(resolveDebugEnabled('', memoryStorage())).toBe(false);
});

test('an unrelated parameter value does not enable', () => {
  expect(resolveDebugEnabled('?debug=yes', memoryStorage())).toBe(false);
});

// Safari private mode throws on sessionStorage access. The URL parameter must still decide, and the
// call must not propagate — a diagnostics helper may never be the reason the app fails to boot.
test('storage failures are swallowed and the URL parameter still decides', () => {
  expect(() => resolveDebugEnabled('?debug=1', throwingStorage())).not.toThrow();
  expect(resolveDebugEnabled('?debug=1', throwingStorage())).toBe(true);
  expect(resolveDebugEnabled('', throwingStorage())).toBe(false);
});

test('a null storage is accepted', () => {
  expect(resolveDebugEnabled('?debug=1', null)).toBe(true);
  expect(resolveDebugEnabled('', null)).toBe(false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/diagnostics/enabled.test.ts`
Expected: FAIL — `Failed to resolve import "./enabled"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/diagnostics/enabled.ts
// Whether the on-screen diagnostics panel is active. Deliberately NOT `import.meta.env.DEV`: the DEV
// build wires the mock scanner (composition.ts), so the camera/decoder facts the panel exists to show
// only exist in PROD builds — `npm run dev:live` and real devices, where no console is available.
export const DEBUG_PARAM = 'debug';
export const DEBUG_STORAGE_KEY = 'daiso-finder:debug';

function safeGet(storage: Storage | null): string | null {
  try {
    return storage?.getItem(DEBUG_STORAGE_KEY) ?? null;
  } catch {
    return null; // Safari private mode and friends
  }
}

function safeSet(storage: Storage | null, value: string): void {
  try {
    storage?.setItem(DEBUG_STORAGE_KEY, value);
  } catch {
    // Persistence is a convenience; the URL parameter already decided this run.
  }
}

function safeRemove(storage: Storage | null): void {
  try {
    storage?.removeItem(DEBUG_STORAGE_KEY);
  } catch {
    // As above.
  }
}

/**
 * Resolve the flag and mirror it into storage. Not pure — it writes — which is why `storage` is a
 * parameter: the tests exercise every branch without touching a real one.
 */
export function resolveDebugEnabled(search: string, storage: Storage | null): boolean {
  const requested = new URLSearchParams(search).get(DEBUG_PARAM);
  if (requested === '1') {
    safeSet(storage, '1');
    return true;
  }
  if (requested === '0') {
    safeRemove(storage);
    return false;
  }
  return safeGet(storage) === '1';
}

function bootStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

// Resolved ONCE, at module init. The flag cannot change mid-session, so every consumer sees one answer
// and no consumer has to re-read the URL.
const enabled = typeof window === 'undefined' ? false : resolveDebugEnabled(window.location.search, bootStorage());

export function isDiagnosticsEnabled(): boolean {
  return enabled;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/diagnostics/enabled.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Run the full gate**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/diagnostics/enabled.ts src/diagnostics/enabled.test.ts
git commit -m "feat(diagnostics): resolve the ?debug=1 panel flag once at boot"
```

---

## Task 2: Diagnostics bus

**Files:**
- Create: `src/diagnostics/bus.ts`
- Test: `src/diagnostics/bus.test.ts`

**Interfaces:**
- Consumes: `isDiagnosticsEnabled()` from Task 1; `ScanOutcome` from `src/domain/ports.ts`.
- Produces:
  - `interface TrackFacts { width: number | null; height: number | null; frameRate: number | null; facingMode: string | null; deviceId: string | null }`
  - `interface ScannerDiagnostics { startedAt: number | null; hasBarcodeDetector: boolean | null; supportedFormats: string[] | null; decoderPath: 'native' | 'zxing' | 'none' | null; decoderReadyMs: number | null; cameraError: string | null; track: TrackFacts | null; nativePolls: number | null; outcome: ScanOutcome['kind'] | null }`
  - `interface NetworkEntry { path: string; status: number | 'error'; ms: number }`
  - `interface DiagnosticsSnapshot { scanner: ScannerDiagnostics; network: NetworkEntry[] }`
  - `NETWORK_LIMIT = 5`, `beginScannerRun(startedAt: number): void`, `publishScanner(patch: Partial<ScannerDiagnostics>): void`, `publishNetwork(entry: NetworkEntry): void`, `getSnapshot(): DiagnosticsSnapshot`, `subscribe(listener: () => void): () => void`, `resetDiagnostics(): void`.

**Context:** `isSecureContext` and `mediaDevices` presence are deliberately NOT in `ScannerDiagnostics` — they are static facts owned solely by `collectEnvironment()` (Task 3). Reporting the same fact from two places means that when they disagree, neither is trustworthy.

- [ ] **Step 1: Write the failing test**

```ts
// src/diagnostics/bus.test.ts
// The flag is frozen at module init in production, so the tests swap it through vi.mock — the same
// idiom AvailabilitySurface.test.tsx uses for the composition root.
const flag = vi.hoisted(() => ({ enabled: true }));
vi.mock('./enabled', () => ({ isDiagnosticsEnabled: () => flag.enabled }));

import {
  NETWORK_LIMIT,
  beginScannerRun,
  getSnapshot,
  publishNetwork,
  publishScanner,
  resetDiagnostics,
  subscribe,
} from './bus';

beforeEach(() => {
  flag.enabled = true;
  resetDiagnostics();
});

test('a fresh bus reports nothing observed', () => {
  const snapshot = getSnapshot();
  expect(snapshot.scanner.startedAt).toBeNull();
  expect(snapshot.scanner.decoderPath).toBeNull();
  expect(snapshot.network).toEqual([]);
});

test('publishScanner merges a patch without clearing earlier fields', () => {
  publishScanner({ decoderPath: 'zxing' });
  publishScanner({ decoderReadyMs: 412 });
  expect(getSnapshot().scanner).toMatchObject({ decoderPath: 'zxing', decoderReadyMs: 412 });
});

// useSyncExternalStore compares the snapshot by reference. A getSnapshot() that builds a new object
// every call re-renders forever, so identity stability is a contract, not an optimisation.
test('getSnapshot returns the same reference until something is published', () => {
  const first = getSnapshot();
  expect(getSnapshot()).toBe(first);
  publishScanner({ decoderPath: 'native' });
  expect(getSnapshot()).not.toBe(first);
});

test('beginScannerRun clears the previous run and stamps the start', () => {
  publishScanner({ decoderPath: 'zxing', outcome: 'failed', nativePolls: 7 });
  beginScannerRun(1000);
  expect(getSnapshot().scanner).toMatchObject({
    startedAt: 1000,
    decoderPath: null,
    outcome: null,
    nativePolls: null,
  });
});

test('the network log keeps only the most recent NETWORK_LIMIT entries, newest last', () => {
  for (let i = 0; i < NETWORK_LIMIT + 3; i += 1) {
    publishNetwork({ path: `/api/${i}`, status: 200, ms: i });
  }
  const { network } = getSnapshot();
  expect(network).toHaveLength(NETWORK_LIMIT);
  expect(network[network.length - 1]?.path).toBe(`/api/${NETWORK_LIMIT + 2}`);
});

// Defence in depth at the single choke point: even if a caller hands over a full URL, a query string
// can carry a search term or identifier and must never reach a copyable report.
test('publishNetwork stores the pathname only, stripping any query string', () => {
  publishNetwork({ path: '/api/search?keyword=secret&uid=abc', status: 200, ms: 5 });
  expect(getSnapshot().network[0]?.path).toBe('/api/search');
});

test('subscribers are notified on publish and stop after unsubscribing', () => {
  let calls = 0;
  const unsubscribe = subscribe(() => {
    calls += 1;
  });
  publishScanner({ decoderPath: 'native' });
  expect(calls).toBe(1);
  unsubscribe();
  publishScanner({ decoderPath: 'zxing' });
  expect(calls).toBe(1);
});

test('every publish is a no-op while disabled', () => {
  flag.enabled = false;
  const before = getSnapshot();
  beginScannerRun(1);
  publishScanner({ decoderPath: 'native' });
  publishNetwork({ path: '/api/x', status: 200, ms: 1 });
  expect(getSnapshot()).toBe(before);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/diagnostics/bus.test.ts`
Expected: FAIL — `Failed to resolve import "./bus"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/diagnostics/bus.ts
// Single-process observation store for the ?debug=1 panel. Adapters publish facts; the panel subscribes.
// App state does NOT flow through here — Zustand already owns it, and duplicating it would create a
// second, drifting truth.
import type { ScanOutcome } from '../domain/ports';
import { isDiagnosticsEnabled } from './enabled';

export interface TrackFacts {
  width: number | null;
  height: number | null;
  frameRate: number | null;
  facingMode: string | null;
  deviceId: string | null;
}

export interface ScannerDiagnostics {
  startedAt: number | null;
  hasBarcodeDetector: boolean | null;
  // null = the support query failed or the API is absent; [] = the platform explicitly supports none.
  // Collapsing the two would turn "we don't know" into "we know it's empty".
  supportedFormats: string[] | null;
  decoderPath: 'native' | 'zxing' | 'none' | null;
  decoderReadyMs: number | null;
  cameraError: string | null; // error.name only — never message or stack
  track: TrackFacts | null;
  nativePolls: number | null; // null on the zxing path: its retries happen inside the library
  outcome: ScanOutcome['kind'] | null;
}

export interface NetworkEntry {
  path: string; // pathname only
  status: number | 'error';
  ms: number;
}

export interface DiagnosticsSnapshot {
  scanner: ScannerDiagnostics;
  network: NetworkEntry[];
}

export const NETWORK_LIMIT = 5;

function emptyScanner(): ScannerDiagnostics {
  return {
    startedAt: null,
    hasBarcodeDetector: null,
    supportedFormats: null,
    decoderPath: null,
    decoderReadyMs: null,
    cameraError: null,
    track: null,
    nativePolls: null,
    outcome: null,
  };
}

let snapshot: DiagnosticsSnapshot = { scanner: emptyScanner(), network: [] };
const listeners = new Set<() => void>();

// The ONLY writer. Replacing the snapshot object here — and nowhere else — is what makes getSnapshot()
// reference-stable between publishes, which useSyncExternalStore requires.
function commit(next: DiagnosticsSnapshot): void {
  snapshot = next;
  for (const listener of [...listeners]) listener();
}

export function beginScannerRun(startedAt: number): void {
  if (!isDiagnosticsEnabled()) return;
  commit({ ...snapshot, scanner: { ...emptyScanner(), startedAt } });
}

export function publishScanner(patch: Partial<ScannerDiagnostics>): void {
  if (!isDiagnosticsEnabled()) return;
  commit({ ...snapshot, scanner: { ...snapshot.scanner, ...patch } });
}

export function publishNetwork(entry: NetworkEntry): void {
  if (!isDiagnosticsEnabled()) return;
  const path = entry.path.split('?')[0] ?? entry.path;
  commit({ ...snapshot, network: [...snapshot.network, { ...entry, path }].slice(-NETWORK_LIMIT) });
}

export function getSnapshot(): DiagnosticsSnapshot {
  return snapshot;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test-only reset. Production has exactly one bus for the life of the page. */
export function resetDiagnostics(): void {
  snapshot = { scanner: emptyScanner(), network: [] };
  listeners.clear();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/diagnostics/bus.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Run the full gate**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/diagnostics/bus.ts src/diagnostics/bus.test.ts
git commit -m "feat(diagnostics): add the observation bus with a stable snapshot reference"
```

---

## Task 3: Report formatting

**Files:**
- Create: `src/diagnostics/report.ts`
- Test: `src/diagnostics/report.test.ts`

**Interfaces:**
- Consumes: `DiagnosticsSnapshot`, `ScannerDiagnostics`, `NetworkEntry` from Task 2.
- Produces:
  - `interface EnvironmentFacts { buildMode: 'PROD' | 'DEV'; adapters: 'live' | 'mock'; protocol: string; host: string; secureContext: boolean; hasMediaDevices: boolean; userAgent: string }`
  - `interface AppFacts { state: string; query: string | null; origin: string | null; storeId: string | null; storeName: string | null; candidateCount: number | null; freshnessAgeMs: number | null }`
  - `UNMEASURED`, `UNREPORTED`, `QUERY_FAILED`, `SUPPORTS_NONE`, `NOT_STARTED` string constants
  - `collectEnvironment(): EnvironmentFacts`
  - `summaryLine(scanner: ScannerDiagnostics, now: number): string`
  - `buildReport(env: EnvironmentFacts, snapshot: DiagnosticsSnapshot, app: AppFacts, now: number): string`

**Context:** This file is where the no-fabrication rule is enforced, so it is pure and DOM-free — the honesty rules are asserted directly on strings.

- [ ] **Step 1: Write the failing test**

```ts
// src/diagnostics/report.test.ts
import type { DiagnosticsSnapshot } from './bus';
import {
  NOT_STARTED,
  QUERY_FAILED,
  SUPPORTS_NONE,
  UNMEASURED,
  UNREPORTED,
  type AppFacts,
  type EnvironmentFacts,
  buildReport,
  collectEnvironment,
  summaryLine,
} from './report';

const env: EnvironmentFacts = {
  buildMode: 'PROD',
  adapters: 'live',
  protocol: 'http:',
  host: '192.168.0.10:8790',
  secureContext: false,
  hasMediaDevices: false,
  userAgent: 'TestAgent/1.0',
};

const app: AppFacts = {
  state: 'success',
  query: '밀폐용기',
  origin: 'scan',
  storeId: '001',
  storeName: '명동역점',
  candidateCount: null,
  freshnessAgeMs: 4200,
};

function snapshotWith(scanner: Partial<DiagnosticsSnapshot['scanner']>): DiagnosticsSnapshot {
  return {
    scanner: {
      startedAt: 1000,
      hasBarcodeDetector: false,
      supportedFormats: null,
      decoderPath: 'zxing',
      decoderReadyMs: 412,
      cameraError: null,
      track: { width: 640, height: 480, frameRate: 30, facingMode: null, deviceId: 'cam-1' },
      nativePolls: null,
      outcome: null,
      ...scanner,
    },
    network: [{ path: '/api/availability', status: 200, ms: 318 }],
  };
}

test('summaryLine reports the decoder, resolution, elapsed time and status', () => {
  expect(summaryLine(snapshotWith({}).scanner, 12_400)).toBe('zxing · 640×480 · 11.4s · 진행 중');
});

test('summaryLine says so before any scan has started', () => {
  expect(summaryLine(snapshotWith({ startedAt: null }).scanner, 5000)).toBe(NOT_STARTED);
});

test('summaryLine shows the final outcome once the run ends', () => {
  expect(summaryLine(snapshotWith({ outcome: 'decoded' }).scanner, 2000)).toContain('decoded');
});

// The zxing reader retries inside decodeOnceFromStream, so we genuinely cannot count its attempts.
// Printing a number here would invent evidence that a §B9 field decision then rests on.
test('an unmeasurable poll count is named as unmeasurable, not zero', () => {
  const report = buildReport(env, snapshotWith({ nativePolls: null }), app, 2000);
  expect(report).toContain(UNMEASURED);
  expect(report).not.toMatch(/시도 횟수: 0/);
});

test('a measured poll count is printed', () => {
  expect(buildReport(env, snapshotWith({ nativePolls: 14 }), app, 2000)).toContain('14');
});

// "the query failed" and "the platform supports nothing" are different facts about the device.
test('a failed format query and an empty format list render differently', () => {
  const failed = buildReport(env, snapshotWith({ supportedFormats: null }), app, 2000);
  const empty = buildReport(env, snapshotWith({ supportedFormats: [] }), app, 2000);
  expect(failed).toContain(QUERY_FAILED);
  expect(empty).toContain(SUPPORTS_NONE);
  expect(failed).not.toBe(empty);
});

test('the format list and its data_matrix membership are both reported', () => {
  const report = buildReport(env, snapshotWith({ supportedFormats: ['qr_code', 'data_matrix'] }), app, 2000);
  expect(report).toContain('qr_code, data_matrix');
  expect(report).toContain('data_matrix: 포함');
});

test('track keys the browser did not report are named as unreported', () => {
  const report = buildReport(env, snapshotWith({}), app, 2000);
  expect(report).toContain(`facingMode: ${UNREPORTED}`);
});

test('the report carries environment, app state and network lines', () => {
  const report = buildReport(env, snapshotWith({}), app, 2000);
  expect(report).toContain('PROD');
  expect(report).toContain('192.168.0.10:8790');
  expect(report).toContain('명동역점');
  expect(report).toContain('/api/availability');
  expect(report).toContain('200');
});

// The report is copied and pasted into notes; a leaked query string would carry a search term.
test('the report contains no query string from a network path', () => {
  const withQuery: DiagnosticsSnapshot = {
    ...snapshotWith({}),
    network: [{ path: '/api/search', status: 200, ms: 10 }],
  };
  expect(buildReport(env, withQuery, app, 2000)).not.toContain('?');
});

test('collectEnvironment reads the live globals without throwing', () => {
  const facts = collectEnvironment();
  expect(facts.buildMode).toBe('DEV'); // Vitest runs the DEV env
  expect(facts.adapters).toBe('mock');
  expect(typeof facts.userAgent).toBe('string');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/diagnostics/report.test.ts`
Expected: FAIL — `Failed to resolve import "./report"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/diagnostics/report.ts
// Pure formatting for the diagnostics panel. DOM-free on purpose: the no-fabrication rules live here,
// so they are asserted directly on the produced strings.
import type { DiagnosticsSnapshot, NetworkEntry, ScannerDiagnostics, TrackFacts } from './bus';

export const UNMEASURED = '측정 불가 (zxing 내부 루프)';
export const UNREPORTED = '미보고';
export const QUERY_FAILED = '질의 실패';
export const SUPPORTS_NONE = '지원 없음';
export const NOT_STARTED = '스캔 전';
export const IN_PROGRESS = '진행 중';

export interface EnvironmentFacts {
  buildMode: 'PROD' | 'DEV';
  adapters: 'live' | 'mock';
  protocol: string;
  host: string;
  secureContext: boolean;
  hasMediaDevices: boolean;
  userAgent: string;
}

export interface AppFacts {
  state: string;
  query: string | null;
  origin: string | null;
  storeId: string | null;
  storeName: string | null;
  candidateCount: number | null;
  freshnessAgeMs: number | null;
}

export function collectEnvironment(): EnvironmentFacts {
  const prod = import.meta.env.PROD;
  return {
    buildMode: prod ? 'PROD' : 'DEV',
    // Derived from the same flag composition.ts branches on, so this line cannot drift from the wiring.
    adapters: prod ? 'live' : 'mock',
    protocol: window.location.protocol,
    host: window.location.host,
    secureContext: window.isSecureContext === true,
    hasMediaDevices: typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia),
    userAgent: navigator.userAgent,
  };
}

function value(v: string | number | null | undefined): string {
  return v === null || v === undefined ? UNREPORTED : String(v);
}

function resolution(track: TrackFacts | null): string {
  if (!track) return '카메라 대기';
  return `${value(track.width)}×${value(track.height)}`;
}

export function summaryLine(scanner: ScannerDiagnostics, now: number): string {
  if (scanner.startedAt === null) return NOT_STARTED;
  const decoder = scanner.decoderPath ?? '준비 중';
  const seconds = ((now - scanner.startedAt) / 1000).toFixed(1);
  const status = scanner.outcome ?? IN_PROGRESS;
  return `${decoder} · ${resolution(scanner.track)} · ${seconds}s · ${status}`;
}

function formats(list: string[] | null): string {
  if (list === null) return QUERY_FAILED;
  if (list.length === 0) return SUPPORTS_NONE;
  return list.join(', ');
}

function dataMatrixMembership(list: string[] | null): string {
  if (list === null) return QUERY_FAILED;
  return list.includes('data_matrix') ? '포함' : '미포함';
}

function trackLines(track: TrackFacts | null): string[] {
  if (!track) return ['  트랙: 없음'];
  return [
    `  해상도: ${value(track.width)}×${value(track.height)}`,
    `  frameRate: ${value(track.frameRate)}`,
    `  facingMode: ${value(track.facingMode)}`,
    `  deviceId: ${value(track.deviceId)}`,
  ];
}

function networkLines(entries: NetworkEntry[]): string[] {
  if (entries.length === 0) return ['  (없음)'];
  return entries.map((e) => `  ${e.path} · ${e.status} · ${e.ms}ms`);
}

export function buildReport(
  env: EnvironmentFacts,
  snapshot: DiagnosticsSnapshot,
  app: AppFacts,
  now: number,
): string {
  const s = snapshot.scanner;
  const elapsed = s.startedAt === null ? NOT_STARTED : `${((now - s.startedAt) / 1000).toFixed(1)}s`;
  return [
    '[환경]',
    `  빌드: ${env.buildMode} · 어댑터: ${env.adapters}`,
    `  주소: ${env.protocol}//${env.host}`,
    `  secureContext: ${env.secureContext} · mediaDevices: ${env.hasMediaDevices}`,
    `  UA: ${env.userAgent}`,
    '',
    '[스캐너]',
    `  BarcodeDetector: ${s.hasBarcodeDetector === null ? UNREPORTED : s.hasBarcodeDetector}`,
    `  지원 포맷: ${formats(s.supportedFormats)}`,
    `  data_matrix: ${dataMatrixMembership(s.supportedFormats)}`,
    `  디코더: ${value(s.decoderPath)} · 준비 ${value(s.decoderReadyMs)}ms`,
    `  카메라 오류: ${value(s.cameraError)}`,
    ...trackLines(s.track),
    `  경과: ${elapsed}`,
    `  시도 횟수: ${s.nativePolls === null ? UNMEASURED : s.nativePolls}`,
    `  결과: ${s.outcome ?? IN_PROGRESS}`,
    '',
    '[앱 상태]',
    `  state: ${app.state}`,
    `  query: ${value(app.query)} · origin: ${value(app.origin)}`,
    `  매장: ${value(app.storeName)} (${value(app.storeId)})`,
    `  후보 수: ${value(app.candidateCount)}`,
    `  캐시 나이: ${app.freshnessAgeMs === null ? UNREPORTED : `${app.freshnessAgeMs}ms`}`,
    '',
    '[네트워크]',
    ...networkLines(snapshot.network),
  ].join('\n');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/diagnostics/report.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Run the full gate**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/diagnostics/report.ts src/diagnostics/report.test.ts
git commit -m "feat(diagnostics): format the report with explicit unmeasured markers"
```

---

## Task 4: Scanner instrumentation

**Files:**
- Modify: `src/adapters/barcode/browserScanner.ts`
- Modify: `src/adapters/barcode/browserScanner.test.ts`

**Interfaces:**
- Consumes: `beginScannerRun`, `publishScanner`, `TrackFacts` from Task 2.
- Produces: `ScannerDeps` gains `now?: () => number` (defaults to `Date.now`). The `ScannerPort` contract and every existing `ScanOutcome` behaviour are unchanged.

**Context:** `createBrowserScanner`'s `scan()` currently has many `return` statements. Rather than adding a publish to each (easy to miss one), extract the existing body verbatim into an inner `runScan` and publish the outcome once at the single new exit. **Do not change any decode, classification, abort or cleanup logic** — the existing tests must keep passing untouched.

- [ ] **Step 1: Write the failing test**

Append to `src/adapters/barcode/browserScanner.test.ts`. Put the `vi.hoisted`/`vi.mock` pair at the TOP of the file (hoisting requirement), keeping all existing tests as they are.

```ts
// --- add at the top of the file, above the existing imports ---
const flag = vi.hoisted(() => ({ enabled: true }));
vi.mock('../../diagnostics/enabled', () => ({ isDiagnosticsEnabled: () => flag.enabled }));

// --- add to the existing imports ---
import { getSnapshot, resetDiagnostics } from '../../diagnostics/bus';

// --- add at the end of the file ---
describe('diagnostics instrumentation', () => {
  beforeEach(() => {
    flag.enabled = true;
    resetDiagnostics();
  });

  function fakeStream(settings: MediaTrackSettings): MediaStream {
    const track = { stop: () => {}, getSettings: () => settings };
    return {
      getTracks: () => [track],
      getVideoTracks: () => [track],
    } as unknown as MediaStream;
  }

  test('the native path publishes its decoder, formats, track settings and poll count', async () => {
    const detect = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ rawValue: '19987' }]);
    const scanner = createBrowserScanner({
      mediaDevices: {
        getUserMedia: async () => fakeStream({ width: 1920, height: 1080, deviceId: 'cam-1' }),
      },
      createNativeDetector: async () => ({ detect }),
      pollIntervalMs: 1,
    });
    const outcome = await scanner.scan({ video: {} as HTMLVideoElement }, new AbortController().signal);
    expect(outcome).toEqual({ kind: 'decoded', value: '19987' });
    const s = getSnapshot().scanner;
    expect(s.decoderPath).toBe('native');
    expect(s.track).toMatchObject({ width: 1920, height: 1080, deviceId: 'cam-1' });
    expect(s.nativePolls).toBeGreaterThanOrEqual(1);
    expect(s.outcome).toBe('decoded');
    expect(s.startedAt).not.toBeNull();
  });

  // The zxing reader retries inside the library, so nativePolls must stay null rather than report 0.
  test('the zxing path publishes its decoder and leaves the poll count unmeasured', async () => {
    const scanner = createBrowserScanner({
      mediaDevices: { getUserMedia: async () => fakeStream({ width: 640, height: 480 }) },
      createNativeDetector: async () => null,
      loadFallbackDecoder: async () => ({ decode: async () => '19987', cancel: () => {} }),
    });
    await scanner.scan({ video: {} as HTMLVideoElement }, new AbortController().signal);
    const s = getSnapshot().scanner;
    expect(s.decoderPath).toBe('zxing');
    expect(s.nativePolls).toBeNull();
    expect(s.track).toMatchObject({ width: 640, height: 480 });
  });

  test('a camera rejection publishes the error name only', async () => {
    const err = new Error('user said no, and this message must not be published');
    err.name = 'NotAllowedError';
    const scanner = createBrowserScanner({
      mediaDevices: {
        getUserMedia: async () => {
          throw err;
        },
      },
      createNativeDetector: async () => ({ detect: async () => [] }),
    });
    await scanner.scan({ video: {} as HTMLVideoElement }, new AbortController().signal);
    const s = getSnapshot().scanner;
    expect(s.cameraError).toBe('NotAllowedError');
    expect(s.outcome).toBe('permissionDenied');
  });

  test('having no usable decoder publishes decoderPath none', async () => {
    const scanner = createBrowserScanner({
      mediaDevices: { getUserMedia: async () => fakeStream({}) },
      createNativeDetector: async () => null,
      loadFallbackDecoder: async () => null,
    });
    const outcome = await scanner.scan({ video: {} as HTMLVideoElement }, new AbortController().signal);
    expect(outcome).toEqual({ kind: 'unsupported' });
    expect(getSnapshot().scanner.decoderPath).toBe('none');
  });

  test('a stream whose tracks expose no getSettings publishes a null track instead of throwing', async () => {
    const scanner = createBrowserScanner({
      mediaDevices: {
        getUserMedia: async () =>
          ({ getTracks: () => [{ stop: () => {} }] }) as unknown as MediaStream,
      },
      createNativeDetector: async () => null,
      loadFallbackDecoder: async () => ({ decode: async () => '19987', cancel: () => {} }),
    });
    const outcome = await scanner.scan({ video: {} as HTMLVideoElement }, new AbortController().signal);
    expect(outcome).toEqual({ kind: 'decoded', value: '19987' });
    expect(getSnapshot().scanner.track).toBeNull();
  });

  test('nothing is published while diagnostics are disabled', async () => {
    flag.enabled = false;
    const scanner = createBrowserScanner({
      mediaDevices: { getUserMedia: async () => fakeStream({ width: 640, height: 480 }) },
      createNativeDetector: async () => null,
      loadFallbackDecoder: async () => ({ decode: async () => '19987', cancel: () => {} }),
    });
    await scanner.scan({ video: {} as HTMLVideoElement }, new AbortController().signal);
    expect(getSnapshot().scanner.startedAt).toBeNull();
  });
});
```

Note on coverage: these tests inject `createNativeDetector`, which bypasses `defaultNativeDetector` — so `hasBarcodeDetector` and `supportedFormats` (published in step 3h) are exercised by the file's **existing** `defaultNativeDetector` tests, not by the block above. Do not add an assertion for them here; it would pass vacuously against the injected double.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/adapters/barcode/browserScanner.test.ts`
Expected: FAIL — `getSnapshot().scanner.decoderPath` is `null` because nothing publishes yet.

- [ ] **Step 3: Write the implementation**

Apply these edits to `src/adapters/barcode/browserScanner.ts`:

3a. Add the import beneath the existing `ports` import:

```ts
import { beginScannerRun, publishScanner, type TrackFacts } from '../../diagnostics/bus';
```

3b. Add `now` to `ScannerDeps`:

```ts
export interface ScannerDeps {
  mediaDevices?: Pick<MediaDevices, 'getUserMedia'> | undefined;
  createNativeDetector?: () => Promise<NativeDetector | null>;
  loadFallbackDecoder?: () => Promise<FallbackDecoder | null>;
  pollIntervalMs?: number;
  now?: () => number; // injectable so decoderReadyMs is assertable without a real clock
}
```

3c. In `createBrowserScanner`, add `const now = deps.now ?? Date.now;` beside the other dep resolutions, then replace the returned object with:

```ts
  // The scan body keeps its many exit points; wrapping it means the outcome is published at exactly one
  // place, so a future early return cannot silently skip instrumentation.
  const runScan = async (target: ScanTarget, signal: AbortSignal): Promise<ScanOutcome> => {
    // MOVE, do not retype: cut the existing body of `scan()` — every line between
    // `async scan(target, signal) {` and its closing brace, currently browserScanner.ts:58-104 —
    // and paste it here verbatim. Steps 3d-3e then add publish calls to three specific places inside
    // it. Retyping risks silently altering the abort/cleanup ordering that the existing tests pin.
  };

  return {
    async scan(target, signal) {
      beginScannerRun(now());
      const outcome = await runScan(target, signal);
      publishScanner({ outcome: outcome.kind });
      return outcome;
    },
  };
```

3d. Inside `runScan`, after the decoder resolution block and before `if (signal.aborted)`, record which decoder won and how long it took. Capture `startedAt` immediately before `native = await …`:

```ts
      const decoderStart = now();
      let native: NativeDetector | null = null;
      let fallback: FallbackDecoder | null = null;
      try {
        native = await untilAbort(createNative(), signal);
        if (!signal.aborted && !native) fallback = await untilAbort(loadFallback(), signal);
      } catch {
        publishScanner({ decoderPath: 'none', decoderReadyMs: now() - decoderStart });
        return { kind: 'failed' };
      }
      publishScanner({
        decoderPath: native ? 'native' : fallback ? 'zxing' : 'none',
        decoderReadyMs: now() - decoderStart,
      });
```

3e. In the `getUserMedia` block, publish the error name on rejection and the track facts on success:

```ts
      let stream: MediaStream;
      try {
        stream = await media.getUserMedia({ video: { facingMode: 'environment' } });
      } catch (err) {
        publishScanner({ cameraError: (err as { name?: string } | null)?.name ?? 'UnknownError' });
        return { kind: isPermissionDenial(err) ? 'permissionDenied' : 'failed' };
      }
      publishScanner({ track: readTrackFacts(stream) });
```

3f. Add the track reader near the other helpers:

```ts
// Observation only: a stream shaped differently than expected (an older browser, a test double) must
// degrade to "we didn't observe it" rather than break a scan that would otherwise have worked.
function readTrackFacts(stream: MediaStream): TrackFacts | null {
  try {
    const track = stream.getVideoTracks?.()[0];
    if (!track?.getSettings) return null;
    const s = track.getSettings();
    return {
      width: s.width ?? null,
      height: s.height ?? null,
      frameRate: s.frameRate ?? null,
      facingMode: s.facingMode ?? null,
      deviceId: s.deviceId ?? null,
    };
  } catch {
    return null;
  }
}
```

3g. In `scanWithNative`, count the polls. Add `let polls = 0;` beside `let settled = false;`, and as the FIRST statement inside the `setInterval` callback:

```ts
      polls += 1;
      publishScanner({ nativePolls: polls });
```

3h. In `defaultNativeDetector`, publish what the platform actually reported. This is the only place that knows:

```ts
async function defaultNativeDetector(): Promise<NativeDetector | null> {
  const ctor = (/* unchanged */) .BarcodeDetector;
  publishScanner({ hasBarcodeDetector: Boolean(ctor) });
  if (!ctor) return null;
  try {
    const supported = await ctor.getSupportedFormats?.();
    publishScanner({ supportedFormats: supported ?? null });
    if (!supported?.includes('data_matrix')) return null;
    return new ctor({ formats: [...SCAN_FORMATS] });
  } catch {
    publishScanner({ supportedFormats: null });
    return null;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/adapters/barcode/browserScanner.test.ts`
Expected: PASS — the new `describe` block AND every pre-existing test in the file. If any pre-existing test changed behaviour, the refactor was not verbatim: revert and redo step 3c.

- [ ] **Step 5: Run the full gate**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/adapters/barcode/browserScanner.ts src/adapters/barcode/browserScanner.test.ts
git commit -m "feat(diagnostics): publish decoder path, track settings and poll count from the scanner"
```

---

## Task 5: Network instrumentation

**Files:**
- Modify: `src/adapters/composition.ts`
- Modify: `src/adapters/composition.test.ts`

**Interfaces:**
- Consumes: `publishNetwork` from Task 2.
- Produces: `createDiagnosticFetch(now?: () => number): DiagnosticFetch` exported from `composition.ts`.

**Context — the real risk in this task:** the four vendor factories declare `FetchLike` **separately and not identically**. `storeStockRepository.ts:8` uses `init: { method; headers; body; signal?: AbortSignal }` returning `Promise<Response>`; `storeDirectory.ts:8` and `productSearchRepository.ts:7` use `init: { method; headers; body }` returning `Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>`. One implementation typed with the widest `init` (including the optional `signal`) and returning `Promise<Response>` is assignable to all four — parameters are checked contravariantly and `Response` structurally satisfies `{ ok; status; json() }`. `npm run typecheck` is the proof; do not weaken it with `as unknown as`.

- [ ] **Step 1: Write the failing test**

Append to `src/adapters/composition.test.ts` (add the `vi.hoisted`/`vi.mock` pair at the TOP of the file):

```ts
// --- top of file ---
const flag = vi.hoisted(() => ({ enabled: true }));
vi.mock('../diagnostics/enabled', () => ({ isDiagnosticsEnabled: () => flag.enabled }));

// --- add to the imports ---
import { createDiagnosticFetch } from './composition';
import { getSnapshot, resetDiagnostics } from '../diagnostics/bus';

// --- add at the end of the file ---
describe('diagnostic fetch', () => {
  beforeEach(() => {
    flag.enabled = true;
    resetDiagnostics();
  });

  const init = { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' };

  test('publishes path, status and duration and returns the response untouched', async () => {
    const original = globalThis.fetch;
    const response = new Response('{}', { status: 200 });
    globalThis.fetch = (async () => response) as typeof fetch;
    let t = 1000;
    try {
      const result = await createDiagnosticFetch(() => (t += 25))('/api/availability', init);
      expect(result).toBe(response); // identity: instrumentation must not wrap or clone
      expect(getSnapshot().network[0]).toEqual({ path: '/api/availability', status: 200, ms: 25 });
    } finally {
      globalThis.fetch = original;
    }
  });

  test('publishes an error entry and re-throws the original error', async () => {
    const original = globalThis.fetch;
    const boom = new Error('offline');
    globalThis.fetch = (async () => {
      throw boom;
    }) as typeof fetch;
    try {
      await expect(createDiagnosticFetch(() => 0)('/api/stores', init)).rejects.toBe(boom);
      expect(getSnapshot().network[0]?.status).toBe('error');
    } finally {
      globalThis.fetch = original;
    }
  });

  test('the PROD availability adapter routes through the instrumented fetch', async () => {
    vi.stubEnv('PROD', true);
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ noMatch: true }), { status: 200 })) as typeof fetch;
    try {
      await createStoreStockRepository()
        .query({ strCd: '1', strNm: 'x' }, { keyword: 'x' })
        .catch(() => {});
      expect(getSnapshot().network.some((e) => e.path === '/api/availability')).toBe(true);
    } finally {
      globalThis.fetch = original;
      vi.unstubAllEnvs();
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/adapters/composition.test.ts`
Expected: FAIL — `createDiagnosticFetch` is not exported.

- [ ] **Step 3: Write the implementation**

Add to `src/adapters/composition.ts`:

```ts
import { publishNetwork } from '../diagnostics/bus';

// The widest of the four vendor FetchLike shapes: the optional `signal` and the concrete `Response`
// make one implementation assignable to all of them (see the task note). Declared here rather than
// imported so composition.ts does not depend on one adapter's type for all four.
type DiagnosticFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<Response>;

// Observation only: the response object is returned by identity and a failure re-throws the original
// error, so nothing downstream can behave differently because diagnostics are on.
export function createDiagnosticFetch(now: () => number = Date.now): DiagnosticFetch {
  return async (url, init) => {
    const started = now();
    try {
      const response = await fetch(url, init);
      publishNetwork({ path: url, status: response.status, ms: now() - started });
      return response;
    } catch (err) {
      publishNetwork({ path: url, status: 'error', ms: now() - started });
      throw err;
    }
  };
}

const diagnosticFetch = createDiagnosticFetch();
```

Then pass it to each PROD factory:

```ts
export function createStoreStockRepository(): StoreStockRepository {
  return import.meta.env.PROD
    ? createDaisoStoreStockRepository({ fetchImpl: diagnosticFetch })
    : createKeywordMockRepository();
}

export function createStoreDirectory(): StoreDirectoryPort {
  return import.meta.env.PROD
    ? createDaisoStoreDirectory({ fetchImpl: diagnosticFetch })
    : createMockStoreDirectory();
}

export function createGeolocation(): GeolocationPort {
  const fetchNearby = import.meta.env.PROD
    ? createDaisoNearbyFetch({ fetchImpl: diagnosticFetch })
    : async () => mockStores;
  return createBrowserGeolocation(navigator, fetchNearby);
}

export function createProductSearch(): ProductSearchPort {
  return import.meta.env.PROD
    ? createDaisoProductSearch({ fetchImpl: diagnosticFetch })
    : createMockProductSearch();
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/adapters/composition.test.ts`
Expected: PASS — the new `describe` block AND every pre-existing test.

- [ ] **Step 5: Run the full gate**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all pass. A `typecheck` error on any `fetchImpl:` line means the shared `DiagnosticFetch` type is not assignable to that factory's `FetchLike` — fix the type, do not cast.

- [ ] **Step 6: Commit**

```bash
git add src/adapters/composition.ts src/adapters/composition.test.ts
git commit -m "feat(diagnostics): time /api calls through the composition root"
```

---

## Task 6: The panel

**Files:**
- Create: `src/ui/components/DiagnosticsBar.tsx`, `src/ui/components/DiagnosticsBar.test.tsx`, `src/styles/diagnostics.css`
- Modify: `src/main.tsx`, `test/e2e/interactive.spec.ts`

**Interfaces:**
- Consumes: `getSnapshot`, `subscribe` (Task 2); `buildReport`, `collectEnvironment`, `summaryLine`, `AppFacts` (Task 3); `useAvailabilityStore` from `src/ui/store.ts`; `isDiagnosticsEnabled` (Task 1).
- Produces: `export default function DiagnosticsBar(): JSX.Element` — a **default** export, required by `React.lazy`.

**Context:** the expanded body renders the report text in a read-only `<textarea>` and nothing else. That is deliberate: what you read is exactly what you copy, one representation instead of two that can disagree. The bar mounts as a sibling of `<AvailabilitySurface />` in `main.tsx`, so it sits outside `<main>` — it is never affected by the `inert` attribute that `.surface-content` carries while the sheet or scanner is open, and being later in DOM order it paints above them (this repo sets no `z-index`).

- [ ] **Step 1: Write the failing test**

```tsx
// src/ui/components/DiagnosticsBar.test.tsx
const flag = vi.hoisted(() => ({ enabled: true }));
vi.mock('../../diagnostics/enabled', () => ({ isDiagnosticsEnabled: () => flag.enabled }));

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beginScannerRun, publishNetwork, publishScanner, resetDiagnostics } from '../../diagnostics/bus';
import { useAvailabilityStore } from '../store';
import DiagnosticsBar from './DiagnosticsBar';

beforeEach(() => {
  flag.enabled = true;
  resetDiagnostics();
  useAvailabilityStore.setState({
    ui: { state: 'default' },
    store: { strCd: '001', strNm: '명동역점' },
    sheetOpen: false,
    scannerOpen: false,
  });
});

test('the collapsed bar reports that no scan has run yet', () => {
  render(<DiagnosticsBar />);
  expect(screen.getByRole('button', { name: /스캔 전/ })).toBeInTheDocument();
});

test('the collapsed summary reflects published scanner facts', () => {
  beginScannerRun(Date.now());
  publishScanner({ decoderPath: 'zxing', track: { width: 640, height: 480, frameRate: null, facingMode: null, deviceId: null } });
  render(<DiagnosticsBar />);
  expect(screen.getByRole('button', { name: /zxing/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /640×480/ })).toBeInTheDocument();
});

test('expanding reveals the full report and toggles aria-expanded', async () => {
  const user = userEvent.setup();
  publishNetwork({ path: '/api/availability', status: 200, ms: 42 });
  render(<DiagnosticsBar />);
  const toggle = screen.getByRole('button', { name: /스캔 전/ });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await user.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const report = screen.getByLabelText('진단 보고서') as HTMLTextAreaElement;
  expect(report).toHaveAttribute('readonly');
  expect(report.value).toContain('/api/availability');
  expect(report.value).toContain('명동역점');
});

test('the report reflects the current app state from the store', async () => {
  const user = userEvent.setup();
  useAvailabilityStore.setState({ ui: { state: 'loading', query: '19987', slow: false, origin: 'scan' } });
  render(<DiagnosticsBar />);
  await user.click(screen.getByRole('button', { name: /스캔 전/ }));
  const report = screen.getByLabelText('진단 보고서') as HTMLTextAreaElement;
  expect(report.value).toContain('state: loading');
  expect(report.value).toContain('origin: scan');
});

// The clipboard API is unavailable over plain http — exactly the LAN setup used for phone testing.
// The textarea fallback is what keeps the copy path from dead-ending, so the failure must be visible.
test('a clipboard failure is surfaced instead of silently swallowed', async () => {
  const user = userEvent.setup();
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: () => Promise.reject(new Error('insecure context')) },
  });
  render(<DiagnosticsBar />);
  await user.click(screen.getByRole('button', { name: /스캔 전/ }));
  await user.click(screen.getByRole('button', { name: '복사' }));
  expect(await screen.findByText(/복사 실패/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/ui/components/DiagnosticsBar.test.tsx`
Expected: FAIL — `Failed to resolve import "./DiagnosticsBar"`.

- [ ] **Step 3: Write the component**

```tsx
// src/ui/components/DiagnosticsBar.tsx
// The ?debug=1 diagnostics bar. Development/test instrumentation, NOT a shopper surface: it is reachable
// only by URL parameter, it never alters app behaviour, and it is not downloaded when the flag is off.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { getSnapshot, subscribe } from '../../diagnostics/bus';
import { type AppFacts, buildReport, collectEnvironment, summaryLine } from '../../diagnostics/report';
import { useAvailabilityStore } from '../store';
import '../../styles/diagnostics.css';

const TICK_MS = 500;

function appFacts(
  ui: ReturnType<typeof useAvailabilityStore.getState>['ui'],
  store: ReturnType<typeof useAvailabilityStore.getState>['store'],
  now: number,
): AppFacts {
  return {
    state: ui.state === 'error' ? `error/${ui.variant}` : ui.state,
    query: 'query' in ui ? ui.query : null,
    origin: 'origin' in ui ? (ui.origin ?? null) : null,
    storeId: store?.strCd ?? null,
    storeName: store?.strNm ?? null,
    candidateCount: ui.state === 'candidates' ? ui.candidates.length : null,
    freshnessAgeMs: 'freshness' in ui && ui.freshness ? now - ui.freshness.observedAt : null,
  };
}

export default function DiagnosticsBar() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);
  const ui = useAvailabilityStore((s) => s.ui);
  const store = useAvailabilityStore((s) => s.store);
  const [expanded, setExpanded] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [, forceTick] = useState(0);

  const scanning = snapshot.scanner.startedAt !== null && snapshot.scanner.outcome === null;

  // Elapsed time is derived from a clock, not from a publish, so nothing would repaint it on its own.
  // Ticking only while a scan is live or the panel is open keeps an idle page free of timers.
  useEffect(() => {
    if (!scanning && !expanded) return;
    const timer = setInterval(() => forceTick((n) => n + 1), TICK_MS);
    return () => clearInterval(timer);
  }, [scanning, expanded]);

  const now = Date.now();
  const report = buildReport(collectEnvironment(), snapshot, appFacts(ui, store, now), now);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopyFailed(false);
    } catch {
      // Plain http (the LAN phone-testing setup) has no clipboard API. Say so — the textarea below is
      // already on screen, so the tester still has a way to get the text out.
      setCopyFailed(true);
    }
  };

  return (
    <div className="diagnostics-bar">
      <button
        type="button"
        className="diagnostics-bar__summary"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        {summaryLine(snapshot.scanner, now)}
      </button>
      {expanded && (
        <div className="diagnostics-bar__body">
          <div className="diagnostics-bar__actions">
            <button type="button" onClick={copy}>
              복사
            </button>
            {copyFailed && (
              <span className="diagnostics-bar__note">복사 실패 — 아래 텍스트를 선택해 주세요.</span>
            )}
          </div>
          <textarea className="diagnostics-bar__report" aria-label="진단 보고서" readOnly value={report} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Write the stylesheet**

```css
/* src/styles/diagnostics.css — development instrumentation only; deliberately outside the design
   tokens so it can never be mistaken for, or drift into, a shopper-facing surface. */
.diagnostics-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: #e7e7e7;
  background: rgba(17, 17, 17, 0.92);
}

.diagnostics-bar__summary {
  display: block;
  width: 100%;
  padding: 6px 10px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  min-height: 32px;
}

.diagnostics-bar__body {
  padding: 0 10px 8px;
}

.diagnostics-bar__actions {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 4px 0;
}

.diagnostics-bar__note {
  color: #ffb4b4;
}

.diagnostics-bar__report {
  width: 100%;
  height: 40vh;
  background: #0d0d0d;
  color: inherit;
  font: inherit;
  border: 1px solid #333;
  white-space: pre;
}
```

- [ ] **Step 5: Run the component tests**

Run: `npx vitest run src/ui/components/DiagnosticsBar.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 6: Mount it in `src/main.tsx`**

```tsx
import { registerSW } from 'virtual:pwa-register';
import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { isDiagnosticsEnabled } from './diagnostics/enabled';
import { AvailabilitySurface } from './ui/AvailabilitySurface';
import './styles/tokens.css';
import './styles/layout.css';

// Lazy so a build without ?debug=1 never downloads the panel or its stylesheet.
const DiagnosticsBar = lazy(() => import('./ui/components/DiagnosticsBar'));

registerSW({ immediate: true });

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <AvailabilitySurface />
    {/* A sibling of <main>, so `inert` on .surface-content never reaches it and DOM order paints it
        above the sheet and the scanner overlay. */}
    {isDiagnosticsEnabled() && (
      <Suspense fallback={null}>
        <DiagnosticsBar />
      </Suspense>
    )}
  </StrictMode>,
);
```

- [ ] **Step 7: Add the E2E tests**

Append to `test/e2e/interactive.spec.ts` (outside the existing `test.describe`, so no store context is pre-seeded):

```ts
test.describe('diagnostics panel', () => {
  test('?debug=1 shows the diagnostics bar', async ({ page }) => {
    await page.goto('/?debug=1');
    await expect(page.locator('.diagnostics-bar')).toBeVisible();
  });

  test('without the parameter the bar is not in the DOM at all', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.diagnostics-bar')).toHaveCount(0);
  });
});
```

- [ ] **Step 8: Run the E2E suite**

Run: `npm run e2e`
Expected: PASS — the two new tests plus every existing one.

Note: the flag persists in `sessionStorage`, and Playwright gives each test a fresh context, so the second test cannot inherit the first test's flag. If the suite is ever changed to reuse a context, the second test must clear the key first.

- [ ] **Step 9: Run the full gate**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: all pass. In the build output confirm `DiagnosticsBar-*.js` is a **separate chunk**, not part of the entry chunk.

- [ ] **Step 10: Commit**

```bash
git add src/ui/components/DiagnosticsBar.tsx src/ui/components/DiagnosticsBar.test.tsx src/styles/diagnostics.css src/main.tsx test/e2e/interactive.spec.ts
git commit -m "feat(diagnostics): add the ?debug=1 bottom bar with a copyable report"
```

---

## Task 7: Camera resolution constraint and records

**Files:**
- Modify: `src/adapters/barcode/browserScanner.ts:81` (the `getUserMedia` call)
- Modify: `src/adapters/barcode/browserScanner.test.ts`
- Modify: `docs/notes/open-questions.md`, `docs/HANDOFF.md`

**Interfaces:**
- Consumes: everything above. Produces: no new API.

**Context:** the browser default is commonly 640×480, at which a 5–8 mm DataMatrix falls below the modules-per-pixel floor a decoder needs. The panel from Task 6 is what makes the change measurable rather than assumed — that is why this task is last.

- [ ] **Step 1: Write the failing test**

Add to the `diagnostics instrumentation` describe block in `src/adapters/barcode/browserScanner.test.ts`:

```ts
// `ideal` is a preference the browser may miss; `exact`/`min` raise OverconstrainedError and would turn
// a low-resolution-but-working webcam into a total failure. The owner's 2026-07-27 decision was NOT to
// exclude such devices, so this test guards the distinction rather than the numbers.
test('the camera is requested with ideal-only resolution hints', async () => {
  let requested: MediaStreamConstraints | undefined;
  const scanner = createBrowserScanner({
    mediaDevices: {
      getUserMedia: async (constraints) => {
        requested = constraints;
        return { getTracks: () => [{ stop: () => {} }] } as unknown as MediaStream;
      },
    },
    createNativeDetector: async () => null,
    loadFallbackDecoder: async () => ({ decode: async () => '19987', cancel: () => {} }),
  });
  await scanner.scan({ video: {} as HTMLVideoElement }, new AbortController().signal);
  const video = requested?.video as MediaTrackConstraints;
  expect(video.facingMode).toBe('environment');
  expect(video.width).toEqual({ ideal: 1920 });
  expect(video.height).toEqual({ ideal: 1080 });
  expect(JSON.stringify(video)).not.toContain('exact');
  expect(JSON.stringify(video)).not.toContain('min');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/adapters/barcode/browserScanner.test.ts`
Expected: FAIL — `video.width` is `undefined`.

- [ ] **Step 3: Write the implementation**

In `src/adapters/barcode/browserScanner.ts`, replace the `getUserMedia` call:

```ts
        // Resolution is a correctness input, not a nicety: a DAISO DataMatrix is ~5-8 mm, and at the
        // common 640x480 default its modules fall under the pixels-per-module floor a decoder needs.
        // `ideal` only — `exact`/`min` would raise OverconstrainedError on a camera that cannot reach
        // the target, converting a blurry-but-usable device into an outright failure.
        stream = await media.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/adapters/barcode/browserScanner.test.ts`
Expected: PASS — the new test plus every existing one.

- [ ] **Step 5: Record the decisions**

In `docs/notes/open-questions.md`, add a `§B31` section recording, one row each:
- B31-1 — the panel is gated on `?debug=1` at runtime, not on `import.meta.env.DEV`, because the DEV build wires the mock scanner and real devices run PROD builds with no console.
- B31-2 — diagnostics are observation-only: no judgement, payload or response changes when the panel is on.
- B31-3 — the report carries `pathname`, status and duration only; never query strings, bodies, headers, or `error.message`.
- B31-4 — unmeasurable values are named (`측정 불가`, `미보고`, `질의 실패`) and never defaulted; `supportedFormats: null` ≠ `[]`.
- B31-5 — the camera is requested with `width/height: { ideal: 1920/1080 }`; `exact`/`min` are forbidden because they convert weak cameras into total failures.
- B31-6 — the panel is development instrumentation, not a shopper surface, so it consumes no Bible D-number (spec §9).

In `docs/HANDOFF.md`, update the resume record: branch `feat/dev-diagnostics-panel`, the new gate counts from step 6, and add a next-step line — run `npm run dev:live`, open `http://127.0.0.1:8790/?debug=1`, and record what the panel reports for `BarcodeDetector`, `지원 포맷`, `디코더`, and the track resolution on Windows Chrome, then repeat on a phone once an HTTPS route exists.

- [ ] **Step 6: Run the full gate**

Run: `npm test && npm run typecheck && npm run lint && npm run build && npm run e2e`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/adapters/barcode/browserScanner.ts src/adapters/barcode/browserScanner.test.ts docs/notes/open-questions.md docs/HANDOFF.md
git commit -m "fix(scan): request an ideal 1920x1080 camera stream for DataMatrix decoding"
```

---

## Verification Summary

After Task 7 the branch delivers:

1. `?debug=1` turns on a bottom bar in **any** build — `npm run dev`, `npm run dev:live`, and a phone hitting the proxy — and nothing at all without it.
2. The bar names the decoder path, the platform's real DataMatrix support, the camera's actual track settings, elapsed time, the app's state, and the last five `/api` calls.
3. Everything on screen is copyable as one text block, with a `<textarea>` fallback for the plain-http case where the clipboard API is unavailable.
4. The camera is asked for 1920×1080 `ideal`, and the panel is the instrument that shows whether the request was honoured.
