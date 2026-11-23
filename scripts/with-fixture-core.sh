#!/usr/bin/env bash
# Runs a command with CORE_INTERNAL_URL pointing at a fixture core (scripts/fixture-core.ts).
# Usage: scripts/with-fixture-core.sh <command> [args...]
# When CORE_INTERNAL_URL is already set the command runs as is and no server is started.
# The server listens on FIXTURE_CORE_PORT (default: a free port) and is always stopped on exit.
set -euo pipefail

if [[ -n ${CORE_INTERNAL_URL:-} ]]; then
  exec "$@"
fi

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
log=$(mktemp)
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON "$root/scripts/fixture-core.ts" >"$log" 2>&1 &
pid=$!
cleanup() {
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  rm -f "$log"
}
trap cleanup EXIT

port=""
for _ in $(seq 1 100); do
  port=$(sed -n 's/^fixture-core listening on \([0-9]*\)$/\1/p' "$log")
  [[ -n $port ]] && break
  kill -0 "$pid" 2>/dev/null || { cat "$log" >&2; echo "fixture-core exited early" >&2; exit 1; }
  sleep 0.1
done
[[ -n $port ]] || { cat "$log" >&2; echo "fixture-core did not start" >&2; exit 1; }

echo "fixture core on http://127.0.0.1:$port" >&2
CORE_INTERNAL_URL="http://127.0.0.1:$port" "$@"
