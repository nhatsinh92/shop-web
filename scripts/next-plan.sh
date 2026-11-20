#!/usr/bin/env bash
# Picks the next job for a planner session. Deterministic: bash + gh REST, no model calls.
# Prints exactly one JSON object and exits within seconds:
#
#   {"action":"plan-tasks","repo":"o/r","epic":N}   an approved epic issue with no task issues yet
#   {"action":"draft-epics","phase":N}              every issue of the latest planned phase is closed
#                                                   and no planning PR is open: draft phase N
#   {"action":"none","reason":"..."}
#   {"action":"error","reason":"..."}  (exit 1)     GitHub could not be read
#
# Epic issues carry the `epic` label; task issues reference them with "Epic: #N" in the body.
# Planning PRs come from branches claude/plans-* (or plans/*).
set -euo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=lib/gh-rest.sh
source "$here/lib/gh-rest.sh"
load_repos
MAX_PHASE=6

# <number><US><state><US><labels><US><epic ref>
ISSUES_JQ="$JQ_REFS"'
.[] | select(.pull_request | not)
  | [.number, .state, ([.labels[].name] | join(",")), refs("Epic")] | map(tostring) | join("\u001f")'
PLANNING_PRS_JQ='[.[] | select(.head.ref | test("^(claude/plans-|plans/)"))] | length'

declare -A all_issues
for repo in "${REPOS[@]}"; do
  all_issues[$repo]=$(api "repos/$repo/issues?state=all&per_page=100" "$ISSUES_JQ") || die_api "issues of $repo"
done

# 1. Approved open epics without task issues.
for repo in "${REPOS[@]}"; do
  while IFS=$US read -r number state labels _; do
    [[ -n $number && $state == open ]] && has "$labels" epic && has "$labels" approved || continue
    tasks=0
    while IFS=$US read -r _ _ _ epic; do [[ ${epic%%,*} == "#$number" ]] && tasks=$((tasks + 1)); done <<<"${all_issues[$repo]}"
    if ((tasks == 0)); then json action plan-tasks repo "$repo" epic "$number"; exit 0; fi
  done <<<"${all_issues[$repo]}"
done

# 2. Epics waiting for the owner, or a planning PR in review: nothing to do.
for repo in "${REPOS[@]}"; do
  while IFS=$US read -r number state labels _; do
    [[ -n $number && $state == open ]] && has "$labels" epic && ! has "$labels" approved || continue
    json action none reason "epic $repo#$number is waiting for the owner's approval"
    exit 0
  done <<<"${all_issues[$repo]}"
  planning=$(api "repos/$repo/pulls?state=open&per_page=100" "$PLANNING_PRS_JQ") || die_api "pull requests of $repo"
  if [[ ${planning:-0} != 0 ]]; then json action none reason "a planning PR is open in $repo"; exit 0; fi
done

# 3. The latest phase that has issues is finished: draft the next one.
latest=0
open=0
for repo in "${REPOS[@]}"; do
  while IFS=$US read -r number state labels _; do
    [[ -n $number ]] || continue
    for n in $(seq 1 "$MAX_PHASE"); do has "$labels" "phase:$n" && ((n > latest)) && latest=$n; done
  done <<<"${all_issues[$repo]}"
done
if ((latest > 0)); then
  for repo in "${REPOS[@]}"; do
    while IFS=$US read -r number state labels _; do
      [[ -n $number && $state == open ]] && has "$labels" "phase:$latest" && open=$((open + 1))
    done <<<"${all_issues[$repo]}"
  done
fi
if ((open == 0 && latest < MAX_PHASE)); then json action draft-epics phase $((latest + 1)); exit 0; fi

json action none reason "no approved epic without tasks; phase $latest still has $open open issues"
