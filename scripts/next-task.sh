#!/usr/bin/env bash
# Picks the next unit of work for a worker session. Deterministic: bash + gh, no model calls.
# Prints exactly one JSON object on stdout and exits within seconds:
#
#   {"action":"none","reason":"..."}                      another worker is active, or nothing to do
#   {"action":"triage","repo":"o/r","issue":N}            an issue reached MAX_ATTEMPTS attempts
#   {"action":"resume","repo":"o/r","issue":N,"branch":"..."}  in-progress issue with a stale heartbeat
#   {"action":"fix","repo":"o/r","pr":N,"branch":"..."}   task PR (issue-*) with requested changes or failing checks
#   {"action":"start","repo":"o/r","issue":N}             oldest ready issue: deps closed, epic approved
#
# It looks across all repositories in SHOP_REPOS so only one worker is active at a time.
# Conventions it relies on (see .claude/prompts/worker.md):
#   heartbeat comment:  <!-- shop-agent:heartbeat role=worker branch=<branch> -->  (edited in place;
#                       its updatedAt is the heartbeat time)
#   attempt comment:    <!-- shop-agent:attempt -->  (one per start or resume)
#   issue body lines:   "Depends on: #12, shop-web#3"  and  "Epic: #5"
set -euo pipefail

# Field separator for rows: a non-whitespace character, so empty fields are kept by `read`.
US=$'\x1f'

STALE_MINUTES=${HEARTBEAT_STALE_MINUTES:-20}
MAX_ATTEMPTS=${MAX_ATTEMPTS:-3}

default_repos() {
  local url owner
  url=$(git config --get remote.origin.url 2>/dev/null || true)
  owner=$(sed -E 's#.*github\.com[:/]([^/]+)/.*#\1#' <<<"$url")
  [[ -n $owner && $owner != "$url" ]] || owner=nhatsinh92
  echo "$owner/shop-api $owner/shop-web"
}
read -r -a REPOS <<<"${SHOP_REPOS:-$(default_repos)}"

json() { # json key value key value ... (numbers stay unquoted)
  local out="{" sep="" k v
  while (($#)); do
    k=$1 v=$2
    shift 2
    if [[ $v =~ ^[0-9]+$ ]]; then out+="$sep\"$k\":$v"; else out+="$sep\"$k\":\"${v//\"/\\\"}\""; fi
    sep=","
  done
  echo "$out}"
}

QUERY='query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    issues(states: OPEN, first: 100, orderBy: {field: CREATED_AT, direction: ASC}) {
      nodes { number createdAt body labels(first: 30) { nodes { name } }
              comments(last: 50) { nodes { body updatedAt } } }
    }
    pullRequests(states: OPEN, first: 50, orderBy: {field: CREATED_AT, direction: ASC}) {
      nodes { number createdAt isDraft headRefName labels(first: 30) { nodes { name } }
              comments(last: 50) { nodes { body updatedAt } }
              commits(last: 1) { nodes { commit { statusCheckRollup { contexts(first: 50) { nodes {
                __typename
                ... on CheckRun { name status conclusion startedAt }
                ... on StatusContext { context state createdAt } } } } } } } }
    }
  }
}'

# One row per open issue and PR (fields separated by US):
#   issue <number> <createdAt> <labels> <hb age min|-1> <hb branch> <attempts> <depends> <epic>
#   pr    <number> <createdAt> <labels> <hb age min|-1> <head branch> <checks> <draft>
JQ='
def labels: [.labels.nodes[].name] | join(",");
def hb: [.comments.nodes[] | select(.body | test("<!-- shop-agent:heartbeat role=worker"))] | last;
def hbage: hb as $h | if $h then ((now - ($h.updatedAt | fromdateiso8601)) / 60 | floor) else -1 end;
def hbbranch: hb as $h | if $h then (($h.body | capture("branch=(?<b>[^ >]+)").b) // "") else "" end;
def attempts: [.comments.nodes[] | select(.body | test("<!-- shop-agent:attempt"))] | length;
def refs($prefix): (.body // "") | split("\n")
  | map(select(test("^\\s*\\**" + $prefix + "\\**:"; "i"))) | (first // "")
  | [scan("(?:[A-Za-z0-9_.-]+/)?([A-Za-z0-9_.-]+)?#([0-9]+)")] | map((.[0] // "") + "#" + .[1]) | join(",");
# Latest run per check name (re-runs and cancelled runs from label events are superseded).
def checks: [.commits.nodes[0].commit.statusCheckRollup.contexts.nodes[]?
  | if .__typename == "CheckRun"
    then {n: .name, t: (.startedAt // ""),
          s: (if .status != "COMPLETED" or .conclusion == "CANCELLED" then "pending"
              elif (.conclusion | IN("SUCCESS", "SKIPPED", "NEUTRAL")) then "ok" else "fail" end)}
    else {n: .context, t: (.createdAt // ""),
          s: (if .state == "SUCCESS" then "ok"
              elif (.state | IN("PENDING", "EXPECTED")) then "pending" else "fail" end)} end
  | select(.n != "merge-gate")]
  | group_by(.n) | map(max_by(.t));
def checkstate: checks as $c
  | if ($c | length) == 0 then "none" elif any($c[]; .s == "fail") then "fail"
    elif any($c[]; .s == "pending") then "pending" else "green" end;
(.data.repository.issues.nodes[]
  | ["issue", .number, .createdAt, labels, hbage, hbbranch, attempts, refs("Depends on"), refs("Epic")] | map(tostring) | join("\u001f")),
(.data.repository.pullRequests.nodes[]
  | ["pr", .number, .createdAt, labels, hbage, .headRefName, checkstate, .isDraft] | map(tostring) | join("\u001f"))
'

# Test hook: with SHOP_FIXTURES=<dir>, read <dir>/<repo name>.json (GraphQL response) and
# <dir>/<repo name>-issue-<n>.json (REST issue) through jq instead of calling GitHub.
query_repo() {
  if [[ -n ${SHOP_FIXTURES:-} ]]; then jq -r "$JQ" "$SHOP_FIXTURES/${1##*/}.json"; else
    gh api graphql -F owner="${1%%/*}" -F name="${1##*/}" -f query="$QUERY" --jq "$JQ"
  fi
}

rows=()
for repo in "${REPOS[@]}"; do
  while IFS= read -r line; do
    [[ -n $line ]] && rows+=("$repo$US$line")
  done < <(query_repo "$repo" | tr -d '\015')
done

has() { [[ ",$1," == *",$2,"* ]]; }

# Resolve "#12" or "shop-web#12" relative to a repo into "owner/name number".
resolve_ref() {
  local repo=$1 name=${2%%#*} number=${2##*#}
  [[ -z $name ]] && name=${repo##*/}
  echo "${repo%%/*}/$name $number"
}
issue_field() {
  if [[ -n ${SHOP_FIXTURES:-} ]]; then jq -r "$3" "$SHOP_FIXTURES/${1##*/}-issue-$2.json" 2>/dev/null | tr -d '\015' || echo "?"
  else gh api "repos/$1/issues/$2" --jq "$3" 2>/dev/null || echo "?"; fi
}

# 1. Another worker is active: any worker heartbeat younger than STALE_MINUTES.
for row in "${rows[@]}"; do
  IFS=$US read -r repo kind number _ _ age _ <<<"$row"
  if ((age >= 0 && age < STALE_MINUTES)); then
    json action none reason "worker heartbeat on $repo $kind #$number is $age min old"
    exit 0
  fi
done

# 2. In-progress issues with a stale (or missing) heartbeat: triage after MAX_ATTEMPTS, else resume.
for row in "${rows[@]}"; do
  IFS=$US read -r repo kind number _ labels _ branch attempts _ <<<"$row"
  [[ $kind == issue ]] && has "$labels" in-progress && ! has "$labels" blocked || continue
  if ((attempts >= MAX_ATTEMPTS)); then json action triage repo "$repo" issue "$number"; exit 0; fi
  json action resume repo "$repo" issue "$number" branch "${branch:-issue-$number}"
  exit 0
done

# 3. PRs that need the worker: requested changes, or failing checks (merge-gate excluded).
#    Only task PRs (branch issue-*); bootstrap and planning PRs belong to the owner and planner.
for row in "${rows[@]}"; do
  IFS=$US read -r repo kind number _ labels _ branch checks draft <<<"$row"
  [[ $kind == pr && $draft == false && $branch == issue-* ]] && ! has "$labels" blocked || continue
  if has "$labels" changes-requested || [[ $checks == fail ]]; then
    json action fix repo "$repo" pr "$number" branch "$branch"
    exit 0
  fi
done

# 4. Ready issues, oldest first across repos: triage if exhausted, else start when deps are closed
#    and the epic (if any) is approved.
mapfile -t ready < <(for row in "${rows[@]}"; do
  IFS=$US read -r repo kind number created labels _ <<<"$row"
  [[ $kind == issue ]] && has "$labels" ready && ! has "$labels" in-progress && ! has "$labels" blocked &&
    printf '%s%s%s\n' "$created" "$US" "$row"
done | sort | cut -d"$US" -f2-)

for row in "${ready[@]}"; do
  IFS=$US read -r repo _ number _ _ _ _ attempts depends epic <<<"$row"
  if ((attempts >= MAX_ATTEMPTS)); then json action triage repo "$repo" issue "$number"; exit 0; fi
  open_dep=""
  IFS=',' read -r -a deps <<<"$depends"
  for dep in "${deps[@]}"; do
    [[ -z $dep ]] && continue
    read -r dep_repo dep_number <<<"$(resolve_ref "$repo" "$dep")"
    [[ $(issue_field "$dep_repo" "$dep_number" .state) == closed ]] || { open_dep="$dep"; break; }
  done
  [[ -z $open_dep ]] || continue
  if [[ -n $epic ]]; then
    read -r epic_repo epic_number <<<"$(resolve_ref "$repo" "${epic%%,*}")"
    [[ $(issue_field "$epic_repo" "$epic_number" '[.labels[].name] | index("approved") != null') == true ]] || continue
  fi
  json action start repo "$repo" issue "$number"
  exit 0
done

json action none reason "nothing ready in ${REPOS[*]}"
