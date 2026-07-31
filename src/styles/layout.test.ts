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
  expect(declaredValue(midStop, 'transform')).not.toBe(declaredValue(restStop, 'transform'));
  expect(declaredValue(midStop, 'opacity')).not.toBe(declaredValue(restStop, 'opacity'));
});
