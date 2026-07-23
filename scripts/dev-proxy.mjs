import fs from 'node:fs';
// scripts/dev-proxy.mjs — DEV-ONLY local server for live testing.
//
// WHY THIS EXISTS: daisomall's anti-abuse gate on the auth-protected endpoints (selStrPkupStck /
// selIntPdStDispInfo) rejects the Cloudflare Workers (workerd) TLS/HTTP fingerprint with 403 — so
// `wrangler pages dev` can serve /api/stores but NOT /api/availability. Node's fetch IS accepted.
// This server runs the REAL `functions/api/*` handlers (bundled via esbuild — no reimplementation) in
// the Node runtime, so the full browser → /api/* → live daisomall → 6-state pipeline works locally.
//
// This is a LOCAL TESTING AID, not the production runtime. Production still needs a Node-runtime proxy
// (see docs/notes/open-questions.md — CF Pages Functions may be blocked in prod too).
//
// Usage:  npm run build   (produce dist/, the prod client that wires the live /api adapters)
//         node scripts/dev-proxy.mjs   (or: npm run dev:live)
//         open http://localhost:8790
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST = path.join(ROOT, 'dist');
const PORT = process.env.PORT ? Number(process.env.PORT) : 8790;

function loadDevVars() {
  const env = {};
  const f = path.join(ROOT, '.dev.vars');
  if (fs.existsSync(f)) {
    for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2];
    }
  }
  // PRE_AUTH_ENC_KEY is a public vendor constant (k-skill SKILL.md); default it so the proxy runs without .dev.vars.
  if (!env.PRE_AUTH_ENC_KEY) env.PRE_AUTH_ENC_KEY = 'PRE_AUTH_ENC_KEY';
  return env;
}
const ENV = loadDevVars();

// Bundle a real Pages Function to node-runnable ESM and import its onRequestPost (uses global fetch /
// crypto.subtle / Request / Response — all present in Node 20+).
async function loadHandler(entry) {
  const out = await esbuild.build({
    entryPoints: [path.join(ROOT, entry)],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    write: false,
  });
  const code = out.outputFiles[0].text;
  const mod = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  return mod.onRequestPost;
}

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain',
  '.map': 'application/json',
};

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('dist/index.html missing — run `npm run build` first.');
  process.exit(1);
}

const handlers = {
  '/api/availability': await loadHandler('functions/api/availability.ts'),
  '/api/stores': await loadHandler('functions/api/stores.ts'),
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const handler = handlers[url.pathname];

  if (handler) {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'method_not_allowed' }));
      return;
    }
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const request = new Request(`http://localhost${url.pathname}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: Buffer.concat(chunks),
    });
    try {
      const response = await handler({ request, env: ENV });
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (e) {
      console.error('dev-proxy handler error:', e);
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'upstream_unavailable' }));
    }
    return;
  }

  // Static assets from dist/, with SPA fallback to index.html.
  let filePath = path.join(DIST, url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory())
    filePath = path.join(DIST, 'index.html');
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(filePath)] ?? 'application/octet-stream',
    });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`dev-proxy (Node runtime) → http://localhost:${PORT}`);
  console.log(
    '  serves dist/ (prod build → live adapters) + REAL functions/api/* handlers in Node.',
  );
  console.log(
    '  daisomall accepts Node TLS; workerd is blocked on protected endpoints (why this exists).',
  );
});
