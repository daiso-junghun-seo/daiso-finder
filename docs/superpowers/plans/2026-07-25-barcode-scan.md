# Barcode Scan Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the existing dead `바코드 스캔` button to a real camera scanner that decodes a 1D barcode and answers through the existing availability pipeline, ending in the same 6-state answer card.

**Architecture:** New `ScannerPort` seam mirroring `GeolocationPort` (port → browser adapter → mock → `composition.ts` PROD/mock switch → prop-injected into a modal overlay). The viewfinder is UI-shell state (`scannerOpen`, like `sheetOpen`), never a 7th `UiState`. A decoded value goes straight to `/api/availability` as `keyword=value, pdNo=value` — no new backend, no `/api/search` round trip.

**Tech Stack:** React 18 + TypeScript (strict, `noUncheckedIndexedAccess`), Zustand, Vitest + Testing Library, Playwright, native `BarcodeDetector` with a dynamically-imported `@zxing/library@0.21.3` fallback (already in `package.json`, uncommitted).

Spec: [`../specs/2026-07-25-barcode-scan-design.md`](../specs/2026-07-25-barcode-scan-design.md). Branch: `feat/barcode-scan` (already checked out at main tip `62a555a`).

## Global Constraints

- **6-state invariant**: the `UiState` state set, its meanings, and `mapStoreObservation` judgement logic do not change. The only domain addition is an optional `origin` provenance field used for copy selection only.
- **Bible-verbatim copy is frozen**: never edit an existing string in `src/ui/copy.ts`. New scan copy is app-owned draft pending Bible ratification (spec §6) — transcribe the drafts exactly as written in this plan.
- **No fabrication**: no EAN→pdNo guessing, no checksum/prefix parsing, no invented product data. A decoded value is passed through verbatim.
- **Ports never throw**: every failure is a `ScanOutcome` variant (mirrors `browserGeolocation` returning `[]` on every failure path).
- **No external CDN**: the fallback decoder is bundled and dynamically imported.
- **Camera is decode-only**: no image recognition, no "is this it?" check (Bible forbids).
- **Server contracts unchanged**: `functions/` is not touched by this plan.
- **Windows 11 / PowerShell**: all commands below are PowerShell-safe. Repo root `C:\Dev\daiso-finder`.
- **Gate before every commit**: `npm test` (vitest), `npm run typecheck` (tsc), `npm run lint` (biome). E2E (`npm run e2e`) at Task 5.
- Korean UX copy uses the existing `~어요` register; no blame constructions (`권한이 없습니다`), no technical terms (`NotAllowedError`, `초기화 실패`).

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/domain/ports.ts` | `ScannerPort`, `ScanOutcome`, `ScanTarget` | 1 |
| `src/adapters/barcode/browserScanner.ts` (+ `.test.ts`) | camera + native/zxing decode behind the port | 1 |
| `src/adapters/mock/scanner.ts` | DEV/test scanner, no camera | 1 |
| `src/adapters/mock/mockRepository.ts` | keyword mock also resolves a known `pdNo` | 1 |
| `src/adapters/composition.ts` (+ `.test.ts`) | `createScanner()` PROD/mock switch | 1 |
| `src/domain/types.ts` | `QueryOrigin`; `origin?` on SUBMIT/loading/empty | 2 |
| `src/domain/state-machine.ts` (+ `.test.ts`) | thread `origin` SUBMIT → loading → empty | 2 |
| `src/ui/copy.ts` (+ `.test.ts`) | 4 scan copy drafts + `scanEmptyBody` | 2 |
| `src/ui/AnswerCard.tsx` (+ `.test.tsx`) | scan-origin Empty body | 2 |
| `src/ui/components/ScannerOverlay.tsx` (+ `.test.tsx`) | modal viewfinder, a11y, outcome copy | 3 |
| `src/styles/layout.css` | minimal overlay/video layout (UI-last: minimal) | 3 |
| `src/ui/store.ts` | `scannerOpen` / `openScanner` / `closeScanner` | 4 |
| `src/ui/AvailabilitySurface.tsx` (+ `.test.tsx`) | `runByScan`, button wiring, overlay render, focus return | 4 |
| `test/e2e/interactive.spec.ts` | scan → answer card via DEV mock | 5 |
| `docs/notes/open-questions.md`, `docs/HANDOFF.md`, `.superpowers/sdd/progress.md` | app decisions §B30, roadmap, ledger | 5 |

**Task dependency:** Task 1 ∥ Task 2 (disjoint files) → Task 3 → Task 4 → Task 5.

---

### Task 1: ScannerPort + browser adapter + mock + composition

**Files:**
- Modify: `src/domain/ports.ts` (append at end)
- Create: `src/adapters/barcode/browserScanner.ts`
- Test: `src/adapters/barcode/browserScanner.test.ts`
- Create: `src/adapters/mock/scanner.ts`
- Modify: `src/adapters/mock/mockRepository.ts:23-34` (`createKeywordMockRepository`)
- Modify: `src/adapters/composition.ts`
- Test: `src/adapters/composition.test.ts` (append)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  - `ScanOutcome`, `ScanTarget`, `ScannerPort` from `src/domain/ports`
  - `createBrowserScanner(deps?: ScannerDeps): ScannerPort`, `SCAN_FORMATS` from `src/adapters/barcode/browserScanner`
  - `createMockScanner(outcome?: ScanOutcome): ScannerPort`, `MOCK_SCAN_VALUE: string` (= `'19987'`) from `src/adapters/mock/scanner`
  - `createScanner(): ScannerPort` from `src/adapters/composition`

- [ ] **Step 1: Write the failing adapter tests**

Create `src/adapters/barcode/browserScanner.test.ts`:

```ts
import type { ScanTarget } from '../../domain/ports';
import { createBrowserScanner } from './browserScanner';

function fakeTrack() {
  return { stopped: false, stop() { this.stopped = true; } };
}
function fakeStream(track: { stop: () => void }) {
  return { getTracks: () => [track] } as unknown as MediaStream;
}
function fakeTarget(): ScanTarget {
  // jsdom has no real media playback; play() must resolve for attach() to proceed.
  const video = { srcObject: null, play: async () => {} } as unknown as HTMLVideoElement;
  return { video };
}

test('decodes with the native detector and stops the camera', async () => {
  const track = fakeTrack();
  const scanner = createBrowserScanner({
    mediaDevices: { getUserMedia: async () => fakeStream(track) },
    createNativeDetector: () => ({ detect: async () => [{ rawValue: '19987' }] }),
    pollIntervalMs: 1,
  });
  const outcome = await scanner.scan(fakeTarget(), new AbortController().signal);
  expect(outcome).toEqual({ kind: 'decoded', value: '19987' });
  expect(track.stopped).toBe(true);
});

test('a permission denial is an outcome, never a throw', async () => {
  const scanner = createBrowserScanner({
    mediaDevices: {
      getUserMedia: async () => {
        const err = new Error('denied');
        err.name = 'NotAllowedError';
        throw err;
      },
    },
    createNativeDetector: () => null,
  });
  await expect(scanner.scan(fakeTarget(), new AbortController().signal)).resolves.toEqual({
    kind: 'permissionDenied',
  });
});

test('no camera API at all reports unsupported', async () => {
  const scanner = createBrowserScanner({ mediaDevices: undefined, createNativeDetector: () => null });
  await expect(scanner.scan(fakeTarget(), new AbortController().signal)).resolves.toEqual({
    kind: 'unsupported',
  });
});

test('falls back to the bundled decoder when no native detector exists', async () => {
  const track = fakeTrack();
  const scanner = createBrowserScanner({
    mediaDevices: { getUserMedia: async () => fakeStream(track) },
    createNativeDetector: () => null,
    loadFallbackDecoder: async () => ({ decode: async () => '1031166', cancel: () => {} }),
  });
  await expect(scanner.scan(fakeTarget(), new AbortController().signal)).resolves.toEqual({
    kind: 'decoded',
    value: '1031166',
  });
  expect(track.stopped).toBe(true);
});

test('an unloadable fallback decoder reports unsupported', async () => {
  const track = fakeTrack();
  const scanner = createBrowserScanner({
    mediaDevices: { getUserMedia: async () => fakeStream(track) },
    createNativeDetector: () => null,
    loadFallbackDecoder: async () => null,
  });
  await expect(scanner.scan(fakeTarget(), new AbortController().signal)).resolves.toEqual({
    kind: 'unsupported',
  });
  expect(track.stopped).toBe(true);
});

test('abort cancels the scan and always stops the camera', async () => {
  const track = fakeTrack();
  const controller = new AbortController();
  const scanner = createBrowserScanner({
    mediaDevices: { getUserMedia: async () => fakeStream(track) },
    // never decodes — the camera stays open until abort (Bible: decode failure keeps the camera open)
    createNativeDetector: () => ({ detect: async () => [] }),
    pollIntervalMs: 1,
  });
  const pending = scanner.scan(fakeTarget(), controller.signal);
  controller.abort();
  await expect(pending).resolves.toEqual({ kind: 'cancelled' });
  expect(track.stopped).toBe(true);
});

test('a transient detect() failure keeps scanning instead of failing the run', async () => {
  const track = fakeTrack();
  let calls = 0;
  const scanner = createBrowserScanner({
    mediaDevices: { getUserMedia: async () => fakeStream(track) },
    createNativeDetector: () => ({
      detect: async () => {
        calls += 1;
        if (calls === 1) throw new Error('frame not ready');
        return [{ rawValue: '19987' }];
      },
    }),
    pollIntervalMs: 1,
  });
  await expect(scanner.scan(fakeTarget(), new AbortController().signal)).resolves.toEqual({
    kind: 'decoded',
    value: '19987',
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/adapters/barcode/browserScanner.test.ts`
Expected: FAIL — cannot resolve `./browserScanner`.

- [ ] **Step 3: Add the port**

Append to `src/domain/ports.ts`:

```ts
// Barcode scan entry (Interface §3, entry path 2). The adapter owns the camera and the decoder; the
// port speaks only outcomes and NEVER throws — every failure must reach the overlay as a variant so the
// flow can end with a concrete next step (Anti-goal 5). Aborting the signal stops the camera.
export type ScanOutcome =
  | { kind: 'decoded'; value: string }
  | { kind: 'permissionDenied' }
  | { kind: 'unsupported' }
  | { kind: 'cancelled' }
  | { kind: 'failed' };

export interface ScanTarget {
  video: HTMLVideoElement;
}

export interface ScannerPort {
  scan(target: ScanTarget, signal: AbortSignal): Promise<ScanOutcome>;
}
```

- [ ] **Step 4: Implement the browser adapter**

Create `src/adapters/barcode/browserScanner.ts`:

```ts
// src/adapters/barcode/browserScanner.ts
// Camera + barcode decode behind ScannerPort. Mirrors browserGeolocation's discipline: every capability
// is injected (never read off a global inside), and no path throws — failures surface as ScanOutcome
// variants. Decode-only: no image recognition (Bible, Engineering/in-store-navigation §dependencies).
import type { ScanOutcome, ScanTarget, ScannerPort } from '../../domain/ports';

// 1D retail symbologies only. QR/DataMatrix stay out: a product query has no defined QR payload, and
// D082 already removed QR as an entry mechanism — decoding one would invite a fabricated mapping.
export const SCAN_FORMATS = [
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'code_128',
  'code_39',
  'itf',
] as const;

export interface NativeDetector {
  detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string }>>;
}

// The bundled fallback, shaped so the adapter never imports @zxing types at module scope (keeps the
// dynamic import a separate chunk).
export interface FallbackDecoder {
  decode(stream: MediaStream, video: HTMLVideoElement): Promise<string>;
  cancel(): void;
}

export interface ScannerDeps {
  mediaDevices?: Pick<MediaDevices, 'getUserMedia'> | undefined;
  createNativeDetector?: () => NativeDetector | null;
  loadFallbackDecoder?: () => Promise<FallbackDecoder | null>;
  pollIntervalMs?: number;
}

export function createBrowserScanner(deps: ScannerDeps = {}): ScannerPort {
  const media =
    'mediaDevices' in deps
      ? deps.mediaDevices
      : typeof navigator === 'undefined'
        ? undefined
        : navigator.mediaDevices;
  const createNative = deps.createNativeDetector ?? defaultNativeDetector;
  const loadFallback = deps.loadFallbackDecoder ?? loadBundledDecoder;
  const pollMs = deps.pollIntervalMs ?? 200;

  return {
    async scan(target, signal) {
      if (!media?.getUserMedia) return { kind: 'unsupported' };
      if (signal.aborted) return { kind: 'cancelled' };
      let stream: MediaStream;
      try {
        stream = await media.getUserMedia({ video: { facingMode: 'environment' } });
      } catch (err) {
        // A denial is the shopper's choice, not an error state to dramatize; anything else (no camera,
        // hardware busy) is reported as unsupported so no technical term reaches the copy layer.
        return { kind: isPermissionDenial(err) ? 'permissionDenied' : 'unsupported' };
      }
      const stopCamera = () => {
        for (const track of stream.getTracks()) track.stop();
      };
      try {
        if (signal.aborted) return { kind: 'cancelled' };
        const native = createNative();
        if (native) return await scanWithNative(native, stream, target, signal, pollMs);
        const fallback = await loadFallback();
        if (!fallback) return { kind: 'unsupported' };
        return await scanWithFallback(fallback, stream, target, signal);
      } catch {
        return { kind: 'failed' };
      } finally {
        // The camera is never left running — success, cancel and failure all pass through here.
        stopCamera();
      }
    },
  };
}

function isPermissionDenial(err: unknown): boolean {
  const name = (err as { name?: string } | null)?.name;
  return name === 'NotAllowedError' || name === 'SecurityError';
}

function defaultNativeDetector(): NativeDetector | null {
  const ctor = (globalThis as { BarcodeDetector?: new (o: { formats: string[] }) => NativeDetector })
    .BarcodeDetector;
  if (!ctor) return null;
  try {
    return new ctor({ formats: [...SCAN_FORMATS] });
  } catch {
    return null; // constructed with an unsupported format list → treat as no native detector
  }
}

async function attach(video: HTMLVideoElement, stream: MediaStream): Promise<void> {
  video.srcObject = stream;
  try {
    await video.play();
  } catch {
    // An autoplay rejection is not fatal: frames still flow and detect() can read them.
  }
}

async function scanWithNative(
  detector: NativeDetector,
  stream: MediaStream,
  target: ScanTarget,
  signal: AbortSignal,
  pollMs: number,
): Promise<ScanOutcome> {
  await attach(target.video, stream);
  return new Promise<ScanOutcome>((resolve) => {
    let settled = false;
    const finish = (outcome: ScanOutcome) => {
      if (settled) return;
      settled = true;
      clearInterval(timer);
      signal.removeEventListener('abort', onAbort);
      resolve(outcome);
    };
    const onAbort = () => finish({ kind: 'cancelled' });
    signal.addEventListener('abort', onAbort);
    const timer = setInterval(() => {
      detector
        .detect(target.video)
        .then((codes) => {
          const value = codes[0]?.rawValue;
          if (value) finish({ kind: 'decoded', value });
        })
        .catch(() => {
          // A frame that cannot be read is not a failure: the Bible keeps the camera open on decode
          // failure and the overlay shows a hint instead (Engineering §5).
        });
    }, pollMs);
    if (signal.aborted) finish({ kind: 'cancelled' });
  });
}

async function scanWithFallback(
  decoder: FallbackDecoder,
  stream: MediaStream,
  target: ScanTarget,
  signal: AbortSignal,
): Promise<ScanOutcome> {
  if (signal.aborted) return { kind: 'cancelled' };
  const onAbort = () => decoder.cancel();
  signal.addEventListener('abort', onAbort);
  try {
    const value = await decoder.decode(stream, target.video);
    return signal.aborted ? { kind: 'cancelled' } : { kind: 'decoded', value };
  } catch {
    return signal.aborted ? { kind: 'cancelled' } : { kind: 'failed' };
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}

// Dynamic import: @zxing stays out of the initial PWA chunk and loads only on a device with no native
// BarcodeDetector (iOS Safari) whose shopper actually opened the scanner. Bundled — never a CDN.
async function loadBundledDecoder(): Promise<FallbackDecoder | null> {
  try {
    const { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } = await import(
      '@zxing/library'
    );
    const hints = new Map<number, unknown>();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.ITF,
    ]);
    const reader = new BrowserMultiFormatReader(hints as never);
    return {
      decode: async (stream, video) => (await reader.decodeOnceFromStream(stream, video)).getText(),
      cancel: () => reader.reset(),
    };
  } catch {
    return null;
  }
}
```

Verify the fallback API names against the installed package before finishing: `node_modules/@zxing/library/esm/browser/BrowserCodeReader.d.ts` must declare `decodeOnceFromStream(stream, videoSource?)` and `reset()`, and `BrowserMultiFormatReader`'s constructor must take a hints `Map`. If a name differs, adapt the wrapper — the `FallbackDecoder` shape stays.

- [ ] **Step 5: Run the adapter tests to verify they pass**

Run: `npm test -- src/adapters/barcode/browserScanner.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Write the failing composition + mock-repo tests**

Append to `src/adapters/composition.test.ts`:

```ts
test('DEV/test build wires the mock scanner without touching the camera', async () => {
  let cameraAsked = false;
  const nav = navigator as unknown as { mediaDevices?: { getUserMedia: () => Promise<MediaStream> } };
  const original = nav.mediaDevices;
  nav.mediaDevices = {
    getUserMedia: async () => {
      cameraAsked = true;
      return {} as MediaStream;
    },
  };
  try {
    const outcome = await createScanner().scan(
      { video: {} as HTMLVideoElement },
      new AbortController().signal,
    );
    expect(outcome).toEqual({ kind: 'decoded', value: MOCK_SCAN_VALUE });
    expect(cameraAsked).toBe(false);
  } finally {
    nav.mediaDevices = original;
  }
});

test('PROD build wires the browser scanner (camera requested, no mock value)', async () => {
  vi.stubEnv('PROD', true);
  let cameraAsked = false;
  const nav = navigator as unknown as { mediaDevices?: { getUserMedia: () => Promise<MediaStream> } };
  const original = nav.mediaDevices;
  nav.mediaDevices = {
    getUserMedia: async () => {
      cameraAsked = true;
      const err = new Error('denied');
      err.name = 'NotAllowedError';
      throw err;
    },
  };
  try {
    const outcome = await createScanner().scan(
      { video: {} as HTMLVideoElement },
      new AbortController().signal,
    );
    expect(cameraAsked).toBe(true);
    expect(outcome).toEqual({ kind: 'permissionDenied' });
  } finally {
    nav.mediaDevices = original;
    vi.unstubAllEnvs();
  }
});

test('the keyword mock repository answers a scanned pdNo', async () => {
  const repo = createStoreStockRepository();
  expect(
    await repo.query({ strCd: '1', strNm: 'x' }, { keyword: MOCK_SCAN_VALUE, pdNo: MOCK_SCAN_VALUE }),
  ).toEqual(mockAnswers.inStock);
});
```

Extend the existing import block at the top of the file to include `createScanner`, and add `import { MOCK_SCAN_VALUE } from './mock/scanner';`.

- [ ] **Step 7: Run them to verify they fail**

Run: `npm test -- src/adapters/composition.test.ts`
Expected: FAIL — `createScanner` is not exported / `./mock/scanner` unresolved.

- [ ] **Step 8: Add the mock scanner, the mock-repo pdNo branch, and the composition switch**

Create `src/adapters/mock/scanner.ts`:

```ts
// src/adapters/mock/scanner.ts — DEV/test scanner: no camera, no permission prompt. Resolves the mock
// catalog's base pdNo so the whole scan → answer flow is exercisable in `vite dev`, Vitest and the
// Playwright dev sweep (spec §8; the real camera path is PROD-only and stays field-unverified, §B9).
import type { ScanOutcome, ScannerPort } from '../../domain/ports';
import { mockCandidates } from './productSearch';

export const MOCK_SCAN_VALUE = mockCandidates[0]?.pdNo ?? '19987';

export function createMockScanner(
  outcome: ScanOutcome = { kind: 'decoded', value: MOCK_SCAN_VALUE },
): ScannerPort {
  return {
    scan: async (_target, signal) => (signal.aborted ? { kind: 'cancelled' } : outcome),
  };
}
```

In `src/adapters/mock/mockRepository.ts`, add the pdNo branch to `createKeywordMockRepository` (after the scenario-key branch, before the product-name branch) and import `mockCandidates`:

```ts
import { mockCandidates } from './productSearch';
```

```ts
      if (Object.hasOwn(mockAnswers, keyword)) return mockAnswers[keyword as Scenario];
      // A scanned barcode arrives as keyword=pdNo=<decoded value> (spec §3.3): match the mock catalog
      // by pdNo so the DEV/E2E scan flow reaches a real answer card instead of always going Empty.
      if (term.pdNo && mockCandidates.some((c) => c.pdNo === term.pdNo)) return mockAnswers.inStock;
      if (keyword && mockProductName.includes(keyword)) return mockAnswers.inStock;
      throw new NoCatalogMatchError([]);
```

In `src/adapters/composition.ts`, add the import lines and the factory:

```ts
import { createBrowserScanner } from './barcode/browserScanner';
import { createMockScanner } from './mock/scanner';
```

```ts
export function createScanner(): ScannerPort {
  return import.meta.env.PROD ? createBrowserScanner() : createMockScanner();
}
```

Add `ScannerPort` to the existing `import type { … } from '../domain/ports';` list.

- [ ] **Step 9: Run the full gate**

Run: `npm test` then `npm run typecheck` then `npm run lint`
Expected: all PASS (286 + 10 new = 296 tests), tsc clean, biome clean.

- [ ] **Step 10: Commit**

```powershell
git add src/domain/ports.ts src/adapters/barcode src/adapters/mock/scanner.ts src/adapters/mock/mockRepository.ts src/adapters/composition.ts src/adapters/composition.test.ts package.json package-lock.json
git commit -m "feat(scan): add ScannerPort seam with native/zxing browser adapter and mock"
```

(`package.json`/`package-lock.json` carry the already-installed `@zxing/library` dependency — commit them here, with this first consumer.)

---

### Task 2: Scan copy drafts + Empty provenance

**Files:**
- Modify: `src/domain/types.ts:66-102`
- Modify: `src/domain/state-machine.ts:7-19`
- Test: `src/domain/state-machine.test.ts` (append)
- Modify: `src/ui/copy.ts` (append at end; `announcementFor` empty case)
- Test: `src/ui/copy.test.ts` (append)
- Modify: `src/ui/AnswerCard.tsx:72-73`
- Test: `src/ui/AnswerCard.test.tsx` (append)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `QueryOrigin` type; `SUBMIT.origin?`, `loading.origin?`, `empty.origin?`; copy constants `SCAN_PERMISSION_DENIED`, `SCAN_UNSUPPORTED`, `SCAN_HINT`, `SCAN_FAILED` and `scanEmptyBody(value: string): string` from `src/ui/copy`.

- [ ] **Step 1: Write the failing reducer + copy + card tests**

Append to `src/domain/state-machine.test.ts`:

```ts
test('a scan submit carries its provenance into loading and on to empty', () => {
  const loading = reduce(initialState, { type: 'SUBMIT', query: '19987', origin: 'scan' });
  expect(loading).toEqual({ state: 'loading', query: '19987', slow: false, origin: 'scan' });
  const empty = reduce(loading, { type: 'NO_MATCH', query: '19987', suggestions: [] });
  expect(empty).toEqual({ state: 'empty', query: '19987', suggestions: [], origin: 'scan' });
});

test('a typed submit has no provenance and reaches a provenance-free empty', () => {
  const loading = reduce(initialState, { type: 'SUBMIT', query: '밀폐용기' });
  expect(loading).toEqual({ state: 'loading', query: '밀폐용기', slow: false, origin: undefined });
  const empty = reduce(loading, { type: 'NO_MATCH', query: '밀폐용기', suggestions: [] });
  expect(empty).toMatchObject({ state: 'empty', query: '밀폐용기', origin: undefined });
});

test('provenance does not survive a candidate selection (the shopper picked a product, not a code)', () => {
  const scanLoading = reduce(initialState, { type: 'SUBMIT', query: '19987', origin: 'scan' });
  const picked = reduce(scanLoading, { type: 'SELECT_CANDIDATE', query: '리빙 밀폐용기 1.2L', pdNo: '19987' });
  expect(picked).toEqual({ state: 'loading', query: '리빙 밀폐용기 1.2L', slow: false });
});
```

Append to `src/ui/copy.test.ts`:

```ts
test('scan copy drafts are transcribed exactly (app-owned, pending Bible ratification)', () => {
  expect(SCAN_PERMISSION_DENIED).toBe('카메라를 사용할 수 없어요. 상품명으로 검색해 보세요.');
  expect(SCAN_UNSUPPORTED).toBe('이 브라우저에서는 바코드 스캔을 쓸 수 없어요. 상품명으로 검색해 보세요.');
  expect(SCAN_FAILED).toBe('바코드를 읽지 못했어요. 상품명으로 검색해 보세요.');
  expect(SCAN_HINT).toBe('바코드가 잘 안 읽히면 상품명으로 검색해 보세요.');
  expect(scanEmptyBody('19987')).toBe(
    "'19987' 바코드로 등록된 상품을 찾지 못했어요. 상품명으로 검색해 보세요.",
  );
});

test('every scan copy line ends with a concrete next step and blames nobody', () => {
  for (const line of [SCAN_PERMISSION_DENIED, SCAN_UNSUPPORTED, SCAN_FAILED, SCAN_HINT, scanEmptyBody('1')]) {
    expect(line).toContain('상품명으로 검색');
    expect(line).not.toContain('권한');
    expect(line).not.toContain('실패');
  }
});

test('a scan-origin empty announces the scan copy, not the typed copy', () => {
  const announced = announcementFor(
    { state: 'empty', query: '19987', suggestions: [], origin: 'scan' },
    defaultPolicy,
    0,
  );
  expect(announced).toEqual([scanEmptyBody('19987')]);
});
```

(The `copy.test.ts` header already imports `announcementFor` and `defaultPolicy`; extend the existing import lists rather than adding duplicates.)

Append to `src/ui/AnswerCard.test.tsx`:

```tsx
test('a scan-origin empty card tells the shopper to search by name instead of scanning again', () => {
  render(
    <AnswerCard
      ui={{ state: 'empty', query: '19987', suggestions: [], origin: 'scan' }}
      policy={defaultPolicy}
      nowMs={0}
    />,
  );
  expect(screen.getByText(scanEmptyBody('19987'))).toBeInTheDocument();
  expect(screen.queryByText(emptyBody('19987'))).not.toBeInTheDocument();
});
```

(Match the existing prop usage in this file — if other tests pass `cardRef`/`onRetry`, mirror that shape.)

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- src/domain/state-machine.test.ts src/ui/copy.test.ts src/ui/AnswerCard.test.tsx`
Expected: FAIL — `origin` is not assignable / `SCAN_*` not exported.

- [ ] **Step 3: Add provenance to the domain types**

In `src/domain/types.ts`, add above `StoreEvent`:

```ts
// Query provenance (app-owned, spec §4). Scan entry needs its own honest Empty copy: the Bible's typed
// Empty tells the shopper to scan, which is self-contradictory for someone who just scanned. Provenance
// selects COPY ONLY — it never participates in availability judgement or the meaning of the 6 states.
export type QueryOrigin = 'scan';
```

Then change the three members:

```ts
  | { type: 'SUBMIT'; query: string; origin?: QueryOrigin }
```
```ts
  | { state: 'loading'; query: string; slow: boolean; origin?: QueryOrigin }
  | { state: 'empty'; query: string; suggestions: string[]; origin?: QueryOrigin }
```

- [ ] **Step 4: Thread it through the reducer**

In `src/domain/state-machine.ts`, split the shared case and extend `NO_MATCH`:

```ts
    case 'SUBMIT':
      return { state: 'loading', query: event.query, slow: false, origin: event.origin };
    case 'SELECT_CANDIDATE':
      // A candidate tap is a product choice, not a scanned code — provenance ends here.
      return { state: 'loading', query: event.query, slow: false };
```
```ts
    case 'NO_MATCH':
      return {
        state: 'empty',
        query: event.query,
        suggestions: event.suggestions.slice(0, 3),
        // Same threading shape RESULT/FAILURE use for query: only a loading state carries provenance.
        origin: state.state === 'loading' ? state.origin : undefined,
      };
```

- [ ] **Step 5: Add the copy drafts**

Append to `src/ui/copy.ts`:

```ts
// ── Barcode scan (spec 2026-07-25-barcode-scan-design §6) ────────────────────────────────────────
// APP-OWNED DRAFTS, PENDING BIBLE RATIFICATION. The Bible defines the scan BUTTON and the typed Empty
// but is silent on every scan failure state (permission, decode, unsupported) and on the Empty a
// scan produces — its typed Empty tells the shopper to scan, which contradicts itself after a scan.
// Drafted to the Korean UX rules: result language only (no 권한이 없습니다-style blame, no technical
// terms), and every line ends with a concrete next step (Anti-goal 5). Replace verbatim on ratification.
export const SCAN_PERMISSION_DENIED = '카메라를 사용할 수 없어요. 상품명으로 검색해 보세요.';
export const SCAN_UNSUPPORTED = '이 브라우저에서는 바코드 스캔을 쓸 수 없어요. 상품명으로 검색해 보세요.';
export const SCAN_FAILED = '바코드를 읽지 못했어요. 상품명으로 검색해 보세요.';
// Shown while the camera STAYS OPEN after a slow decode (Bible Engineering §5: decode failure keeps
// the camera open and hints) — never a dead end, never an error frame.
export const SCAN_HINT = '바코드가 잘 안 읽히면 상품명으로 검색해 보세요.';

export function scanEmptyBody(value: string): string {
  return `'${value}' 바코드로 등록된 상품을 찾지 못했어요. 상품명으로 검색해 보세요.`;
}
```

And in `announcementFor`, change the empty case:

```ts
    case 'empty':
      return [ui.origin === 'scan' ? scanEmptyBody(ui.query) : emptyBody(ui.query)];
```

- [ ] **Step 6: Render it in the card**

In `src/ui/AnswerCard.tsx`, change the empty case (import `scanEmptyBody` alongside `emptyBody`):

```tsx
    case 'empty':
      return (
        <p className="text-body">
          {ui.origin === 'scan' ? scanEmptyBody(ui.query) : emptyBody(ui.query)}
        </p>
      );
```

- [ ] **Step 7: Run the gate**

Run: `npm test` then `npm run typecheck` then `npm run lint`
Expected: all PASS. If `origin: undefined` trips a lint/type rule, keep the explicit `origin: undefined` in the reducer (the tests above assert the shape) — `exactOptionalPropertyTypes` is not enabled in `tsconfig.json`.

- [ ] **Step 8: Commit**

```powershell
git add src/domain/types.ts src/domain/state-machine.ts src/domain/state-machine.test.ts src/ui/copy.ts src/ui/copy.test.ts src/ui/AnswerCard.tsx src/ui/AnswerCard.test.tsx
git commit -m "feat(scan): honest scan-origin copy drafts + query provenance for Empty"
```

---

### Task 3: ScannerOverlay component

**Files:**
- Create: `src/ui/components/ScannerOverlay.tsx`
- Test: `src/ui/components/ScannerOverlay.test.tsx`
- Modify: `src/styles/layout.css` (append)

**Interfaces:**
- Consumes: `ScannerPort`, `ScanOutcome` (Task 1); `SCAN_PERMISSION_DENIED`, `SCAN_UNSUPPORTED`, `SCAN_FAILED`, `SCAN_HINT` (Task 2); existing `SCAN_BUTTON_LABEL`, `STORE_SELECT_CLOSE`, `GlassSurface`.
- Produces: `ScannerOverlay({ scanner, onDecoded, onClose, hintDelayMs? })`.

- [ ] **Step 1: Write the failing component tests**

Create `src/ui/components/ScannerOverlay.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ScannerPort } from '../../domain/ports';
import { SCAN_BUTTON_LABEL, SCAN_HINT, SCAN_PERMISSION_DENIED, SCAN_UNSUPPORTED } from '../copy';
import { ScannerOverlay } from './ScannerOverlay';

const never: ScannerPort = { scan: () => new Promise(() => {}) };

test('is a labelled modal dialog that takes focus on open', async () => {
  render(<ScannerOverlay scanner={never} onDecoded={() => {}} onClose={() => {}} />);
  const dialog = screen.getByRole('dialog');
  expect(dialog).toHaveAttribute('aria-modal', 'true');
  expect(screen.getByRole('heading', { name: SCAN_BUTTON_LABEL })).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('button', { name: '닫기' })).toHaveFocus());
});

test('a decoded value is handed up exactly once', async () => {
  const decoded: string[] = [];
  const scanner: ScannerPort = { scan: async () => ({ kind: 'decoded', value: '19987' }) };
  render(<ScannerOverlay scanner={scanner} onDecoded={(v) => decoded.push(v)} onClose={() => {}} />);
  await waitFor(() => expect(decoded).toEqual(['19987']));
});

test('a permission denial shows the honest fallback copy and stays open', async () => {
  const scanner: ScannerPort = { scan: async () => ({ kind: 'permissionDenied' }) };
  render(<ScannerOverlay scanner={scanner} onDecoded={() => {}} onClose={() => {}} />);
  expect(await screen.findByText(SCAN_PERMISSION_DENIED)).toBeInTheDocument();
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});

test('an unsupported browser says so without a technical term', async () => {
  const scanner: ScannerPort = { scan: async () => ({ kind: 'unsupported' }) };
  render(<ScannerOverlay scanner={scanner} onDecoded={() => {}} onClose={() => {}} />);
  expect(await screen.findByText(SCAN_UNSUPPORTED)).toBeInTheDocument();
});

test('a slow decode keeps the camera open and only adds a hint', async () => {
  vi.useFakeTimers();
  try {
    render(
      <ScannerOverlay scanner={never} onDecoded={() => {}} onClose={() => {}} hintDelayMs={10} />,
    );
    expect(screen.queryByText(SCAN_HINT)).not.toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(11);
    expect(screen.getByText(SCAN_HINT)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});

test('닫기 and Escape both close', async () => {
  const user = userEvent.setup();
  let closes = 0;
  const { unmount } = render(
    <ScannerOverlay scanner={never} onDecoded={() => {}} onClose={() => { closes += 1; }} />,
  );
  await user.click(screen.getByRole('button', { name: '닫기' }));
  expect(closes).toBe(1);
  unmount();

  render(<ScannerOverlay scanner={never} onDecoded={() => {}} onClose={() => { closes += 1; }} />);
  await user.keyboard('{Escape}');
  expect(closes).toBe(2);
});

test('unmounting aborts the scan so the camera cannot outlive the overlay', async () => {
  let signal: AbortSignal | undefined;
  const scanner: ScannerPort = {
    scan: (_t, s) => {
      signal = s;
      return new Promise(() => {});
    },
  };
  const { unmount } = render(
    <ScannerOverlay scanner={scanner} onDecoded={() => {}} onClose={() => {}} />,
  );
  await waitFor(() => expect(signal).toBeDefined());
  unmount();
  expect(signal?.aborted).toBe(true);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- src/ui/components/ScannerOverlay.test.tsx`
Expected: FAIL — cannot resolve `./ScannerOverlay`.

- [ ] **Step 3: Implement the overlay**

Create `src/ui/components/ScannerOverlay.tsx`:

```tsx
// src/ui/components/ScannerOverlay.tsx
// Barcode viewfinder. The Bible defines the scan BUTTON and the entry path but never a scanning screen,
// so this overlay is an app-owned surface built on the StoreSelectionSheet precedent (modal dialog,
// Escape, focus). It is UI-shell state, NOT a 7th UiState — the 6 answer states are untouched.
// Every outcome ends with a concrete next step (Anti-goal 5); a slow decode keeps the camera open and
// only adds a hint (Bible Engineering §5).
import { useEffect, useRef, useState } from 'react';
import type { ScanOutcome, ScannerPort } from '../../domain/ports';
import {
  SCAN_BUTTON_LABEL,
  SCAN_FAILED,
  SCAN_HINT,
  SCAN_PERMISSION_DENIED,
  SCAN_UNSUPPORTED,
  STORE_SELECT_CLOSE,
} from '../copy';
import { GlassSurface } from './GlassSurface';

const DEFAULT_HINT_DELAY_MS = 10_000;

function noticeFor(outcome: ScanOutcome | null): string | null {
  if (!outcome) return null;
  switch (outcome.kind) {
    case 'permissionDenied':
      return SCAN_PERMISSION_DENIED;
    case 'unsupported':
      return SCAN_UNSUPPORTED;
    case 'failed':
      return SCAN_FAILED;
    default:
      return null; // decoded/cancelled leave no notice behind
  }
}

export function ScannerOverlay({
  scanner,
  onDecoded,
  onClose,
  hintDelayMs = DEFAULT_HINT_DELAY_MS,
}: {
  scanner: ScannerPort;
  onDecoded: (value: string) => void;
  onClose: () => void;
  hintDelayMs?: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);
  const [hinting, setHinting] = useState(false);

  // The dialog must own focus while it is open (Interface §6); 닫기 is the safe landing target.
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setHinting(true), hintDelayMs);
    return () => clearTimeout(timer);
  }, [hintDelayMs]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing) return; // IME composition Escape cancels the composition, not the overlay
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // One scan per mount. Unmount aborts it — the adapter stops the camera on abort, so the camera can
  // never outlive this overlay.
  useEffect(() => {
    const controller = new AbortController();
    let live = true;
    const video = videoRef.current;
    if (!video) return;
    scanner
      .scan({ video }, controller.signal)
      .then((result) => {
        if (!live || result.kind === 'cancelled') return;
        if (result.kind === 'decoded') {
          onDecoded(result.value);
          return;
        }
        setOutcome(result);
      })
      .catch(() => {
        // Defensive only: ScannerPort is contractually throw-free (spec §3.1).
        if (live) setOutcome({ kind: 'failed' });
      });
    return () => {
      live = false;
      controller.abort();
    };
  }, [scanner, onDecoded]);

  const notice = noticeFor(outcome);

  return (
    <GlassSurface className="scanner-overlay">
      <section role="dialog" aria-modal="true" aria-labelledby="scanner-title">
        <div className="scanner-overlay__header">
          <h2 id="scanner-title" className="text-heading">
            {SCAN_BUTTON_LABEL}
          </h2>
          <button ref={closeRef} type="button" className="text-label" onClick={onClose}>
            {STORE_SELECT_CLOSE}
          </button>
        </div>
        {/* Decorative preview: the camera image carries no information a screen reader can use — every
            state is stated in text below. */}
        <video ref={videoRef} className="scanner-overlay__video" aria-hidden="true" playsInline muted autoPlay />
        {notice ? (
          <p className="text-body">{notice}</p>
        ) : (
          hinting && <p className="text-caption">{SCAN_HINT}</p>
        )}
      </section>
    </GlassSurface>
  );
}
```

- [ ] **Step 4: Add the minimal styling**

Append to `src/styles/layout.css` (UI-last: layout only, polish is slice 3):

```css
/* Barcode scanner overlay — minimal layout only; presentation polish is the UI pass (HANDOFF slice 3). */
.scanner-overlay {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.scanner-overlay__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.scanner-overlay__video {
  width: 100%;
  max-height: 60vh;
  object-fit: cover;
}
```

Check the existing `.sheet-scrim` / `.store-selection-sheet` rules in this file first and match their z-index band and spacing conventions instead of inventing new ones.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- src/ui/components/ScannerOverlay.test.tsx`
Expected: PASS (7 tests). jsdom does not implement `HTMLMediaElement.play` — if a test errors on it, stub it in the test file with `vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)` rather than changing the component.

- [ ] **Step 6: Run the gate and commit**

Run: `npm test` then `npm run typecheck` then `npm run lint`

```powershell
git add src/ui/components/ScannerOverlay.tsx src/ui/components/ScannerOverlay.test.tsx src/styles/layout.css
git commit -m "feat(scan): accessible scanner overlay with honest outcome copy"
```

---

### Task 4: Surface wiring — store slice, runByScan, button, focus return

**Files:**
- Modify: `src/ui/store.ts:12-46`
- Modify: `src/ui/AvailabilitySurface.tsx` (module-scope adapters ~L38-42; new controller after `runByPdNo` ~L206; `searchBar` L257-281; each render branch's overlay mount)
- Test: `src/ui/AvailabilitySurface.test.tsx` (append)

**Interfaces:**
- Consumes: `createScanner` (Task 1), `QueryOrigin` (Task 2), `ScannerOverlay` (Task 3).
- Produces: `runByScan(store, value, dispatch, runner?)`; store fields `scannerOpen`, `openScanner()`, `closeScanner()`.

- [ ] **Step 1: Write the failing wiring tests**

Append to `src/ui/AvailabilitySurface.test.tsx` (follow the file's existing setup: it resets the store between tests — reuse that helper rather than writing a new one):

```tsx
test('runByScan queries availability by the decoded value as both keyword and pdNo', async () => {
  const calls: Array<{ keyword: string; pdNo?: string }> = [];
  const runner: QueryOutcomeRunner = async (_store, keyword, pdNo) => {
    calls.push({ keyword, pdNo });
    return { type: 'NO_MATCH', query: keyword, suggestions: [] };
  };
  await runByScan(storeA, '19987', useAvailabilityStore.getState().dispatch, runner);
  expect(calls).toEqual([{ keyword: '19987', pdNo: '19987' }]);
  expect(useAvailabilityStore.getState().ui).toMatchObject({ state: 'empty', origin: 'scan' });
});

test('a scan outcome that lands after a newer submit is dropped', async () => {
  const dispatch = useAvailabilityStore.getState().dispatch;
  let release: (() => void) | undefined;
  const slow: QueryOutcomeRunner = async () => {
    await new Promise<void>((r) => { release = r; });
    return { type: 'NO_MATCH', query: '19987', suggestions: [] };
  };
  const pending = runByScan(storeA, '19987', dispatch, slow);
  dispatch({ type: 'SUBMIT', query: '밀폐용기' }); // newer typed run supersedes the scan
  release?.();
  await pending;
  expect(useAvailabilityStore.getState().ui).toMatchObject({ state: 'loading', query: '밀폐용기' });
});

test('a scanned barcode is not recorded as a recent search', async () => {
  const before = useAvailabilityStore.getState().recentSearches;
  const runner: QueryOutcomeRunner = async () => ({ type: 'NO_MATCH', query: '19987', suggestions: [] });
  await runByScan(storeA, '19987', useAvailabilityStore.getState().dispatch, runner);
  expect(useAvailabilityStore.getState().recentSearches).toEqual(before);
});

test('tapping 바코드 스캔 opens the scanner dialog', async () => {
  const user = userEvent.setup();
  render(<AvailabilitySurface />);
  await user.click(screen.getByRole('button', { name: SCAN_BUTTON_LABEL }));
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
});

test('closing the scanner returns focus to the scan button', async () => {
  const user = userEvent.setup();
  render(<AvailabilitySurface />);
  const scanButton = screen.getByRole('button', { name: SCAN_BUTTON_LABEL });
  await user.click(scanButton);
  await user.click(await screen.findByRole('button', { name: '닫기' }));
  await waitFor(() => expect(scanButton).toHaveFocus());
});
```

Extend the file's existing imports with `runByScan`, `SCAN_BUTTON_LABEL`, and whatever the file already uses (`storeA`, `useAvailabilityStore`, `QueryOutcomeRunner`).

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- src/ui/AvailabilitySurface.test.tsx`
Expected: FAIL — `runByScan` is not exported; no dialog opens.

- [ ] **Step 3: Add the shell state**

In `src/ui/store.ts`, add to the interface and the store body:

```ts
  scannerOpen: boolean;
  openScanner: () => void;
  closeScanner: () => void;
```
```ts
  scannerOpen: false,
  openScanner: () => set({ scannerOpen: true }),
  closeScanner: () => set({ scannerOpen: false }),
```

- [ ] **Step 4: Add the controller**

In `src/ui/AvailabilitySurface.tsx`, after `runByPdNo`:

```ts
// Scan pipeline: a decoded barcode is already an exact identifier, so it skips the literal candidate
// search entirely (a candidate list would be noise, /api/search's store-carryable filter could drop the
// exact match, and it saves a round trip). The decoded value goes in verbatim as BOTH keyword (the
// server requires one) and pdNo (B29 pdNo-identity) — no EAN→pdNo guessing anywhere (spec §0 D3).
// The barcode is deliberately NOT recorded as a recent search: a digit string has no recall value.
export async function runByScan(
  store: StoreContext,
  value: string,
  dispatch: (event: StoreEvent) => void,
  runner: QueryOutcomeRunner = liveQueryRunner,
) {
  const token = ++latestRunToken;
  dispatch({ type: 'SUBMIT', query: value, origin: 'scan' }); // → loading(query=value, origin=scan)
  let event: StoreEvent;
  try {
    event = await runner(store, value, value);
  } catch {
    event = { type: 'FAILURE', cache: { kind: 'noCache' } };
  }
  if (token !== latestRunToken) return;
  if (!isCurrentRun(useAvailabilityStore.getState(), { keyword: value, strCd: store.strCd })) return;
  dispatch(event);
}
```

- [ ] **Step 5: Wire the button, the overlay and focus return**

Add to the module-scope adapter block (next to `productSearch` / `browserGeolocation`):

```ts
const scanner = createScanner();
```
(extend the existing `import { … } from '../adapters/composition';` line; import `ScannerOverlay` from `./components/ScannerOverlay`.)

In the component body, alongside the sheet selectors:

```ts
  const scannerOpen = useAvailabilityStore((s) => s.scannerOpen);
  const openScanner = useAvailabilityStore((s) => s.openScanner);
  const closeScanner = useAvailabilityStore((s) => s.closeScanner);
  const scanButtonRef = useRef<HTMLButtonElement>(null);
  const wasScannerOpen = useRef(scannerOpen);
```

Focus return, mirroring the existing sheet effect:

```ts
  // Closing the scanner (닫기 / Escape / a decode) returns focus to its opener — never <body>.
  useEffect(() => {
    if (wasScannerOpen.current && !scannerOpen) scanButtonRef.current?.focus();
    wasScannerOpen.current = scannerOpen;
  }, [scannerOpen]);
```

In `searchBar`, give the existing button its ref and handler (copy string unchanged):

```tsx
        <button
          ref={scanButtonRef}
          type="button"
          aria-label={SCAN_BUTTON_LABEL}
          className="text-label"
          onClick={openScanner}
        >
          {SCAN_BUTTON_LABEL}
        </button>
```

Build the overlay once next to `sheet` and render it in every branch that renders `searchBar` (default, candidates, and the answer-card branch) — the scanner must be reachable from every state (Bible: `barcode scan is always reachable`):

```tsx
  const scannerModal = scannerOpen && (
    <>
      <div className="sheet-scrim" aria-hidden="true" />
      <ScannerOverlay
        scanner={scanner}
        onDecoded={(value) => {
          closeScanner();
          void runByScan(store, value, dispatch);
        }}
        onClose={closeScanner}
      />
    </>
  );
```

Place `{scannerModal}` immediately after the `{sheetOpen && (…)}` block in each of the three returns, and extend `backgroundInert` so the background is inert for the scanner too:

```ts
  const backgroundInert = sheetOpen || scannerOpen ? '' : undefined;
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -- src/ui/AvailabilitySurface.test.tsx`
Expected: PASS, including the pre-existing typed/candidate/recent-search tests (regression guard).

- [ ] **Step 7: Run the gate and commit**

Run: `npm test` then `npm run typecheck` then `npm run lint`

```powershell
git add src/ui/store.ts src/ui/AvailabilitySurface.tsx src/ui/AvailabilitySurface.test.tsx
git commit -m "feat(scan): wire scan button to camera overlay and availability by decoded value"
```

---

### Task 5: E2E, bundle check, documentation

**Files:**
- Modify: `test/e2e/interactive.spec.ts`
- Modify: `docs/notes/open-questions.md` (new §B30 block after the §B29 block)
- Modify: `docs/HANDOFF.md` (completed list + 🟢 slice list + resume rule)
- Modify: `.superpowers/sdd/progress.md` (append a FEATURE entry)

**Interfaces:**
- Consumes: everything from Tasks 1-4.
- Produces: no code interfaces.

- [ ] **Step 1: Write the failing E2E spec**

Append to `test/e2e/interactive.spec.ts` (match the file's existing store-context seeding and helper style):

```ts
test('scanning a barcode answers with the availability card', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '바코드 스캔' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  // The DEV composition wires the mock scanner (no camera), which resolves the mock catalog's pdNo.
  await expect(page.getByText('이 매장에 있어요')).toBeVisible();
});
```

- [ ] **Step 2: Run it to verify it fails, then passes**

Run: `npm run e2e -- --project=dev -g "scanning a barcode"`
Expected: FAIL before Tasks 1-4 land; PASS now. If the dialog closes before the assertion, assert the answer card only (the overlay unmounts on decode).

- [ ] **Step 3: Verify the bundle split**

Run: `npm run build`
Expected: build succeeds and `@zxing` appears in a **separate** chunk, not in the entry chunk. Record the entry-chunk size in the commit message. If zxing landed in the main chunk, the dynamic import was hoisted — check that `browserScanner.ts` has no top-level `@zxing/library` import.

- [ ] **Step 4: Record the app decisions**

In `docs/notes/open-questions.md`, add a §B30 block in the same table format as §B29:

| # | 결정 | 확정 | 근거/검증 |
|---|---|---|---|
| B30-1 | 디코더 스택 | 네이티브 `BarcodeDetector` + 번들 `@zxing/library` 동적 import 폴백 | 외부 CDN 금지; 지연 청크라 초기 번들 불변 |
| B30-2 | 심볼로지 | EAN-13/8 · UPC-A/E · CODE-128/39 · ITF (QR·DataMatrix 제외) | 1D 상품 바코드만; QR 페이로드 미정의 + D082 혼동 회피 |
| B30-3 | 스캔 조회 경로 | 디코드값 = keyword = pdNo로 기존 `/api/availability` 재사용, `/api/search` 미경유 | 정확 식별자라 후보 리스트 무의미 + M2 필터 리스크 + 왕복 1회 절감 |
| B30-4 | 스캔 카피 4종 | 앱 정직 초안(권한·미지원·읽기 실패·힌트) + 스캔 전용 Empty | Bible 침묵 구간, owner 승인(2026-07-25) — **Bible 비준 대기** |
| B30-5 | 뷰파인더 상태 모델 | UI 셸 상태 `scannerOpen`(6상태 불변), 도메인엔 `origin?: 'scan'` 프로버넌스만 | 7번째 상태 신설 금지; provenance는 카피 선택 전용 |
| B30-6 | 바코드 숫자 최근 검색 미기록 | 기록 안 함 | 숫자열은 recognition-over-recall 가치 없음·목록 오염 |
| B30-7 | 물리 바코드 ↔ pdNo 관계 | **미확정 — 심 뒤 격리** | 프로브(2026-07-25, 5요청): SearchGoods doc **74필드에 바코드 필드 0건**, 하위 엔드포인트 유일 키 = `pdNo`. 실 상품 바코드 1개면 1요청으로 판정 가능(§B9 필드검증) |

Add a short prose line under the table noting that B30-4 is Bible-ratification-pending and B30-7 is the residual risk that would invalidate the scan path if the packaging carries EAN-13.

- [ ] **Step 5: Update HANDOFF and the ledger**

- `docs/HANDOFF.md`: add the feature to the completed list with the commit ids and the new gate numbers; strike item 2 in the 🟢 list; point the resume rule at slice 3 (candidate/photo UI polish).
- `.superpowers/sdd/progress.md`: append a `### FEATURE 2026-07-25: barcode scan entry` block in the established style — decisions, task-by-task commits, review outcomes, final gate numbers, and the fact that this is local-only (no push, no deploy).

- [ ] **Step 6: Final full gate**

Run: `npm test` then `npm run typecheck` then `npm run lint` then `npm run e2e`
Expected: unit all green (≈310), tsc clean, biome clean, Playwright 18/18 (17 + the new scan spec).

Also confirm no secret leaked into the staged diff and that the scratchpad probe scripts never entered the repo:

```powershell
git status --short
git diff --cached | Select-String -Pattern "PRE_AUTH_ENC_KEY|Bearer |x-dm-uid" -CaseSensitive
```
Expected: no untracked stray files; no secret matches.

- [ ] **Step 7: Commit**

```powershell
git add test/e2e/interactive.spec.ts docs .superpowers/sdd/progress.md
git commit -m "test(scan): e2e scan flow + record app decisions (B30)"
```

---

## Self-Review Notes

- Spec §3.1 port, §3.2 decoder strategy, §3.3 query path, §4 state model, §5 failure table, §6 copy, §7 a11y, §8 verification each map to a task above (1, 1, 4, 2+4, 1+3, 2, 3, 5).
- Spec §5 rows "오버레이 열린 채 매장 변경" is covered by Task 4's `backgroundInert` (the sheet cannot be opened while the scanner is modal) — no separate task needed.
- `runByScan` reuses `latestRunToken` and `isCurrentRun` from `AvailabilitySurface.tsx`; both already exist and are exported/module-scoped there.
- Names used consistently across tasks: `ScannerPort.scan`, `ScanOutcome.kind`, `createScanner`, `createMockScanner`, `MOCK_SCAN_VALUE`, `runByScan`, `scannerOpen`/`openScanner`/`closeScanner`, `scanEmptyBody`, `SCAN_PERMISSION_DENIED`/`SCAN_UNSUPPORTED`/`SCAN_FAILED`/`SCAN_HINT`.
