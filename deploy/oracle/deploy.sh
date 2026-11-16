#!/usr/bin/env bash
# Deploy the current origin/main to the Oracle VM. Run as the login user (ubuntu):
#
#   bash ~/apps/daiso-finder-repo/deploy/oracle/deploy.sh
#
# The test suite is NOT run here — main is protected and CI gates every push. This script only
# builds, swaps the runtime tree, restarts, health-checks, and rolls back on failure.
set -euo pipefail

REPO_DIR="${REPO_DIR:-$HOME/apps/daiso-finder-repo}"
APP_DIR="${APP_DIR:-$HOME/apps/daiso-finder-proxy}"
SERVICE="${SERVICE:-daiso-finder-proxy.service}"
PORT="${PORT:-8790}"
PREV_DIR="${APP_DIR}.prev"

say() { printf '\n== %s\n' "$*"; }

cd "${REPO_DIR}"
say "fetching origin"
git fetch --prune origin
TARGET="$(git rev-parse origin/main)"
CURRENT="$(cat "${APP_DIR}/deployed-sha" 2>/dev/null || true)"

if [[ "${TARGET}" == "${CURRENT}" ]]; then
  say "already at ${TARGET} — nothing to do"
  exit 0
fi

say "checking out ${TARGET}"
git checkout --detach --force "${TARGET}"

# The 1 GiB AMD shape needs a bigger heap than Node's default, and the 2 GiB swap that
# bootstrap.sh adds is what makes it safe. Bigger shapes keep their default.
mem_mb="$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)"
if [[ "${mem_mb}" -lt 2048 ]]; then
  export NODE_OPTIONS="${NODE_OPTIONS:-} --max-old-space-size=768"
fi

# Full install: tsc and vite are devDependencies. `npm prune --omit=dev` in the app tree below
# keeps only the runtime deps (esbuild is a direct dependency).
say "installing and building (slow on the 1/8-OCPU AMD shape — that is expected)"
npm ci --prefer-offline --no-audit --no-fund
npm run build

# Snapshot the running tree first. dist/ + functions/ + scripts/ are a few MB, so this is cheap
# and gives a one-command rollback without rebuilding the previous commit.
if [[ -d "${APP_DIR}/dist" ]]; then
  say "snapshotting the current runtime to ${PREV_DIR}"
  rm -rf "${PREV_DIR}"
  rsync -a --exclude node_modules --exclude .env --exclude deployed-sha "${APP_DIR}/" "${PREV_DIR}/"
fi

say "syncing ${TARGET} into ${APP_DIR}"
rsync -a --delete \
  --exclude .git --exclude node_modules --exclude .env --exclude deployed-sha \
  "${REPO_DIR}/" "${APP_DIR}/"
npm --prefix "${APP_DIR}" ci --omit=dev --prefer-offline --no-audit --no-fund

say "restarting ${SERVICE}"
sudo systemctl restart "${SERVICE}"

ok=0
for _ in $(seq 1 15); do
  sleep 2
  if curl -fsS "http://127.0.0.1:${PORT}/health" >/dev/null; then
    ok=1
    break
  fi
done

if [[ "${ok}" -ne 1 ]]; then
  echo "local health check failed — rolling back" >&2
  if [[ -d "${PREV_DIR}" ]]; then
    rsync -a --delete --exclude node_modules --exclude .env --exclude deployed-sha \
      "${PREV_DIR}/" "${APP_DIR}/"
    sudo systemctl restart "${SERVICE}"
    echo "rolled back to the previous runtime (deployed-sha left at ${CURRENT:-<none>})" >&2
  fi
  sudo journalctl -u "${SERVICE}" -n 40 --no-pager >&2 || true
  exit 1
fi

echo "${TARGET}" > "${APP_DIR}/deployed-sha"
say "deployed ${TARGET}"
curl -fsS "http://127.0.0.1:${PORT}/health"
echo
