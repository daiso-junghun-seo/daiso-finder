import css from './layout.css?raw';

// display:none and visibility:hidden both remove the node from the accessibility tree, which would
// silence the very announcement this class exists to preserve. Clip-based hiding does not.
test('the visually-hidden utility hides without leaving the accessibility tree', () => {
  const rule = css.slice(css.indexOf('.visually-hidden'));
  expect(rule).toContain('clip-path');
  expect(rule.slice(0, rule.indexOf('}'))).not.toContain('display: none');
  expect(rule.slice(0, rule.indexOf('}'))).not.toContain('visibility: hidden');
});

// The aim guide's shape decisions (2026-07-28-scan-aim-guide-design.md §2, §6) live entirely in CSS, so
// without these a future edit reintroducing a closed border, a background fill or a z-index would go
// completely uncaught. These assertions check the stylesheet's TEXT only — they cannot prove rendered
// appearance, because Vitest stubs plain CSS imports (`vite.config.ts` limits the CSS pipeline to
// `css: { include: [/\.css\?raw$/] }`), so jsdom never applies this file. The rendered geometry is
// measured instead by the phone-viewport bounding-box test in test/e2e/interactive.spec.ts.
function ruleFor(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf('}', start));
}

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

test('.scanner-overlay__aim declares no background and no border of its own — corners are drawn by its child spans', () => {
  const rule = ruleFor('.scanner-overlay__aim');
  expect(rule).not.toContain('background');
  expect(rule).not.toContain('border');
});

// The prohibitions above are satisfied by an EMPTY rule, and an empty rule draws nothing. These pin the
// square the records claim (§B30-10: corner brackets at 60% of the short side): sized from the height,
// which is the short side of a landscape preview, never from the width — a percentage width resolves
// against the containing block's WIDTH and so cannot bound the square inside a landscape picture.
test('.scanner-overlay__aim is a square sized from the preview height, per §B30-10', () => {
  const rule = ruleFor('.scanner-overlay__aim');
  expect(rule).toContain('height: 60%');
  expect(rule).toContain('aspect-ratio: 1');
  expect(rule).toMatch(/\bwidth:\s*auto/);
});

// The reduced-motion fallback ("fully opaque static brackets", §4.2 of the design) depends on this rule
// declaring no opacity of its own: with the animation killed by tokens.css's global rule, there is no
// opacity declaration left to apply, so the initial value (1, fully opaque) wins. layout.css asserts this
// in a comment, but nothing checked it before this test — someone adding `opacity: 0.32` to this base
// rule would permanently dim the brackets for motion-sensitive shoppers with the suite green.
test('.scanner-overlay__aim declares no opacity of its own — the reduced-motion fallback depends on it', () => {
  const rule = ruleFor('.scanner-overlay__aim');
  expect(rule).not.toContain('opacity');
});

test('each aim-guide corner span draws a solid border and zeroes exactly two sides, making a bracket rather than a closed box', () => {
  // Without the positive half, deleting the border declaration takes the brackets off the screen while
  // every "no closed box" assertion below still passes.
  expect(ruleFor('.scanner-overlay__aim span')).toMatch(/border:\s*\d+px\s+solid/);
  for (let n = 1; n <= 4; n += 1) {
    const rule = ruleFor(`.scanner-overlay__aim span:nth-child(${n})`);
    const zeroedSides = rule.match(/border-(top|right|bottom|left):\s*0;/g) ?? [];
    expect(zeroedSides).toHaveLength(2);
  }
});

test('no z-index appears anywhere in layout.css — this codebase stacks by DOM order', () => {
  // Comments in this file name z-index by name while documenting its deliberate absence (e.g.
  // "No z-index: neither .sheet-scrim..."), so comments are stripped first — this checks for an
  // actual declaration, not prose.
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  expect(withoutComments).not.toContain('z-index');
});

// A POSITIVE assertion, deliberately. This file already learned once that a CSS guard made only of
// prohibitions passes with the declaration deleted — an empty rule violates nothing and draws nothing.
test('.scanner-overlay__aim--live actually declares the breathing animation', () => {
  expect(ruleFor('.scanner-overlay__aim--live')).toMatch(/animation:\s*aim-breathe/);
});

// `infinite` is load-bearing on its own: without it the brackets breathe once and stop, which is the
// exact "looks stopped" symptom this branch exists to remove — and the assertion above only checks that
// the shorthand names `aim-breathe`, so it would still pass with `infinite` dropped.
test('.scanner-overlay__aim--live animates infinitely, not once', () => {
  expect(ruleFor('.scanner-overlay__aim--live')).toMatch(
    /animation:\s*aim-breathe[^;]*\binfinite\b/,
  );
});

// THE GPU-COMPOSITE CONSTRAINT, pinned. The decode loop runs its own requestAnimationFrame at 96.7%
// main-thread occupancy (§B30-20 ⑥), so a keyframe that animated a layout or paint property would
// compete with the very work this motion advertises — and it would do so invisibly, since nothing about
// the rendered result is observable from a unit test.
test('@keyframes aim-breathe animates transform and opacity only', () => {
  const block = blockFor('@keyframes aim-breathe');
  // Anchored to line-start (the `m` flag), so this assumes one declaration per line. It is the Biome CSS
  // formatter — not this test — that actually holds that assumption for this file: a same-line injection
  // (`color: red; height: 61%;`) is caught by `biome check .`, not here (verified: Biome 1.9.4 splits it
  // onto two lines).
  const declared = [...block.matchAll(/^\s*([a-z-]+):/gm)].map((m) => m[1]);
  expect(declared.length).toBeGreaterThan(0);
  expect(new Set(declared)).toEqual(new Set(['transform', 'opacity']));
});

// layout.css comments that `translate(-50%, -50%)` is repeated in BOTH stops "deliberately" — which is
// exactly the wording that invites a future tidy-up to fold it into one shared declaration. Deleting it
// from the 50% stop passes both guards above (the property whitelist still sees `transform`, and nothing
// here checked the centring translate specifically), while the real consequence is severe and visible:
// transform is a single property, so without the translate the centring offset is gone and the brackets
// jump off-centre by half their own size every cycle.
test('translate(-50%, -50%) appears exactly twice inside @keyframes aim-breathe — once per stop', () => {
  const block = blockFor('@keyframes aim-breathe');
  const matches = block.match(/translate\(-50%, -50%\)/g) ?? [];
  expect(matches).toHaveLength(2);
});

// The whitelist above proves only which PROPERTY NAMES appear, never that their VALUES move: a future
// edit could flatten the 50% stop to the same transform and opacity as 0%,100% — a fully static
// "animation" — and that test would still pass. Checked on BOTH properties, not just one, because a
// guard that compared only `transform` would still pass a flattened `opacity`, and vice versa.
test('@keyframes aim-breathe changes value at the 50% stop, not just repeats the same declarations', () => {
  const block = blockFor('@keyframes aim-breathe');
  // Anchored to line-start so this finds the "50% {" stop selector, not the "-50%" inside
  // `translate(-50%, -50%)`, which appears in every stop's transform value.
  const midStart = block.search(/^\s*50%\s*\{/m);
  expect(midStart).toBeGreaterThan(-1);
  const restStop = block.slice(0, midStart);
  const midStop = block.slice(midStart);
  const declaredValue = (text: string, property: string) =>
    text.match(new RegExp(`${property}:\\s*([^;]+);`))?.[1];
  // Both sides must be PRESENT before they are compared: `.not.toBe` alone is satisfied just as well by
  // `undefined !== 'some value'` as by two genuinely different declared values, so a DELETED declaration
  // (declaredValue returns undefined) would trivially pass the comparison below and this test would say
  // nothing about it.
  const assertChanges = (property: string) => {
    const midValue = declaredValue(midStop, property);
    const restValue = declaredValue(restStop, property);
    expect(midValue).toBeDefined();
    expect(restValue).toBeDefined();
    expect(midValue).not.toBe(restValue);
  };
  assertChanges('transform');
  assertChanges('opacity');
});

// Usability floor (2026-10-11-ui-floor-pass-design.md §2–§3) — positive assertions only.
// A prohibition-only guard passes with the declaration deleted, so each rule below pins a
// VALUE the shopper depends on, not just the absence of something worse.
test('.search-bar lays its input and scan button out in one flex row', () => {
  const rule = ruleFor('.search-bar');
  expect(rule).toMatch(/display:\s*flex/);
  expect(ruleFor('.search-bar input')).toMatch(/flex:\s*1\s+1\s+auto/);
});

test('.recent-searches and .candidate-list drop UA bullets', () => {
  for (const list of ['.recent-searches ul', '.candidate-list ul']) {
    expect(ruleFor(list)).toMatch(/list-style:\s*none/);
  }
  // Candidate rows breathe at 12px (feed rhythm — the 8px Interface minimum, not exactly 8);
  // recent chips scroll in one row whose gap owns both axes.
  expect(ruleFor('.candidate-list li + li')).toMatch(/margin-top:\s*12px/);
  expect(ruleFor('.recent-searches li + li')).toMatch(/margin-top:\s*0/);
});

test('.candidate-list rows are one flex line: photo, name takes the row, price hugs right', () => {
  expect(ruleFor('.candidate-list button')).toMatch(/display:\s*flex/);
  expect(ruleFor('.candidate-list button > span:first-of-type')).toMatch(/flex:\s*1\s+1\s+auto/);
});

test('.candidate-list photo is a fixed box that never crops the product', () => {
  const rule = ruleFor('.candidate-list .product-photo');
  expect(rule).toMatch(/width:\s*80px/);
  expect(rule).toMatch(/height:\s*80px/);
  // contain, never cover: cropping would hide shelf-matchable detail (design §2).
  expect(rule).toMatch(/object-fit:\s*contain/);
});

test('.answer-card keeps text off the glass edge and photos inside the card', () => {
  expect(ruleFor('.answer-card')).toMatch(/padding:\s*20px/);
  expect(ruleFor('.answer-card')).toMatch(/inset 0 1px 0/);
  const photo = ruleFor('.answer-card .product-photo');
  expect(photo).toMatch(/max-width:\s*100%/);
  expect(photo).toMatch(/max-height:\s*260px/);
  expect(photo).toMatch(/border-radius:\s*var\(--radius-md\)/);
  expect(photo).toMatch(/object-fit:\s*contain/);
});

// UI polish (2026-10-12-ui-polish-design.md §2–§3) — positive assertions only.
test('buttons and inputs share the flat control system (no UA grey)', () => {
  // Shared paint lives on the `button, input` pair rule — ruleFor('input') lands there
  // first, while a bare ruleFor('button') would land inside `.answer-card button + button`.
  expect(ruleFor('input')).toMatch(/border-radius:\s*var\(--radius-md\)/);
  expect(ruleFor('input')).toMatch(/border:\s*1px solid/);
  expect(ruleFor('input')).toMatch(/font:\s*inherit/);
  // Buttons widen the shared side padding in their own rule.
  expect(ruleFor('button')).toMatch(/padding:\s*10px 16px/);
});

test('.scan-button--primary is the single filled button, on action tokens', () => {
  const rule = ruleFor('.scan-button--primary');
  expect(rule).toMatch(/background:\s*var\(--action-bg\)/);
  expect(rule).toMatch(/color:\s*var\(--action-fg\)/);
});

test(':focus-visible carries the accent ring (keyboard shoppers)', () => {
  const cssText = css.replace(/\/\*[\s\S]*?\*\//g, '');
  expect(cssText).toMatch(/button:focus-visible/);
  expect(cssText).toContain('outline-offset: 2px');
});

test('.surface-content has a vertical beat and a large-title entry', () => {
  expect(ruleFor('.surface-content')).toMatch(/gap:\s*var\(--space-md\)/);
  expect(ruleFor('main h1')).toMatch(/font-size:\s*1\.75rem/);
});

test('.store-context-line is a spaced row with a quiet change affordance', () => {
  expect(ruleFor('.store-context-line')).toMatch(/justify-content:\s*space-between/);
  expect(ruleFor('.store-context-line button')).toMatch(/text-decoration:\s*underline/);
});

test('the locale segmented control presses the current language (44px segments)', () => {
  expect(ruleFor('.locale-segmented')).toMatch(/border-radius:\s*var\(--radius-pill\)/);
  expect(ruleFor('.locale-segmented button[aria-pressed="true"]')).toMatch(
    /background:\s*var\(--surface-solid\)/,
  );
});

test('.candidate-list rows read as cards with a weighted name', () => {
  expect(ruleFor('.candidate-list button')).toMatch(/border-radius:\s*var\(--radius-lg\)/);
  expect(ruleFor('.candidate-list button > span:first-of-type')).toMatch(/font-weight:\s*600/);
});

// UI_Improvement_Plan P1 (fewer borders): shadow carries elevation on cards + rows.
test('the answer card drops the glass border (doubled class beats import order)', () => {
  expect(ruleFor('.glass-surface.answer-card')).toMatch(/border-width:\s*0/);
});

test('candidate rows drop their border (shadow carries elevation)', () => {
  expect(ruleFor('.candidate-list button')).toMatch(/border-width:\s*0/);
});

test('.store-selection-sheet has a rounded top and full-width row buttons', () => {
  expect(ruleFor('.store-selection-sheet')).toMatch(/border-radius:\s*var\(--radius-lg\)/);
  expect(ruleFor('.store-selection-sheet__results button')).toMatch(/width:\s*100%/);
});

// Redesign (2026-10-12-ui-redesign-design.md §2–§3) — positive assertions only.
test('.cta--primary is the full-width wired action on action tokens', () => {
  const rule = ruleFor('.cta--primary');
  expect(rule).toMatch(/width:\s*100%/);
  expect(rule).toMatch(/background:\s*var\(--action-bg\)/);
  expect(rule).toMatch(/color:\s*var\(--action-fg\)/);
});

test('.skeleton-block is a decorative pulse: opacity only, aria-hidden in markup', () => {
  const rule = ruleFor('.skeleton-block');
  expect(rule).toMatch(/animation:\s*skeleton-pulse/);
  expect(blockFor('@keyframes skeleton-pulse')).toMatch(/opacity/);
  const declared = [...blockFor('@keyframes skeleton-pulse').matchAll(/^\s*([a-z-]+):/gm)].map(
    (m) => m[1],
  );
  expect(new Set(declared)).toEqual(new Set(['opacity']));
});

test('.answer-card enters on opacity + rise only (Bible §3 150–300ms)', () => {
  expect(ruleFor('.answer-card')).toMatch(/animation:\s*card-enter 220ms ease-out/);
  const declared = [...blockFor('@keyframes card-enter').matchAll(/^\s*([a-z-]+):/gm)].map(
    (m) => m[1],
  );
  expect(new Set(declared)).toEqual(new Set(['opacity', 'transform']));
});

test('recent searches scroll as a snap row (stories-style, keyboard-discoverable)', () => {
  // Superseded by the snap-row test below (feed pass): kept for the pill assertion,
  // which both layouts share.
  expect(ruleFor('.recent-searches button')).toMatch(/border-radius:\s*var\(--radius-pill\)/);
});

test('.sheet-grabber is a centred affordance bar', () => {
  const rule = ruleFor('.sheet-grabber');
  expect(rule).toMatch(/width:\s*40px/);
  expect(rule).toMatch(/margin:\s*0 auto/);
});

// iOS pass (2026-10-13-ui-ios-design.md §1) — positive assertions only.
test('hero type rides the rounded display stack (graceful elsewhere)', () => {
  expect(ruleFor('.price-line')).toMatch(/font-family:\s*var\(--font-display\)/);
});

test('the search field carries its magnifier inside the input (label unchanged)', () => {
  expect(ruleFor('.search-field')).toMatch(/display:\s*flex/);
  expect(ruleFor('.search-field input')).toMatch(/padding-left:\s*36px/);
});

test('the dock carries a specular top edge (D083 permission, decorative)', () => {
  expect(ruleFor('.search-bar-surface')).toMatch(/inset 0 1px 0/);
});

test('the entry headline reads large-title (weight count unchanged)', () => {
  const rule = ruleFor('main h1');
  expect(rule).toMatch(/font-size:\s*1\.75rem/);
  expect(rule).toMatch(/font-weight:\s*700/);
});

// Refine pass 2 (2026-10-12-ui-refine-design.md §2) — positive assertions only.
test('status pills tint without touching icon + text discipline', () => {
  expect(ruleFor('.status-pill')).toMatch(/border-radius:\s*var\(--radius-pill\)/);
  expect(ruleFor('.status-pill--success')).toMatch(/background:\s*var\(--tint-success\)/);
  expect(ruleFor('.status-pill--neutral')).toMatch(/background:\s*var\(--tint-neutral\)/);
});

test('.error-banner carries its tint (icon + sentence discipline unchanged)', () => {
  expect(ruleFor('.error-banner')).toMatch(/background:\s*var\(--tint-error\)/);
});

test('.price-line hero-emphasises within the Heading role', () => {
  const rule = ruleFor('.price-line');
  expect(rule).toMatch(/font-size:\s*1\.75rem/);
  expect(rule).toMatch(/font-weight:\s*700/);
  expect(rule).toMatch(/font-variant-numeric:\s*tabular-nums/);
});

test('candidate prices align down the feed (tabular numerals)', () => {
  expect(ruleFor('.candidate-list button > span:last-of-type')).toMatch(/tabular-nums/);
});

test('recent searches scroll as a snap row (stories-style, keyboard-discoverable)', () => {
  expect(ruleFor('.recent-searches ul')).toMatch(/flex-wrap:\s*nowrap/);
  expect(ruleFor('.recent-searches ul')).toMatch(/scroll-snap-type:\s*x/);
  expect(ruleFor('.recent-searches ul')).toMatch(/scrollbar-width:\s*thin/);
});

test('.scan-button--primary keeps the icon aligned with its label', () => {
  const rule = ruleFor('.scan-button--primary');
  expect(rule).toMatch(/display:\s*inline-flex/);
  expect(rule).toMatch(/align-items:\s*center/);
  expect(rule).toMatch(/font-family:\s*var\(--font-display\)/);
});

test('.empty-medallion is decorative chrome (aria-hidden in markup)', () => {
  const rule = ruleFor('.empty-medallion');
  expect(rule).toMatch(/border-radius:\s*50%/);
  expect(rule).toMatch(/background:\s*var\(--tint-neutral\)/);
});

test('.store-selection-sheet rows carry a CSS-only chevron', () => {
  // Second selector of the pair (the first line ends in a comma, which ruleFor cannot address).
  const rule = ruleFor('.store-selection-sheet__nearby button::after');
  expect(rule).toContain('border-top:');
  expect(rule).toContain('rotate(45deg)');
});
