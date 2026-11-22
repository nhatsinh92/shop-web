#!/usr/bin/env bash
# Tests for the `done` heartbeat: heartbeat.sh marks a run's heartbeats done, and next-task.sh,
# next-review.sh and claim.sh stop counting done heartbeats as active agents.
# Uses REST fixtures (writes are logged, never sent). Needs bash, jq and GNU date.
# Run: bash scripts/tests/heartbeat.test.sh
set -euo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
scripts=$(cd "$here/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
export SHOP_REPOS="o/shop-api o/shop-web" CLAIM_WAIT_SECONDS=0 SHOP_FAKE_COMMENT_ID=100

ago() { date -u -d "-$1 min" +%Y-%m-%dT%H:%M:%SZ; }
put() { local path=${1%%\?*}; printf '%s' "$2" >"$work/${path//\//_}.json"; }
hb() { # id issue-number updated-min-ago [role] [branch] [done]
  local extra=""
  [[ ${6:-} == done ]] && extra='\n<!-- shop-agent:done -->'
  printf '{"id":%s,"issue_url":"https://api.github.com/repos/o/r/issues/%s","body":"<!-- shop-agent:heartbeat role=%s branch=%s -->%s\\nprogress","updated_at":"%s"}' \
    "$1" "$2" "${4:-worker}" "${5:-claude/issue-$2-x}" "$extra" "$(ago "$3")"
}
recent() { put "repos/o/$1/issues/comments" "[$2]"; }
item() { put "repos/o/$1/issues/$2/comments" "[${3:-}]"; }
reset() {
  rm -f "$work"/*.json "$work/writes.log"
  local name
  for name in shop-api shop-web; do put "repos/o/$name/issues" "[]"; put "repos/o/$name/pulls" "[]"; recent "$name" ""; done
}

failures=0
expect() {
  if [[ $2 == "$3" ]]; then echo "ok   - $1"; else
    echo "FAIL - $1"
    echo "       expected: $2"
    echo "       actual:   $3"
    failures=$((failures + 1))
  fi
}
strip_reason() { sed 's/,"reason":"[^"]*"//'; }
task() { SHOP_FIXTURES=$work bash "$scripts/next-task.sh" 2>/dev/null | strip_reason; }
review() { SHOP_FIXTURES=$work bash "$scripts/next-review.sh" 2>/dev/null | strip_reason; }
claim() { SHOP_FIXTURES=$work bash "$scripts/claim.sh" o/shop-api 6 claude/issue-6-x 2>/dev/null || echo "exit $?"; }
beat() { SHOP_FIXTURES=$work bash "$scripts/heartbeat.sh" "$@" 2>/dev/null <<<"Done: PR opened" || echo "exit $?"; }
writes() { tr '\n' ';' <"$work/writes.log" 2>/dev/null || true; }

# --- pickers and claim ignore done heartbeats -------------------------------------------------
reset
recent shop-api "$(hb 40 11 4)"
expect "a fresh worker heartbeat still blocks the worker picker" '{"action":"none"}' "$(task)"
expect "  (reason names the busy issue)" 'worker heartbeat on o/shop-api #11 is 4 min old' \
  "$(SHOP_FIXTURES=$work bash "$scripts/next-task.sh" | jq -r .reason)"

reset
recent shop-api "$(hb 40 11 4 worker claude/issue-11-x done)"
expect "a fresh but done worker heartbeat does not block the worker picker" \
  'nothing ready in o/shop-api o/shop-web' "$(SHOP_FIXTURES=$work bash "$scripts/next-task.sh" | jq -r .reason)"

reset
item shop-api 6
recent shop-api "$(hb 40 11 4 worker claude/issue-11-x done),$(hb 100 6 0)"
expect "a done worker heartbeat does not make claim.sh lose" '{"claimed":true,"comment":100}' "$(claim)"

reset
put "repos/o/shop-api/pulls" '[{"number":7,"created_at":"'"$(ago 30)"'","draft":false,"labels":[{"name":"review"}],"head":{"ref":"claude/issue-6-x","sha":"sha7"},"body":"Closes #6"}]'
put "repos/o/shop-api/commits/sha7/check-runs" '{"check_runs":[{"name":"build","status":"completed","conclusion":"success","started_at":"'"$(ago 5)"'"}]}'
recent shop-api "$(hb 41 7 3 reviewer -)"
expect "a fresh reviewer heartbeat still makes the review picker skip the PR" '{"action":"none"}' "$(review)"
recent shop-api "$(hb 41 7 3 reviewer - done)"
expect "a done reviewer heartbeat does not make the review picker skip the PR" \
  '{"action":"review","repo":"o/shop-api","pr":7,"issue":6}' "$(review)"

# --- heartbeat.sh done ------------------------------------------------------------------------
reset
item shop-api 29 "$(hb 50 29 2)"
recent shop-api "$(hb 40 11 4),$(hb 50 29 2),$(hb 45 12 3 worker claude/issue-12-y),$(hb 46 13 3 worker claude/issue-11-x done),$(hb 47 29 3 reviewer -)"
expect "done refreshes this heartbeat and marks the same branch's other fresh heartbeat done" \
  "$(printf '%s\n%s' 'heartbeat comment 50 (done)' 'heartbeat comment 40 (done)')" \
  "$(beat o/shop-api 29 worker claude/issue-11-x - done)"
expect "  only heartbeats 50 and 40 are written (other branch, already done and reviewer untouched)" \
  'PATCH repos/o/shop-api/issues/comments/50;PATCH repos/o/shop-api/issues/comments/40;' "$(writes)"

reset
item shop-api 29 "$(hb 50 29 2)"
recent shop-api "$(hb 40 11 4),$(hb 50 29 2)"
expect "without done only this heartbeat is refreshed" 'heartbeat comment 50' "$(beat o/shop-api 29 worker claude/issue-11-x -)"
expect "  one write" 'PATCH repos/o/shop-api/issues/comments/50;' "$(writes)"

reset
item shop-api 7
expect "a reviewer's first done heartbeat is posted; reviewers touch no other comment" \
  'heartbeat comment 100 (done)' "$(beat o/shop-api 7 reviewer - - done)"
expect "  one write" 'POST repos/o/shop-api/issues/7/comments;' "$(writes)"

reset
item shop-api 7
expect "an unknown sixth argument is rejected" 'exit 2' "$(beat o/shop-api 7 reviewer - - finished)"

if ((failures)); then
  echo "$failures failing"
  exit 1
fi
echo "all heartbeat tests passed"
