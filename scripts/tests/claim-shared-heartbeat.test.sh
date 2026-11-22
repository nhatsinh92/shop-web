#!/usr/bin/env bash
# Tests for scripts/claim.sh when concurrent worker runs share one heartbeat comment on the same
# issue (shop-api#33, shop-web#24). REST fixtures only; writes are logged, never sent.
# Needs bash, jq and GNU date. Run: bash scripts/tests/claim-shared-heartbeat.test.sh
set -euo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
scripts=$(cd "$here/.." && pwd)
claim_script=${CLAIM_SCRIPT:-$scripts/claim.sh}
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
export SHOP_REPOS="o/shop-api o/shop-web" CLAIM_WAIT_SECONDS=0 SHOP_FAKE_COMMENT_ID=100 CLAIM_RUN_ID=run-b

ago() { date -u -d "-$1 min" +%Y-%m-%dT%H:%M:%SZ; }
put() { local path=${1%%\?*}; printf '%s' "$2" >"$work/${path//\//_}.json"; }
# hb id issue-number updated-min-ago [claim-run] [done]
hb() {
  local body="<!-- shop-agent:heartbeat role=worker branch=claude/issue-$2 -->"
  [[ -n ${4:-} ]] && body+="\\n<!-- shop-agent:claim run=$4 -->"
  [[ -n ${5:-} ]] && body+="\\n<!-- shop-agent:done -->"
  printf '{"id":%s,"issue_url":"https://api.github.com/repos/o/r/issues/%s","body":"%s","updated_at":"%s"}' \
    "$1" "$2" "$body" "$(ago "$3")"
}
recent() { put "repos/o/$1/issues/comments" "[$2]"; }
item() { put "repos/o/$1/issues/$2/comments" "[${3:-}]"; }
reset() { rm -f "$work"/*.json "$work/writes.log"; recent shop-api ""; recent shop-web ""; item shop-api 14; }

failures=0
expect() {
  if [[ $2 == "$3" ]]; then echo "ok   - $1"; else
    echo "FAIL - $1"
    echo "       expected: $2"
    echo "       actual:   $3"
    failures=$((failures + 1))
  fi
}
claim() { SHOP_FIXTURES=$work bash "$claim_script" o/shop-api 14 claude/issue-14-b 2>/dev/null || echo "exit $?"; }
writes() { if [[ -f $work/writes.log ]]; then tr '\n' ';' <"$work/writes.log"; fi; }

# Run A posted heartbeat 7 seconds ago; run B starts on the same issue.
reset
item shop-api 14 "$(hb 7 14 0 run-a)"
recent shop-api "$(hb 7 14 0 run-a)"
expect "a fresh heartbeat on the same issue -> the second run ends" \
  "$(printf '%s\n%s' '{"claimed":false,"reason":"another worker is active: o/shop-api#14 (heartbeat comment 7)"}' 'exit 3')" "$(claim)"
expect "  the second run writes nothing" '' "$(writes)"

# Runs A and B both refresh the same stale heartbeat 40; A wrote last.
reset
item shop-api 14 "$(hb 40 14 45)"
recent shop-api "$(hb 40 14 0 run-a)"
expect "two runs refresh the same stale heartbeat, the other run wrote last -> lost" \
  "$(printf '%s\n%s' '{"claimed":false,"reason":"another worker run claimed o/shop-api#14 at the same time (heartbeat comment 40)"}' 'exit 3')" "$(claim)"
expect "  the shared heartbeat is not deleted or edited again" 'PATCH repos/o/shop-api/issues/comments/40;' "$(writes)"

# Same, but B wrote last.
reset
item shop-api 14 "$(hb 40 14 45)"
recent shop-api "$(hb 40 14 0 run-b)"
expect "two runs refresh the same stale heartbeat, this run wrote last -> claimed" '{"claimed":true,"comment":40}' "$(claim)"

# A finished run marked its heartbeat done a minute ago: the next run may start at once.
reset
item shop-api 14 "$(hb 40 14 1 run-a "done")"
recent shop-api "$(hb 40 14 0 run-b)"
expect "a fresh heartbeat marked done -> claimed by refreshing it" '{"claimed":true,"comment":40}' "$(claim)"
expect "  the done heartbeat was edited, nothing posted" 'PATCH repos/o/shop-api/issues/comments/40;' "$(writes)"

# Both runs found no heartbeat and posted one each: A got 99, B got 100.
reset
recent shop-api "$(hb 99 14 0 run-a),$(hb 100 14 0 run-b)"
expect "two runs post separate heartbeats on the same issue -> the newer one loses" \
  "$(printf '%s\n%s' '{"claimed":false,"reason":"another worker is active: o/shop-api#14 (heartbeat comment 99)"}' 'exit 3')" "$(claim)"
expect "  the losing run deletes only its own heartbeat" 'POST repos/o/shop-api/issues/14/comments;DELETE repos/o/shop-api/issues/comments/100;' "$(writes)"

echo
if ((failures)); then echo "$failures test(s) failed"; exit 1; fi
echo "all shared-heartbeat claim tests passed"
