#!/usr/bin/env bash
# Creates or refreshes the heartbeat / progress comment of an agent on an issue or PR.
# The comment is edited in place, so its updatedAt is the heartbeat the pickers read.
#
#   scripts/heartbeat.sh <owner/repo> <issue-or-pr-number> <role> <branch> [body-file|-] [done]
#
#   role      worker | reviewer
#   branch    the working branch ("-" for reviewers)
#   body      progress markdown (Done / Next); read from the file, or stdin with "-"
#   done      the run is ending: the heartbeat is marked done (DONE_MARKER) so the pickers and
#             claim.sh stop counting it as an active agent. A worker's other fresh heartbeats for
#             the same branch in the repository (the issue's, when this one is on the PR) are
#             marked done too. The next refresh without `done` makes the heartbeat active again.
#
#   scripts/heartbeat.sh <owner/repo> <number> attempt     posts one attempt marker (worker start/resume)
set -euo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=lib/gh-rest.sh
source "$here/lib/gh-rest.sh"

repo=${1:?repo}
number=${2:?issue or PR number}
role=${3:?role}

if [[ $role == attempt ]]; then
  gh_write POST "repos/$repo/issues/$number/comments" -f body="<!-- shop-agent:attempt -->
Worker attempt started at $(date -u +%Y-%m-%dT%H:%M:%SZ)." --jq .html_url
  exit 0
fi

branch=${4:?branch}
source_file=${5:--}
state=${6:-}
[[ -z $state || $state == done ]] || { echo "heartbeat: the sixth argument must be 'done'" >&2; exit 2; }
progress=$(if [[ $source_file == - ]]; then [[ -t 0 ]] && echo "_Starting._" || cat; else cat "$source_file"; fi)
marker="<!-- shop-agent:heartbeat role=$role branch=$branch -->"
status=updated
[[ $state == done ]] && status=finished
body="$marker${state:+
$DONE_MARKER}
**${role^} progress** · branch \`$branch\` · $status $(date -u +%Y-%m-%dT%H:%M:%SZ)

$progress"

existing=$(api "repos/$repo/issues/$number/comments?per_page=100" \
  "[.[] | select(.body | startswith(\"<!-- shop-agent:heartbeat role=$role \"))] | last | .id // empty")
existing=${existing%%$'\n'*}

if [[ -n $existing ]]; then
  mine=$existing
  gh_write PATCH "repos/$repo/issues/comments/$mine" -f "body=$body" --silent
else
  mine=$(gh_write POST "repos/$repo/issues/$number/comments" -f "body=$body" --jq .id)
fi
echo "heartbeat comment $mine${state:+ (done)}"

[[ $state == done && $branch != - ]] || exit 0

# Mark this run's other fresh heartbeats (same role and branch) done as well.
since=$(minutes_ago "$STALE_MINUTES")
others=$(api "repos/$repo/issues/comments?since=$since&per_page=100" \
  ".[] | select(.body | startswith(\"$marker\")) | select(.body | contains(\"$DONE_MARKER\") | not)
   | select(.id != $mine) | @json") || { echo "heartbeat: could not read recent comments" >&2; exit 1; }
while IFS= read -r row; do
  [[ -n $row ]] || continue
  id=$(jq -r .id <<<"$row")
  other_body=$(jq -r --arg done "$DONE_MARKER" '.body | sub("\n"; "\n" + $done + "\n")' <<<"$row")
  [[ $other_body == *"$DONE_MARKER"* ]] || other_body="$(jq -r .body <<<"$row")
$DONE_MARKER"
  gh_write PATCH "repos/$repo/issues/comments/$id" -f "body=$other_body" --silent
  echo "heartbeat comment $id (done)"
done <<<"$others"
