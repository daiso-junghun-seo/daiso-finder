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
  expect(withoutComments).not.toMatch(/as unknown as/);
  expect(withoutComments).not.toMatch(/@ts-expect-error/);
  expect(withoutComments).not.toMatch(/\bas\s+\{/);
  expect(withoutComments).toContain("'headers' in res");
});
