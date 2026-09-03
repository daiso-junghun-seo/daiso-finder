import { parseServerTiming, readServerTiming } from './serverTiming';
import serverTimingSource from './serverTiming?raw';

test('parses total and legs in order', () => {
  expect(parseServerTiming('total;dur=412, search;dur=88, stck;dur=310')).toEqual({
    totalMs: 412,
    legs: [
      { name: 'search', ms: 88 },
      { name: 'stck', ms: 310 },
    ],
  });
});

test('a header with only total yields no legs rather than a fabricated one', () => {
  expect(parseServerTiming('total;dur=7')).toEqual({ totalMs: 7, legs: [] });
});

test('legs without a total keep totalMs null instead of summing them', () => {
  // Summing is forbidden: disp and stck run in Promise.all, so a sum exceeds the wall clock and
  // drives the residual negative. See the design spec §7.
  expect(parseServerTiming('search;dur=88, stck;dur=310')).toEqual({
    totalMs: null,
    legs: [
      { name: 'search', ms: 88 },
      { name: 'stck', ms: 310 },
    ],
  });
});

test('a measured zero survives', () => {
  expect(parseServerTiming('total;dur=0, str;dur=0')).toEqual({
    totalMs: 0,
    legs: [{ name: 'str', ms: 0 }],
  });
});

test('malformed entries are dropped, never defaulted', () => {
  expect(parseServerTiming('total;dur=412, broken, str;dur=abc, ;dur=5, disp;dur=94')).toEqual({
    totalMs: 412,
    legs: [{ name: 'disp', ms: 94 }],
  });
});

test('an empty or whitespace duration value is dropped, never fabricated as a measured zero', () => {
  // Number('') is 0, and 0 passes Number.isFinite -- this is the shape that sails through unless
  // the empty/whitespace value is rejected BEFORE Number() ever runs. total;dur= alone leaves
  // nothing observed at all (→ null); a trailing empty leg is dropped but the total survives.
  expect(parseServerTiming('total;dur=')).toBeNull();
  expect(parseServerTiming('total;dur=412, str;dur=')).toEqual({ totalMs: 412, legs: [] });
});

test('an absent or unparseable header is null, not an empty object', () => {
  expect(parseServerTiming(null)).toBeNull();
  expect(parseServerTiming('')).toBeNull();
  expect(parseServerTiming('nonsense')).toBeNull();
});

test('readServerTiming returns null for an object with no headers (the FetchLike doubles)', () => {
  expect(readServerTiming({ ok: true, status: 200, json: async () => ({}) })).toBeNull();
  expect(readServerTiming({ headers: null })).toBeNull();
  expect(readServerTiming({ headers: {} })).toBeNull();
  expect(readServerTiming({ headers: { get: 'not a function' } })).toBeNull();
});

test('readServerTiming rejects a headers that is a function carrying its own get property', () => {
  // The case where the thorough probe and a weakened `'headers' in res` actually diverge in RETURN
  // VALUE, not just code path: `typeof res.headers === 'object'` correctly rejects a function, while
  // `'headers' in res` alone would let it through and hand back fabricated timing instead of null.
  const headersFn = Object.assign(() => {}, { get: () => 'total;dur=412' });
  expect(readServerTiming({ headers: headersFn })).toBeNull();
});

test('readServerTiming reads a real Response', () => {
  const res = new Response('{}', { headers: { 'server-timing': 'total;dur=412, str;dur=61' } });
  expect(readServerTiming(res)).toEqual({ totalMs: 412, legs: [{ name: 'str', ms: 61 }] });
});

test('readServerTiming survives a headers.get that throws', () => {
  expect(
    readServerTiming({
      headers: {
        get() {
          throw new Error('nope');
        },
      },
    }),
  ).toBeNull();
});

test('the header probe is structural — no casts', () => {
  // A source-text guard, because the discipline being protected is invisible to a behavior test:
  // widening FetchLike or reaching for `as unknown as` would make every test above still pass while
  // breaking the repo-wide doubles that implement exactly { ok, status, json } (§B30-18 ⑧).
  const withoutComments = serverTimingSource
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
  // The `@ts-expect-error` directive is only ever valid as a full-line comment, so the
  // comment-stripping above has already deleted any real occurrence before this assertion would
  // even run -- checked against the RAW source instead. The two cast checks below stay against the
  // STRIPPED text on purpose: a cast is executable code that must be checked post-strip so the word
  // "as" appearing in prose/comments cannot false-positive. Do not merge these two checks back
  // together.
  expect(serverTimingSource).not.toMatch(/@ts-expect-error/);
  expect(withoutComments).not.toMatch(/as unknown as/);
  expect(withoutComments).not.toMatch(/\bas\s+\{/);
  expect(withoutComments).toContain("'headers' in res");
});
