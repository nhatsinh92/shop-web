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
#
# Runs on the same issue or PR can share one heartbeat comment (each refreshes the existing one), so
# comparing comment ids cannot tell them apart. Two more rules cover that case:
#   - an existing heartbeat that is fresh and not marked done means a worker is active on this
#     item: the run ends at once without writing anything;
#   - every run writes a unique claim marker into the heartbeat; after the wait, a run whose marker
#     was overwritten by another run lost (the last writer wins) and leaves the comment alone.
# CLAIM_RUN_ID overrides the generated run id (tests).
set -euo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=lib/gh-rest.sh
source "$here/lib/gh-rest.sh"
load_repos

repo=${1:?repo}
number=${2:?issue or PR number}
branch=${3:?branch}
wait_seconds=${CLAIM_WAIT_SECONDS:-15}
run_id=${CLAIM_RUN_ID:-$(date -u +%s%N)-$$-$RANDOM}

body="<!-- shop-agent:heartbeat role=worker branch=$branch -->
<!-- shop-agent:claim run=$run_id -->
**Worker progress** · branch \`$branch\` · updated $(date -u +%Y-%m-%dT%H:%M:%SZ)

Claiming this task (waiting ${wait_seconds}s for other worker runs that started at the same time)."

existing_jq='[.[] | select(.body | startswith("<!-- shop-agent:heartbeat role=worker "))] | last
  | if . == null then empty else
      [.id, (.body | contains("'"$DONE_MARKER"'")), ((now - (.updated_at | fromdateiso8601)) / 60 | floor)]
      | map(tostring) | join("\u001f") end'
existing_row=$(api "repos/$repo/issues/$number/comments?per_page=100" "$existing_jq") ||
  die_api "comments of $repo#$number"
IFS=$US read -r existing existing_done existing_age <<<"${existing_row##*$'\n'}"

if [[ -n $existing && $existing_done == false ]] && ((existing_age < STALE_MINUTES)); then
  printf '{"claimed":false,"reason":"another worker is active: %s#%s (heartbeat comment %s)"}\n' \
    "$repo" "$number" "$existing"
  exit 3
fi

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

# Another run on the same item may have refreshed the same comment after this run did.
owner_run=$(api "repos/$repo/issues/comments?since=$since&per_page=100" \
  "[.[] | select(.id == $mine) | .body | capture(\"<!-- shop-agent:claim run=(?<run>[^ ]+) -->\").run] | first // empty") ||
  die_api "recent comments of $repo"
if [[ -n $owner_run && $owner_run != "$run_id" ]]; then
  printf '{"claimed":false,"reason":"another worker run claimed %s#%s at the same time (heartbeat comment %s)"}\n' \
    "$repo" "$number" "$mine"
  exit 3
fi

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
