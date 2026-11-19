// scripts/client-key.mjs — the rate-limit bucket key for the Node proxy.
//
// WHY NOT the socket address: in production the proxy binds loopback and Caddy is the only hop, so
// every request's socket peer is 127.0.0.1. Keying on it puts every shopper in one 120 req/min
// bucket (docs/deploy/gcp-e2-micro.md §12.3).
//
// Trust boundary: the proxy is only reachable through the local reverse proxy (HOST defaults to
// 127.0.0.1), so headers added by that hop are trusted. Paths in order:
//   1. Cloudflare's `cf-connecting-ip` when the deployment sits behind a Cloudflare tunnel.
//   2. The LAST `x-forwarded-for` entry. Caddy appends the real peer to any client-supplied header;
//      taking the first entry would let a caller choose its own bucket. If Caddy replaced the
//      header instead, the last entry is still the real peer.
//   3. The socket address (local dev without a reverse proxy).
//
// This is a blast-radius guard, not an identity: returning the same key for several clients is
// safe, returning a different key per spoofed header only weakens the guard, never the app.
const MAX_KEY_CHARS = 64;

function headerValue(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
}

export function clientKey(headers, remoteAddress) {
  const cf = headerValue(headers['cf-connecting-ip']);
  if (cf) return cf.slice(0, MAX_KEY_CHARS);

  const forwarded = headerValue(headers['x-forwarded-for']);
  if (forwarded) {
    const hops = forwarded
      .split(',')
      .map((hop) => hop.trim())
      .filter(Boolean);
    const last = hops.at(-1);
    if (last) return last.slice(0, MAX_KEY_CHARS);
  }

  return (remoteAddress ?? 'unknown').slice(0, MAX_KEY_CHARS);
}
