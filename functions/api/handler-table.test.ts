import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

// dev-proxy.mjs exports nothing and calls main() at module scope, so importing it would start a server.
// Compare the source text instead: a route silently missing from the table is invisible at runtime —
// the client turns the resulting 404 into an empty result.
test('every Pages Function under functions/api is routed by the dev proxy', () => {
  const root = path.resolve(__dirname, '../..');
  const proxy = readFileSync(path.join(root, 'scripts/dev-proxy.mjs'), 'utf8');
  const handlers = readdirSync(path.join(root, 'functions/api'))
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((f) => `functions/api/${f}`);
  expect(handlers.length).toBeGreaterThan(0);
  for (const handler of handlers) {
    expect(proxy).toContain(handler);
  }
});
