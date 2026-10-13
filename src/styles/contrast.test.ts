// src/styles/contrast.test.ts — B14 closure: mechanical WCAG 2.x contrast verification of the
// D083 token set (Interface §5 "Contrast guarantee (non-negotiable, I6)"). This is a verification
// artifact only — the color math is intentionally re-implemented here, not imported from src.
import css from './tokens.css?raw';

const DARK_MARKER = '@media (prefers-color-scheme: dark)';

type ThemeTokens = Map<string, string>;
type RGBA = { r: number; g: number; b: number; a: number };
type RGB = { r: number; g: number; b: number };

// --- Parsing --------------------------------------------------------------

/** Collects `--name: value;` custom-property declarations out of a CSS fragment. */
function extractTokens(block: string): ThemeTokens {
  const tokens: ThemeTokens = new Map();
  const re = /--([a-zA-Z][\w-]*)\s*:\s*([^;]+);/g;
  for (const match of block.matchAll(re)) {
    const name = match[1];
    const value = match[2];
    if (name === undefined || value === undefined) continue;
    tokens.set(`--${name}`, value.trim());
  }
  return tokens;
}

const darkMarkerIndex = css.indexOf(DARK_MARKER);
const lightBlock = css.slice(0, darkMarkerIndex);
const darkBlockRaw = css.slice(darkMarkerIndex);

const lightTokens = extractTokens(lightBlock);
const darkOverrides = extractTokens(darkBlockRaw);
// Dark theme = light merged with its overrides (brief's parser contract).
const darkTokens: ThemeTokens = new Map([...lightTokens, ...darkOverrides]);

/** Resolves one level of `var(--x)` indirection against the given theme's token map. */
function resolveRaw(tokens: ThemeTokens, name: string): string {
  const raw = tokens.get(name);
  if (raw === undefined) throw new Error(`token ${name} not found`);
  const varMatch = raw.match(/^var\((--[\w-]+)\)$/);
  if (!varMatch) return raw;
  const varName = varMatch[1];
  if (varName === undefined) throw new Error(`malformed var() reference in: ${raw}`);
  const inner = tokens.get(varName);
  if (inner === undefined) throw new Error(`var reference ${varName} not found`);
  return inner;
}

function parseColor(raw: string): RGBA {
  const hex = raw.match(/^#([0-9a-fA-F]{6})$/);
  if (hex) {
    const hexDigits = hex[1];
    if (hexDigits === undefined) throw new Error(`malformed hex color: ${raw}`);
    const n = Number.parseInt(hexDigits, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const rgba = raw.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (rgba) {
    const [, rStr, gStr, bStr, aStr] = rgba;
    if (rStr === undefined || gStr === undefined || bStr === undefined) {
      throw new Error(`malformed rgba color: ${raw}`);
    }
    return {
      r: Number(rStr),
      g: Number(gStr),
      b: Number(bStr),
      a: aStr !== undefined ? Number(aStr) : 1,
    };
  }
  throw new Error(`unrecognized color value: ${raw}`);
}

function colorOf(tokens: ThemeTokens, name: string): RGBA {
  return parseColor(resolveRaw(tokens, name));
}

// --- WCAG color math --------------------------------------------------------

function srgbToLinear(channel255: number): number {
  const c = channel255 / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(color: RGB): number {
  return (
    0.2126 * srgbToLinear(color.r) + 0.7152 * srgbToLinear(color.g) + 0.0722 * srgbToLinear(color.b)
  );
}

function contrastRatio(a: RGB, b: RGB): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Alpha-composites `fg` (with alpha) over an opaque `bg`. */
function compositeOver(fg: RGBA, bg: RGB): RGB {
  return {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
  };
}

const BLACK: RGB = { r: 0, g: 0, b: 0 };
const WHITE: RGB = { r: 255, g: 255, b: 255 };

/** Worst-case contrast for `text` against a translucent `tint` token: the tint composited over
 * both a pure-black and a pure-white underlay must each hold the threshold (D083 "whatever shows
 * through the blur"). Returns the lower (binding) of the two ratios. */
function worstCaseGlassRatio(tokens: ThemeTokens, textToken: string, tintToken: string): number {
  const text = colorOf(tokens, textToken);
  const tint = colorOf(tokens, tintToken);
  const overBlack = compositeOver(tint, BLACK);
  const overWhite = compositeOver(tint, WHITE);
  return Math.min(contrastRatio(text, overBlack), contrastRatio(text, overWhite));
}

function solidRatio(tokens: ThemeTokens, textToken: string, bgToken: string): number {
  const text = colorOf(tokens, textToken);
  const bg = colorOf(tokens, bgToken);
  return contrastRatio(text, bg);
}

// --- Checks (Task P6-3 table), per theme -----------------------------------

const THEMES: { name: string; tokens: ThemeTokens }[] = [
  { name: 'light', tokens: lightTokens },
  { name: 'dark', tokens: darkTokens },
];

const THRESHOLD = 4.5;

for (const { name, tokens } of THEMES) {
  test(`[${name}] --text-primary on --surface-solid holds ≥4.5:1`, () => {
    expect(solidRatio(tokens, '--text-primary', '--surface-solid')).toBeGreaterThanOrEqual(
      THRESHOLD,
    );
  });

  test(`[${name}] --text-secondary on --surface-solid holds ≥4.5:1`, () => {
    expect(solidRatio(tokens, '--text-secondary', '--surface-solid')).toBeGreaterThanOrEqual(
      THRESHOLD,
    );
  });

  test(`[${name}] --color-success on --surface-solid holds ≥4.5:1`, () => {
    expect(solidRatio(tokens, '--color-success', '--surface-solid')).toBeGreaterThanOrEqual(
      THRESHOLD,
    );
  });

  test(`[${name}] --color-error on --surface-solid holds ≥4.5:1`, () => {
    expect(solidRatio(tokens, '--color-error', '--surface-solid')).toBeGreaterThanOrEqual(
      THRESHOLD,
    );
  });

  test(`[${name}] --text-primary on glass worst-case (--surface-glass-tint) holds ≥4.5:1`, () => {
    expect(
      worstCaseGlassRatio(tokens, '--text-primary', '--surface-glass-tint'),
    ).toBeGreaterThanOrEqual(THRESHOLD);
  });

  test(`[${name}] --text-secondary on glass worst-case (--surface-glass-tint) holds ≥4.5:1`, () => {
    expect(
      worstCaseGlassRatio(tokens, '--text-secondary', '--surface-glass-tint'),
    ).toBeGreaterThanOrEqual(THRESHOLD);
  });

  test(`[${name}] --color-success on glass worst-case (--surface-glass-tint) holds ≥4.5:1`, () => {
    expect(
      worstCaseGlassRatio(tokens, '--color-success', '--surface-glass-tint'),
    ).toBeGreaterThanOrEqual(THRESHOLD);
  });

  test(`[${name}] --color-error on glass worst-case (--surface-glass-tint) holds ≥4.5:1`, () => {
    expect(
      worstCaseGlassRatio(tokens, '--color-error', '--surface-glass-tint'),
    ).toBeGreaterThanOrEqual(THRESHOLD);
  });

  test(`[${name}] --text-primary on raised glass worst-case (--surface-glass-tint-raised) holds ≥4.5:1`, () => {
    expect(
      worstCaseGlassRatio(tokens, '--text-primary', '--surface-glass-tint-raised'),
    ).toBeGreaterThanOrEqual(THRESHOLD);
  });

  test(`[${name}] --text-secondary on raised glass worst-case (--surface-glass-tint-raised) holds ≥4.5:1`, () => {
    expect(
      worstCaseGlassRatio(tokens, '--text-secondary', '--surface-glass-tint-raised'),
    ).toBeGreaterThanOrEqual(THRESHOLD);
  });

  test(`[${name}] --color-success on raised glass worst-case (--surface-glass-tint-raised) holds ≥4.5:1`, () => {
    expect(
      worstCaseGlassRatio(tokens, '--color-success', '--surface-glass-tint-raised'),
    ).toBeGreaterThanOrEqual(THRESHOLD);
  });

  test(`[${name}] --color-error on raised glass worst-case (--surface-glass-tint-raised) holds ≥4.5:1`, () => {
    expect(
      worstCaseGlassRatio(tokens, '--color-error', '--surface-glass-tint-raised'),
    ).toBeGreaterThanOrEqual(THRESHOLD);
  });

  // UI polish (2026-10-12): the single filled button. Opaque on opaque, so solidRatio —
  // no worst-case composite needed. The dark theme flips the foreground (white on
  // #ff4d5e would be ≈3.2:1); both directions are pinned, not just light.
  test(`[${name}] --action-fg on --action-bg (primary button) holds ≥4.5:1`, () => {
    expect(solidRatio(tokens, '--action-fg', '--action-bg')).toBeGreaterThanOrEqual(THRESHOLD);
  });

  // The keyboard ring paints on the app's own surfaces (opaque, per-theme) — not over
  // arbitrary imagery like glass tints, so the per-theme solid pair is the honest check.
  // It rides --action-bg (ink/near-white), not brand red (taste-2 rationing).
  test(`[${name}] --action-bg focus ring on --surface-solid holds ≥4.5:1`, () => {
    expect(solidRatio(tokens, '--action-bg', '--surface-solid')).toBeGreaterThanOrEqual(THRESHOLD);
  });

  // Refine (2026-10-12-ui-refine-design.md): status pills + banner tint. Opaque pairs.
  // A miss here drops the TINT (text stays) — recorded per pair in the design doc.
  test(`[${name}] --color-success on --tint-success (status pill) holds ≥4.5:1`, () => {
    expect(solidRatio(tokens, '--color-success', '--tint-success')).toBeGreaterThanOrEqual(
      THRESHOLD,
    );
  });

  test(`[${name}] --text-primary on --tint-neutral (neutral pill) holds ≥4.5:1`, () => {
    expect(solidRatio(tokens, '--text-primary', '--tint-neutral')).toBeGreaterThanOrEqual(
      THRESHOLD,
    );
  });

  test(`[${name}] --color-error on --tint-error (error banner) holds ≥4.5:1`, () => {
    expect(solidRatio(tokens, '--color-error', '--tint-error')).toBeGreaterThanOrEqual(THRESHOLD);
  });
}

test('parser found both themes (guards against silent regex drift)', () => {
  const REQUIRED = [
    '--text-primary',
    '--text-secondary',
    '--surface-solid',
    '--color-success',
    '--color-error',
    '--surface-glass-tint',
    '--surface-glass-tint-raised',
    '--action-bg',
    '--action-fg',
    '--tint-success',
    '--tint-error',
    '--tint-neutral',
  ];
  for (const token of REQUIRED) {
    expect(lightTokens.has(token)).toBe(true);
    expect(darkTokens.has(token)).toBe(true);
  }
  // Light and dark must actually diverge — otherwise the dark override block was not found.
  expect(resolveRaw(darkTokens, '--color-bg')).not.toBe(resolveRaw(lightTokens, '--color-bg'));
  expect(resolveRaw(darkTokens, '--color-bg')).toBe('#121212');
  expect(resolveRaw(lightTokens, '--color-bg')).toBe('#ffffff');
});
