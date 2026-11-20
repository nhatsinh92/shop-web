#!/usr/bin/env bash
# Picks the next unit of work for a worker session. Deterministic: bash + gh REST, no model calls.
# Prints exactly one JSON object on stdout and exits within seconds:
#
#   {"action":"none","reason":"..."}                       another worker is active, or nothing to do
#   {"action":"triage","repo":"o/r","issue":N}             an issue reached MAX_ATTEMPTS attempts
#   {"action":"resume","repo":"o/r","issue":N,"branch":"..."}  in-progress issue, stale heartbeat
#   {"action":"fix","repo":"o/r","pr":N,"branch":"...","why":"..."}   task PR (claude/issue-*) that
#        needs the worker; why = changes-requested | conflict (merge conflict with main) | checks
#   {"action":"start","repo":"o/r","issue":N}              oldest ready issue: deps closed, epic approved
#   {"action":"error","reason":"..."}  (exit 1)            GitHub could not be read: do not guess
#
# It looks across all repositories in SHOP_REPOS so only one worker is active at a time.
# Conventions (see .claude/prompts/worker.md):
#   heartbeat comment:  <!-- shop-agent:heartbeat role=worker branch=<branch> -->  (edited in place;
#                       its updated_at is the heartbeat time)
#   attempt comment:    <!-- shop-agent:attempt -->  (one per start or resume)
#   issue body lines:   "Depends on: #12, shop-web#3"  and  "Epic: #5"
set -euo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=lib/gh-rest.sh
source "$here/lib/gh-rest.sh"
load_repos
MAX_ATTEMPTS=${MAX_ATTEMPTS:-3}

ISSUES_JQ="$JQ_REFS"'
.[] | select((.pull_request | not) and .state == "open")
  | ["issue", .number, .created_at, ([.labels[].name] | join(",")), refs("Depends on"), refs("Epic")]
  | map(tostring) | join("\u001f")'
PULLS_JQ='.[] | [.number, .created_at, ([.labels[].name] | join(",")), .head.ref, .head.sha, .draft]
  | map(tostring) | join("\u001f")'
# "<attempts><US><branch of the latest worker heartbeat>"
ITEM_JQ='[([.[] | select(.body | test("<!-- shop-agent:attempt"))] | length),
  ([.[] | select(.body | test("<!-- shop-agent:heartbeat role=worker "))] | last
   | if . == null then "" else ((.body | capture("branch=(?<b>[^ >]+)").b) // "") end)]
  | map(tostring) | join("\u001f")'

since=$(minutes_ago "$STALE_MINUTES")
issues=()
pulls=()
for repo in "${REPOS[@]}"; do
  # 1. Another worker is active: a worker heartbeat younger than STALE_MINUTES anywhere.
  fresh=$(api "repos/$repo/issues/comments?since=$since&per_page=100" "$(fresh_heartbeats_jq worker)") ||
    die_api "recent comments of $repo"
  if [[ -n $fresh ]]; then
    IFS=$US read -r number age <<<"${fresh%%$'\n'*}"
    json action none reason "worker heartbeat on $repo #$number is $age min old"
    exit 0
  fi
  out=$(api "repos/$repo/issues?state=open&sort=created&direction=asc&per_page=100" "$ISSUES_JQ") ||
    die_api "open issues of $repo"
  while IFS= read -r line; do [[ -n $line ]] && issues+=("$repo$US$line"); done <<<"$out"
  out=$(api "repos/$repo/pulls?state=open&per_page=100" "$PULLS_JQ") || die_api "open pull requests of $repo"
  while IFS= read -r line; do [[ -n $line ]] && pulls+=("$repo$US$line"); done <<<"$out"
done

item_state() { # repo number -> "<attempts><US><branch>"
  local out
  out=$(api "repos/$1/issues/$2/comments?per_page=100" "$ITEM_JQ") || return 1
  echo "${out%%$'\n'*}"
}

# 2. In-progress issues with a stale (or missing) heartbeat: triage after MAX_ATTEMPTS, else resume.
for row in "${issues[@]}"; do
  IFS=$US read -r repo _ number _ labels _ <<<"$row"
  has "$labels" in-progress && ! has "$labels" blocked || continue
  state=$(item_state "$repo" "$number") || die_api "comments of $repo#$number"
  IFS=$US read -r attempts branch <<<"$state"
  if ((attempts >= MAX_ATTEMPTS)); then json action triage repo "$repo" issue "$number"; exit 0; fi
  json action resume repo "$repo" issue "$number" branch "${branch:-claude/issue-$number}"
  exit 0
done

# 3. Task PRs that need the worker: requested changes, a merge conflict with main, or failing checks
#    (merge-gate excluded).
#    Bootstrap and planning PRs belong to the owner and the planner.
for row in "${pulls[@]}"; do
  IFS=$US read -r repo number _ labels ref sha draft <<<"$row"
  [[ $draft == false && $ref == claude/issue-* ]] && ! has "$labels" blocked || continue
  if has "$labels" changes-requested; then
    json action fix repo "$repo" pr "$number" branch "$ref" why changes-requested
    exit 0
  fi
  # A PR in conflict with main can still have green checks and would wait forever.
  merge_state=$(api "repos/$repo/pulls/$number" '.mergeable_state') || die_api "pull request $repo#$number"
  if [[ $merge_state == dirty ]]; then
    json action fix repo "$repo" pr "$number" branch "$ref" why conflict
    exit 0
  fi
  checks=$(check_state "$repo" "$sha") || die_api "checks of $repo#$number"
  if [[ $checks == fail ]]; then json action fix repo "$repo" pr "$number" branch "$ref" why checks; exit 0; fi
done

# 4. Ready issues, oldest first across repos: triage if exhausted, else start when dependencies are
#    closed and the epic (if any) is approved.
resolve_ref() { # repo "#12" | "shop-web#12" -> "owner/name number"
  local repo=$1 name=${2%%#*} number=${2##*#}
  [[ -z $name ]] && name=${repo##*/}
  echo "${repo%%/*}/$name $number"
}
mapfile -t ready < <(for row in "${issues[@]}"; do
  IFS=$US read -r _ _ _ created labels _ <<<"$row"
  has "$labels" ready && ! has "$labels" in-progress && ! has "$labels" blocked &&
    printf '%s%s%s\n' "$created" "$US" "$row"
done | sort | cut -d"$US" -f2-)

for row in "${ready[@]}"; do
  [[ -n $row ]] || continue
  IFS=$US read -r repo _ number _ _ depends epic <<<"$row"
  state=$(item_state "$repo" "$number") || die_api "comments of $repo#$number"
  IFS=$US read -r attempts _ <<<"$state"
  if ((attempts >= MAX_ATTEMPTS)); then json action triage repo "$repo" issue "$number"; exit 0; fi
  blocked_by=""
  IFS=',' read -r -a deps <<<"$depends"
  for dep in "${deps[@]}"; do
    [[ -n $dep ]] || continue
    read -r dep_repo dep_number <<<"$(resolve_ref "$repo" "$dep")"
    dep_state=$(api "repos/$dep_repo/issues/$dep_number" '.state') ||
      { echo "next-task: cannot read $dep_repo#$dep_number" >&2; dep_state=unknown; }
    [[ $dep_state == closed ]] || { blocked_by=$dep; break; }
  done
  [[ -z $blocked_by ]] || continue
  if [[ -n $epic ]]; then
    read -r epic_repo epic_number <<<"$(resolve_ref "$repo" "${epic%%,*}")"
    approved=$(api "repos/$epic_repo/issues/$epic_number" '[.labels[].name] | index("approved") != null') || approved=false
    [[ $approved == true ]] || continue
  fi
  json action start repo "$repo" issue "$number"
  exit 0
done

json action none reason "nothing ready in ${REPOS[*]}"
