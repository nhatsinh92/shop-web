#!/usr/bin/env bash
# Picks the next PR for a reviewer session. Deterministic: bash + gh REST, no model calls.
# Prints exactly one JSON object and exits within seconds:
#
#   {"action":"review","repo":"o/r","pr":N,"issue":M}   oldest PR labelled `review` with green checks
#   {"action":"none","reason":"..."}
#   {"action":"error","reason":"..."}  (exit 1)         GitHub could not be read
#
# Skips drafts, PRs labelled agent-approved / changes-requested / blocked, PRs whose checks
# (merge-gate excluded) are pending or failing, and PRs with a reviewer heartbeat younger than
# HEARTBEAT_STALE_MINUTES (another reviewer is on it):  <!-- shop-agent:heartbeat role=reviewer -->
set -euo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=lib/gh-rest.sh
source "$here/lib/gh-rest.sh"
load_repos

PULLS_JQ='.[] | [.created_at, .number, ([.labels[].name] | join(",")), .draft, .head.sha,
  (((.body // "") | [scan("(?i)(?:closes|fixes|resolves) #([0-9]+)")] | first // [""]) | .[0])]
  | map(tostring) | join("\u001f")'

since=$(minutes_ago "$STALE_MINUTES")
candidates=()
busy=" "
for repo in "${REPOS[@]}"; do
  out=$(api "repos/$repo/issues/comments?since=$since&per_page=100" "$(fresh_heartbeats_jq reviewer)") ||
    die_api "recent comments of $repo"
  while IFS=$US read -r number _; do [[ -n $number ]] && busy+="$repo#$number "; done <<<"$out"
  out=$(api "repos/$repo/pulls?state=open&per_page=100" "$PULLS_JQ") || die_api "open pull requests of $repo"
  while IFS= read -r line; do [[ -n $line ]] && candidates+=("$line$US$repo"); done <<<"$out"
done

mapfile -t sorted < <(printf '%s\n' "${candidates[@]}" | sort)
for row in "${sorted[@]}"; do
  [[ -n $row ]] || continue
  IFS=$US read -r _ number labels draft sha issue repo <<<"$row"
  [[ $draft == false ]] && has "$labels" review || continue
  if has "$labels" agent-approved || has "$labels" changes-requested || has "$labels" blocked; then continue; fi
  [[ $busy == *" $repo#$number "* ]] && continue
  checks=$(check_state "$repo" "$sha") || die_api "checks of $repo#$number"
  [[ $checks == green ]] || continue
  if [[ -n $issue ]]; then
    json action review repo "$repo" pr "$number" issue "$issue"
  else
    json action review repo "$repo" pr "$number"
  fi
  exit 0
done

json action none reason "no PR labelled review with green checks"
