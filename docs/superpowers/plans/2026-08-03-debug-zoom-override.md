# Debug Zoom Override Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a diagnostics session request a specific camera zoom factor via `?debug=1&zoom=N`, so the next real-device run can finally produce a `zoom != 2` sample and settle whether zoom raises pixels-per-module.

**Architecture:** A pure parser in `src/diagnostics/enabled.ts` turns the URL into `number | null`; the composition root passes it into `createBrowserScanner` as a `ScannerDeps` seam; the adapter uses it in place of the production cap when computing what to ask `applyConstraints` for, and publishes what it intended so the panel can show it. No URL reading inside the adapter.

**Tech Stack:** React 18 + TypeScript, Vitest, Biome.

**Design doc:** [`docs/superpowers/specs/2026-08-03-debug-zoom-override-design.md`](../specs/2026-08-03-debug-zoom-override-design.md)

## Global Constraints

- **`MAX_SCAN_ZOOM = 2` does not change, and the override may never exceed it.** It is a correctness bound: past a model's `virtualDeviceSwitchOverVideoZoomFactors` (3x or 5x) an iPhone hands the session to the telephoto lens, which cannot focus close. An override of `3` is rejected, not clamped — see Task 1.
- **The device's own reported ceiling still clamps DOWN.** `min(override ?? MAX_SCAN_ZOOM, capabilities.zoom.max)`.
- **The gate is `isDiagnosticsEnabled()`, not "the URL carries `debug=1`."** The debug flag persists in `sessionStorage`, and a session enabled that way must still honour the override.
- **`zoom` is never persisted.** URL-only, re-read every load. `resolveZoomOverride` must not take a `Storage` parameter.
- **No fabrication.** A rejected or absent override must leave production behaviour exactly as it is today, and the panel must never show a requested factor as though it were applied. The existing `줌 적용:` line stays a `getSettings()` read-back.
- **A rejected override must be visible.** A silently ignored typo would have the tester record a 2.0 run believing it was 1.0 — producing the inverted conclusion "changing zoom does not change symbol size".
- **Answer states untouched:** the 6 `UiState` values, transitions, Zustand wiring, `ScannerPort`, all UX copy, the decode path, and bracket geometry do not change.
- Korean for UX copy; **English for code, identifiers, comments and commit messages**. The panel is a diagnostics surface and its labels are Korean, matching its neighbours.
- Windows 11 / PowerShell. No Linux-only command examples.
- Work on a new branch `feat/debug-zoom-override` cut from `main` (`f690df3`). Do not push. Do not merge without an independent review.

---

### Task 1: Parse the override

**Files:**
- Modify: `src/diagnostics/enabled.ts`
- Test: `src/diagnostics/enabled.test.ts`

**Interfaces:**
- Produces: `export function resolveZoomOverride(search: string, diagnosticsEnabled: boolean): number | null`, and `export const ZOOM_PARAM = 'zoom'`. Task 2 calls it. It is pure — no `Storage`, no globals — which is what structurally guarantees the no-persistence rule.

- [ ] **Step 0: Cut the branch**

```bash
git checkout main && git checkout -b feat/debug-zoom-override
```

- [ ] **Step 1: Write the failing tests**

Append to `src/diagnostics/enabled.test.ts`, following that file's existing style. `MAX_SCAN_ZOOM` is deliberately NOT imported here — the adapter owns that constant, and importing it would couple a URL parser to a camera module. The literal `2` is written out, and the comment says why.

```ts
// The sweep parameter. Gated on diagnostics being ON — which is `isDiagnosticsEnabled()`, not "the URL
// carries debug=1", because that flag persists in sessionStorage and a session enabled that way must
// still honour the override. Requiring the parameter on every load is backwards for a test session
// driven from a phone.
test('a valid zoom override is accepted when diagnostics is on', () => {
  expect(resolveZoomOverride('?zoom=1', true)).toBe(1);
  expect(resolveZoomOverride('?zoom=1.5', true)).toBe(1.5);
  // The production cap itself is allowed: it is the other half of the 1.0-vs-2.0 comparison.
  expect(resolveZoomOverride('?zoom=2', true)).toBe(2);
});

// 2 is written as a literal rather than imported from the adapter: a URL parser must not depend on a
// camera module, and the coupling is stated in the design (§0) instead. Above the cap the value is
// REJECTED, never clamped — a silently clamped 3 would record a 2.0 run under a URL that says 3.
test('an override above the production cap is rejected outright, not clamped', () => {
  expect(resolveZoomOverride('?zoom=3', true)).toBeNull();
  expect(resolveZoomOverride('?zoom=2.0001', true)).toBeNull();
});

test('a non-positive, non-numeric or non-finite override is rejected', () => {
  for (const raw of ['0', '-1', 'abc', '', 'NaN', 'Infinity', '1e400']) {
    expect(resolveZoomOverride(`?zoom=${raw}`, true)).toBeNull();
  }
  // Absent entirely — the ordinary production case.
  expect(resolveZoomOverride('', true)).toBeNull();
});

// The gate, both directions. The second half is the one that would have broken in the field: a tester
// who enabled ?debug=1 on a previous load and then opened ?zoom=1 must still get the override.
test('the override is honoured only while diagnostics is on, whatever turned it on', () => {
  expect(resolveZoomOverride('?zoom=1', false)).toBeNull();
  expect(resolveZoomOverride('?debug=1&zoom=1', false)).toBeNull();
  expect(resolveZoomOverride('?zoom=1', true)).toBe(1);
});
```

Add `resolveZoomOverride` to the existing import from `./enabled` at the top of the file.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run src/diagnostics/enabled.test.ts`
Expected: FAIL — `resolveZoomOverride is not a function` (or a TypeScript error on the import), on every one of the four tests.

- [ ] **Step 3: Implement**

Add to `src/diagnostics/enabled.ts`, next to `DEBUG_PARAM`:

```ts
export const ZOOM_PARAM = 'zoom';

// The upper bound is the adapter's MAX_SCAN_ZOOM, deliberately duplicated as a literal rather than
// imported: this module parses URLs and must not depend on a camera module. The duplication is
// recorded in the design (§0) and pinned by the test next door. Raising one without the other is
// caught there.
const MAX_ZOOM_OVERRIDE = 2;

/**
 * The sweep parameter, or null when there is nothing to honour.
 *
 * PURE, and the signature is the point: no `Storage` parameter, so a zoom cannot persist the way the
 * debug flag does. A sticky zoom would ride a later run the tester had forgotten about — the sweep tool
 * corrupting the sweep.
 *
 * Out of range is REJECTED rather than clamped. Clamping would let `?zoom=3` record a 2.0 run under a
 * URL that claims 3, which is exactly the mis-attribution this parameter exists to avoid.
 */
export function resolveZoomOverride(
  search: string,
  diagnosticsEnabled: boolean,
): number | null {
  if (!diagnosticsEnabled) return null;
  const raw = new URLSearchParams(search).get(ZOOM_PARAM);
  if (raw === null || raw.trim() === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  if (value <= 0 || value > MAX_ZOOM_OVERRIDE) return null;
  return value;
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run src/diagnostics/enabled.test.ts`
Expected: PASS, every test in the file.

- [ ] **Step 5: Prove the tests have teeth**

Back the file up first — use a file copy, **never** `git checkout --`, which would also discard Step 3:

```bash
cp src/diagnostics/enabled.ts "$TEMP/enabled.bak"
```

| Mutation | Must kill |
|---|---|
| Delete `if (value <= 0 \|\| value > MAX_ZOOM_OVERRIDE) return null;` | "rejected outright, not clamped" and "non-positive... rejected" |
| Replace that line with a clamp: `return Math.min(value, MAX_ZOOM_OVERRIDE)` | "rejected outright, not clamped" |
| Delete `if (!diagnosticsEnabled) return null;` | "honoured only while diagnostics is on" |
| Delete `if (!Number.isFinite(value)) return null;` | "non-numeric or non-finite ... rejected" |

Restore with `cp "$TEMP/enabled.bak" src/diagnostics/enabled.ts` after each. A surviving mutation means the test does not pin what its name claims — report it rather than adjusting the test to match.

- [ ] **Step 6: Commit**

```bash
npm run test
git add src/diagnostics/enabled.ts src/diagnostics/enabled.test.ts
git commit -m "feat(diagnostics): parse the debug-only zoom override

A pure parser with no Storage parameter, which is what structurally keeps a zoom
from persisting the way the debug flag does -- a sticky zoom would ride a later
run the tester had forgotten about.

Out of range is rejected, not clamped: a clamped ?zoom=3 would record a 2.0 run
under a URL claiming 3, the exact mis-attribution this parameter exists to avoid.

Gated on isDiagnosticsEnabled() rather than on the URL carrying debug=1, because
that flag persists and a session enabled earlier must still honour the override.

All four tests proven by mutation."
```

---

### Task 2: Plumb it through and apply it

**Files:**
- Modify: `src/adapters/barcode/browserScanner.ts`
- Modify: `src/adapters/composition.ts`
- Test: `src/adapters/barcode/browserScanner.test.ts`

**Interfaces:**
- Consumes: `resolveZoomOverride` from Task 1.
- Produces: a new optional `ScannerDeps` field `zoomOverride?: number | null`, and `zoomTarget(track, override)`. Task 3 publishes what this task decided.

- [ ] **Step 1: Write the failing tests**

Append to the zoom section of `src/adapters/barcode/browserScanner.test.ts`, beside the existing zoom tests. `fakeZoomStream` and `zoomScanner` already exist in that file — `zoomScanner(stream, extra)` spreads `extra` last, so `zoomOverride` can be passed straight through.

```ts
// THE WHOLE POINT OF THE PARAMETER: the sweep needs a `zoom != 2` sample, and until now every run
// requested the cap. 1 is the baseline the record has never had (open-questions §B30-19 ④).
test('a debug zoom override is what gets requested, in place of the cap', async () => {
  const { stream, requests } = fakeZoomStream({
    zoom: { min: 0.5, max: 10, step: 0.1 },
    settings: { width: 1920, height: 1080 },
  });
  await zoomScanner(stream, { zoomOverride: 1 }).scan(fakeTarget(), new AbortController().signal);
  expect(requests).toEqual([{ advanced: [{ zoom: 1 }] }]);
});

// The device ceiling still wins. An override is a request for LESS than the cap, never a way around a
// camera's own limit — the clamp that already governs the cap governs the override identically.
test('a camera whose ceiling is below the override is asked for its ceiling', async () => {
  const { stream, requests } = fakeZoomStream({
    zoom: { min: 1, max: 1.5, step: 0.1 },
    settings: { width: 1920, height: 1080, zoom: 1.5 },
  });
  await zoomScanner(stream, { zoomOverride: 2 }).scan(fakeTarget(), new AbortController().signal);
  expect(requests).toEqual([{ advanced: [{ zoom: 1.5 }] }]);
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run src/adapters/barcode/browserScanner.test.ts`
Expected: the first test FAILS — the request is `{ zoom: 2 }` because the override is ignored. The second may pass already (the clamp exists and 1.5 < 2 either way); note in the report which of the two failed and which did not, and rely on Step 5's mutation for the one that passed.

- [ ] **Step 3: Implement**

In `src/adapters/barcode/browserScanner.ts`:

1. Add to the `ScannerDeps` interface, beside `pollIntervalMs`:

```ts
  // DIAGNOSTICS ONLY, and null in every production run. The composition root resolves it from
  // `?debug=1&zoom=N`; this module never reads a URL. It replaces the cap as the factor to request but
  // can never exceed it — resolveZoomOverride rejects anything above MAX_SCAN_ZOOM, so the lens-switch
  // bound the cap exists to enforce holds whether or not an override is present.
  zoomOverride?: number | null;
```

2. Capture it beside the other deps in `createBrowserScanner` (next to `frameLoopDeps`):

```ts
  const zoomOverride = deps.zoomOverride ?? null;
```

3. Thread it to `applyScanZoom` — change the call to `await applyScanZoom(stream, now, zoomOverride);` and the signature to `async function applyScanZoom(stream: MediaStream, now: () => number, override: number | null): Promise<void>`, passing it on to `zoomTarget(track, override)`.

4. Change `zoomTarget` to take the override and use it as the ceiling to request:

```ts
function zoomTarget(track: MediaStreamTrack, override: number | null): number | null {
  if (typeof track.getCapabilities !== 'function') return null;
  // The override replaces the cap as what we ASK for; it can never exceed it, because
  // resolveZoomOverride rejects anything above MAX_SCAN_ZOOM before it reaches this module.
  const wanted = override ?? MAX_SCAN_ZOOM;
  try {
    const capabilities: ExtendedCapabilities = track.getCapabilities();
    const max = capabilities.zoom?.max;
    // A reported range with no max is a range whose ceiling we do not know. Ask for what we want and let
    // `advanced` drop it if the device cannot honour it, rather than inventing a ceiling.
    if (typeof max !== 'number' || !Number.isFinite(max))
      return capabilities.zoom ? wanted : null;
    return Math.min(wanted, max);
  } catch {
    return null;
  }
}
```

In `src/adapters/composition.ts`, resolve it at the composition root:

```ts
export function createScanner(): ScannerPort {
  return import.meta.env.PROD
    ? createBrowserScanner({
        // Read HERE, not in the adapter: this is the only place in the app that knows about the URL,
        // and the adapter's whole discipline is that every capability arrives through ScannerDeps.
        zoomOverride:
          typeof window === 'undefined'
            ? null
            : resolveZoomOverride(window.location.search, isDiagnosticsEnabled()),
      })
    : createMockScanner();
}
```

Add the import: `import { isDiagnosticsEnabled, resolveZoomOverride } from '../diagnostics/enabled';` (check whether `isDiagnosticsEnabled` is already imported there before adding a duplicate).

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run src/adapters/barcode/browserScanner.test.ts`
Expected: PASS, every test in the file — including the pre-existing `zoom is requested once, capped at 2, and only through the best-effort advanced list`, which must still see `{ zoom: 2 }` when no override is passed. If that test fails, the default was not preserved.

- [ ] **Step 5: Prove the tests have teeth**

```bash
cp src/adapters/barcode/browserScanner.ts "$TEMP/bs.bak"
```

| Mutation | Must kill |
|---|---|
| In `zoomTarget`, ignore the parameter: `const wanted = MAX_SCAN_ZOOM;` | "a debug zoom override is what gets requested" |
| Replace the clamp with `return wanted;` | "asked for its ceiling" |
| In `createBrowserScanner`, hardcode `const zoomOverride = null;` | "a debug zoom override is what gets requested" |

Restore with `cp "$TEMP/bs.bak" src/adapters/barcode/browserScanner.ts` after each.

- [ ] **Step 6: Commit**

```bash
npm run test
git add src/adapters/barcode/browserScanner.ts src/adapters/composition.ts src/adapters/barcode/browserScanner.test.ts
git commit -m "feat(scan): request the debug zoom override in place of the cap

The override replaces the cap as the factor to ask for and can never exceed it:
resolveZoomOverride rejects anything above MAX_SCAN_ZOOM before it reaches the
adapter, so the lens-switch bound holds either way. The device's own reported
ceiling still clamps down.

Resolved at the composition root; the adapter never reads a URL, matching the
rule that every capability arrives through ScannerDeps.

Both tests proven by mutation, and the pre-existing no-override test still pins
{ zoom: 2 }."
```

---

### Task 3: Show what was requested

**Files:**
- Modify: `src/diagnostics/bus.ts`
- Modify: `src/adapters/barcode/browserScanner.ts`
- Modify: `src/diagnostics/report.ts`
- Test: `src/diagnostics/report.test.ts`

**Interfaces:**
- Consumes: the override captured in Task 2.
- Produces: `ScannerDiagnostics.zoomRequested: number | null` and the panel line `줌 요청:`.

**Why this is its own task:** Task 2 makes the override work; without this task nothing on screen says it worked, and a typo'd URL produces a run that looks valid but is not. That is the finding the design calls load-bearing (§3).

- [ ] **Step 1: Write the failing tests**

Append to `src/diagnostics/report.test.ts`, following the existing style there (the file builds a snapshot and asserts on the rendered line).

```ts
// THE FEEDBACK THAT MAKES THE PARAMETER USABLE. Without it a mistyped URL is indistinguishable from a
// working one: the tester records a 2.0 run believing it was 1.0, and the sweep concludes "changing
// zoom does not change symbol size" — the inverse of the truth.
test('an override that was honoured is reported as a REQUEST, beside what the camera confirmed', () => {
  const report = renderFor({ zoomRequested: 1, appliedZoom: 1 });
  expect(report).toContain('줌 요청: 1');
  expect(report).toContain('줌 적용: 1');
});

// No override is the production case, and the panel must look exactly as it did before this parameter
// existed — an absent line, not `줌 요청: 미보고`, which would be noise about something nobody asked for.
test('with no override the request line is absent entirely', () => {
  expect(renderFor({ zoomRequested: null })).not.toContain('줌 요청');
});
```

Write `renderFor` to match however the file's existing zoom tests build their snapshot (they use `trackWith(...)` / a scanner snapshot object — reuse that helper rather than inventing a second one, and if no such helper exists, follow the shape the neighbouring `카메라 기능` tests use).

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run src/diagnostics/report.test.ts`
Expected: the first FAILS (no `줌 요청` in the output); the second passes trivially, and earns its keep from the Step 5 mutation.

- [ ] **Step 3: Implement**

In `src/diagnostics/bus.ts`, add beside `appliedZoom` (around line 102) and to the reset object (around line 183):

```ts
  // What we INTENDED to ask for, and only ever set by a diagnostics session's ?zoom=N. null in every
  // production run. Kept separate from appliedZoom because they answer different questions: this one
  // says the parameter parsed, that one says the camera confirmed.
  zoomRequested: number | null;
```

In `src/adapters/barcode/browserScanner.ts`, publish it as the FIRST thing `applyScanZoom` does — **before** the `!track` early return:

```ts
async function applyScanZoom(
  stream: MediaStream,
  now: () => number,
  override: number | null,
): Promise<void> {
  // Published BEFORE any early return, deliberately. It is a fact about this RUN's configuration, not
  // about the camera, so it must appear even when the track names no zoom range and nothing is
  // requested — otherwise "the override did not parse" and "this camera has no zoom" would collapse
  // into the same blank line, and the tester could not tell a bad URL from an incapable device.
  if (override !== null) publishScanner({ zoomRequested: override });
  const track = stream.getVideoTracks?.()[0];
  …
```

In `src/diagnostics/report.ts`, add the line immediately **above** `줌 적용:` (so the request reads before the confirmation), rendered only when present:

```ts
    // Only when a diagnostics session actually asked. Absent — not 미보고 — when nobody did: an
    // unreported marker here would be noise about a bound nobody claimed, the same rule the capability
    // ranges follow. Placed above 줌 적용 so the pair reads request-then-confirmation.
    ...(s.zoomRequested === null ? [] : [`  줌 요청: ${s.zoomRequested}`]),
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run src/diagnostics/report.test.ts src/adapters/barcode/browserScanner.test.ts src/diagnostics/bus.test.ts`
Expected: PASS. If a bus snapshot test asserts an exact object shape, it needs `zoomRequested: null` added — that is expected, not a defect.

- [ ] **Step 5: Prove the tests have teeth**

```bash
cp src/diagnostics/report.ts "$TEMP/report.bak"
```

| Mutation | Must kill |
|---|---|
| Render the line unconditionally: `` `  줌 요청: ${s.zoomRequested ?? UNREPORTED}` `` | "with no override the request line is absent entirely" |
| Change the condition to a truthiness check (`s.zoomRequested ? … : []`) | nothing today — **report this**: a measured 0 is impossible here because `resolveZoomOverride` rejects 0, so the two are equivalent. Say so rather than inventing a test for an unreachable state. |
| Delete the line entirely | "an override that was honoured is reported as a REQUEST" |

Restore with `cp "$TEMP/report.bak" src/diagnostics/report.ts` after each.

- [ ] **Step 6: Commit**

```bash
npm run test
git add src/diagnostics/bus.ts src/adapters/barcode/browserScanner.ts src/diagnostics/report.ts src/diagnostics/report.test.ts
git commit -m "feat(diagnostics): report the zoom factor a debug session asked for

Without this a mistyped ?zoom= is indistinguishable from a working one: the
tester records a 2.0 run believing it was 1.0, and the sweep concludes zoom does
nothing -- the inverse of the truth.

Published before applyScanZoom's early returns, because it is a fact about the
run's configuration rather than about the camera: a track that names no zoom
range must still show what was intended, or a bad URL and an incapable device
look identical.

Kept separate from appliedZoom, which stays a getSettings() read-back. The pair
separates 'the request never went' from 'the platform would not say'.

Absent rather than 미보고 when nobody asked, so the production panel is
byte-identical to before."
```

---

### Task 4: Gate and record

**Files:**
- Modify: `docs/notes/open-questions.md` (new row `B30-23`)
- Modify: `docs/HANDOFF.md`

- [ ] **Step 1: Run the complete gate and capture the real numbers**

```bash
npm run test 2>&1 | tail -5
npx tsc -b && echo "tsc clean"
npx biome check .
npm run build 2>&1 | grep -E "index-|DiagnosticsBar|precache|built in"
npm run e2e 2>&1 | tail -3
```

Expected: vitest **555** (547 + 8), tsc clean, biome clean (117 files), Playwright 23/23, build succeeds. Record the **measured** entry chunk and precache figures. If the count is not 555, reconcile the difference and report it rather than adjusting the expectation.

- [ ] **Step 2: Write the `B30-23` row in `docs/notes/open-questions.md`**

Append one row after `B30-22`, in the established three-column shape. It must state:

- What shipped: the parameter, its gate (`isDiagnosticsEnabled()`, not the URL), the 2.0 ceiling, rejection-not-clamping, no persistence, and the `줌 요청:` line.
- **Why 3.0 was dropped** from the recorded sweep plan (§B30-17 ④ / HANDOFF): the lens-switch bound, and that the open question only needs a `zoom != 2` sample, which 1.0 supplies.
- **Why the rejection feedback is load-bearing**, in the terms the design uses: a silent rejection yields the inverted conclusion.
- The literal `2` duplicated between `enabled.ts` and `MAX_SCAN_ZOOM`, and that a test pins it — an honest note that the coupling exists.
- The measured gate from Step 1.
- That this parameter **has not been used on a device yet** — it ships a capability, not an answer.

- [ ] **Step 3: Update `docs/HANDOFF.md`**

- Add a current-state paragraph dated 2026-08-03 pointing at `§B30-23`.
- In the measurement procedure, add `줌 요청` to the list of values to record each run, and state the sweep URLs (`?debug=1&zoom=1` and `?debug=1&zoom=2` at a fixed distance).
- In "다음 작업", mark the zoom sweep tooling done and leave the **owner's real-device session** as the next item, naming the four questions it closes (§B30-19 ④ mechanism, §B30-22 ③ compositor, §B30-22 ⑩ Low Power Mode `playing`, and whether the crop is worth its product decision).

- [ ] **Step 4: Commit the record**

```bash
git add docs/notes/open-questions.md docs/HANDOFF.md
git commit -m "docs(scan): record the debug zoom override and the sweep it unblocks"
```

- [ ] **Step 5: Hand back for independent review — do NOT merge**

Report the branch name, the commit list, the measured gate, and the mutation results for every new test. The branch merges only after an independent whole-branch review.

---

## Self-Review

**Spec coverage.** Design §1 → Tasks 1-2. §2 (flow, pure signature, gate) → Task 1 Step 3 + Task 2 Step 3. §3 (rejection rules and the feedback line) → Task 1 Step 3 + Task 3. §4 (no persistence) → Task 1's signature, pinned by its test. §5 (unreachable to shoppers) → Task 1's gate test. §6 (8 tests) → Tasks 1-3 add exactly 4 + 2 + 2. §7 (not built) → no task builds any of it. §8 (what the device session answers) → Task 4 Step 3. §9 (gate) → Task 4 Step 1.

**Placeholder scan.** No TBD/TODO. Every code step carries literal code. Task 3 Step 1's `renderFor` is the one place deferring to an existing helper rather than naming it — deliberate, because inventing a second snapshot helper beside the file's own would be the duplication this repo flags; the step says which neighbouring tests to copy.

**Type consistency.** `resolveZoomOverride(search, diagnosticsEnabled)` is declared in Task 1 and called with those two arguments in Task 2. `zoomOverride` is the `ScannerDeps` field name in Task 2 and the test-double key in both of its tests. `zoomRequested` is the bus field in Task 3, published in Task 3, and asserted in Task 3. `ZOOM_PARAM` is exported in Task 1 and unused elsewhere — intentional, matching `DEBUG_PARAM`'s existing role as a named constant for the parameter.

**One known duplication, stated rather than hidden.** The value `2` appears as `MAX_SCAN_ZOOM` in the adapter and as `MAX_ZOOM_OVERRIDE` in the parser. Importing across that boundary would make a URL parser depend on a camera module. Task 1's test writes the literal and its comment says why; Task 4 records it. If the cap ever moves, both move — and the rejection test is what fails first.
