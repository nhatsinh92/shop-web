#!/usr/bin/env bash
# Setup script for the Claude Code cloud environment (set it in the environment's "Setup script"
# field as: bash /home/user/shop-api/scripts/cloud-setup.sh).
#
# Runs as root on Ubuntu after the repositories are cloned, before Claude Code starts. The result
# is cached as a snapshot only if it exits 0 within about five minutes, so every step here is
# best effort and the script always exits 0. Java 21, Node 22, jq and gh are preinstalled; Docker
# is not available (Testcontainers tests skip locally and run in CI).
#
# Needs these hosts besides the default package-manager allowlist: services.gradle.org and
# downloads.gradle.org (Gradle wrapper), cdn.playwright.dev and playwright.download.prss.microsoft.com
# (Playwright Chromium).
set -u

log() { printf '\n== %s (t+%ss)\n' "$1" "$SECONDS"; }
have() { command -v "$1" >/dev/null 2>&1; }

find_repo() {
  local name=$1 dir
  for dir in "${2:-}" "/home/user/$name" "$PWD/$name" "$(dirname "${BASH_SOURCE[0]}")/../../$name"; do
    [[ -n $dir && -f $dir/CLAUDE.md ]] && { (cd "$dir" && pwd); return; }
  done
}
API_DIR=$(find_repo shop-api "${SHOP_API_DIR:-}")
WEB_DIR=$(find_repo shop-web "${SHOP_WEB_DIR:-}")

log "Tools"
for tool in java node jq gh git; do
  if have "$tool"; then echo "$tool: $("$tool" --version 2>&1 | head -1)"; else echo "$tool: MISSING"; fi
done

log "pnpm through corepack (version from shop-web's packageManager)"
if [[ -n $WEB_DIR ]]; then
  corepack enable >/dev/null 2>&1 || npm install -g corepack >/dev/null 2>&1 && corepack enable
  (cd "$WEB_DIR" && corepack install >/dev/null 2>&1; echo "pnpm: $(pnpm --version 2>&1)")
else
  echo "shop-web checkout not found"
fi

log "shop-web dependencies"
if [[ -n $WEB_DIR ]]; then
  (cd "$WEB_DIR" && pnpm install --frozen-lockfile >/dev/null 2>&1 && echo "pnpm install: ok") || echo "pnpm install: FAILED"
fi

log "Gradle wrapper and dependencies (shop-api)"
if [[ -n $API_DIR ]]; then
  (cd "$API_DIR" && timeout 180 ./gradlew --no-daemon -q classes testClasses >/dev/null 2>&1 && echo "gradle: ok") ||
    echo "gradle: FAILED or timed out (check that services.gradle.org is allowed)"
else
  echo "shop-api checkout not found"
fi

log "Playwright Chromium (shop-web)"
if [[ -n $WEB_DIR ]]; then
  (cd "$WEB_DIR" && timeout 150 pnpm exec playwright install --with-deps chromium >/dev/null 2>&1 && echo "playwright: ok") ||
    echo "playwright: FAILED or timed out (check the Playwright download hosts)"
fi

log "GitHub access (REST only; gh auth status may report an invalid token, the proxy authenticates)"
if gh api repos/nhatsinh92/shop-api --jq .full_name >/dev/null 2>&1; then echo "gh api: ok"; else echo "gh api: FAILED"; fi

log "Docker"
if have docker && docker info >/dev/null 2>&1; then echo "docker: AVAILABLE"; else
  echo "docker: NOT AVAILABLE (expected; Testcontainers tests skip here and run in CI)"
fi

log "Done"
exit 0
