// src/adapters/layering.test.ts — the port boundary is one-way: adapters map upstream data into
// domain shapes, so they must not reach into ui/. This is a source-level guard because the bad
// import type-checks fine and only shows up as a reuse blocker later (open-questions §B47 review).
// import.meta.glob keeps this test free of node:fs (the app tsconfig has no node types).
const sources = import.meta.glob(['./**/*.ts', './**/*.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

test('adapters never import from ui/ — the port boundary stays one-way', () => {
  const offenders = Object.entries(sources)
    .filter(([file]) => !/\.test\.(ts|tsx)$/.test(file))
    .filter(([, source]) => /from\s+['"][^'"]*\/ui\//.test(source))
    .map(([file]) => file);
  expect(offenders).toEqual([]);
});
