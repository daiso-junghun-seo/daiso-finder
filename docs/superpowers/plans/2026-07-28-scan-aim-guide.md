# Scan Aim Guide and 계산바코드 Instruction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the shopper a square aiming guide and an instruction that names the `계산바코드` label, and add the `decodeMs` measurement that makes the change provable.

**Architecture:** Four independent slices plus records. A `decodeMs` field lands first so a baseline can be measured before any UI changes. Then a decorative corner-bracket guide is overlaid on the scanner `<video>` inside a new positioned wrapper; then the aim-guide copy is replaced and its `계산바코드` token emphasised; then the scanner's `LiveRegion` stops rendering visible duplicate text; then the dev proxy starts serving `/api/search`.

**Tech Stack:** React 18.3, TypeScript strict, Zustand 4, Vitest + Testing Library, Playwright, Biome, Vite 5, plain CSS with design tokens.

**Spec:** [`../specs/2026-07-28-scan-aim-guide-design.md`](../specs/2026-07-28-scan-aim-guide-design.md)

## Global Constraints

- **No fabrication.** An unmeasured value renders as an explicit marker, never a plausible default. `decodeMs: null` means "not measured", never `0`.
- **Diagnostics never change app behaviour.** Adding `decodeMs` must not alter what `scan()` returns or when.
- **Nothing throws.** A diagnostics or decoration failure must never break a scan.
- **`ideal` only.** Do not touch the `getUserMedia` constraints. `exact`/`min` remain forbidden.
- **No 1D decoding.** `SCAN_FORMATS` stays `['data_matrix']`. The package's 880 barcode is an unused product number (owner statement, 2026-07-28).
- **Hiding technique.** Visually-hidden means clip-based only. `display: none` and `visibility: hidden` are **forbidden** — both remove the node from the accessibility tree and kill the announcement.
- **Copy.** Korean, one sentence, no technical vocabulary, 해요체. The canonical string is `'계산바코드' 표시 옆 사각형 코드를 네모에 꽉 채워 주세요.` — app-owned draft, pending Bible ratification.
- **No new `z-index`.** This codebase has zero `z-index` declarations; stacking is DOM order.
- **Language:** code, identifiers, comments and commit messages in English. User-visible strings in Korean.
- **Verification gate for every task:** `npm test`, `npm run typecheck`, `npm run lint` must all pass before commit.
- **Local only.** No push, no deploy, no PR.

---

## File Structure

**Create**

| File | Responsibility |
|---|---|
| `src/styles/layout.test.ts` | `?raw` text assertions on `layout.css` — the only place the hiding technique can be verified |
| `functions/api/handler-table.test.ts` | Asserts every non-test `functions/api/*.ts` is routed by the dev proxy |

**Modify**

| File | Change |
|---|---|
| `src/diagnostics/bus.ts` | Add `decodeMs` to `ScannerDiagnostics` and `emptyScanner()` |
| `src/diagnostics/bus.test.ts` | Pin `decodeMs` in the empty snapshot |
| `src/diagnostics/report.ts` | Render the `디코드` line |
| `src/diagnostics/report.test.ts` | Pin measured and unmeasured rendering |
| `src/adapters/barcode/browserScanner.ts` | Stamp `decodeMs` at the single outcome publish |
| `src/adapters/barcode/browserScanner.test.ts` | Pin the stamp through the injectable clock |
| `src/ui/components/ScannerOverlay.tsx` | Viewport wrapper, aim guide, token emphasis, hidden live region |
| `src/ui/components/ScannerOverlay.test.tsx` | New guide tests; repair four assertions the emphasis breaks |
| `src/styles/layout.css` | `__viewport`, `__aim`, and the visually-hidden utility |
| `src/ui/copy.ts` | Replace `SCAN_AIM_GUIDE`, add the token and the splitter |
| `src/ui/copy.test.ts` | Update the verbatim pin; cover the splitter |
| `src/ui/a11y/LiveRegion.tsx` | Optional `visuallyHidden` prop |
| `src/ui/a11y/LiveRegion.test.tsx` | Pin the class is applied only when asked |
| `scripts/dev-proxy.mjs` | Register `/api/search`; fix the stale header comment |
| `docs/deploy/gpu01-node-proxy.md` | "two routes" → three |
| `docs/notes/open-questions.md` | §B30-9, §B30-10, §B30-11 |
| `docs/HANDOFF.md` | Resume record |

---

## Task 1: `decodeMs` — the measurement that makes this provable

**Files:**
- Modify: `src/diagnostics/bus.ts`, `src/diagnostics/bus.test.ts`
- Modify: `src/diagnostics/report.ts`, `src/diagnostics/report.test.ts`
- Modify: `src/adapters/barcode/browserScanner.ts`, `src/adapters/barcode/browserScanner.test.ts`

**Interfaces:**
- Consumes: `publishScanner`, `beginScannerRun` (existing), `ScannerDeps.now` (existing, optional, defaults to `Date.now`).
- Produces: `ScannerDiagnostics.decodeMs: number | null`.

**Context:** the panel's `경과` line is `now - startedAt` recomputed on **every render** (`report.ts:97-98`, `DiagnosticsBar.tsx:67`), so it grows until the last render and includes the time the tester took to open the panel. It is an upper bound, not a decode duration. This task adds the settled measurement. **It goes first so a baseline can be taken on the real device before any UI changes land.**

- [ ] **Step 1: Write the failing tests**

Add to `src/diagnostics/bus.test.ts`, inside the existing fresh-bus test:

```ts
test('a fresh bus has not measured a decode', () => {
  expect(getSnapshot().scanner.decodeMs).toBeNull();
});
```

Add to `src/diagnostics/report.test.ts`:

```ts
// A settled run reports how long the decode actually took. This is NOT the 경과 line: that one is
// derived from Date.now() on every render, so it keeps growing after the run ends.
test('a measured decode duration is printed', () => {
  expect(buildReport(env, snapshotWith({ decodeMs: 8200 }), app, 2000)).toContain('8200ms');
});

test('an unmeasured decode is named, not defaulted to zero', () => {
  const report = buildReport(env, snapshotWith({ decodeMs: null }), app, 2000);
  expect(report).toContain(`디코드: ${UNREPORTED}`);
  expect(report).not.toMatch(/디코드: 0ms/);
});
```

Add to the `diagnostics instrumentation` describe block in `src/adapters/barcode/browserScanner.test.ts`:

```ts
// The clock advances 5ms per read. beginScannerRun takes the first, the decoder resolution takes the
// next two, and the outcome publish takes the last — so a stamp measured from the run's start reads 15.
// A stamp measured from the wrong anchor, or subtracted the wrong way round, cannot produce that.
test('the decode duration is stamped when the run settles', async () => {
  let t = 0;
  const now = () => {
    t += 5;
    return t;
  };
  const scanner = createBrowserScanner({
    mediaDevices: { getUserMedia: async () => fakeStreamWithSettings({ width: 640, height: 480 }) },
    createNativeDetector: async () => null,
    loadFallbackDecoder: async () => ({ decode: async () => '19987', cancel: () => {} }),
    now,
  });
  await scanner.scan(fakeTarget(), new AbortController().signal);
  const s = getSnapshot().scanner;
  expect(s.startedAt).toBe(5);
  expect(s.decodeMs).toBe(15);
});
```

Note: the expected `15` depends on how many times `now()` is read on the zxing path. Run the test and, if the number differs, **investigate before adjusting** — the count is documented in the comment and a surprise there means the anchor moved.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/diagnostics/bus.test.ts src/diagnostics/report.test.ts src/adapters/barcode/browserScanner.test.ts`
Expected: FAIL — `decodeMs` does not exist on `ScannerDiagnostics`.

- [ ] **Step 3: Add the field to the bus**

In `src/diagnostics/bus.ts`, add to `ScannerDiagnostics` immediately after `nativePolls`:

```ts
  // Wall-clock from beginScannerRun to the outcome publish. Distinct from the panel's 경과 line, which
  // is recomputed from Date.now() on every render and therefore only ever an upper bound.
  decodeMs: number | null;
```

and to `emptyScanner()` immediately after `nativePolls: null,`:

```ts
    decodeMs: null,
```

- [ ] **Step 4: Stamp it in the scanner**

In `src/adapters/barcode/browserScanner.ts`, replace the returned object's `scan` with:

```ts
    async scan(target, signal) {
      const startedAt = now();
      beginScannerRun(startedAt);
      const outcome = await runScan(target, signal);
      publishScanner({ outcome: outcome.kind, decodeMs: now() - startedAt });
      return outcome;
    },
```

Do not change `runScan` or anything inside it.

- [ ] **Step 5: Render it in the report**

In `src/diagnostics/report.ts`, add one line to `buildReport`'s array immediately after the `경과` line:

```ts
    `  디코드: ${s.decodeMs === null ? UNREPORTED : `${s.decodeMs}ms`}`,
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/diagnostics src/adapters/barcode`
Expected: PASS — the new tests plus every pre-existing test in those files.

- [ ] **Step 7: Run the full gate**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/diagnostics/bus.ts src/diagnostics/bus.test.ts src/diagnostics/report.ts src/diagnostics/report.test.ts src/adapters/barcode/browserScanner.ts src/adapters/barcode/browserScanner.test.ts
git commit -m "feat(diagnostics): stamp how long a scan actually took to decode"
```

---

## Task 2: The corner-bracket aim guide

**Files:**
- Modify: `src/ui/components/ScannerOverlay.tsx`, `src/ui/components/ScannerOverlay.test.tsx`
- Modify: `src/styles/layout.css`

**Interfaces:**
- Consumes: nothing new.
- Produces: DOM classes `scanner-overlay__viewport` and `scanner-overlay__aim`.

**Context:** the overlay currently renders header → `<video>` → paragraph, with no aiming affordance at all — the copy tells the shopper to fit the code into a frame that does not exist. The decoder reads the whole frame on both paths (native `detect(target.video)`; zxing draws `videoWidth`/`videoHeight` to a canvas), and `object-fit: cover` means it reads slightly **more** than is visible. So the guide is an aiming aid, never a crop: **no closed border, no dimmed surround.**

**`videoRef` must stay on the `<video>`.** Moving it to the wrapper makes `videoRef.current` a `<div>`, which does not trip the `if (!video) return;` guard — it fails later and more confusingly, or breaks the build on the `useRef<HTMLVideoElement>` type.

- [ ] **Step 1: Write the failing tests**

Add to `src/ui/components/ScannerOverlay.test.tsx`:

```tsx
test('a square aiming guide is drawn over the camera while scanning', () => {
  const { container } = render(
    <ScannerOverlay scanner={never} onDecoded={() => {}} onClose={() => {}} />,
  );
  const aim = container.querySelector('.scanner-overlay__aim');
  expect(aim).toBeInTheDocument();
  // Decoration only: the instruction below carries the meaning for assistive tech.
  expect(aim).toHaveAttribute('aria-hidden', 'true');
  // It must sit inside the positioned wrapper, next to the video it aims.
  expect(
    container.querySelector('.scanner-overlay__viewport .scanner-overlay__aim'),
  ).toBeInTheDocument();
});

// Leaving an aiming guide on screen after the camera failed would be an instruction the app cannot honour.
test('the aiming guide disappears once an outcome notice replaces the guidance', async () => {
  const scanner: ScannerPort = { scan: async () => ({ kind: 'permissionDenied' }) };
  const { container } = render(
    <ScannerOverlay scanner={scanner} onDecoded={() => {}} onClose={() => {}} />,
  );
  await screen.findByText(SCAN_PERMISSION_DENIED, noticeParagraph);
  expect(container.querySelector('.scanner-overlay__aim')).not.toBeInTheDocument();
});
```

These reuse what the file already has: the module-level `const never: ScannerPort` for a run that never settles (line 14), the inline `const scanner: ScannerPort = { scan: async () => ({ kind: … }) }` idiom for a settled outcome, and the `noticeParagraph` selector scope. `SCAN_PERMISSION_DENIED` and `ScannerPort` are already imported by the file — do not add duplicate imports.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/ui/components/ScannerOverlay.test.tsx`
Expected: FAIL — `.scanner-overlay__aim` is not in the document.

- [ ] **Step 3: Wrap the video and add the guide**

In `src/ui/components/ScannerOverlay.tsx`, replace the `<video …/>` element (and keep its two preceding comments) with:

```tsx
        <div className="scanner-overlay__viewport">
          {/* Decorative preview: the camera image carries no information a screen reader can use — every
              state is stated in text below. */}
          {/* biome-ignore lint/a11y/noAriaHiddenOnFocusable: <video> without controls is not focusable */}
          <video
            ref={videoRef}
            className="scanner-overlay__video"
            aria-hidden="true"
            playsInline
            muted
            autoPlay
          />
          {/* Aiming brackets, decoration only. Hidden once a notice lands: an aiming guide over a camera
              that failed is an instruction the app cannot honour. */}
          {!notice && (
            <div className="scanner-overlay__aim" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </div>
          )}
        </div>
```

- [ ] **Step 4: Add the styles**

Append to `src/styles/layout.css`:

```css
.scanner-overlay__viewport {
  position: relative;
}

/* Aiming brackets only — corners, never a closed box and never a dimmed surround. Both decode paths
   read the whole frame (and `object-fit: cover` means slightly more than is visible), so a boundary
   would imply a crop that does not exist; a dimmed mask would additionally hide the packaging the
   shopper is scanning for the code. Sized to 60% deliberately: filling it brings the phone closer,
   which is what raises pixels-per-module. 36vh caps it inside the video's own 60vh ceiling. */
.scanner-overlay__aim {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(60%, 36vh);
  aspect-ratio: 1;
  pointer-events: none;
}

/* White with a dark halo rather than a theme token: the surface behind is arbitrary camera imagery,
   so no palette value can guarantee contrast against it. Same reasoning as src/styles/diagnostics.css. */
.scanner-overlay__aim span {
  position: absolute;
  width: 18%;
  height: 18%;
  border: 2px solid #ffffff;
  filter: drop-shadow(0 0 1px rgba(0, 0, 0, 0.6));
}

.scanner-overlay__aim span:nth-child(1) {
  top: 0;
  left: 0;
  border-right: 0;
  border-bottom: 0;
}

.scanner-overlay__aim span:nth-child(2) {
  top: 0;
  right: 0;
  border-left: 0;
  border-bottom: 0;
}

.scanner-overlay__aim span:nth-child(3) {
  bottom: 0;
  left: 0;
  border-right: 0;
  border-top: 0;
}

.scanner-overlay__aim span:nth-child(4) {
  bottom: 0;
  right: 0;
  border-left: 0;
  border-top: 0;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/ui/components/ScannerOverlay.test.tsx`
Expected: PASS — the two new tests AND every pre-existing test in the file. In particular `expect(dialog.querySelectorAll('p')).toHaveLength(1)` must still pass: no paragraph was added.

- [ ] **Step 6: Run the full gate**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/ui/components/ScannerOverlay.tsx src/ui/components/ScannerOverlay.test.tsx src/styles/layout.css
git commit -m "feat(scan): draw corner brackets so the shopper has something to aim into"
```

---

## Task 3: The `계산바코드` instruction

**Files:**
- Modify: `src/ui/copy.ts`, `src/ui/copy.test.ts`
- Modify: `src/ui/components/ScannerOverlay.tsx`, `src/ui/components/ScannerOverlay.test.tsx`

**Interfaces:**
- Consumes: `.scanner-overlay__aim` from Task 2 — the 네모 the sentence refers to.
- Produces: `SCAN_AIM_GUIDE` (new text), `SCAN_AIM_GUIDE_TOKEN`, `splitAimGuide(sentence, token)`.

**Context:** the current sentence names a shape but no landmark, and the shopper's instinct is to frame the whole printed strip — which leaves the square code at about 30% of the frame. `'계산바코드'` is the label printed on the package (owner statement, 2026-07-28); D069 requires a token the shopper must match against the physical world to be rendered as the world renders it, so printing it verbatim is compliance, not an amendment. The sentence itself is an app-owned draft pending Bible ratification, exactly like the string it replaces (§B30-8).

**This task breaks four existing assertions.** That is expected and they are repaired here — `getByText(SCAN_AIM_GUIDE)` stops matching because Testing Library's `getNodeText` only concatenates *direct* text nodes, and the `<strong>` splits them.

- [ ] **Step 1: Write the failing tests**

Replace the `SCAN_AIM_GUIDE` line in `src/ui/copy.test.ts`'s verbatim block with:

```ts
  expect(SCAN_AIM_GUIDE).toBe("'계산바코드' 표시 옆 사각형 코드를 네모에 꽉 채워 주세요.");
```

and add:

```ts
// The panel emphasises the token in place, so the token must actually occur in the sentence.
test('the emphasised token is part of the aim guide sentence', () => {
  expect(SCAN_AIM_GUIDE).toContain(SCAN_AIM_GUIDE_TOKEN);
});

test('splitAimGuide returns the text before, the token, and the text after', () => {
  expect(splitAimGuide('ab TOKEN cd', 'TOKEN')).toEqual(['ab ', 'TOKEN', ' cd']);
});

// A split that cannot find its token must not swallow the instruction.
test('splitAimGuide returns null when the token is absent', () => {
  expect(splitAimGuide('no token here', 'TOKEN')).toBeNull();
});
```

Add to `src/ui/components/ScannerOverlay.test.tsx`:

```tsx
test('the aim guide names the 계산바코드 label and emphasises it', () => {
  const { container } = render(
    <ScannerOverlay scanner={never} onDecoded={() => {}} onClose={() => {}} />,
  );
  const guide = container.querySelector('#scanner-aim-guide');
  // The emphasis must not change what the sentence says — the dialog's description is computed from it.
  expect(guide?.textContent).toBe(SCAN_AIM_GUIDE);
  expect(guide?.querySelector('strong')?.textContent).toBe(SCAN_AIM_GUIDE_TOKEN);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/ui/copy.test.ts src/ui/components/ScannerOverlay.test.tsx`
Expected: FAIL — the verbatim pin fails on the old string, `splitAimGuide` is not exported, and no `<strong>` is rendered.

- [ ] **Step 3: Replace the copy and add the splitter**

In `src/ui/copy.ts`, replace the `SCAN_AIM_GUIDE` line and its preceding rationale comment with:

```ts
// Shown from the moment the viewfinder opens. Two failures made the previous wording ("상품의 정사각형
// 코드를 화면 안에 맞춰 주세요.") useless on a real device: there was no frame on screen to fit anything
// into, and naming only the SHAPE left the shopper to guess which part of the printed strip to aim at.
// '계산바코드' is the label printed on the package (owner statement, 2026-07-28) — a token the shopper
// matches against the physical world, so D069 keeps it exactly as the world renders it. "꽉 채워" is the
// operative instruction: filling the brackets brings the phone closer, which is what makes the code
// decodable. The symbology name stays out — a technical term the Korean UX rules forbid.
export const SCAN_AIM_GUIDE = "'계산바코드' 표시 옆 사각형 코드를 네모에 꽉 채워 주세요.";
// Emphasised in place by the viewfinder so the shopper can find the label at a glance.
export const SCAN_AIM_GUIDE_TOKEN = "'계산바코드'";

/** Split a sentence around a token so the token can be emphasised without duplicating the sentence. */
export function splitAimGuide(
  sentence: string,
  token: string,
): [string, string, string] | null {
  const at = sentence.indexOf(token);
  if (at === -1) return null;
  return [sentence.slice(0, at), token, sentence.slice(at + token.length)];
}
```

- [ ] **Step 4: Emphasise the token in the overlay**

In `src/ui/components/ScannerOverlay.tsx`, add `SCAN_AIM_GUIDE_TOKEN` and `splitAimGuide` to the existing `../copy` import, add above the component:

```tsx
const AIM_GUIDE_PARTS = splitAimGuide(SCAN_AIM_GUIDE, SCAN_AIM_GUIDE_TOKEN);
```

and replace the aim-guide paragraph's body:

```tsx
            <p id={AIM_GUIDE_ID} className="text-body">
              {AIM_GUIDE_PARTS ? (
                <>
                  {AIM_GUIDE_PARTS[0]}
                  <strong>{AIM_GUIDE_PARTS[1]}</strong>
                  {AIM_GUIDE_PARTS[2]}
                </>
              ) : (
                /* A token that cannot be found must never cost the shopper the instruction. */
                SCAN_AIM_GUIDE
              )}
            </p>
```

- [ ] **Step 5: Repair the four assertions the emphasis breaks**

In `src/ui/components/ScannerOverlay.test.tsx`:

- The three `getByText(SCAN_AIM_GUIDE)` lookups become `container.querySelector('#scanner-aim-guide')` with a `textContent` comparison, or a `getByText` with a normalizer — pick one and use it consistently.
- The `screen.getByRole('dialog', { name: SCAN_BUTTON_LABEL, description: SCAN_AIM_GUIDE })` lookup becomes a description **containment** check, not exact equality. Nesting inserts whitespace at element boundaries in the computed accessible description; a containment check also survives the Bible swapping the wording later:

```tsx
  const dialog = screen.getByRole('dialog', { name: SCAN_BUTTON_LABEL });
  expect(dialog).toHaveAccessibleDescription(expect.stringContaining('계산바코드'));
```

- **`expect(screen.queryByText(SCAN_AIM_GUIDE)).not.toBeInTheDocument()`** — this is the one that goes quiet rather than red. After the split it passes whether or not the guide is on screen, so it stops guarding "the guide disappears when a notice lands". Rewrite it against the id:

```tsx
  expect(container.querySelector('#scanner-aim-guide')).not.toBeInTheDocument();
```

Record in your report what the computed accessible description actually turned out to be.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/ui/copy.test.ts src/ui/components/ScannerOverlay.test.tsx`
Expected: PASS — new and repaired assertions, plus every other test in both files.

- [ ] **Step 7: Run the full gate**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/ui/copy.ts src/ui/copy.test.ts src/ui/components/ScannerOverlay.tsx src/ui/components/ScannerOverlay.test.tsx
git commit -m "feat(scan): tell the shopper to fill the brackets with the 계산바코드 code"
```

---

## Task 4: Stop the scanner announcing itself twice on screen

**Files:**
- Modify: `src/ui/a11y/LiveRegion.tsx`, `src/ui/a11y/LiveRegion.test.tsx`
- Modify: `src/ui/components/ScannerOverlay.tsx`
- Modify: `src/styles/layout.css`
- Create: `src/styles/layout.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `LiveRegion({ message, visuallyHidden? })`, CSS class `visually-hidden`.

**Context:** `LiveRegion` is a plain `<div>` with no visual hiding, so when the scanner shows an outcome notice the same sentence appears twice on screen. **Only the scanner's instance may be hidden.** `AvailabilitySurface.tsx:451` is the sole on-screen source of `LIVE_FRESHNESS_CAPTION` ('방금 확인한 재고예요') in the four non-inStock success states — `AnswerCard` renders that caption only in the inStock branch. Hiding it would delete information, and freshness framing is D061 philosophy the app may not decide. Leave both `AvailabilitySurface` call sites alone.

**Verification is not where you would expect it.** Vitest stubs plain CSS imports, so jsdom never applies `layout.css` — `getComputedStyle` cannot confirm anything was hidden, and `getByRole('status')` proves only that the node is still in the accessibility tree. The technique itself is verified by asserting on the stylesheet **text**.

- [ ] **Step 1: Write the failing tests**

Create `src/styles/layout.test.ts` (follow the `?raw` import pattern already used by `src/styles/glass.test.ts`):

```ts
import css from './layout.css?raw';

// display:none and visibility:hidden both remove the node from the accessibility tree, which would
// silence the very announcement this class exists to preserve. Clip-based hiding does not.
test('the visually-hidden utility hides without leaving the accessibility tree', () => {
  const rule = css.slice(css.indexOf('.visually-hidden'));
  expect(rule).toContain('clip-path');
  expect(rule.slice(0, rule.indexOf('}'))).not.toContain('display: none');
  expect(rule.slice(0, rule.indexOf('}'))).not.toContain('visibility: hidden');
});
```

Add to `src/ui/a11y/LiveRegion.test.tsx`:

```tsx
test('the region is visible by default', () => {
  render(<LiveRegion message="이 매장에 있어요" />);
  expect(screen.getByRole('status')).not.toHaveClass('visually-hidden');
});

test('it can be hidden visually while staying in the accessibility tree', () => {
  render(<LiveRegion message="이 매장에 있어요" visuallyHidden />);
  const region = screen.getByRole('status'); // getByRole excludes a11y-hidden nodes by default
  expect(region).toHaveClass('visually-hidden');
  expect(region).toHaveAttribute('aria-live', 'polite');
});
```

Add to `src/ui/components/ScannerOverlay.test.tsx`:

```tsx
// The notice already renders as a visible paragraph; the live region repeats it for assistive tech only.
test('the scanner live region does not duplicate the notice on screen', () => {
  const scanner: ScannerPort = { scan: async () => ({ kind: 'failed' }) };
  render(<ScannerOverlay scanner={scanner} onDecoded={() => {}} onClose={() => {}} />);
  expect(screen.getByRole('status')).toHaveClass('visually-hidden');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/styles/layout.test.ts src/ui/a11y/LiveRegion.test.tsx src/ui/components/ScannerOverlay.test.tsx`
Expected: FAIL — `.visually-hidden` is not in `layout.css` and `LiveRegion` takes no such prop.

- [ ] **Step 3: Add the utility class**

Append to `src/styles/layout.css`:

```css
/* Visually hidden, still announced. Clip-based on purpose: display:none and visibility:hidden remove
   the node from the accessibility tree, which would silence the live region entirely. */
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
```

- [ ] **Step 4: Give `LiveRegion` the option**

Replace `src/ui/a11y/LiveRegion.tsx`'s body:

```tsx
export function LiveRegion({
  message,
  visuallyHidden = false,
}: {
  message: string;
  // Opt-in per call site: on surfaces where the same sentence is already on screen, rendering it twice
  // is noise. Never turn this on where the live region is the only source of a line.
  visuallyHidden?: boolean;
}) {
  return (
    <div aria-live="polite" role="status" className={visuallyHidden ? 'visually-hidden' : undefined}>
      {message}
    </div>
  );
}
```

- [ ] **Step 5: Turn it on for the scanner only**

In `src/ui/components/ScannerOverlay.tsx`:

```tsx
        <LiveRegion message={notice ?? ''} visuallyHidden />
```

Do **not** touch the two `AvailabilitySurface` call sites.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/styles src/ui/a11y src/ui/components/ScannerOverlay.test.tsx`
Expected: PASS. `ScannerOverlay.test.tsx`'s existing `getByRole('status')` lookup must still pass — that is the evidence the node stayed in the accessibility tree.

- [ ] **Step 7: Run the full gate**

Run: `npm test && npm run typecheck && npm run lint && npm run e2e`
Expected: all pass. The e2e suite touches `AvailabilitySurface`'s live regions, which are unchanged.

- [ ] **Step 8: Commit**

```bash
git add src/ui/a11y/LiveRegion.tsx src/ui/a11y/LiveRegion.test.tsx src/ui/components/ScannerOverlay.tsx src/ui/components/ScannerOverlay.test.tsx src/styles/layout.css src/styles/layout.test.ts
git commit -m "fix(scan): stop the viewfinder printing its notice twice"
```

---

## Task 5: Serve `/api/search` from the dev proxy

**Files:**
- Modify: `scripts/dev-proxy.mjs`
- Create: `functions/api/handler-table.test.ts`
- Modify: `docs/deploy/gpu01-node-proxy.md`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing importable — a route registration and a guard test.

**Context:** `buildHandlers()` registers `/api/availability` and `/api/stores`, but the client calls `/api/search` (`productSearchRepository.ts:15`). The proxy 404s and the client swallows it (`if (!res.ok) return []`), so the failure is invisible: candidates are always empty under `dev:live` and every query falls through to the keyword-only branch. **This does not affect the scan path** — `runByScan` skips the literal candidate search — but it does affect typed search, and after this fix keywords with two or more candidates will render the candidates state where they previously did not.

`functions/api/search.ts`'s `onRequestPost` signature is byte-identical to the other two, and it needs no env the proxy does not already supply (`SEARCH_BASE`, already in `.dev.vars`).

- [ ] **Step 1: Write the failing test**

Create `functions/api/handler-table.test.ts`:

```ts
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

// dev-proxy.mjs exports nothing and calls main() at module scope, so importing it would start a server.
// Compare the source text instead: a route silently missing from the table is invisible at runtime —
// the client turns the resulting 404 into an empty result.
test('every Pages Function under functions/api is routed by the dev proxy', () => {
  const root = path.resolve(__dirname, '../..');
  const proxy = readFileSync(path.join(root, 'scripts/dev-proxy.mjs'), 'utf8');
  const handlers = readdirSync(path.join(root, 'functions/api'))
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((f) => `functions/api/${f}`);
  expect(handlers.length).toBeGreaterThan(0);
  for (const handler of handlers) {
    expect(proxy).toContain(handler);
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run functions/api/handler-table.test.ts`
Expected: FAIL — `functions/api/search.ts` is not present in the proxy source.

- [ ] **Step 3: Register the route**

In `scripts/dev-proxy.mjs`, add the entry to `buildHandlers()` in path order:

```js
async function buildHandlers() {
  return {
    '/api/availability': await loadHandler('functions/api/availability.ts'),
    '/api/search': await loadHandler('functions/api/search.ts'),
    '/api/stores': await loadHandler('functions/api/stores.ts'),
  };
}
```

Then update the file's header comment so its route enumeration includes `/api/search`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run functions/api/handler-table.test.ts`
Expected: PASS.

- [ ] **Step 5: Fix the deploy doc**

In `docs/deploy/gpu01-node-proxy.md`, the line describing the proxy as `two routes (/api/availability, /api/stores)` becomes three, including `/api/search`. Add a note that the gpu01 process runs this same file and therefore needs the redeploy.

- [ ] **Step 6: Run the full gate**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add scripts/dev-proxy.mjs functions/api/handler-table.test.ts docs/deploy/gpu01-node-proxy.md
git commit -m "fix(proxy): serve /api/search so typed search finds candidates locally"
```

---

## Task 6: Records

**Files:**
- Modify: `docs/notes/open-questions.md`, `docs/HANDOFF.md`

**Interfaces:** none.

**Context:** the scan copy set is tracked in `§B30` as app-owned drafts pending Bible ratification. Three new rows join it. Match the existing rows' exact table structure, numbering and Korean register — read `§B30-1` through `§B30-8` before writing.

- [ ] **Step 1: Add the decision rows**

In `docs/notes/open-questions.md`, append these two rows to the `§B30` table. The table's columns are `# | 항목 | 결정 | 근거·검증` — match the register of B30-1…B30-8 above them, and keep the bold conventions they use.

```markdown
| B30-9 | 조준 카피 정정 | `SCAN_AIM_GUIDE`를 `'계산바코드' 표시 옆 사각형 코드를 네모에 꽉 채워 주세요.`로 교체 + 토큰 `<strong>` 강조 | 실기기(2026-07-28)에서 기존 문구는 **없는 프레임에 맞추라고 지시**하고 있었고, 형상만 말해 인쇄 덩어리 안 어디를 겨눌지 알려주지 않았다. `'계산바코드'`는 포장 인쇄 표기(**오너 진술** 2026-07-28) — D069는 쇼퍼가 물리 세계와 대조하는 토큰을 세계가 렌더하는 대로 유지하라 하므로 그대로 적는 것은 **이행**이다. 앱 정직 초안, **Bible 비준 대기**(B30-4·B30-8과 동일 성격). ⚠️ `옆`은 관측된 포장 **1개** 기준 — 다른 배치가 발견되면 정정 대상 |
| B30-10 | 조준 가이드 도형 | 정사각 **모서리 브래킷**(짧은 변 60%). 닫힌 테두리·바깥 딤 마스크는 채택하지 않음 | 두 디코드 경로 모두 프레임 전체를 읽고(`detect(target.video)` / zxing은 `videoWidth`·`videoHeight` 전체를 캔버스에 그림), `object-fit: cover` 때문에 **보이는 범위보다 넓게** 읽는다 — 경계선은 존재하지 않는 크롭을 함의하고, 딤 마스크는 쇼퍼가 코드를 찾는 포장면을 가린다. 60%는 의도적 — 채우려면 기기를 가까이 대게 되고 그것이 모듈당 픽셀을 올린다. **이 인과는 가설이며 `decodeMs`로 측정한다**(§B30-11) |
| B30-11 | 디코드 시간 측정 | `ScannerDiagnostics.decodeMs` 추가 — `outcome` 발행 시점에 스탬프 | 패널의 `경과`는 `now - startedAt`을 **매 렌더 재계산**하므로(`report.ts`, `DiagnosticsBar.tsx`) 런 종료 후에도 계속 자라고 테스터가 패널을 여는 시간까지 포함한다 = **상한**. 2026-07-28의 `경과: 14.1s`를 디코드 시간으로 읽은 것은 오독이었고 기준선이 아니다. B30-10의 가설은 이 필드 없이는 검증 불가 |
```

- [ ] **Step 2: Refresh the resume record**

In `docs/HANDOFF.md`, update the resume record: the measured gate counts from the run you do in step 3 (not predicted ones), and a next-step line stating that the real-device re-measurement is outstanding and how to do it — `HOST=0.0.0.0 npm run dev:live` (the default `127.0.0.1` is unreachable from a phone) or a tunnel, open `?debug=1`, scan the 계산바코드, and record `디코드`. Note explicitly that **`경과: 14.1s` is not a baseline** — it is an upper bound that included the time taken to open the panel — so a baseline must be captured with the current build before comparing.

- [ ] **Step 3: Run the full gate**

Run: `npm test && npm run typecheck && npm run lint && npm run build && npm run e2e`
Expected: all pass. Record the measured counts.

- [ ] **Step 4: Commit**

```bash
git add docs/notes/open-questions.md docs/HANDOFF.md
git commit -m "docs(scan): record the aim guide and 계산바코드 decisions"
```

---

## Verification Summary

After Task 6 the branch delivers:

1. The panel reports `디코드`, a settled measurement, alongside the `경과` upper bound it should never have been read as.
2. The viewfinder shows square corner brackets while scanning, and hides them the moment the camera fails.
3. The instruction names `'계산바코드'` in bold and tells the shopper to fill the brackets.
4. The scanner's outcome notice appears once on screen instead of twice, with the announcement intact.
5. `dev:live` serves `/api/search`, and a test fails if a fourth route is ever added without routing it.

**What it does not deliver:** proof that any of this made decoding faster. That requires the real-device measurement in `docs/HANDOFF.md` — a baseline on the current build first, then the same product and lighting after. Until those two numbers exist, the framing hypothesis stays a hypothesis.
