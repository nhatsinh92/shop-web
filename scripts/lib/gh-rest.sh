#!/usr/bin/env bash
# Shared helpers for the orchestration scripts (sourced, not executed).
#
# Claude Code cloud sessions reach GitHub through a proxy that blocks GraphQL, so everything here
# uses the REST API through `gh api`. Failures are never swallowed: callers turn a failed request
# into {"action":"error",...} and a non-zero exit.
#
# Test hook: with SHOP_FIXTURES=<dir>, api() reads <dir>/<path without query, "/" -> "_">.json
# through jq instead of calling GitHub (see scripts/tests/).

# shellcheck disable=SC2034 # variables below are used by the scripts that source this file
US=$'\x1f' # row field separator: not whitespace, so `read` keeps empty fields
STALE_MINUTES=${HEARTBEAT_STALE_MINUTES:-20}
# A heartbeat whose run has ended (`heartbeat.sh ... done`). It no longer counts as an active agent,
# so the next run can start at once instead of waiting STALE_MINUTES.
DONE_MARKER='<!-- shop-agent:done -->'

default_repos() {
  local url owner
  url=$(git config --get remote.origin.url 2>/dev/null || true)
  owner=$(sed -E 's#.*github\.com[:/]([^/]+)/.*#\1#' <<<"$url")
  [[ -n $owner && $owner != "$url" ]] || owner=nhatsinh92
  echo "$owner/shop-api $owner/shop-web"
}

# Sets the global REPOS array from SHOP_REPOS or the origin remote's owner.
load_repos() {
  # shellcheck disable=SC2034 # used by the sourcing script
  read -r -a REPOS <<<"${SHOP_REPOS:-$(default_repos)}"
}

fixture_path() {
  local path=${1%%\?*}
  printf '%s/%s.json' "$SHOP_FIXTURES" "${path//\//_}"
}

# api <path> [jq filter]: GET a REST path (all pages) and print the filter's output.
api() {
  local path=$1 filter=${2:-.} out file
  if [[ -n ${SHOP_FIXTURES:-} ]]; then
    file=$(fixture_path "$path")
    [[ -f $file ]] || { echo "api: no fixture for $path ($file)" >&2; return 1; }
    out=$(jq -r "$filter" "$file") || return 1
  else
    out=$(gh api --paginate "$path" --jq "$filter") || return 1
  fi
  out=$(tr -d '\015' <<<"$out")
  [[ -n $out ]] && printf '%s\n' "$out"
  return 0
}

has() { [[ ",$1," == *",$2,"* ]]; }

# json key value [key value ...]: one-line JSON object; all-digit values stay numbers.
json() {
  local out="{" sep="" k v
  while (($#)); do
    k=$1 v=$2
    shift 2
    if [[ $v =~ ^[0-9]+$ ]]; then out+="$sep\"$k\":$v"; else out+="$sep\"$k\":\"${v//\"/\\\"}\""; fi
    sep=","
  done
  echo "$out}"
}

die_api() {
  json action error reason "GitHub API request failed: $1"
  exit 1
}

minutes_ago() {
  date -u -d "-$1 min" +%Y-%m-%dT%H:%M:%SZ
}

# jq: "Depends on: #12, shop-web#3" / "Epic: #5" lines of an issue body -> "#12,shop-web#3"
# shellcheck disable=SC2034
JQ_REFS='def refs($prefix): (.body // "") | split("\n")
  | map(select(test("^\\s*\\**" + $prefix + "\\**:"; "i"))) | (first // "")
  | [scan("(?:[A-Za-z0-9_.-]+/)?([A-Za-z0-9_.-]+)?#([0-9]+)")] | map((.[0] // "") + "#" + .[1]) | join(",");'

# jq over a check-runs response: green | pending | fail | none, from the latest run per check name.
# merge-gate is excluded (it is red until approvals exist); cancelled runs count as pending.
JQ_CHECKS='[.check_runs[]
  | {n: .name, t: (.started_at // ""),
     s: (if .status != "completed" or .conclusion == "cancelled" then "pending"
         elif (.conclusion | IN("success", "skipped", "neutral")) then "ok" else "fail" end)}
  | select(.n != "merge-gate")]
  | group_by(.n) | map(max_by(.t))
  | if length == 0 then "none" elif any(.[]; .s == "fail") then "fail"
    elif any(.[]; .s == "pending") then "pending" else "green" end'

# check_state <repo> <sha>
check_state() {
  api "repos/$1/commits/$2/check-runs?per_page=100" "$JQ_CHECKS"
}

# jq over issue comments: "<issue number><US><age minutes>" for fresh heartbeats of a role
# (heartbeats marked done are not fresh).
fresh_heartbeats_jq() {
  printf '.[] | select(.body | test("<!-- shop-agent:heartbeat role=%s ")) | select(.body | contains("<!-- shop-agent:done -->") | not) | ((now - (.updated_at | fromdateiso8601)) / 60 | floor) as $age | select($age < %s) | [(.issue_url | split("/") | last), $age] | map(tostring) | join("\\u001f")' "$1" "$STALE_MINUTES"
}

# jq over issue comments: "<comment id><US><issue number>" for fresh heartbeats of a role
# (heartbeats marked done are not fresh).
fresh_heartbeat_ids_jq() {
  printf '.[] | select(.body | test("<!-- shop-agent:heartbeat role=%s ")) | select(.body | contains("<!-- shop-agent:done -->") | not) | select(((now - (.updated_at | fromdateiso8601)) / 60) < %s) | [.id, (.issue_url | split("/") | last)] | map(tostring) | join("\\u001f")' "$1" "$STALE_MINUTES"
}

# gh_write <METHOD> <path> [gh api args...]: a mutating REST call. In fixture mode it is logged to
# $SHOP_FIXTURES/writes.log instead of sent, and a POST prints $SHOP_FAKE_COMMENT_ID.
gh_write() {
  local method=$1 path=$2
  shift 2
  if [[ -n ${SHOP_FIXTURES:-} ]]; then
    echo "$method $path" >>"$SHOP_FIXTURES/writes.log"
    [[ $method == POST ]] && echo "${SHOP_FAKE_COMMENT_ID:-999}"
    return 0
  fi
  gh api -X "$method" "$path" "$@"
}
