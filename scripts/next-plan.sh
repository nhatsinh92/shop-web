#!/usr/bin/env bash
# Picks the next job for a planner session. Deterministic: bash + gh, no model calls.
# Prints exactly one JSON object and exits within seconds:
#
#   {"action":"plan-tasks","repo":"o/r","epic":N}   an approved epic issue with no task issues yet
#   {"action":"draft-epics","phase":N}              every issue of the latest planned phase is closed
#                                                   and no planning PR is open: draft phase N
#   {"action":"none","reason":"..."}
#
# Epic issues carry the `epic` label; task issues reference them with "Epic: #N" in the body.
set -euo pipefail

default_repos() {
  local url owner
  url=$(git config --get remote.origin.url 2>/dev/null || true)
  owner=$(sed -E 's#.*github\.com[:/]([^/]+)/.*#\1#' <<<"$url")
  [[ -n $owner && $owner != "$url" ]] || owner=nhatsinh92
  echo "$owner/shop-api $owner/shop-web"
}
read -r -a REPOS <<<"${SHOP_REPOS:-$(default_repos)}"
MAX_PHASE=6

# 1. Approved epics without task issues.
for repo in "${REPOS[@]}"; do
  for epic in $(gh issue list --repo "$repo" --state open --label epic --label approved --json number --jq '.[].number' | tr -d '\015'); do
    tasks=$(gh search issues --repo "$repo" --match body "Epic: #$epic" --json number --jq 'length' | tr -d '\015')
    if [[ $tasks == 0 ]]; then
      printf '{"action":"plan-tasks","repo":"%s","epic":%s}\n' "$repo" "$epic"
      exit 0
    fi
  done
done

# 2. Unapproved epics or an open planning PR: wait for the owner.
for repo in "${REPOS[@]}"; do
  waiting=$(gh issue list --repo "$repo" --state open --label epic --json labels \
    --jq '[.[] | select([.labels[].name] | index("approved") | not)] | length' | tr -d '\015')
  if [[ $waiting != 0 ]]; then
    echo '{"action":"none","reason":"epics are waiting for the owner'"'"'s approval"}'
    exit 0
  fi
  planning=$(gh pr list --repo "$repo" --state open --search "head:plans/" --json number --jq 'length' | tr -d '\015')
  if [[ $planning != 0 ]]; then
    echo '{"action":"none","reason":"a planning PR is open"}'
    exit 0
  fi
done

# 3. The latest phase that has issues is finished: draft the next one.
latest=0
for repo in "${REPOS[@]}"; do
  for n in $(seq "$MAX_PHASE" -1 1); do
    if [[ $(gh issue list --repo "$repo" --state all --label "phase:$n" --limit 1 --json number --jq 'length' | tr -d '\015') != 0 ]]; then
      ((n > latest)) && latest=$n
      break
    fi
  done
done
open=0
if ((latest > 0)); then
  for repo in "${REPOS[@]}"; do
    count=$(gh issue list --repo "$repo" --state open --label "phase:$latest" --json number --jq 'length' | tr -d '\015')
    open=$((open + count))
  done
fi
if ((open == 0 && latest < MAX_PHASE)); then
  printf '{"action":"draft-epics","phase":%s}\n' $((latest + 1))
  exit 0
fi

echo '{"action":"none","reason":"no approved epic without tasks; current phase still open"}'
