#!/usr/bin/env bash
# Tests for scripts/next-task.sh and scripts/next-review.sh against fixture data (no GitHub calls).
# Needs bash, jq and GNU date. Run: bash scripts/tests/picker.test.sh
set -euo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
scripts=$(cd "$here/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
export SHOP_REPOS="o/shop-api o/shop-web"

ago() { date -u -d "-$1 min" +%Y-%m-%dT%H:%M:%SZ; }
labels() { local out="" l; for l in "$@"; do out+="${out:+,}{\"name\":\"$l\"}"; done; echo "{\"nodes\":[$out]}"; }
comments() { echo "{\"nodes\":[${1:-}]}"; }
comment() { printf '{"body":"%s","updatedAt":"%s"}' "$1" "$2"; }
heartbeat() { comment "<!-- shop-agent:heartbeat role=${3:-worker} branch=$1 -->" "$(ago "$2")"; }
attempt() { comment "<!-- shop-agent:attempt -->" "$(ago 90)"; }
issue() { # number created-min-ago body labels-json comments-json
  printf '{"number":%s,"createdAt":"%s","body":"%s","labels":%s,"comments":%s}' "$1" "$(ago "$2")" "$3" "$4" "$5"
}
checks() { # name:STATE ... (SUCCESS, FAILURE, IN_PROGRESS)
  local out="" pair name state
  for pair in "$@"; do
    name=${pair%%:*} state=${pair#*:}
    if [[ $state == IN_PROGRESS ]]; then out+="${out:+,}{\"__typename\":\"CheckRun\",\"name\":\"$name\",\"status\":\"IN_PROGRESS\",\"conclusion\":null}"
    else out+="${out:+,}{\"__typename\":\"CheckRun\",\"name\":\"$name\",\"status\":\"COMPLETED\",\"conclusion\":\"$state\"}"; fi
  done
  echo "{\"nodes\":[{\"commit\":{\"statusCheckRollup\":{\"contexts\":{\"nodes\":[$out]}}}}]}"
}
pr() { # number created-min-ago draft labels-json comments-json checks-json [body]
  printf '{"number":%s,"createdAt":"%s","isDraft":%s,"headRefName":"issue-%s","body":"%s","labels":%s,"comments":%s,"commits":%s}' \
    "$1" "$(ago "$2")" "$3" "$1" "${7:-}" "$4" "$5" "$6"
}
repo_json() { # file issues-json-array prs-json-array
  printf '{"data":{"repository":{"issues":{"nodes":[%s]},"pullRequests":{"nodes":[%s]}}}}' "$2" "$3" >"$work/$1.json"
}
rest_issue() { # repo-name number state labels...
  local name=$1 number=$2 state=$3
  shift 3
  local ls="" l
  for l in "$@"; do ls+="${ls:+,}{\"name\":\"$l\"}"; done
  printf '{"number":%s,"state":"%s","labels":[%s]}' "$number" "$state" "$ls" >"$work/$name-issue-$number.json"
}

failures=0
expect() { # name expected-json actual-json
  if [[ $2 == "$3" ]]; then echo "ok   - $1"; else echo "FAIL - $1"; echo "       expected: $2"; echo "       actual:   $3"; failures=$((failures + 1)); fi
}
task() { SHOP_FIXTURES=$work bash "$scripts/next-task.sh" | sed 's/,"reason":"[^"]*"//'; }
review() { SHOP_FIXTURES=$work bash "$scripts/next-review.sh" | sed 's/,"reason":"[^"]*"//'; }
reset() { rm -f "$work"/*.json; repo_json shop-api "" ""; repo_json shop-web "" ""; }

# --- next-task.sh -----------------------------------------------------------------------------
reset
expect "nothing open -> none" '{"action":"none"}' "$(task)"

reset
repo_json shop-api "$(issue 7 300 "" "$(labels in-progress)" "$(comments "$(heartbeat issue-7-x 5)")"),$(issue 8 200 "" "$(labels ready)" "$(comments)")" ""
expect "fresh worker heartbeat -> none" '{"action":"none"}' "$(task)"

reset
repo_json shop-web "" "$(pr 3 100 false "$(labels review)" "$(comments "$(heartbeat issue-3 10)")" "$(checks build:SUCCESS)")"
expect "fresh heartbeat on a PR in the other repo -> none" '{"action":"none"}' "$(task)"

reset
repo_json shop-api "$(issue 7 300 "" "$(labels in-progress)" "$(comments "$(attempt),$(heartbeat issue-7-cart-qty 45)")")" ""
expect "stale in-progress issue -> resume on its branch" \
  '{"action":"resume","repo":"o/shop-api","issue":7,"branch":"issue-7-cart-qty"}' "$(task)"

reset
repo_json shop-api "$(issue 7 300 "" "$(labels in-progress)" "$(comments "$(attempt),$(attempt),$(attempt),$(heartbeat issue-7 45)")")" ""
expect "stale in-progress issue with 3 attempts -> triage" '{"action":"triage","repo":"o/shop-api","issue":7}' "$(task)"

reset
repo_json shop-api "$(issue 7 300 "" "$(labels in-progress blocked)" "$(comments "$(heartbeat issue-7 45)")")" ""
expect "blocked issue is ignored" '{"action":"none"}' "$(task)"

reset
repo_json shop-web "" "$(pr 4 100 false "$(labels review changes-requested)" "$(comments)" "$(checks build:SUCCESS)")"
expect "PR with requested changes -> fix" '{"action":"fix","repo":"o/shop-web","pr":4,"branch":"issue-4"}' "$(task)"

reset
repo_json shop-api "" "$(pr 5 100 false "$(labels review)" "$(comments)" "$(checks build:FAILURE merge-gate:FAILURE)")"
expect "PR with a failing check -> fix" '{"action":"fix","repo":"o/shop-api","pr":5,"branch":"issue-5"}' "$(task)"

reset
repo_json shop-api "" "$(pr 5 100 false "$(labels review)" "$(comments)" "$(checks build:SUCCESS merge-gate:FAILURE)")"
expect "only merge-gate failing is not a fix" '{"action":"none"}' "$(task)"

reset
repo_json shop-api "" "$(pr 6 100 true "$(labels)" "$(comments)" "$(checks build:FAILURE)")"
expect "draft PRs are ignored" '{"action":"none"}' "$(task)"

reset
repo_json shop-api "$(issue 10 300 'Depends on: #9 (contract)\nEpic: #2' "$(labels ready)" "$(comments)"),$(issue 11 200 'Depends on: shop-web#1\nEpic: #2' "$(labels ready)" "$(comments)")" ""
rest_issue shop-api 9 open
rest_issue shop-web 1 closed
rest_issue shop-api 2 open epic approved
expect "oldest ready issue with an open dependency is skipped" '{"action":"start","repo":"o/shop-api","issue":11}' "$(task)"

reset
repo_json shop-web "$(issue 20 500 'Depends on: none\nEpic: #19' "$(labels ready)" "$(comments)")" ""
repo_json shop-api "$(issue 30 100 'Depends on: none' "$(labels ready)" "$(comments)")" ""
rest_issue shop-web 19 open epic
expect "ready issue whose epic is not approved is skipped" '{"action":"start","repo":"o/shop-api","issue":30}' "$(task)"

reset
repo_json shop-web "$(issue 20 500 'Depends on: none\nEpic: #19' "$(labels ready)" "$(comments)")" ""
repo_json shop-api "$(issue 30 100 'Depends on: none' "$(labels ready)" "$(comments)")" ""
rest_issue shop-web 19 open epic approved
expect "oldest ready issue across repos wins" '{"action":"start","repo":"o/shop-web","issue":20}' "$(task)"

reset
repo_json shop-api "$(issue 40 100 '' "$(labels ready)" "$(comments "$(attempt),$(attempt),$(attempt)")")" ""
expect "ready issue with 3 failed attempts -> triage" '{"action":"triage","repo":"o/shop-api","issue":40}' "$(task)"

reset
repo_json shop-api "$(issue 7 300 "" "$(labels in-progress)" "$(comments "$(heartbeat issue-7 45)")")" \
  "$(pr 5 100 false "$(labels changes-requested)" "$(comments)" "$(checks build:SUCCESS)")"
expect "resume comes before fix" '{"action":"resume","repo":"o/shop-api","issue":7,"branch":"issue-7"}' "$(task)"

# --- next-review.sh ---------------------------------------------------------------------------
reset
expect "review: nothing open -> none" '{"action":"none"}' "$(review)"

reset
repo_json shop-api "" "$(pr 5 300 false "$(labels review)" "$(comments)" "$(checks build:SUCCESS gitleaks:SUCCESS merge-gate:FAILURE)" 'Closes #12'),$(pr 6 100 false "$(labels review)" "$(comments)" "$(checks build:SUCCESS)")"
expect "review: oldest green PR, merge-gate ignored" '{"action":"review","repo":"o/shop-api","pr":5,"issue":12}' "$(review)"

reset
repo_json shop-api "" "$(pr 5 300 false "$(labels review)" "$(comments)" "$(checks build:IN_PROGRESS)"),$(pr 6 100 false "$(labels review agent-approved)" "$(comments)" "$(checks build:SUCCESS)")"
expect "review: pending checks and approved PRs are skipped" '{"action":"none"}' "$(review)"

reset
repo_json shop-web "" "$(pr 8 300 false "$(labels review)" "$(comments "$(heartbeat x 3 reviewer)")" "$(checks build:SUCCESS)")"
expect "review: PR with a fresh reviewer heartbeat is skipped" '{"action":"none"}' "$(review)"

echo
if ((failures)); then echo "$failures test(s) failed"; exit 1; fi
echo "all picker tests passed"
