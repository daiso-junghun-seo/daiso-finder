import fs from 'node:fs';
// scripts/dev-proxy.mjs — Node-runtime proxy for DAISO Finder: local dev AND production (gpu01).
//
// WHY THIS EXISTS: daisomall's anti-abuse gate on the auth-protected endpoints (selStrPkupStck /
// selIntPdStDispInfo) rejects the Cloudflare Workers (workerd) TLS/HTTP fingerprint with 403 — so
// `wrangler pages dev` (and prod CF Pages Functions) can serve /api/stores and /api/search (neither
// needs the Bearer auth handshake) but NOT /api/availability, which does. Node's fetch IS accepted.
// This server runs the REAL `functions/api/*` handlers (bundled via esbuild — no reimplementation) in
// the Node runtime, so the full browser → /api/* → live daisomall → 6-state pipeline works both
// locally and in production. All three routes are served here regardless, so this process is a
// single, consistent origin for the whole /api/* surface.
//
// Architecture (docs/superpowers/specs/2026-07-23-runtime-resolution.md, Option C): this process always
// serves BOTH dist/ static assets AND /api/* (same-origin — matches today's composition.ts, which fetches
// relative `/api/*` with no base-URL override, unchanged by this file). That is the verified mode. The
// doc's *recommended* target is a hybrid split (CF Pages serves dist/, this process serves /api/* only on
// gpu01, different origins) — CORS support (ALLOW_ORIGIN) below is wired for that split, but flipping the
// client over to it needs a composition-root base-URL change that is out of scope here (proxy/hosting
// only). Until that lands, ALLOW_ORIGIN stays unset and this process is a self-contained same-origin app
// server. Set SERVE_STATIC=0 to run /api-only (e.g. once the hybrid split is wired client-side).
//
// Env (all optional; production sets these via a host .env, see docs/deploy/gpu01-node-proxy.md):
//   HOST              bind address                  default 127.0.0.1
//   PORT              listen port                    default 8790 (dev) / set explicitly in prod
//   ALLOW_ORIGIN      CORS origin to allow on /api/*  default unset (same-origin, no CORS headers added)
//   SERVE_STATIC      '0' disables dist/ static serving (pure /api mode)   default on
//   PRE_AUTH_ENC_KEY  vendor pre-auth AES key (public constant; kept in env for rotation/hygiene)
//   UPSTREAM_BASE     fapi.daisomall.co.kr override
//   SEARCH_BASE       www.daisomall.co.kr override
// process.env always wins; .dev.vars (gitignored) is a local-only fallback so `npm run dev:live` needs no
// exported env vars. Never logged: JWT, x-dm-uid, Authorization/Bearer, request/response bodies.
//
// Usage:  npm run build && npm run dev:live   (local: builds dist/, serves it + live /api on :8790)
//         node scripts/dev-proxy.mjs          (production entry — see docs/deploy/gpu01-node-proxy.md)
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST = path.join(ROOT, 'dist');

const HOST = process.env.HOST || '127.0.0.1';
const PORT = process.env.PORT ? Number(process.env.PORT) : 8790;
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || null;
const SERVE_STATIC = process.env.SERVE_STATIC !== '0';

function loadDevVars() {
  const vars = {};
  const f = path.join(ROOT, '.dev.vars');
  if (fs.existsSync(f)) {
    for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) vars[m[1]] = m[2];
    }
  }
  return vars;
}

// process.env always wins; .dev.vars is a local-only fallback; PRE_AUTH_ENC_KEY is a public vendor
// constant (k-skill SKILL.md) so it alone gets a hardcoded last-resort default.
function resolveUpstreamEnv() {
  const fileVars = loadDevVars();
  return {
    PRE_AUTH_ENC_KEY:
      process.env.PRE_AUTH_ENC_KEY || fileVars.PRE_AUTH_ENC_KEY || 'PRE_AUTH_ENC_KEY',
    UPSTREAM_BASE: process.env.UPSTREAM_BASE || fileVars.UPSTREAM_BASE || undefined,
    SEARCH_BASE: process.env.SEARCH_BASE || fileVars.SEARCH_BASE || undefined,
  };
}

// Bundle a real Pages Function to node-runnable ESM and import its onRequestPost (uses global fetch /
// crypto.subtle / Request / Response — all present in Node 20+). No logic is reimplemented.
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

async function buildHandlers() {
  return {
    '/api/availability': await loadHandler('functions/api/availability.ts'),
    '/api/search': await loadHandler('functions/api/search.ts'),
    '/api/stores': await loadHandler('functions/api/stores.ts'),
  };
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

function serveStatic(url, res) {
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
}

function corsPreflightHeaders() {
  return {
    'access-control-allow-origin': ALLOW_ORIGIN,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '600',
    vary: 'origin',
  };
}

async function handleApi(req, res, url, handlers, env) {
  if (ALLOW_ORIGIN && req.method === 'OPTIONS') {
    res.writeHead(204, corsPreflightHeaders());
    res.end();
    return;
  }
  const handler = handlers[url.pathname];
  if (!handler) {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
    return;
  }
  if (req.method !== 'POST') {
    res.writeHead(405, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'method_not_allowed' }));
    return;
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const request = new Request(`http://${HOST}${url.pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: Buffer.concat(chunks),
  });
  let response;
  try {
    response = await handler({ request, env });
  } catch {
    // Handler errors here are only ever `new Error(<status-code string>)` (see functions/api/*.ts) —
    // never secrets — but we still avoid logging the exception object, just a fixed tag.
    console.error(JSON.stringify({ event: 'handler_error', path: url.pathname }));
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'upstream_unavailable' }));
    return;
  }
  const headers = Object.fromEntries(response.headers);
  if (ALLOW_ORIGIN) {
    headers['access-control-allow-origin'] = ALLOW_ORIGIN;
    headers.vary = 'origin';
  }
  res.writeHead(response.status, headers);
  res.end(Buffer.from(await response.arrayBuffer()));
}

function handleHealth(res) {
  res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(
    JSON.stringify({
      status: 'ok',
      service: 'daiso-finder-proxy',
      uptimeSeconds: Math.round(process.uptime()),
      time: new Date().toISOString(),
    }),
  );
}

// Structured request log: method, path, status, duration only. Never headers/query/body — those may
// carry the daisomall JWT/x-dm-uid/Bearer on the way through, so this line must stay coarse.
function logRequest(method, pathname, status, startNs) {
  const durationMs = Math.round(Number(process.hrtime.bigint() - startNs) / 1e5) / 10;
  console.log(
    JSON.stringify({ time: new Date().toISOString(), method, path: pathname, status, durationMs }),
  );
}

async function main() {
  if (SERVE_STATIC && !fs.existsSync(path.join(DIST, 'index.html'))) {
    console.error('dist/index.html missing — run `npm run build` first.');
    process.exit(1);
  }

  const handlers = await buildHandlers();
  const env = resolveUpstreamEnv();

  const server = http.createServer((req, res) => {
    const start = process.hrtime.bigint();
    const url = new URL(req.url ?? '/', `http://${HOST}:${PORT}`);
    res.on('finish', () => logRequest(req.method ?? '?', url.pathname, res.statusCode, start));

    const run = async () => {
      if (req.method === 'GET' && url.pathname === '/health') return handleHealth(res);
      if (url.pathname.startsWith('/api/')) return handleApi(req, res, url, handlers, env);
      if (!SERVE_STATIC) {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'not_found' }));
        return;
      }
      return serveStatic(url, res);
    };

    run().catch((e) => {
      console.error(JSON.stringify({ event: 'unhandled_error', message: e?.message ?? 'unknown' }));
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'internal_error' }));
      } else {
        res.end();
      }
    });
  });

  await new Promise((resolve) => server.listen(PORT, HOST, resolve));
  console.log(`daiso-finder proxy (Node runtime) → http://${HOST}:${PORT}`);
  const corsNote = ALLOW_ORIGIN
    ? ` CORS allow-origin=${ALLOW_ORIGIN}.`
    : ' same-origin (no CORS headers).';
  console.log(
    `  serves ${SERVE_STATIC ? 'dist/ (SPA) + ' : ''}REAL functions/api/* handlers in Node.${corsNote}`,
  );
  console.log(
    '  daisomall accepts Node TLS; workerd is blocked on protected endpoints (why this exists).',
  );

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(JSON.stringify({ event: 'shutdown', signal }));
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main();
