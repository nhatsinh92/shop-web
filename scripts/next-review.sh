#!/usr/bin/env bash
# Picks the next PR for a reviewer session. Deterministic: bash + gh, no model calls.
# Prints exactly one JSON object and exits within seconds:
#
#   {"action":"review","repo":"o/r","pr":N,"issue":M}   oldest PR labelled `review` with green checks
#   {"action":"none","reason":"..."}
#
# Skips drafts, PRs already labelled agent-approved / changes-requested / blocked, PRs whose checks
# (merge-gate excluded) are pending or failing, and PRs with a reviewer heartbeat younger than
# HEARTBEAT_STALE_MINUTES (another reviewer is on it):
#   <!-- shop-agent:heartbeat role=reviewer -->
set -euo pipefail

# Field separator for rows: a non-whitespace character, so empty fields are kept by `read`.
US=$'\x1f'

STALE_MINUTES=${HEARTBEAT_STALE_MINUTES:-20}

default_repos() {
  local url owner
  url=$(git config --get remote.origin.url 2>/dev/null || true)
  owner=$(sed -E 's#.*github\.com[:/]([^/]+)/.*#\1#' <<<"$url")
  [[ -n $owner && $owner != "$url" ]] || owner=nhatsinh92
  echo "$owner/shop-api $owner/shop-web"
}
read -r -a REPOS <<<"${SHOP_REPOS:-$(default_repos)}"

QUERY='query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    pullRequests(states: OPEN, first: 50, orderBy: {field: CREATED_AT, direction: ASC}) {
      nodes { number createdAt isDraft body labels(first: 30) { nodes { name } }
              comments(last: 50) { nodes { body updatedAt } }
              commits(last: 1) { nodes { commit { statusCheckRollup { contexts(first: 50) { nodes {
                __typename
                ... on CheckRun { name status conclusion }
                ... on StatusContext { context state } } } } } } } }
    }
  }
}'

# Row (fields separated by US): <createdAt> <number> <labels> <draft> <checks> <reviewer hb age|-1> <closes issue>
JQ='
def hb: [.comments.nodes[] | select(.body | test("<!-- shop-agent:heartbeat role=reviewer"))] | last;
def hbage: hb as $h | if $h then ((now - ($h.updatedAt | fromdateiso8601)) / 60 | floor) else -1 end;
def checks: [.commits.nodes[0].commit.statusCheckRollup.contexts.nodes[]?
  | if .__typename == "CheckRun"
    then {n: .name, s: (if .status != "COMPLETED" then "pending"
                        elif (.conclusion | IN("SUCCESS", "SKIPPED", "NEUTRAL")) then "ok" else "fail" end)}
    else {n: .context, s: (if .state == "SUCCESS" then "ok"
                           elif (.state | IN("PENDING", "EXPECTED")) then "pending" else "fail" end)} end
  | select(.n != "merge-gate")];
def checkstate: checks as $c
  | if ($c | length) == 0 then "none" elif any($c[]; .s == "fail") then "fail"
    elif any($c[]; .s == "pending") then "pending" else "green" end;
def closes: ((.body // "") | [scan("(?i)(?:closes|fixes|resolves) #([0-9]+)")] | first // [""]) | .[0];
.data.repository.pullRequests.nodes[]
  | [.createdAt, .number, ([.labels.nodes[].name] | join(",")), .isDraft, checkstate, hbage, closes] | map(tostring) | join("\u001f")
'

has() { [[ ",$1," == *",$2,"* ]]; }

# Test hook: with SHOP_FIXTURES=<dir>, read <dir>/<repo name>.json through jq instead of GitHub.
query_repo() {
  if [[ -n ${SHOP_FIXTURES:-} ]]; then jq -r "$JQ" "$SHOP_FIXTURES/${1##*/}.json"; else
    gh api graphql -F owner="${1%%/*}" -F name="${1##*/}" -f query="$QUERY" --jq "$JQ"
  fi
}

candidates=()
for repo in "${REPOS[@]}"; do
  while IFS= read -r line; do
    [[ -n $line ]] && candidates+=("$line$US$repo")
  done < <(query_repo "$repo" | tr -d '\015')
done

mapfile -t sorted < <(printf '%s\n' "${candidates[@]}" | sort)
for row in "${sorted[@]}"; do
  [[ -z $row ]] && continue
  IFS=$US read -r _ number labels draft checks age issue repo <<<"$row"
  [[ $draft == false ]] && has "$labels" review || continue
  has "$labels" agent-approved || has "$labels" changes-requested || has "$labels" blocked && continue
  [[ $checks == green ]] || continue
  ((age >= 0 && age < STALE_MINUTES)) && continue
  if [[ -n $issue ]]; then
    printf '{"action":"review","repo":"%s","pr":%s,"issue":%s}\n' "$repo" "$number" "$issue"
  else
    printf '{"action":"review","repo":"%s","pr":%s}\n' "$repo" "$number"
  fi
  exit 0
done

echo '{"action":"none","reason":"no PR labelled review with green checks"}'
