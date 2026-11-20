#!/usr/bin/env bash
# Tests for scripts/claim.sh against REST fixtures (writes are logged, never sent).
# Needs bash, jq and GNU date. Run: bash scripts/tests/claim.test.sh
set -euo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
scripts=$(cd "$here/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
export SHOP_REPOS="o/shop-api o/shop-web" CLAIM_WAIT_SECONDS=0 SHOP_FAKE_COMMENT_ID=100

ago() { date -u -d "-$1 min" +%Y-%m-%dT%H:%M:%SZ; }
put() { local path=${1%%\?*}; printf '%s' "$2" >"$work/${path//\//_}.json"; }
hb() { # id issue-number updated-min-ago [role]
  printf '{"id":%s,"issue_url":"https://api.github.com/repos/o/r/issues/%s","body":"<!-- shop-agent:heartbeat role=%s branch=claude/issue-%s -->","updated_at":"%s"}' \
    "$1" "$2" "${4:-worker}" "$2" "$(ago "$3")"
}
recent() { put "repos/o/$1/issues/comments" "[$2]"; }
item() { put "repos/o/$1/issues/$2/comments" "[${3:-}]"; }
reset() { rm -f "$work"/*.json "$work/writes.log"; recent shop-api ""; recent shop-web ""; item shop-api 6; }

failures=0
expect() {
  if [[ $2 == "$3" ]]; then echo "ok   - $1"; else
    echo "FAIL - $1"
    echo "       expected: $2"
    echo "       actual:   $3"
    failures=$((failures + 1))
  fi
}
claim() { SHOP_FIXTURES=$work bash "$scripts/claim.sh" o/shop-api 6 claude/issue-6-x 2>/dev/null || echo "exit $?"; }
writes() { tr '\n' ';' <"$work/writes.log" 2>/dev/null || true; }

reset
recent shop-api "$(hb 100 6 0)"
expect "no other worker -> claimed with a new heartbeat" '{"claimed":true,"comment":100}' "$(claim)"
expect "  the heartbeat was posted" 'POST repos/o/shop-api/issues/6/comments;' "$(writes)"

reset
recent shop-web "$(hb 50 3 2)"
recent shop-api "$(hb 100 6 0)"
expect "an older fresh heartbeat in the other repo -> lost" \
  "$(printf '%s\n%s' '{"claimed":false,"reason":"another worker is active: o/shop-web#3 (heartbeat comment 50)"}' 'exit 3')" "$(claim)"
expect "  the new heartbeat is deleted again" 'POST repos/o/shop-api/issues/6/comments;DELETE repos/o/shop-api/issues/comments/100;' "$(writes)"

reset
recent shop-api "$(hb 100 6 0),$(hb 200 9 0)"
expect "a newer claim started at the same time -> claimed (the other one backs off)" '{"claimed":true,"comment":100}' "$(claim)"

reset
recent shop-api "$(hb 10 4 45),$(hb 100 6 0)"
expect "a stale heartbeat does not block" '{"claimed":true,"comment":100}' "$(claim)"

reset
recent shop-api "$(hb 20 4 1 reviewer),$(hb 100 6 0)"
expect "a reviewer heartbeat does not block" '{"claimed":true,"comment":100}' "$(claim)"

reset
item shop-api 6 "$(hb 40 6 45)"
recent shop-api "$(hb 40 6 0),$(hb 60 7 0)"
expect "resume refreshes its existing heartbeat and wins against a newer claim" '{"claimed":true,"comment":40}' "$(claim)"
expect "  the existing heartbeat was edited, nothing posted" 'PATCH repos/o/shop-api/issues/comments/40;' "$(writes)"

reset
item shop-api 6 "$(hb 80 6 45)"
recent shop-api "$(hb 50 4 3),$(hb 80 6 0)"
expect "resume loses against an older active worker" \
  "$(printf '%s\n%s' '{"claimed":false,"reason":"another worker is active: o/shop-api#4 (heartbeat comment 50)"}' 'exit 3')" "$(claim)"
expect "  a refreshed heartbeat is not deleted" 'PATCH repos/o/shop-api/issues/comments/80;' "$(writes)"

reset
rm "$work/repos_o_shop-web_issues_comments.json"
expect "unreadable GitHub data -> error" \
  "$(printf '%s\n%s' '{"action":"error","reason":"GitHub API request failed: recent comments of o/shop-web"}' 'exit 1')" "$(claim)"

echo
if ((failures)); then echo "$failures test(s) failed"; exit 1; fi
echo "all claim tests passed"
