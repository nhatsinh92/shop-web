#!/usr/bin/env bash
# Tests for next-task.sh, next-review.sh and next-plan.sh against REST fixtures (no GitHub calls).
# Needs bash, jq and GNU date. Run: bash scripts/tests/picker.test.sh
set -euo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
scripts=$(cd "$here/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
export SHOP_REPOS="o/shop-api o/shop-web"

# --- fixture builders (REST response shapes) --------------------------------------------------
ago() { date -u -d "-$1 min" +%Y-%m-%dT%H:%M:%SZ; }
put() { local path=${1%%\?*}; printf '%s' "$2" >"$work/${path//\//_}.json"; }
labels() { local out="" l; for l in "$@"; do out+="${out:+,}{\"name\":\"$l\"}"; done; echo "[$out]"; }
issue() { # number created-min-ago body labels-json [state]
  printf '{"number":%s,"state":"%s","created_at":"%s","body":"%s","labels":%s}' "$1" "${5:-open}" "$(ago "$2")" "$3" "$4"
}
pr() { # number created-min-ago draft labels-json [branch] [body]
  printf '{"number":%s,"created_at":"%s","draft":%s,"labels":%s,"head":{"ref":"%s","sha":"sha%s"},"body":"%s"}' \
    "$1" "$(ago "$2")" "$3" "$4" "${5:-claude/issue-$1}" "$1" "${6:-}"
}
comment() { # issue-number body updated-min-ago
  printf '{"issue_url":"https://api.github.com/repos/o/r/issues/%s","body":"%s","updated_at":"%s"}' "$1" "$2" "$(ago "$3")"
}
heartbeat() { comment "$1" "<!-- shop-agent:heartbeat role=${4:-worker} branch=$2 -->" "$3"; }
attempt() { comment "$1" "<!-- shop-agent:attempt -->" 90; }
checks() { # repo-name pr-number name:conclusion ... (success, failure, cancelled, in_progress); later = newer
  local name=$1 number=$2 out="" pair check state i
  shift 2
  i=$#
  for pair in "$@"; do
    check=${pair%%:*} state=${pair#*:}
    i=$((i - 1))
    if [[ $state == in_progress ]]; then
      out+="${out:+,}{\"name\":\"$check\",\"status\":\"in_progress\",\"conclusion\":null,\"started_at\":\"$(ago "$i")\"}"
    else
      out+="${out:+,}{\"name\":\"$check\",\"status\":\"completed\",\"conclusion\":\"$state\",\"started_at\":\"$(ago "$i")\"}"
    fi
  done
  put "repos/o/$name/commits/sha$number/check-runs" "{\"total_count\":0,\"check_runs\":[$out]}"
}
issues() { put "repos/o/$1/issues" "[$2]"; }
pulls() { put "repos/o/$1/pulls" "[$2]"; }
recent() { put "repos/o/$1/issues/comments" "[$2]"; }
item_comments() { put "repos/o/$1/issues/$2/comments" "[${3:-}]"; }
rest_issue() { # repo-name number state labels...
  local name=$1 number=$2 state=$3
  shift 3
  put "repos/o/$name/issues/$number" "{\"number\":$number,\"state\":\"$state\",\"labels\":$(labels "$@")}"
}
reset() {
  rm -f "$work"/*.json
  local name
  for name in shop-api shop-web; do issues "$name" ""; pulls "$name" ""; recent "$name" ""; done
}

failures=0
expect() { # name expected actual
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
plan() { SHOP_FIXTURES=$work bash "$scripts/next-plan.sh" 2>/dev/null | strip_reason; }

# --- next-task.sh -----------------------------------------------------------------------------
reset
expect "nothing open -> none" '{"action":"none"}' "$(task)"

reset
rm "$work/repos_o_shop-web_pulls.json"
expect "unreadable GitHub data -> error, not none" '{"action":"error"}' "$(task)"
set +e
SHOP_FIXTURES=$work bash "$scripts/next-task.sh" >/dev/null 2>&1
code=$?
set -e
expect "error exits non-zero" 1 "$code"

reset
issues shop-api "$(issue 7 300 "" "$(labels in-progress)"),$(issue 8 200 "" "$(labels ready)")"
recent shop-api "$(heartbeat 7 claude/issue-7-x 5)"
expect "fresh worker heartbeat -> none" '{"action":"none"}' "$(task)"

reset
recent shop-web "$(heartbeat 3 claude/issue-3 10)"
issues shop-api "$(issue 8 200 "" "$(labels ready)")"
item_comments shop-api 8
expect "fresh heartbeat in the other repo -> none" '{"action":"none"}' "$(task)"

reset
recent shop-api "$(heartbeat 7 claude/issue-7 3 reviewer)"
issues shop-api "$(issue 8 200 "" "$(labels ready)")"
item_comments shop-api 8
expect "a reviewer heartbeat does not block the worker" '{"action":"start","repo":"o/shop-api","issue":8}' "$(task)"

reset
issues shop-api "$(issue 7 300 "" "$(labels in-progress)")"
item_comments shop-api 7 "$(attempt 7),$(heartbeat 7 claude/issue-7-cart-qty 45)"
expect "stale in-progress issue -> resume on its branch" \
  '{"action":"resume","repo":"o/shop-api","issue":7,"branch":"claude/issue-7-cart-qty"}' "$(task)"

reset
issues shop-api "$(issue 7 300 "" "$(labels in-progress)")"
item_comments shop-api 7
expect "in-progress issue without heartbeat -> resume on the default branch" \
  '{"action":"resume","repo":"o/shop-api","issue":7,"branch":"claude/issue-7"}' "$(task)"

reset
issues shop-api "$(issue 7 300 "" "$(labels in-progress)")"
item_comments shop-api 7 "$(attempt 7),$(attempt 7),$(attempt 7),$(heartbeat 7 claude/issue-7 45)"
expect "stale in-progress issue with 3 attempts -> triage" '{"action":"triage","repo":"o/shop-api","issue":7}' "$(task)"

reset
issues shop-api "$(issue 7 300 "" "$(labels in-progress blocked)")"
expect "blocked issue is ignored" '{"action":"none"}' "$(task)"

reset
pulls shop-web "$(pr 4 100 false "$(labels review changes-requested)")"
expect "PR with requested changes -> fix" '{"action":"fix","repo":"o/shop-web","pr":4,"branch":"claude/issue-4"}' "$(task)"

reset
pulls shop-api "$(pr 5 100 false "$(labels review)")"
checks shop-api 5 build:failure merge-gate:failure
expect "PR with a failing check -> fix" '{"action":"fix","repo":"o/shop-api","pr":5,"branch":"claude/issue-5"}' "$(task)"

reset
pulls shop-api "$(pr 5 100 false "$(labels review)")"
checks shop-api 5 build:success merge-gate:failure
expect "only merge-gate failing is not a fix" '{"action":"none"}' "$(task)"

reset
pulls shop-api "$(pr 5 100 false "$(labels review)")"
checks shop-api 5 build:cancelled merge-gate:cancelled build:success merge-gate:failure
expect "a cancelled run superseded by a green re-run is not a fix" '{"action":"none"}' "$(task)"

reset
pulls shop-api "$(pr 5 100 false "$(labels review)")"
checks shop-api 5 build:success build:failure
expect "the latest run of a check decides" '{"action":"fix","repo":"o/shop-api","pr":5,"branch":"claude/issue-5"}' "$(task)"

reset
pulls shop-api "$(pr 6 100 true "$(labels changes-requested)")"
expect "draft PRs are ignored" '{"action":"none"}' "$(task)"

reset
pulls shop-api "$(pr 3 100 false "$(labels changes-requested)" claude/plans-phase-2)"
expect "planning and bootstrap PRs are not fixed by workers" '{"action":"none"}' "$(task)"

reset
issues shop-api "$(issue 10 300 'Depends on: #9 (contract)\nEpic: #2' "$(labels ready)"),$(issue 11 200 'Depends on: shop-web#1\nEpic: #2' "$(labels ready)")"
item_comments shop-api 10
item_comments shop-api 11
rest_issue shop-api 9 open
rest_issue shop-web 1 closed
rest_issue shop-api 2 open epic approved
expect "oldest ready issue with an open dependency is skipped" '{"action":"start","repo":"o/shop-api","issue":11}' "$(task)"

reset
issues shop-web "$(issue 20 500 'Depends on: none\nEpic: #19' "$(labels ready)")"
issues shop-api "$(issue 30 100 'Depends on: none' "$(labels ready)")"
item_comments shop-web 20
item_comments shop-api 30
rest_issue shop-web 19 open epic
expect "ready issue whose epic is not approved is skipped" '{"action":"start","repo":"o/shop-api","issue":30}' "$(task)"

reset
issues shop-web "$(issue 20 500 'Depends on: none\nEpic: #19' "$(labels ready)")"
issues shop-api "$(issue 30 100 'Depends on: none' "$(labels ready)")"
item_comments shop-web 20
item_comments shop-api 30
rest_issue shop-web 19 open epic approved
expect "oldest ready issue across repos wins" '{"action":"start","repo":"o/shop-web","issue":20}' "$(task)"

reset
issues shop-api "$(issue 40 100 '' "$(labels ready)")"
item_comments shop-api 40 "$(attempt 40),$(attempt 40),$(attempt 40)"
expect "ready issue with 3 failed attempts -> triage" '{"action":"triage","repo":"o/shop-api","issue":40}' "$(task)"

reset
issues shop-api "$(issue 7 300 "" "$(labels in-progress)")"
item_comments shop-api 7 "$(heartbeat 7 claude/issue-7 45)"
pulls shop-api "$(pr 5 100 false "$(labels changes-requested)")"
expect "resume comes before fix" '{"action":"resume","repo":"o/shop-api","issue":7,"branch":"claude/issue-7"}' "$(task)"

# --- next-review.sh ---------------------------------------------------------------------------
reset
expect "review: nothing open -> none" '{"action":"none"}' "$(review)"

reset
pulls shop-api "$(pr 5 300 false "$(labels review)" claude/issue-12 'Closes #12'),$(pr 6 100 false "$(labels review)")"
checks shop-api 5 build:success gitleaks:success merge-gate:failure
checks shop-api 6 build:success
expect "review: oldest green PR, merge-gate ignored" '{"action":"review","repo":"o/shop-api","pr":5,"issue":12}' "$(review)"

reset
pulls shop-api "$(pr 5 300 false "$(labels review)"),$(pr 6 100 false "$(labels review agent-approved)")"
checks shop-api 5 build:in_progress
expect "review: pending checks and approved PRs are skipped" '{"action":"none"}' "$(review)"

reset
pulls shop-api "$(pr 5 300 false "$(labels review)")"
checks shop-api 5 build:cancelled build:success
expect "review: a cancelled run superseded by a green re-run counts as green" '{"action":"review","repo":"o/shop-api","pr":5}' "$(review)"

reset
pulls shop-web "$(pr 8 300 false "$(labels review)")"
recent shop-web "$(heartbeat 8 - 3 reviewer)"
checks shop-web 8 build:success
expect "review: PR with a fresh reviewer heartbeat is skipped" '{"action":"none"}' "$(review)"

reset
rm "$work/repos_o_shop-api_issues_comments.json"
expect "review: unreadable GitHub data -> error" '{"action":"error"}' "$(review)"

# --- next-plan.sh -----------------------------------------------------------------------------
reset
issues shop-api "$(issue 2 500 '' "$(labels epic phase:1)")"
expect "plan: unapproved epic -> none" '{"action":"none"}' "$(plan)"

reset
issues shop-api "$(issue 2 500 '' "$(labels epic phase:1 approved)")"
expect "plan: approved epic without tasks -> plan-tasks" '{"action":"plan-tasks","repo":"o/shop-api","epic":2}' "$(plan)"

reset
issues shop-api "$(issue 2 500 '' "$(labels epic phase:1 approved)"),$(issue 5 100 'Epic: #2' "$(labels ready phase:1)")"
expect "plan: approved epic with tasks, phase open -> none" '{"action":"none"}' "$(plan)"

reset
issues shop-api "$(issue 2 500 '' "$(labels epic phase:1 approved)" closed),$(issue 5 100 'Epic: #2' "$(labels phase:1)" closed)"
expect "plan: phase 1 finished -> draft phase 2" '{"action":"draft-epics","phase":2}' "$(plan)"

reset
issues shop-api "$(issue 2 500 '' "$(labels epic phase:1 approved)" closed)"
pulls shop-web "$(pr 9 100 false "$(labels phase:2)" claude/plans-phase-2)"
expect "plan: planning PR open -> none" '{"action":"none"}' "$(plan)"

echo
if ((failures)); then echo "$failures test(s) failed"; exit 1; fi
echo "all picker tests passed"
