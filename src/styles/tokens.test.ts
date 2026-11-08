import css from './tokens.css?raw';

const DARK_MARKER = '@media (prefers-color-scheme: dark)';

const REQUIRED_TOKENS = [
  '--surface-solid',
  '--text-primary',
  '--text-secondary',
  '--surface-glass-tint',
  '--surface-glass-tint-raised',
  '--glass-blur',
  '--glass-text-shadow',
  '--surface-scrim',
  '--glass-border',
  '--color-success',
  '--color-error',
  '--color-neutral-border',
];

test('every custom property glass.css references is defined in the light (:root) block', () => {
  const lightBlock = css.slice(0, css.indexOf(DARK_MARKER));
  for (const token of REQUIRED_TOKENS) {
    expect(lightBlock).toMatch(new RegExp(`${token}\\s*:\\s*[^;]+;`));
  }
});

test('body sets the Korean-first system font stack (no UA serif fallback)', () => {
  const bodyRule = css.slice(css.indexOf('body {'));
  expect(bodyRule).toMatch(/font-family:\s*var\(--font-sans\)/);
  expect(css).toMatch(/--font-sans:[^;]*Apple SD Gothic Neo/);
  expect(css).toMatch(/--font-sans:[^;]*Noto Sans KR/);
});

test('display type rides the rounded stack (SF Rounded where available)', () => {
  const displayRule = css.slice(css.indexOf('.text-display {'));
  expect(displayRule).toMatch(/font-family:\s*var\(--font-display\)/);
  expect(css).toMatch(/--font-display:[^;]*ui-rounded/);
});

test('dark-mode overrides redefine every theme-sensitive token', () => {
  const darkBlock = css.slice(css.indexOf(DARK_MARKER));
  for (const token of [
    '--color-bg',
    '--color-text',
    '--color-accent',
    '--text-secondary',
    '--surface-glass-tint',
    '--surface-glass-tint-raised',
    '--glass-text-shadow',
    '--surface-scrim',
    '--color-success',
    '--color-error',
    '--color-neutral-border',
  ]) {
    expect(darkBlock).toMatch(new RegExp(`${token}\\s*:\\s*[^;]+;`));
  }
});

test('typography utility classes exist for Display/Heading/Body/Caption/Label (Interface §5)', () => {
  for (const cls of [
    '.text-display',
    '.text-heading',
    '.text-body',
    '.text-caption',
    '.text-label',
  ]) {
    expect(css).toContain(cls);
  }
});

test('search-bar demotion and status color utility classes exist', () => {
  for (const cls of ['.search-bar--demoted', '.success-status', '.error-banner']) {
    expect(css).toContain(cls);
  }
});

// Layout hardening (2026-11-08): the UA defaults these rules reset were measurably
// participating in layout — content-box turned a 44px input into 66px, UA p margins
// added a second 16px rhythm, and Korean broke mid-word. Each assertion pins the
// reset itself, because deleting one silently restores the old geometry.
test('the layout reset makes declared sizes and Korean line breaks real', () => {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  expect(withoutComments).toMatch(/\*,\s*\*::before,\s*\*::after\s*\{\s*box-sizing:\s*border-box;/);
  expect(withoutComments).toMatch(/body,\s*h1,\s*h2,\s*h3,\s*p,\s*ul,\s*ol\s*\{\s*margin:\s*0;/);

  const bodyRule = css.slice(css.indexOf('body {'));
  expect(bodyRule).toMatch(/word-break:\s*keep-all/);
  expect(bodyRule).toMatch(/overflow-wrap:\s*break-word/);
});

// LOAD-BEARING FOR ACCESSIBILITY, and pinned by nothing until now. layout.css deliberately ships no
// local prefers-reduced-motion block for the scanner's breathing brackets because this global rule
// already turns every animation off with `!important`. That makes deleting this block a silent
// accessibility regression: a motion-sensitive shopper would get a pulsing overlay and the whole suite
// would stay green.
test('the global reduced-motion rule turns animations off, which is what the scanner brackets rely on', () => {
  // Strip comments so that quoted selectors (e.g., `/* * {` as documentation) or prose that names
  // the selector while documenting its absence do not trick the tests. This also makes the depth
  // counter trustworthy: with comments present, counting braces would be confounded by braces
  // inside prose (e.g., `/* selector { … } was removed */`).
  const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, '');

  const start = cssNoComments.indexOf('@media (prefers-reduced-motion: reduce)');
  expect(start).toBeGreaterThan(-1);

  // The rule must be top-level (depth 0), not nested inside another at-rule. If the rule were
  // wrapped in `@media print`, it would apply only when printing, and a motion-sensitive shopper
  // seeing the app on their phone would lose protection.
  let depthBeforeRule = 0;
  for (let i = 0; i < start; i += 1) {
    if (cssNoComments[i] === '{') depthBeforeRule += 1;
    else if (cssNoComments[i] === '}') depthBeforeRule -= 1;
  }
  expect(depthBeforeRule).toBe(0);

  let depth = 0;
  let end = -1;
  for (let i = cssNoComments.indexOf('{', start); i < cssNoComments.length; i += 1) {
    if (cssNoComments[i] === '{') depth += 1;
    else if (cssNoComments[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  expect(end).toBeGreaterThan(start);
  const block = cssNoComments.slice(start, end);
  // `!important` is not decoration here: it is what lets this beat the animation shorthand that
  // `.scanner-overlay__aim--live` declares directly on the element.
  expect(block).toMatch(/animation:\s*none\s*!important/);
  // The declaration must sit inside the universal selector `*`, not a narrower one like
  // `input, button`. If it applied only to inputs and buttons, `.scanner-overlay__aim--live`
  // (a `<div>`) would lose protection. The `[{}]` anchor ensures `*` is a whole selector, not part
  // of a descendant combinator like `.a *`.
  expect(block).toMatch(/[{}]\s*\*\s*\{[^}]*animation:\s*none\s*!important/);
});
