#!/usr/bin/env bash
# Setup script for the Claude Code cloud environment that runs the worker, reviewer and planner
# sessions with both repositories attached. Idempotent; safe to run on every session start.
#
# Installs JDK 21, Node 22, pnpm, jq, the GitHub CLI and Playwright's Chromium; warms the Gradle and
# pnpm caches; and reports whether Docker (needed by Testcontainers and the e2e stack) is usable.
# Needs no credentials. Paths: SHOP_API_DIR / SHOP_WEB_DIR, or found next to this script.
set -uo pipefail

log() { printf '\n== %s\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }
SUDO=""
[[ $(id -u) -ne 0 ]] && have sudo && SUDO="sudo"
export DEBIAN_FRONTEND=noninteractive

find_repo() {
  local name=$1 dir
  for dir in "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)" "$PWD/$name" "$PWD/../$name" \
    "$(dirname "${BASH_SOURCE[0]}")/../../$name" "$HOME/$name" "/workspace/$name" "/code/$name"; do
    [[ -f $dir/CLAUDE.md && $(basename "$(cd "$dir" && pwd)") == "$name" ]] && { (cd "$dir" && pwd); return; }
  done
}
API_DIR=${SHOP_API_DIR:-$(find_repo shop-api)}
WEB_DIR=${SHOP_WEB_DIR:-$(find_repo shop-web)}

apt_install() {
  have apt-get || { echo "apt-get not available; install $* manually"; return 1; }
  $SUDO apt-get install -y -q "$@" >/dev/null
}
apt_updated=0
apt_update() { ((apt_updated)) || { $SUDO apt-get update -q >/dev/null && apt_updated=1; }; }

log "Base tools"
apt_update
for tool in curl git jq unzip ca-certificates gnupg; do have "$tool" || apt_install "$tool"; done
jq --version

log "JDK 21"
if have java && java -version 2>&1 | grep -q 'version "21'; then
  java -version 2>&1 | head -1
else
  if ! apt_install openjdk-21-jdk-headless; then
    curl -fsSL https://packages.adoptium.net/artifactory/api/gpg/key/public | $SUDO gpg --dearmor -o /usr/share/keyrings/adoptium.gpg
    echo "deb [signed-by=/usr/share/keyrings/adoptium.gpg] https://packages.adoptium.net/artifactory/deb $(. /etc/os-release && echo "$VERSION_CODENAME") main" |
      $SUDO tee /etc/apt/sources.list.d/adoptium.list >/dev/null
    apt_updated=0 && apt_update && apt_install temurin-21-jdk
  fi
  java -version 2>&1 | head -1
fi

log "Node 22 and pnpm"
if ! have node || [[ $(node -p 'process.versions.node.split(".")[0]') -lt 22 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | $SUDO -E bash - >/dev/null
  apt_install nodejs
fi
node --version
if ! have pnpm; then
  # pnpm version comes from shop-web's packageManager field through corepack.
  $SUDO corepack enable 2>/dev/null || npm install -g corepack >/dev/null && $SUDO corepack enable
fi
[[ -n $WEB_DIR ]] && (cd "$WEB_DIR" && corepack install >/dev/null 2>&1; pnpm --version)

log "GitHub CLI"
if ! have gh; then
  curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg |
    $SUDO dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg status=none
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" |
    $SUDO tee /etc/apt/sources.list.d/github-cli.list >/dev/null
  apt_updated=0 && apt_update && apt_install gh
fi
gh --version | head -1
if gh auth status >/dev/null 2>&1; then echo "gh: authenticated"; else
  echo "gh: NOT authenticated. The pickers, heartbeats and PR commands need gh with access to both repos."
fi

log "Warm the Gradle cache (shop-api)"
if [[ -n $API_DIR ]]; then
  (cd "$API_DIR" && ./gradlew --no-daemon -q classes testClasses) &&
    echo "gradle: dependencies cached" || echo "gradle: warm-up failed (see above)"
else
  echo "shop-api checkout not found; set SHOP_API_DIR"
fi

log "Warm the pnpm store and install Playwright Chromium (shop-web)"
if [[ -n $WEB_DIR ]]; then
  (cd "$WEB_DIR" && pnpm install --frozen-lockfile >/dev/null && echo "pnpm: dependencies installed")
  (cd "$WEB_DIR" && pnpm exec playwright install --with-deps chromium >/dev/null 2>&1 &&
    echo "playwright: chromium installed" || echo "playwright: browser install failed")
else
  echo "shop-web checkout not found; set SHOP_WEB_DIR"
fi

log "Agent state folders"
for dir in "$API_DIR" "$WEB_DIR"; do [[ -n $dir ]] && mkdir -p "$dir/.claude/state"; done
echo ok

log "Docker"
if have docker && docker info >/dev/null 2>&1; then
  echo "docker: AVAILABLE ($(docker version --format '{{.Server.Version}}' 2>/dev/null)). Testcontainers and make demo can run here."
else
  echo "docker: NOT AVAILABLE. Testcontainers and e2e tests run only in CI; workers rely on gh pr checks."
fi
