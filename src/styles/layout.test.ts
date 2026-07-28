import css from './layout.css?raw';

// display:none and visibility:hidden both remove the node from the accessibility tree, which would
// silence the very announcement this class exists to preserve. Clip-based hiding does not.
test('the visually-hidden utility hides without leaving the accessibility tree', () => {
  const rule = css.slice(css.indexOf('.visually-hidden'));
  expect(rule).toContain('clip-path');
  expect(rule.slice(0, rule.indexOf('}'))).not.toContain('display: none');
  expect(rule.slice(0, rule.indexOf('}'))).not.toContain('visibility: hidden');
});

// Carried over from Task 2's review: no test exercised the aim guide's CSS at all, so a future edit
// reintroducing a closed border, a background fill, or a z-index would go completely uncaught. These
// assertions check the stylesheet's TEXT only — they cannot prove rendered appearance (jsdom never
// applies this file; see the module comment above and Task 4's brief).
test('.scanner-overlay__aim declares no background and no border of its own — corners are drawn by its child spans', () => {
  const start = css.indexOf('.scanner-overlay__aim {');
  expect(start).toBeGreaterThan(-1);
  const end = css.indexOf('}', start);
  const rule = css.slice(start, end);
  expect(rule).not.toContain('background');
  expect(rule).not.toContain('border');
});

test('each aim-guide corner span zeroes exactly two border sides, drawing a bracket rather than a closed box', () => {
  for (let n = 1; n <= 4; n += 1) {
    const marker = `.scanner-overlay__aim span:nth-child(${n}) {`;
    const start = css.indexOf(marker);
    expect(start).toBeGreaterThan(-1);
    const end = css.indexOf('}', start);
    const rule = css.slice(start, end);
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
