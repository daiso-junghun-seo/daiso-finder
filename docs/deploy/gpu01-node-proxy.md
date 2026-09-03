# gpu01 Node proxy — deploy runbook (Option C)

> **STATUS: PREP ONLY — NOT DEPLOYED.** Public egress to daisomall from any host (this proxy on gpu01, or
> the earlier CF Workers probe in the runtime-resolution doc) is gated on the **owner's ToS/robots
> review**, which has not happened yet. Nothing in this document has been run against gpu01. This runbook
> exists so deployment is a paperwork-free `git pull` + `systemctl restart` once that review clears — it
> is not itself authorization to deploy.

Design source: [`docs/superpowers/specs/2026-07-23-runtime-resolution.md`](../superpowers/specs/2026-07-23-runtime-resolution.md)
(Option C). Server implementation: [`scripts/dev-proxy.mjs`](../../scripts/dev-proxy.mjs) — the same file
used for local dev (`npm run dev:live`), fully env-driven so production is the same code with different
env vars, not a fork. Because it is the same file, any route missing from its handler table is missing on
gpu01 too, not just locally — `/api/search` was one such gap (fixed 2026-07-28; see
`functions/api/handler-table.test.ts`, which now guards against this recurring). Once gpu01 is actually
deployed (still gated on the ToS/robots review above), a `git pull` + `systemctl restart` on that host
picks up the fix same as any other change to this file — there is no separate proxy codebase to patch.

---

## 0. Two deployment shapes

The proxy always *can* serve both `dist/` (SPA) and `/api/*` from one process (`SERVE_STATIC` defaults
on). Which shape you run is an env-var choice, not a code choice:

| | Shape A — all-Node same-origin (**recommended first step**) | Shape B — hybrid split-origin (doc's long-term target, §3.3) |
|---|---|---|
| What serves `dist/` | This Node process | Cloudflare Pages (existing `wrangler.jsonc` project, unchanged) |
| What serves `/api/*` | This Node process (same origin) | This Node process on gpu01 (different origin from the CF Pages domain) |
| Client changes needed | **None** — `src/adapters/composition.ts` already calls relative `/api/*` | One composition-root change to inject a cross-origin API base URL — **out of scope for this proxy task**, tracked as a follow-up |
| `SERVE_STATIC` | unset (default on) | `0` |
| `ALLOW_ORIGIN` | unset (no CORS headers needed — same origin) | set to the CF Pages origin (e.g. `https://daiso-finder.pages.dev`) |
| Why pick it | Zero client risk, ships today once ToS/robots clears | Matches the doc's recommendation (CDN for static, Node only where daisomall forces it) once the client-side base-URL follow-up lands |

**Recommendation: deploy Shape A first.** It is what was verified locally for this task (health +
live `/api/availability` + SPA, all through gpu01-identical code paths). Move to Shape B only after the
composition-root base-URL change ships separately — the proxy itself needs no code change to make that
switch, only the two env vars above.

---

## 1. Prerequisites

- gpu01 access (`mosh gpu01` / `ssh gpu01`), matching the existing k-skill-proxy operator.
- Node 20+ on gpu01 (`node --version`) — the proxy uses only `node:http`, `node:fs`, `node:path`,
  `node:url`, and `esbuild` (already a transitive devDependency via Vite; no new production dependency).
- `systemd --user` available for the deploying account, with **lingering enabled** so the service survives
  logout: `loginctl enable-linger <user>` (one-time, needs root/sudo — same requirement k-skill-proxy has).
- A TLS-terminating public entry point (Cloudflare Tunnel or reverse proxy — see §4). **This is the piece
  gated by the ToS/robots review**, since it is what makes the proxy reachable from the public internet.
- Owner decision: hostname for this service (e.g. `daiso-proxy.<domain>`) — not yet chosen, needed before
  §4 can be wired.

## 2. App directory layout (mirrors k-skill-proxy, `.claude/skills/k-skill/docs/deploy-k-skill-proxy.md`)

| Item | Suggested value | Notes |
|---|---|---|
| Source checkout | `~/apps/daiso-finder-repo` | `git clone` of this repo, `main` branch only (never deploy from a feature branch) |
| App directory | `~/apps/daiso-finder-proxy` | synced copy actually run by systemd — keeps a bad checkout from taking prod down mid-sync |
| Service | `daiso-finder-proxy.service` | `systemctl --user status daiso-finder-proxy.service` |
| Runtime env | `~/apps/daiso-finder-proxy/.env` | **gitignored, never in the repo** — see §3 |
| Deployed marker | `~/apps/daiso-finder-proxy/deployed-sha` | written only after a deploy passes its health checks (k-skill-proxy pattern) |

## 3. Env injection (`.env`, gitignored — NEVER commit real values)

`scripts/dev-proxy.mjs` reads these from `process.env` (with a `.dev.vars` fallback that is **local-dev
only** — production must set real env vars, not ship `.dev.vars`):

| Var | Required | Default if unset | Notes |
|---|---|---|---|
| `HOST` | no | `127.0.0.1` | Bind loopback only; the tunnel/reverse proxy (§4) is what's reachable publicly — matches k-skill-proxy's `KSKILL_PROXY_HOST` default. |
| `PORT` | no | `8790` | **Must not collide** with `k-skill-proxy` (`8080`) or other gpu01 services already bound — confirm a free port with the gpu01 operator before first deploy; this doc does not reserve one. |
| `ALLOW_ORIGIN` | only for Shape B | unset | See §0. When unset, no CORS headers are added (same-origin Shape A). When set, preflight `OPTIONS` on `/api/*` gets a 204 + `Access-Control-Allow-Origin/Methods/Headers`, and the actual response's `Access-Control-Allow-Origin` is pinned to this value instead of the handler's default `*`. |
| `SERVE_STATIC` | no | on (serves `dist/`) | Set to `0` for Shape B (`/api/*`-only). |
| `PRE_AUTH_ENC_KEY` | recommended | hardcoded fallback `PRE_AUTH_ENC_KEY` | Public vendor constant (k-skill `daiso-product-search/SKILL.md`) — not secret, kept in env for rotation hygiene per `docs/notes/store-api-observations.md`. |
| `UPSTREAM_BASE` | no | `https://fapi.daisomall.co.kr` | Override only if the vendor host changes. |
| `SEARCH_BASE` | no | `https://www.daisomall.co.kr` | Override only if the vendor host changes. |
| `DIAG_TIMING` | no | unset | Optional; `'1'` adds a `Server-Timing` response header carrying upstream leg durations. **Leave it unset in production** — it is a diagnostics aid for local device sessions, and the header would otherwise advertise which vendor endpoints the proxy calls. |

None of these are session secrets — the actual sensitive material (JWT, `x-dm-uid`, Bearer) is fetched
per-request from daisomall and **never persisted, never logged, never in `.env`** (see
`functions/_lib/daisoAuth.ts`; unchanged by this task).

Sample `.env` (values illustrative, not real secrets — copy and edit on gpu01, do not commit):

```dotenv
HOST=127.0.0.1
PORT=8790
# ALLOW_ORIGIN=https://daiso-finder.pages.dev   # only for Shape B
# SERVE_STATIC=0                                 # only for Shape B
PRE_AUTH_ENC_KEY=PRE_AUTH_ENC_KEY
UPSTREAM_BASE=https://fapi.daisomall.co.kr
SEARCH_BASE=https://www.daisomall.co.kr
# DIAG_TIMING=1                                  # diagnostics only — leave unset in production
```

## 4. Build step

```bash
cd ~/apps/daiso-finder-proxy
npm ci --omit=dev            # esbuild is a transitive devDependency of vite — see note below
npm run build                # tsc -b && vite build → dist/
```

> **Note on `esbuild`**: `scripts/dev-proxy.mjs` imports `esbuild` directly at runtime to bundle
> `functions/api/*.ts` into Node-runnable ESM (no logic reimplementation — see the file's header comment).
> Today `esbuild` is only a *transitive* devDependency (via `vite`), which is fine for `npm ci` (no
> `--omit=dev`) but would be missing under `--omit=dev`. **Before the first production deploy, promote
> `esbuild` to a direct `dependencies` entry in `package.json`** (or run `npm ci` without `--omit=dev` on
> gpu01) so the proxy doesn't depend on devDependency install behavior. This is a one-line follow-up, not
> done here since it touches `package.json` dependency shape beyond what this task's diff should carry
> silently — flagging it explicitly instead.

If Shape A (serves `dist/`): the build above is required before every start. If Shape B (`SERVE_STATIC=0`):
`dist/` is not read by the proxy, but `npm run build` is still how the CF Pages side gets its artifact —
that deploy is unchanged/separate from this runbook.

## 5. systemd user service (sample unit)

`~/.config/systemd/user/daiso-finder-proxy.service`:

```ini
[Unit]
Description=DAISO Finder Node proxy (Flow 1 /api, Option C)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=%h/apps/daiso-finder-proxy
EnvironmentFile=%h/apps/daiso-finder-proxy/.env
ExecStart=/usr/bin/node scripts/dev-proxy.mjs
Restart=on-failure
RestartSec=5
# scripts/dev-proxy.mjs handles SIGTERM by closing the server; give it a moment before SIGKILL.
TimeoutStopSec=15

[Install]
WantedBy=default.target
```

```bash
systemctl --user daemon-reload
systemctl --user enable --now daiso-finder-proxy.service
systemctl --user status daiso-finder-proxy.service
```

Adjust `ExecStart`'s `node` path to match gpu01's Node install (`which node` — k-skill-proxy uses a plain
`node` on PATH; if a version manager shims it, use the absolute resolved path instead, since systemd user
units don't source shell rc files).

## 6. Domain / TLS termination

gpu01's existing pattern (k-skill-proxy) is a **Cloudflare Tunnel** (`cloudflared`) forwarding a public
hostname to `127.0.0.1:<port>`, run as its own systemd user service
(`k-skill-proxy-tunnel.service`) — see `.claude/skills/k-skill/docs/deploy-k-skill-proxy.md` (reference
only, not modified by this task). Two ways to reuse that pattern here, both **owner decisions, not made in
this task**:

1. **New tunnel route on the existing cloudflared config** — add an ingress rule mapping a new hostname
   (e.g. `daiso-proxy.nomadamas.org`) to `http://127.0.0.1:<PORT>`, alongside the existing
   `k-skill-proxy.nomadamas.org` rule. Lowest new-infra cost if gpu01's tunnel config is shared/extensible.
2. **New standalone tunnel** — a second `cloudflared` service + credentials file, mirroring
   `k-skill-proxy-tunnel.service` exactly but pointed at this proxy's port. More isolated, more setup.

Either way, TLS terminates at Cloudflare's edge (tunnel is outbound-only from gpu01, no inbound port
forwarding/certs to manage on the box itself) — consistent with "Node's TLS is what daisomall accepts
outbound; the *inbound* public edge can still be anything," since the daisomall-facing leg (Node → daisomall)
is unaffected by how the client → proxy leg is terminated.

**Hostname is not yet chosen** — needs an owner call before §7's public health check can be wired for
real; this doc uses `daiso-proxy.<domain>` as a placeholder throughout.

## 7. Health-check wiring

`GET /health` → `200 {"status":"ok","service":"daiso-finder-proxy","uptimeSeconds":N,"time":"..."}`.
No secrets, no upstream calls — purely a liveness probe (does not itself verify daisomall reachability).

```bash
# local (always, once the service is running):
curl -fsS http://127.0.0.1:8790/health

# public (only once §6's tunnel/domain is wired):
curl -fsS https://daiso-proxy.<domain>/health
```

Adapting k-skill-proxy's cron-based auto-deploy (`.claude/skills/k-skill/scripts/deploy-k-skill-proxy-gpu01.sh`,
reference only) to this project would look like — **sketch only, not created/run as part of this task**:

```bash
#!/usr/bin/env bash
set -euo pipefail
REPO_DIR=~/apps/daiso-finder-repo
APP_DIR=~/apps/daiso-finder-proxy
SERVICE=daiso-finder-proxy.service

git -C "$REPO_DIR" fetch --prune origin
target_sha="$(git -C "$REPO_DIR" rev-parse origin/main)"
[[ "$target_sha" == "$(cat "$APP_DIR/deployed-sha" 2>/dev/null || true)" ]] && exit 0

git -C "$REPO_DIR" checkout --detach --force "$target_sha"
npm --prefix "$REPO_DIR" ci
npm --prefix "$REPO_DIR" run lint
npm --prefix "$REPO_DIR" run typecheck
npm --prefix "$REPO_DIR" run test
npm --prefix "$REPO_DIR" run build

rsync -a --delete --exclude node_modules --exclude .env "$REPO_DIR/" "$APP_DIR/"
npm --prefix "$APP_DIR" ci --omit=dev
systemctl --user restart "$SERVICE"

for _ in 1 2 3 4 5; do
  sleep 2
  curl -fsS http://127.0.0.1:8790/health && break
done
curl -fsS http://127.0.0.1:8790/health
curl -fsS https://daiso-proxy.<domain>/health   # only once §6 is wired

echo "$target_sha" > "$APP_DIR/deployed-sha"
```

Same shape as k-skill-proxy's: fetch → gate on tests+lint+typecheck → sync → restart → local+public health
check → record `deployed-sha` only after success. A rollback branch (restore previous synced tree + restart
on failure, per the k-skill-proxy script) should be added before this is ever actually installed as a cron
job — omitted from the sketch above for brevity, not because it's unneeded.

## 8. Mapping to the existing k-skill-proxy gpu01 pattern

| k-skill-proxy | daiso-finder proxy (this doc) |
|---|---|
| Fastify, many routes, per-provider API keys | plain `node:http`, three routes (`/api/availability`, `/api/search`, `/api/stores`), one daisomall-shaped auth handshake — **no framework dependency added** |
| `systemctl --user status k-skill-proxy.service` | `systemctl --user status daiso-finder-proxy.service` |
| `k-skill-proxy-tunnel.service` → `k-skill-proxy.nomadamas.org` | new tunnel route (§6) → `daiso-proxy.<domain>` (hostname TBD) |
| `.env` in app directory, runtime-injected | same (§3) |
| cron + `deploy-k-skill-proxy-gpu01.sh`, flock, 5-min interval | same shape available (§7 sketch), **not installed** |
| `/health` returns `{ok: true, ...}` | `/health` returns `{status: 'ok', ...}` (matching this repo's existing response-shape convention, e.g. `functions/_lib/daisoUpstream.ts` `jsonResponse`) |
| Proxy-route inclusion rule: only add routes needing a server-held API key | Same principle already followed: `/api/*` exists *because* daisomall's anti-abuse gate forces a Node-runtime, auth-holding hop — not because of a generic "proxy everything" policy |

## 9. What is explicitly NOT done by this runbook

- No `wrangler login`, no `wrangler deploy`, no public egress of any kind was performed while producing this
  document. Verification was **local only** (`127.0.0.1`, see the accompanying report).
- No hostname was registered, no tunnel/reverse-proxy config was touched on gpu01 (no gpu01 access was used
  at all — this is a paper design against the existing k-skill-proxy pattern, read-only).
- No systemd unit was installed anywhere.
- No `.env` with real values exists anywhere in this repo or was created on any host.

**Next real step is the owner's ToS/robots review (§ blocking note at top).** Once that clears: pick a
port (§3) and hostname (§6), promote `esbuild` to a direct dependency (§4 note), then this runbook's steps
1–7 execute in order.
