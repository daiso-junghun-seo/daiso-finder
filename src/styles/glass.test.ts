import css from './glass.css?raw';

const SUPPORTS_MARKER =
  '@supports (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))';
const REDUCED_MARKER = '@media (prefers-reduced-transparency: reduce)';

// Returns the full at-rule block (marker + braces) starting at the marker, brace-matched.
function atRuleBlock(marker: string): string {
  const start = css.indexOf(marker);
  if (start === -1) return '';
  const open = css.indexOf('{', start + marker.length);
  let depth = 1;
  let i = open + 1;
  while (depth > 0 && i < css.length) {
    if (css[i] === '{') depth += 1;
    if (css[i] === '}') depth -= 1;
    i += 1;
  }
  return css.slice(start, i);
}

const supportsBlock = atRuleBlock(SUPPORTS_MARKER);
const reducedBlock = atRuleBlock(REDUCED_MARKER);

test('exactly one standard + one -webkit backdrop-filter blur declaration outside the reduced-transparency block (one composited layer per surface, D083)', () => {
  const outsideReduced = css.replace(reducedBlock, '');
  // Declarations end with ';' — the @supports feature query itself is not a declaration.
  // The value may nest one level of parens, e.g. blur(var(--glass-blur)).
  // The prefixed pair is ONE composited blur layer, not two; the lookbehind keeps the
  // standard-property count from also matching inside -webkit-backdrop-filter.
  const standardBlurDecls =
    outsideReduced.match(/(?<!-)backdrop-filter:\s*blur\((?:[^()]|\([^()]*\))*\)\s*;/g) ?? [];
  const webkitBlurDecls =
    outsideReduced.match(/-webkit-backdrop-filter:\s*blur\((?:[^()]|\([^()]*\))*\)\s*;/g) ?? [];
  expect(standardBlurDecls).toHaveLength(1);
  expect(webkitBlurDecls).toHaveLength(1);
  expect(reducedBlock.match(/backdrop-filter:\s*blur\(/g)).toBeNull();
});

test('reduced-transparency fallback forces the blur off (solid is the base layer)', () => {
  expect(reducedBlock).toContain('backdrop-filter: none !important');
  expect(reducedBlock).toContain('-webkit-backdrop-filter: none !important');
  expect(reducedBlock).toContain('background: var(--surface-solid) !important');
});

test('the glass text-shadow is applied only inside @supports; outside it only the reduced reset appears', () => {
  expect(supportsBlock).toContain('text-shadow: var(--glass-text-shadow);');
  const outsideSupports = css.replace(supportsBlock, '');
  const shadowDecls = outsideSupports.match(/text-shadow:\s*[^;]+;/g) ?? [];
  expect(shadowDecls).toEqual(['text-shadow: none !important;']);
});

test('lists render on the solid layer — D083 forbids blur on large scrolling lists', () => {
  expect(css).toMatch(/\.glass-surface ul\s*\{[^}]*background:\s*var\(--surface-solid\);/);
});

test('.sheet-scrim uses the scrim token', () => {
  expect(css).toMatch(/\.sheet-scrim\s*\{[^}]*background:\s*var\(--surface-scrim\);/);
});
