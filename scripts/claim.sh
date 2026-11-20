#!/usr/bin/env bash
# Claims the work the picker chose, so that only one worker proceeds when several worker runs start
# at the same moment (an hourly run and a GitHub-event run, or event runs from both repositories).
#
#   scripts/claim.sh <owner/repo> <issue-or-pr number> <branch>
#
# It posts (or refreshes) this run's worker heartbeat on the issue or PR, waits CLAIM_WAIT_SECONDS
# (default 15) for runs that started at the same time to post theirs, then reads every fresh worker
# heartbeat in SHOP_REPOS. Comment ids only grow, so the oldest heartbeat wins:
#
#   {"claimed":true,"comment":ID}                   exit 0: go ahead
#   {"claimed":false,"reason":"..."}                exit 3: another worker was first; end the run
#   {"action":"error","reason":"..."}               exit 1: GitHub could not be read or written
#
# A run that loses deletes the heartbeat comment it created (a refreshed one is left as it was).
set -euo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=lib/gh-rest.sh
source "$here/lib/gh-rest.sh"
load_repos

repo=${1:?repo}
number=${2:?issue or PR number}
branch=${3:?branch}
wait_seconds=${CLAIM_WAIT_SECONDS:-15}

body="<!-- shop-agent:heartbeat role=worker branch=$branch -->
**Worker progress** · branch \`$branch\` · updated $(date -u +%Y-%m-%dT%H:%M:%SZ)

Claiming this task (waiting ${wait_seconds}s for other worker runs that started at the same time)."

existing=$(api "repos/$repo/issues/$number/comments?per_page=100" \
  '[.[] | select(.body | startswith("<!-- shop-agent:heartbeat role=worker "))] | last | .id // empty') ||
  die_api "comments of $repo#$number"
existing=${existing%%$'\n'*}

if [[ -n $existing ]]; then
  mine=$existing
  created=false
  gh_write PATCH "repos/$repo/issues/comments/$mine" -f "body=$body" --silent || die_api "update heartbeat on $repo#$number"
else
  mine=$(gh_write POST "repos/$repo/issues/$number/comments" -f "body=$body" --jq .id) ||
    die_api "post heartbeat on $repo#$number"
  created=true
fi
[[ $mine =~ ^[0-9]+$ ]] || die_api "unexpected comment id '$mine'"

sleep "$wait_seconds"

since=$(minutes_ago "$STALE_MINUTES")
older=""
for r in "${REPOS[@]}"; do
  out=$(api "repos/$r/issues/comments?since=$since&per_page=100" "$(fresh_heartbeat_ids_jq worker)") ||
    die_api "recent comments of $r"
  while IFS=$US read -r id issue; do
    [[ -n $id && $id != "$mine" ]] || continue
    if ((id < mine)); then
      older="$r#$issue (heartbeat comment $id)"
      break 2
    fi
  done <<<"$out"
done

if [[ -n $older ]]; then
  if [[ $created == true ]]; then
    gh_write DELETE "repos/$repo/issues/comments/$mine" --silent || echo "claim: could not delete comment $mine" >&2
  fi
  printf '{"claimed":false,"reason":"another worker is active: %s"}\n' "$older"
  exit 3
fi

printf '{"claimed":true,"comment":%s}\n' "$mine"
