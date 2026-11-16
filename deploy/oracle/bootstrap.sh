#!/usr/bin/env bash
# One-time host setup for the DAISO Finder Node proxy on an Oracle Cloud Always Free VM
# (Ubuntu 24.04). Run as the login user (ubuntu), never as root:
#
#   bash deploy/oracle/bootstrap.sh                          # hostname = <public-ip>.sslip.io
#   bash deploy/oracle/bootstrap.sh daiso.example.com        # own domain instead
#
# Idempotent: a second run only fills in what is missing. See docs/deploy/oracle-always-free.md.
set -euo pipefail

HOSTNAME_ARG="${1:-}"
REPO_URL="${REPO_URL:-https://github.com/daiso-junghun-seo/daiso-finder.git}"
REPO_DIR="${REPO_DIR:-$HOME/apps/daiso-finder-repo}"
APP_DIR="${APP_DIR:-$HOME/apps/daiso-finder-proxy}"
SERVICE="daiso-finder-proxy.service"
PORT="${PORT:-8790}"

say() { printf '\n== %s\n' "$*"; }

if [[ "${EUID}" -eq 0 ]]; then
  echo "run as the login user (e.g. ubuntu) — this script calls sudo itself" >&2
  exit 1
fi

# 1. Swap. The always-free AMD shape has 1 GiB RAM; `tsc -b && vite build` needs headroom.
if ! swapon --show | grep -q .; then
  say "adding a 2 GiB swap file (build headroom)"
  sudo fallocate -l 2G /swapfile 2>/dev/null || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile >/dev/null
  sudo swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

# 2. Base packages.
say "installing base packages"
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
  ca-certificates curl git rsync gpg apt-transport-https debian-keyring debian-archive-keyring

# 3. Node 22 (the repo's .nvmrc). NodeSource ships an arm64 build too, so A1 works.
node_major=0
if command -v node >/dev/null 2>&1; then
  node_major="$(node -p 'process.versions.node.split(".")[0]')"
fi
if [[ "${node_major}" -lt 20 ]]; then
  say "installing Node 22 (NodeSource)"
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
NODE_BIN="$(command -v node)"
say "node $(node --version) at ${NODE_BIN}, npm $(npm --version)"

# 4. Host firewall. Oracle's Ubuntu images end the INPUT chain with a REJECT rule, so 80/443
#    are closed even when the VCN Security List allows them. Both layers must be opened.
say "opening 80/443 in the host firewall"
for port in 80 443; do
  sudo iptables -C INPUT -p tcp --dport "${port}" -j ACCEPT 2>/dev/null \
    || sudo iptables -I INPUT 1 -p tcp --dport "${port}" -j ACCEPT
done
if ! dpkg -s netfilter-persistent >/dev/null 2>&1; then
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y iptables-persistent
fi
sudo mkdir -p /etc/iptables
sudo sh -c 'iptables-save > /etc/iptables/rules.v4'

# 5. Caddy: TLS termination + reverse proxy in front of the loopback-bound Node process.
if ! command -v caddy >/dev/null 2>&1; then
  say "installing Caddy (apt repo)"
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | sudo gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo apt-get update -y
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y caddy
fi

# 6. Source checkout (public repo — no credentials on the host).
mkdir -p "$(dirname "${REPO_DIR}")"
if [[ ! -d "${REPO_DIR}/.git" ]]; then
  say "cloning ${REPO_URL}"
  git clone "${REPO_URL}" "${REPO_DIR}"
fi

# 7. Public hostname. sslip.io maps <ip-with-dashes>.sslip.io to that IP for free; replace it
#    with a real domain by re-running this script with the domain as $1.
if [[ -z "${HOSTNAME_ARG}" ]]; then
  public_ip="$(curl -fsS https://api.ipify.org)"
  HOSTNAME_ARG="${public_ip//./-}.sslip.io"
  say "no hostname given — using ${HOSTNAME_ARG} (public IP ${public_ip})"
fi

# 8. Runtime env. Nothing here is a secret: PRE_AUTH_ENC_KEY is the vendor's public constant
#    (docs/notes/store-api-observations.md). Session JWTs are fetched per request and never stored.
mkdir -p "${APP_DIR}"
if [[ ! -f "${APP_DIR}/.env" ]]; then
  say "writing ${APP_DIR}/.env"
  cat > "${APP_DIR}/.env" <<EOF
HOST=127.0.0.1
PORT=${PORT}
PRE_AUTH_ENC_KEY=PRE_AUTH_ENC_KEY
EOF
  chmod 600 "${APP_DIR}/.env"
fi

# 9. systemd unit (system scope — root is available on this host, so no lingering needed).
say "installing ${SERVICE}"
sed -e "s|__USER__|$(id -un)|g" -e "s|__HOME__|${HOME}|g" -e "s|__NODE__|${NODE_BIN}|g" \
  "${REPO_DIR}/deploy/oracle/daiso-finder-proxy.service" \
  | sudo tee "/etc/systemd/system/${SERVICE}" >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable "${SERVICE}"

# 10. Caddy site config.
say "rendering /etc/caddy/Caddyfile for ${HOSTNAME_ARG}"
sed -e "s|__HOST__|${HOSTNAME_ARG}|g" -e "s|__PORT__|${PORT}|g" \
  "${REPO_DIR}/deploy/oracle/Caddyfile.template" \
  | sudo tee /etc/caddy/Caddyfile >/dev/null
sudo systemctl enable caddy
sudo systemctl reload caddy 2>/dev/null || sudo systemctl restart caddy

# 11. First deploy (build + start + local health check).
say "first deploy"
bash "${REPO_DIR}/deploy/oracle/deploy.sh"

# 12. Public health check. Certificate issuance can take a few seconds on the first request.
say "public health check — https://${HOSTNAME_ARG}/health"
ok=0
for _ in $(seq 1 30); do
  if curl -fsS "https://${HOSTNAME_ARG}/health"; then
    echo
    ok=1
    break
  fi
  sleep 2
done
if [[ "${ok}" -ne 1 ]]; then
  echo "public health check failed. Check:" >&2
  echo "  1) VCN Security List allows 80/443 (console)" >&2
  echo "  2) sudo iptables -S INPUT | grep -E 'dport (80|443)'" >&2
  echo "  3) sudo journalctl -u caddy -n 50" >&2
  echo "  4) dig +short ${HOSTNAME_ARG}" >&2
  exit 1
fi

say "done — https://${HOSTNAME_ARG}"
