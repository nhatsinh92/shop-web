#!/usr/bin/env bash
# Tests for scripts/with-fixture-core.sh: it starts the fixture core when CORE_INTERNAL_URL is
# unset, stops it afterwards (also when the command fails) and stays out of the way when it is set.
# Run: bash scripts/tests/with-fixture-core.test.sh
set -euo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
wrap="$here/../with-fixture-core.sh"
failures=0
expect() {
  if [[ $2 == "$3" ]]; then echo "ok   - $1"; else
    echo "FAIL - $1"; echo "       expected: $2"; echo "       actual:   $3"
    failures=$((failures + 1))
  fi
}
port_of() { sed -n 's#^http://127.0.0.1:\([0-9]*\)$#\1#p' <<<"$1"; }
listening() { curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$1/api/products" && echo yes || echo no; }

unset CORE_INTERNAL_URL
out=$(bash "$wrap" bash -c 'echo "$CORE_INTERNAL_URL"; curl -s -o /dev/null -w "%{http_code}" "$CORE_INTERNAL_URL/api/products" >&2' 2>&1)
url=$(grep '^http://127.0.0.1:' <<<"$out" | head -1)
expect "the command sees CORE_INTERNAL_URL and the server answers" "200" "$(tail -1 <<<"$out")"
expect "the server is stopped after a successful command" "no" "$(listening "$(port_of "$url")")"

url=""
set +e
out=$(bash "$wrap" bash -c 'echo "$CORE_INTERNAL_URL"; exit 7' 2>/dev/null)
code=$?
set -e
expect "a failing command keeps its exit code" "7" "$code"
expect "the server is stopped after a failing command" "no" "$(listening "$(port_of "$out")")"

out=$(CORE_INTERNAL_URL=http://example.invalid:1 bash "$wrap" bash -c 'echo "$CORE_INTERNAL_URL"' 2>&1)
expect "a set CORE_INTERNAL_URL is kept and no server starts" "http://example.invalid:1" "$out"

((failures == 0)) || { echo "$failures test(s) failed"; exit 1; }
