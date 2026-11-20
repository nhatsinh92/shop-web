#!/usr/bin/env bash
# GitHub operations for agent sessions, over the REST API only (GraphQL - and with it `gh pr` and
# `gh issue` - is blocked in Claude Code cloud sessions). Role prompts use these subcommands.
#
#   gh-task.sh issue-view    <repo> <n>                  title, labels, body and comments
#   gh-task.sh issue-create  <repo> <title> <body-file|-> [label ...]   prints the issue number
#   gh-task.sh comment       <repo> <n> <body-file|->    comment on an issue or PR
#   gh-task.sh labels        <repo> <n> add|remove <label ...>
#   gh-task.sh pr-create     <repo> <branch> <title> <body-file|-> [label ...]   prints the PR number
#   gh-task.sh pr-view       <repo> <pr>                 title, branch, labels, body, comments, reviews
#   gh-task.sh pr-diff       <repo> <pr>
#   gh-task.sh pr-review     <repo> <pr> <body-file|->   review comment (authors cannot approve)
#   gh-task.sh checks        <repo> <pr>                 latest run per check, and the overall state
#   gh-task.sh checks-wait   <repo> <pr> [minutes=30]    waits until no check (except merge-gate) is
#                                                        pending; exit 0 green, 1 failing, 2 timeout
#   gh-task.sh failed-logs   <repo> <pr> [lines=150]     log tails of failing checks
#   gh-task.sh auto-merge    <repo> <pr>                 enable squash auto-merge
#   gh-task.sh ready         <repo> <pr>                 mark a draft PR ready for review
#
# <repo> is owner/name. Bodies are read from a file, or from stdin with "-".
set -euo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=lib/gh-rest.sh
source "$here/lib/gh-rest.sh"

usage() { sed -n '2,22p' "${BASH_SOURCE[0]}" >&2; exit 2; }
body_of() { if [[ $1 == - ]]; then cat; else cat "$1"; fi; }

# Latest run per check name for a PR head: "<name><TAB><status><TAB><conclusion><TAB><id>"
LATEST_RUNS_JQ='[.check_runs[]] | group_by(.name) | map(max_by(.started_at // ""))
  | .[] | [.name, .status, (.conclusion // "-"), .id] | @tsv'

head_sha() { gh api "repos/$1/pulls/$2" --jq .head.sha; }

cmd=${1:-}
[[ -n $cmd ]] || usage
shift

case $cmd in
issue-view)
  repo=$1 n=$2
  gh api "repos/$repo/issues/$n" --jq '"# \(.title)\nstate: \(.state)  labels: \([.labels[].name] | join(", "))\n\n\(.body // "")"'
  echo -e "\n## Comments"
  gh api --paginate "repos/$repo/issues/$n/comments" --jq '.[] | "\n--- \(.user.login) at \(.updated_at)\n\(.body)"'
  ;;
issue-create)
  repo=$1 title=$2 body=$(body_of "$3")
  shift 3
  args=(-f "title=$title" -f "body=$body")
  for label in "$@"; do args+=(-f "labels[]=$label"); done
  gh api "repos/$repo/issues" "${args[@]}" --jq '"\(.number) \(.html_url)"'
  ;;
comment)
  repo=$1 n=$2 body=$(body_of "$3")
  gh api "repos/$repo/issues/$n/comments" -f "body=$body" --jq .html_url
  ;;
labels)
  repo=$1 n=$2 op=$3
  shift 3
  for label in "$@"; do
    case $op in
    add) gh api "repos/$repo/issues/$n/labels" -f "labels[]=$label" --silent ;;
    remove) gh api -X DELETE "repos/$repo/issues/$n/labels/${label//:/%3A}" --silent 2>/dev/null || true ;;
    *) usage ;;
    esac
    echo "$op $label"
  done
  ;;
pr-create)
  repo=$1 branch=$2 title=$3 body=$(body_of "$4")
  shift 4
  number=$(gh api "repos/$repo/pulls" -f "title=$title" -f "head=$branch" -f base=main -f "body=$body" --jq .number)
  for label in "$@"; do gh api "repos/$repo/issues/$number/labels" -f "labels[]=$label" --silent; done
  echo "$number https://github.com/$repo/pull/$number"
  ;;
pr-view)
  repo=$1 pr=$2
  gh api "repos/$repo/pulls/$pr" --jq '"# \(.title)\nbranch: \(.head.ref) -> \(.base.ref)  draft: \(.draft)  state: \(.state)\nlabels: \([.labels[].name] | join(", "))\n\n\(.body // "")"'
  echo -e "\n## Conversation"
  gh api --paginate "repos/$repo/issues/$pr/comments" --jq '.[] | "\n--- \(.user.login) at \(.updated_at)\n\(.body)"'
  echo -e "\n## Reviews"
  gh api --paginate "repos/$repo/pulls/$pr/reviews" --jq '.[] | select(.body != "") | "\n--- \(.user.login) \(.state)\n\(.body)"'
  echo -e "\n## Inline review comments"
  gh api --paginate "repos/$repo/pulls/$pr/comments" --jq '.[] | "\n--- \(.path):\(.line // .original_line) \(.user.login)\n\(.body)"'
  ;;
pr-diff)
  gh api -H "Accept: application/vnd.github.diff" "repos/$1/pulls/$2"
  ;;
pr-review)
  repo=$1 pr=$2 body=$(body_of "$3")
  gh api "repos/$repo/pulls/$pr/reviews" -f event=COMMENT -f "body=$body" --jq .html_url
  ;;
checks)
  repo=$1 pr=$2
  sha=$(head_sha "$repo" "$pr")
  api "repos/$repo/commits/$sha/check-runs?per_page=100" "$LATEST_RUNS_JQ"
  echo "overall (merge-gate excluded): $(check_state "$repo" "$sha")"
  ;;
checks-wait)
  repo=$1 pr=$2 minutes=${3:-30}
  deadline=$((SECONDS + minutes * 60))
  while :; do
    sha=$(head_sha "$repo" "$pr")
    state=$(check_state "$repo" "$sha")
    case $state in
    green | none) echo "checks: $state"; exit 0 ;;
    fail) echo "checks: failing"; "${BASH_SOURCE[0]}" checks "$repo" "$pr"; exit 1 ;;
    esac
    ((SECONDS < deadline)) || { echo "checks: still pending after $minutes min"; exit 2; }
    sleep 30
  done
  ;;
failed-logs)
  repo=$1 pr=$2 lines=${3:-150}
  sha=$(head_sha "$repo" "$pr")
  api "repos/$repo/commits/$sha/check-runs?per_page=100" "$LATEST_RUNS_JQ" |
    while IFS=$'\t' read -r name status conclusion id; do
      [[ $name != merge-gate && $status == completed && $conclusion =~ ^(failure|timed_out|action_required)$ ]] || continue
      echo "===== $name (job $id): $conclusion"
      gh api "repos/$repo/actions/jobs/$id/logs" 2>/dev/null | tail -n "$lines" || echo "(log not available)"
    done
  ;;
auto-merge)
  # Claude Code cloud sessions enable auto-merge through the proxy's CCR route.
  gh api -X PUT "repos/$1/pulls/$2/ccr/auto_merge" -f merge_method=squash
  ;;
ready)
  gh api -X POST "repos/$1/pulls/$2/ccr/ready_for_review"
  ;;
*) usage ;;
esac
