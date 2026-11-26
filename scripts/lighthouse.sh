#!/usr/bin/env bash
# Builds the production app against the stub gateway, serves it with next start and runs Lighthouse
# CI (mobile preset, 3 runs, median) on the URLs in lighthouserc.json.
# Usage: scripts/lighthouse.sh            collect + assert against the budgets in lighthouserc.json
#        LHCI_ASSERT=off scripts/lighthouse.sh   collect only (used to measure the budgets)
# Env: E2E_STUB_PORT (default 4010), CHROME_PATH (default: the Chromium that
# Playwright uses). Both servers are stopped on exit, also on failure. Reports: .lighthouseci/.
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$root"

port=3000 # the urls in lighthouserc.json use this port
stub_port=${E2E_STUB_PORT:-4010}
stub_url="http://localhost:$stub_port"
pids=()
cleanup() {
  for pid in "${pids[@]:-}"; do
    [[ -n $pid ]] || continue
    pkill -P "$pid" 2>/dev/null || true # children first (next start forks next-server)
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup EXIT

wait_for() { # url
  for _ in $(seq 1 200); do
    curl -fsS -o /dev/null "$1" 2>/dev/null && return 0
    sleep 0.3
  done
  echo "timed out waiting for $1" >&2
  return 1
}

# rewrites() in next.config.ts is resolved at build time, so the build must see GATEWAY_URL.
GATEWAY_URL=$stub_url bash scripts/with-fixture-core.sh pnpm build
node scripts/check-static-shell.mjs

E2E_STUB_PORT=$stub_port node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON e2e/support/stub-gateway.ts &
pids+=($!)
wait_for "$stub_url/__stub/health"

GATEWAY_URL=$stub_url CORE_INTERNAL_URL=$stub_url CART_INTERNAL_URL=$stub_url \
  ./node_modules/.bin/next start -p "$port" &
pids+=($!)
wait_for "http://localhost:$port/"

# The PDP url in lighthouserc.json must be the stub's first flash-sale product.
first=$(curl -fsS "$stub_url/api/flash-sales/current" | node -e \
  'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).items[0].slug))')
grep -q "/product/$first\"" lighthouserc.json || {
  echo "lighthouserc.json has no url for the first flash-sale product ($first)" >&2
  exit 1
}

export CHROME_PATH=${CHROME_PATH:-$(node -p 'require("@playwright/test").chromium.executablePath()')}
[[ -x $CHROME_PATH ]] || { echo "no Chromium at $CHROME_PATH (run: pnpm exec playwright install chromium)" >&2; exit 1; }

rm -rf .lighthouseci
pnpm exec lhci collect --config=lighthouserc.json
if [[ ${LHCI_ASSERT:-on} != off ]]; then
  pnpm exec lhci assert --config=lighthouserc.json
fi
