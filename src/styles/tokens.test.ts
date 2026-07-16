import css from './tokens.css?raw';

const DARK_MARKER = '@media (prefers-color-scheme: dark)';

const REQUIRED_TOKENS = [
  '--surface-solid',
  '--text-primary',
  '--text-secondary',
  '--surface-glass-tint',
  '--glass-blur',
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

test('dark-mode overrides redefine every theme-sensitive token', () => {
  const darkBlock = css.slice(css.indexOf(DARK_MARKER));
  for (const token of [
    '--color-bg',
    '--color-text',
    '--color-accent',
    '--text-secondary',
    '--surface-glass-tint',
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
