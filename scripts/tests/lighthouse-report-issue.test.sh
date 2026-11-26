#!/usr/bin/env bash
# Tests for scripts/lighthouse-report-issue.sh with a fake gh that logs its calls.
# Run: bash scripts/tests/lighthouse-report-issue.test.sh   (needs bash and jq)
set -euo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
script="$here/../lighthouse-report-issue.sh"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

cat >"$work/gh" <<'GH'
#!/usr/bin/env bash
echo "${*//$'\n'/ }" >>"$WORK/calls.log"
if [[ $* == *"--jq"* ]]; then printf '%s' "${EXISTING:-}"; fi
GH
chmod +x "$work/gh"
export WORK=$work GH="$work/gh"

failures=0
expect() {
  if [[ $2 == "$3" ]]; then echo "ok   - $1"; else
    echo "FAIL - $1"; echo "       expected: $2"; echo "       actual:   $3"; failures=$((failures + 1))
  fi
}
calls() { cat "$work/calls.log" 2>/dev/null || true; }
reset() { rm -f "$work/calls.log"; unset EXISTING; }

failing='[{"url":"http://localhost:3000/cart","auditId":"largest-contentful-paint","level":"error","passed":false,"operator":"<=","expected":837,"actual":1200}]'
passing='[{"url":"http://localhost:3000/","auditId":"cumulative-layout-shift","level":"error","passed":true,"operator":"<=","expected":0.01,"actual":0}]'

reset; echo "[]" >"$work/r.json"
bash "$script" o/r https://run "$work/r.json" >/dev/null
expect "an empty result creates nothing" "" "$(calls)"

reset; echo "$passing" >"$work/r.json"
bash "$script" o/r https://run "$work/r.json" >/dev/null
expect "a passing run creates no issue and no comment" "" "$(calls)"

reset; echo "$failing" >"$work/r.json"
bash "$script" o/r https://run "$work/r.json" >/dev/null
expect "a failure opens an issue with labels" 1 "$(calls | grep -c 'repos/o/r/issues -f title=Lighthouse budgets failing .*labels\[\]=bug .*labels\[\]=area:infra')"
expect "the issue lists url, metric, value and budget, and the run" 1 \
  "$(calls | grep -c 'http://localhost:3000/cart`: `largest-contentful-paint` is 1200 (budget <= 837).*Run: https://run')"

reset; echo "$failing" >"$work/r.json"; export EXISTING=42
bash "$script" o/r https://run "$work/r.json" >/dev/null
expect "an open issue gets a comment" 1 "$(calls | grep -c 'repos/o/r/issues/42/comments -f body=')"
expect "no second issue is opened" 0 "$(calls | grep -c 'title=')"

reset; rm -f "$work/r.json"
bash "$script" o/r https://run "$work/r.json" >/dev/null
expect "a run without results still reports" 1 "$(calls | grep -c 'No assertion results found')"

((failures == 0)) || { echo "$failures failure(s)"; exit 1; }
