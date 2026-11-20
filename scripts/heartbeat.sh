#!/usr/bin/env bash
# Creates or refreshes the heartbeat / progress comment of an agent on an issue or PR.
# The comment is edited in place, so its updatedAt is the heartbeat the pickers read.
#
#   scripts/heartbeat.sh <owner/repo> <issue-or-pr-number> <role> <branch> [body-file|-]
#
#   role      worker | reviewer
#   branch    the working branch ("-" for reviewers)
#   body      progress markdown (Done / Next); read from the file, or stdin with "-"
#
#   scripts/heartbeat.sh <owner/repo> <number> attempt     posts one attempt marker (worker start/resume)
set -euo pipefail

repo=${1:?repo}
number=${2:?issue or PR number}
role=${3:?role}

if [[ $role == attempt ]]; then
  gh api "repos/$repo/issues/$number/comments" -f body="<!-- shop-agent:attempt -->
Worker attempt started at $(date -u +%Y-%m-%dT%H:%M:%SZ)." --jq .html_url
  exit 0
fi

branch=${4:?branch}
source_file=${5:--}
progress=$(if [[ $source_file == - ]]; then [[ -t 0 ]] && echo "_Starting._" || cat; else cat "$source_file"; fi)
marker="<!-- shop-agent:heartbeat role=$role branch=$branch -->"
body="$marker
**${role^} progress** · branch \`$branch\` · updated $(date -u +%Y-%m-%dT%H:%M:%SZ)

$progress"

existing=$(gh api "repos/$repo/issues/$number/comments" --paginate \
  --jq "[.[] | select(.body | startswith(\"<!-- shop-agent:heartbeat role=$role \"))] | last | .id // empty")

if [[ -n $existing ]]; then
  gh api -X PATCH "repos/$repo/issues/comments/$existing" -f body="$body" --jq .html_url
else
  gh api "repos/$repo/issues/$number/comments" -f body="$body" --jq .html_url
fi
