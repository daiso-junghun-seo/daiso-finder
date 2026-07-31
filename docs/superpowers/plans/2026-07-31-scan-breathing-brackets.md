# Scan Breathing Brackets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the scanner's aiming brackets breathe while — and only while — the camera is actually delivering frames, so a scan that is running at ~50 decode attempts/second stops reading as frozen.

**Architecture:** One boolean in `ScannerOverlay` flipped by the `<video>`'s native `playing` event adds a `--live` modifier class; a CSS keyframe animation on that class scales and fades the brackets using `transform` and `opacity` only. No JS animation loop, no `ScannerPort` change, no new dependency.

**Tech Stack:** React 18 + TypeScript, plain CSS (`src/styles/layout.css`), Vitest + @testing-library/react, Biome.

**Design doc:** [`docs/superpowers/specs/2026-07-31-scan-breathing-brackets-design.md`](../specs/2026-07-31-scan-breathing-brackets-design.md)

## Global Constraints

- **GPU-composite only.** The animation may touch `transform` and `opacity` and nothing else. The decode loop runs its own `requestAnimationFrame` and run F measured **96.7% main-thread occupancy** (19.17 ms of real work × 50.5 attempts/sec), so any layout- or paint-costing property competes with the work the motion is advertising. No JS `requestAnimationFrame` animation under any circumstances.
- **No fabrication.** The motion asserts exactly one proposition — *"the camera is delivering frames"* — and must not run before that is true. It must never depict progress or position: every attempt decodes the **whole** frame, so there is no band being read and no percentage complete.
- **Answer states are untouched.** The 6 `UiState` values, their transitions, the Zustand wiring, `ScannerPort`, all UX copy, and the decode path do not change. `scannerOpen` remains UI-shell state.
- **Bracket geometry is untouched.** `height: 60%` + `aspect-ratio: 1` + `width: auto` stay exactly as they are (§B30-10, pinned by `layout.test.ts` and a phone-viewport E2E).
- **Korean for UX copy, English for code, identifiers and commit messages.**
- **Windows 11 / PowerShell.** No Linux-only command examples.
- Work on a new branch `feat/scan-breathing-brackets` cut from `main` (`f469c9e`). Do not push. Do not merge without an independent review.

---

### Task 1: The `--live` class, driven by the video's `playing` event

**Files:**
- Modify: `src/ui/components/ScannerOverlay.tsx`
- Test: `src/ui/components/ScannerOverlay.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: the class name `scanner-overlay__aim--live`, applied to the element that already carries `scanner-overlay__aim`. Task 2 styles exactly that class name — it must match character for character.

- [ ] **Step 0: Cut the branch**

```bash
git checkout main && git checkout -b feat/scan-breathing-brackets
```

- [ ] **Step 1: Add `fireEvent` to the existing testing-library import**

In `src/ui/components/ScannerOverlay.test.tsx`, line 1 currently reads:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
```

Change it to:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
```

- [ ] **Step 2: Write the two failing tests**

Append to `src/ui/components/ScannerOverlay.test.tsx`. `never` is the existing module-level `ScannerPort` double whose `scan` never settles — a scan permanently in flight, which is the state this motion describes.

```tsx
// THE WHOLE POINT OF GATING ON `playing`. scan() resolves the decoder, then calls getUserMedia — and on
// iOS the permission prompt sits INSIDE that call, measured at 749-1005 ms (749 ms = §B30-20 ⑤; the 1005 ms cold start = §B30-19 ①). Breathing from
// mount would spend that whole second telling the shopper we are reading a camera that is not on yet,
// which is the one proposition this motion is allowed to make.
test('the brackets do not breathe before the camera delivers frames', () => {
  const { container } = render(
    <ScannerOverlay scanner={never} onDecoded={() => {}} onClose={() => {}} />,
  );
  expect(container.querySelector('.scanner-overlay__aim')).not.toHaveClass(
    'scanner-overlay__aim--live',
  );
});

// `playing` is the browser saying frames are flowing, which is exactly when the decode loop has frames
// to consume. It is a DOM event the overlay already owns, so this costs no ScannerPort change.
test('the brackets start breathing once the video reports it is playing', () => {
  const { container } = render(
    <ScannerOverlay scanner={never} onDecoded={() => {}} onClose={() => {}} />,
  );
  const video = container.querySelector('video');
  if (!video) throw new Error('the overlay rendered no <video> to drive');
  fireEvent.playing(video);
  expect(container.querySelector('.scanner-overlay__aim')).toHaveClass(
    'scanner-overlay__aim--live',
  );
});
```

- [ ] **Step 3: Run the tests and watch them fail**

Run: `npx vitest run src/ui/components/ScannerOverlay.test.tsx`

Expected: the first test PASSES (the class does not exist yet, so it is trivially absent) and the second FAILS with an assertion that the element does not have class `scanner-overlay__aim--live`.

This asymmetry is expected and is why Step 6 exists: the first test only earns its keep once a mutation can kill it.

- [ ] **Step 4: Implement**

In `src/ui/components/ScannerOverlay.tsx`:

1. Add the state next to the existing `outcome`/`hinting` state (around line 54):

```tsx
  // Not "the scan started" — "frames are arriving". getUserMedia can be outstanding for a second or
  // more on iOS because the permission prompt lives inside it, and the brackets must not claim to be
  // reading anything during that window.
  const [streaming, setStreaming] = useState(false);
```

2. Add the handler to the existing `<video>` (around line 125). The element keeps every attribute it has:

```tsx
          <video
            ref={videoRef}
            className="scanner-overlay__video"
            aria-hidden="true"
            playsInline
            muted
            autoPlay
            onPlaying={() => setStreaming(true)}
          />
```

3. Add the modifier to the brackets (around line 136):

```tsx
            <div
              className={`scanner-overlay__aim${streaming ? ' scanner-overlay__aim--live' : ''}`}
              aria-hidden="true"
            >
```

No teardown is needed. Every terminal outcome either unmounts the brackets (a notice replaces the guidance — already wired and already tested) or unmounts the whole overlay.

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npx vitest run src/ui/components/ScannerOverlay.test.tsx`
Expected: PASS, all tests in the file (18 existing + 2 new = 20).

- [ ] **Step 6: Prove both tests have teeth**

Apply each mutation to `src/ui/components/ScannerOverlay.tsx`, run the file, confirm RED, then revert it before the next one. Use a file copy to revert, **not** `git checkout --`, which would also throw away the implementation from Step 4.

```bash
cp src/ui/components/ScannerOverlay.tsx "$TEMP/so.bak"
```

| Mutation | Must kill |
|---|---|
| Delete `onPlaying={() => setStreaming(true)}` | "start breathing once the video reports it is playing" |
| Replace the className expression with the constant `"scanner-overlay__aim scanner-overlay__aim--live"` | "do not breathe before the camera delivers frames" |

Restore after each with `cp "$TEMP/so.bak" src/ui/components/ScannerOverlay.tsx`. If a mutation survives, stop — the test does not pin what its name claims, and that is a finding, not a nit.

- [ ] **Step 7: Commit**

```bash
git add src/ui/components/ScannerOverlay.tsx src/ui/components/ScannerOverlay.test.tsx
git commit -m "feat(scan): mark the brackets live only while the video is playing

The motion this class will drive asserts one thing -- the camera is delivering
frames -- so it is gated on the video's own \`playing\` event rather than on mount.
On iOS the permission prompt sits inside getUserMedia (749 ms measured, §B30-20 ⑤; 1005 ms cold, §B30-19 ①), so
mount is up to a second before any frame exists.

A DOM event the overlay already owns, so ScannerPort is unchanged. No teardown:
every terminal outcome unmounts either the brackets or the overlay.

Both tests proven by mutation -- dropping onPlaying kills one, applying the class
unconditionally kills the other."
```

---

### Task 2: The breathing animation

**Files:**
- Modify: `src/styles/layout.css`
- Test: `src/styles/layout.test.ts`

**Interfaces:**
- Consumes: the class `scanner-overlay__aim--live` from Task 1.
- Produces: `@keyframes aim-breathe` and the three custom properties `--aim-breathe-duration`, `--aim-breathe-scale`, `--aim-breathe-dim` declared on `.scanner-overlay__aim`. Task 4 records their values.

- [ ] **Step 1: Add the `blockFor` helper to `src/styles/layout.test.ts`**

Place it directly below the existing `ruleFor` function.

```ts
// ruleFor stops at the first `}`, which is right for a flat rule and WRONG for anything containing a
// nested block: an `@keyframes` or `@media` body would come back truncated at its first inner brace,
// and every assertion against the truncated text would then be about the wrong thing. This counts
// braces instead, so the whole at-rule body is returned.
function blockFor(header: string): string {
  const start = css.indexOf(header);
  expect(start).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = css.indexOf('{', start); i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(start, i + 1);
    }
  }
  throw new Error(`unterminated block: ${header}`);
}
```

- [ ] **Step 2: Write the two failing tests**

Append to `src/styles/layout.test.ts`.

```ts
// A POSITIVE assertion, deliberately. This file already learned once that a CSS guard made only of
// prohibitions passes with the declaration deleted — an empty rule violates nothing and draws nothing.
test('.scanner-overlay__aim--live actually declares the breathing animation', () => {
  expect(ruleFor('.scanner-overlay__aim--live')).toMatch(/animation:\s*aim-breathe/);
});

// THE GPU-COMPOSITE CONSTRAINT, pinned. The decode loop runs its own requestAnimationFrame at 96.7%
// main-thread occupancy (§B30-20 ⑥), so a keyframe that animated a layout or paint property would
// compete with the very work this motion advertises — and it would do so invisibly, since nothing about
// the rendered result is observable from a unit test.
test('@keyframes aim-breathe animates transform and opacity only', () => {
  const block = blockFor('@keyframes aim-breathe');
  const declared = [...block.matchAll(/^\s*([a-z-]+):/gm)].map((m) => m[1]);
  expect(declared.length).toBeGreaterThan(0);
  expect(new Set(declared)).toEqual(new Set(['transform', 'opacity']));
});
```

- [ ] **Step 3: Run the tests and watch them fail**

Run: `npx vitest run src/styles/layout.test.ts`
Expected: both FAIL — the first because `ruleFor` cannot find `.scanner-overlay__aim--live {`, the second because `blockFor` cannot find `@keyframes aim-breathe`.

- [ ] **Step 4: Implement the CSS**

In `src/styles/layout.css`, add the three custom properties to the **existing** `.scanner-overlay__aim` rule. Every current declaration stays — the existing guards assert `height: 60%`, `aspect-ratio: 1` and `width: auto`, and that no `background` or `border` appears here.

```css
.scanner-overlay__aim {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  height: 60%;
  width: auto;
  max-width: 60%;
  aspect-ratio: 1;
  pointer-events: none;
  /* The motion's three knobs, together in one place so a real-device adjustment is one edit rather
     than three. They are NOT a runtime override: there is no ?debug= switch for them and none is
     planned. Chosen against a static mock on a monitor; the real thing rides a shaky hand-held camera
     image, where the same values usually read weaker. */
  --aim-breathe-duration: 1.3s;
  --aim-breathe-scale: 1.09;
  --aim-breathe-dim: 0.32;
}
```

Then add these two blocks immediately after that rule, before `.scanner-overlay__aim span`:

```css
/* ANIMATED ONLY WHILE FRAMES ARE ARRIVING. ScannerOverlay adds this class on the <video>'s `playing`
   event, never at mount: getUserMedia can be outstanding for a second or more on iOS because the
   permission prompt is inside it (749 ms measured, §B30-20 ⑤; 1005 ms cold, §B30-19 ①), and the motion's single
   proposition is "the camera is delivering frames".

   transform and opacity ONLY, and the test next door pins that. The decode loop runs its own
   requestAnimationFrame at 96.7% main-thread occupancy (§B30-20 ⑥), so anything costing layout or
   paint here competes with the work being advertised. A sweeping line — the familiar scanner idiom —
   was rejected for a different reason: every attempt decodes the WHOLE frame, so a line implying
   "reading this band now" depicts progress that does not exist (design §2).

   NO local prefers-reduced-motion block: tokens.css kills every animation globally with `!important`,
   and this rule declares no opacity of its own, so a reduced-motion shopper gets exactly the fully
   opaque static brackets the design asks for. tokens.test.ts pins that global rule. */
.scanner-overlay__aim--live {
  animation: aim-breathe var(--aim-breathe-duration) ease-in-out infinite;
  will-change: transform, opacity;
}

/* translate(-50%, -50%) is repeated in BOTH keyframes deliberately. transform is a single property, so
   a keyframe that omits it overrides the centring declared above and the brackets jump off centre. */
@keyframes aim-breathe {
  0%,
  100% {
    transform: translate(-50%, -50%) scale(1);
    opacity: var(--aim-breathe-dim);
  }
  50% {
    transform: translate(-50%, -50%) scale(var(--aim-breathe-scale));
    opacity: 1;
  }
}
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npx vitest run src/styles/layout.test.ts`
Expected: PASS, all tests in the file. Confirm the pre-existing `.scanner-overlay__aim` guards still pass — the added custom properties contain neither `background` nor `border`, so they must.

- [ ] **Step 6: Prove both tests have teeth**

```bash
cp src/styles/layout.css "$TEMP/layout.bak"
```

| Mutation | Must kill |
|---|---|
| Delete the `animation:` line from `.scanner-overlay__aim--live` | "actually declares the breathing animation" |
| Add `height: 61%;` inside the `50%` keyframe | "animates transform and opacity only" |

Restore with `cp "$TEMP/layout.bak" src/styles/layout.css` after each.

- [ ] **Step 7: Format and commit**

```bash
npx biome check . --write
npx vitest run src/styles/layout.test.ts
git add src/styles/layout.css src/styles/layout.test.ts
git commit -m "feat(scan): breathe the aiming brackets on transform and opacity only

Four candidate motions were compared animating side by side; breathing won on
honesty. The familiar sweeping line implies \"reading this band now\", and every
attempt decodes the whole frame, so that progress does not exist. Breathing claims
only \"alive\", which is the one thing that is true.

transform and opacity only, pinned by a test, because the decode loop owns its own
rAF at 96.7% main-thread occupancy -- a layout-costing keyframe would compete with
the work the motion advertises.

The animation declaration is pinned POSITIVELY: this file already learned that a
guard made only of prohibitions passes with the declaration deleted.

Both tests proven by mutation."
```

---

### Task 3: Pin the global reduced-motion rule this feature now depends on

**Files:**
- Test: `src/styles/tokens.test.ts`

**Interfaces:**
- Consumes: the animation from Task 2 (this is what makes the global rule load-bearing).
- Produces: nothing other tasks consume.

**Why this is its own task:** `tokens.css:46` already disables every animation under `prefers-reduced-motion: reduce`, which is why Task 2 adds no local media block. But `src/styles/tokens.test.ts` contains **zero** references to `reduced-motion`: the block can be deleted with the entire suite green. Before this feature that was a harmless omission; this feature makes it the only thing standing between a motion-sensitive shopper and a pulsing overlay.

- [ ] **Step 1: Write the failing test**

Append to `src/styles/tokens.test.ts`. It needs its own brace-counting reader — the module has no helpers, and `indexOf('}')` would stop inside the `*` rule.

```ts
// LOAD-BEARING FOR ACCESSIBILITY, and pinned by nothing until now. layout.css deliberately ships no
// local prefers-reduced-motion block for the scanner's breathing brackets because this global rule
// already turns every animation off with `!important`. That makes deleting this block a silent
// accessibility regression: a motion-sensitive shopper would get a pulsing overlay and the whole suite
// would stay green.
test('the global reduced-motion rule turns animations off, which is what the scanner brackets rely on', () => {
  const start = css.indexOf('@media (prefers-reduced-motion: reduce)');
  expect(start).toBeGreaterThan(-1);
  let depth = 0;
  let end = -1;
  for (let i = css.indexOf('{', start); i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  expect(end).toBeGreaterThan(start);
  const block = css.slice(start, end);
  // `!important` is not decoration here: it is what lets this beat the animation shorthand that
  // `.scanner-overlay__aim--live` declares directly on the element.
  expect(block).toMatch(/animation:\s*none\s*!important/);
});
```

- [ ] **Step 2: Run the test and watch it fail**

Temporarily comment out the whole `@media (prefers-reduced-motion: reduce)` block in `src/styles/tokens.css`, then run:

Run: `npx vitest run src/styles/tokens.test.ts`
Expected: FAIL at `expect(start).toBeGreaterThan(-1)`.

This is the mutation and the RED step in one: the rule already exists, so the only way to watch this test fail is to remove the thing it pins. Restore the block immediately afterwards.

- [ ] **Step 3: Restore `tokens.css` and confirm GREEN**

```bash
git checkout -- src/styles/tokens.css
npx vitest run src/styles/tokens.test.ts
```

Expected: PASS. (`git checkout --` is safe here and only here: `tokens.css` has no uncommitted work in this plan.)

- [ ] **Step 4: Commit**

```bash
git add src/styles/tokens.test.ts
git commit -m "test(styles): pin the global reduced-motion rule the brackets depend on

tokens.css has disabled every animation under prefers-reduced-motion since it was
written, and nothing asserted it -- the block could be deleted with the whole suite
green. That was harmless until layout.css started relying on it: the breathing
brackets ship no local media block precisely because this one already wins with
\`!important\`, so deleting it would hand a motion-sensitive shopper a pulsing
overlay and fail silently.

Verified by removing the block and watching this test go red."
```

---

### Task 4: Full gate and record

**Files:**
- Modify: `docs/notes/open-questions.md` (new row `B30-22`)
- Modify: `docs/HANDOFF.md` (current-state paragraph, and the next-steps list)

**Interfaces:**
- Consumes: everything above.
- Produces: the decision record. No code.

- [ ] **Step 1: Run the complete gate and capture the real numbers**

```bash
npm run test 2>&1 | tail -5
npx tsc -b && echo "tsc clean"
npx biome check .
npm run build 2>&1 | grep -E "index-|DiagnosticsBar|precache|built in"
npm run e2e 2>&1 | tail -3
```

Expected: vitest **542** (537 + 5), tsc clean, biome clean (117 files), Playwright 23/23, build succeeds. Record the **measured** entry chunk size and precache figures — do not copy the numbers from this plan into the record. If vitest is not exactly 542, reconcile the difference before writing anything down rather than adjusting the expectation.

- [ ] **Step 2: Write the `B30-22` row in `docs/notes/open-questions.md`**

Append one row to the decision table, immediately after `B30-21`, following the established three-column shape (`| B30-22 | <what shipped> | <why / the reasoning> |`). It must state:

- The motion, its trigger (`playing`, not mount, and why — the iOS permission prompt sits inside `getUserMedia`), and its single proposition.
- **The three rejected candidates with their reasons**, especially the sweeping line: familiar, and rejected because it depicts spatial progress that does not exist.
- **The corrected premise**: §B30-20 ⑭ and HANDOFF justified the bracket crop as the animation's main-thread budget; a GPU-composite animation does not spend that budget, so the two are not preconditions for each other. The crop keeps its own rationale and its own product decision.
- That reduced-motion is served by the **global** `tokens.css` rule, that this feature makes that rule load-bearing, and that it is now pinned for the first time.
- The three tuning values, that they were chosen against a static mock on a monitor, and that they are **not** runtime-adjustable.
- The measured gate from Step 1.

- [ ] **Step 3: Update `docs/HANDOFF.md`**

- Add a current-state paragraph dated 2026-07-31 summarising the wave and pointing at `§B30-22` as the canonical record, with the measured gate.
- In "다음 작업", mark the scan animation done and leave **bracket crop** and **zoom sweep** as the remaining items — and carry over §0's correction so the crop is no longer listed as a precondition for the animation.

- [ ] **Step 4: Commit the record**

```bash
git add docs/notes/open-questions.md docs/HANDOFF.md
git commit -m "docs(scan): record the breathing brackets and correct the crop's premise"
```

- [ ] **Step 5: Hand back for independent review — do NOT merge**

Report to the owner: the branch name, the commit list, the measured gate, and the mutation results for all five new tests. The branch merges only after an independent review, per the rule this repo adopted after its own review found two criticals in code that had already passed per-task review.

---

## Self-Review

**Spec coverage.** Design §1 → Tasks 1-2. §2 (rejected candidates) → Task 4 Step 2. §3 (`playing` trigger) → Task 1. §4.1 → Task 1 Step 4. §4.2 → Task 2 Step 4, including the "no local media block" correction. §4.3 (values and their limits) → Task 2 Step 4 comment + Task 4 Step 2. §5 (honesty) → the constraints block and the test names. §6 (accessibility) → Task 3. §7 (five new tests, and the reminder not to re-count the existing notice test) → Tasks 1-3, which add exactly 2 + 2 + 1. §8 (what is not built) → no task builds any of it. §9 (gate) → Task 4 Step 1.

**Placeholder scan.** No TBD/TODO. Every code step carries the literal code. Task 4 Steps 2-3 prescribe content rather than final prose, which is correct for a decision record whose numbers come from Step 1 — but it enumerates every required point, so nothing is left to taste.

**Type consistency.** `scanner-overlay__aim--live` is spelled identically in Task 1 (produced), Task 2 (styled and asserted), and Task 3 (referenced in a comment). `aim-breathe` is spelled identically in the `animation` shorthand, the `@keyframes` header, and both tests. The three custom properties are declared in Task 2 Step 4 and read in the same block. `blockFor` is defined in Task 2 Step 1 and used in Task 2 Step 2; Task 3 deliberately inlines its own reader because it is in a different module with no shared helper.
