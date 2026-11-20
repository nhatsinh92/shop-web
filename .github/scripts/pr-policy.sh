#!/usr/bin/env bash
# Pull request policy checks, run by .github/workflows/merge-gate.yml.
#
#   pr-policy.sh protected  <pr>   fails when the PR touches a protected path without `infra-change`
#   pr-policy.sh merge-gate <pr>   fails unless the PR has `agent-approved` and, when it touches a
#                                  sensitive path, `human-approved` added by the repository owner
#
# The workflow runs this script from the PR's *base* commit, so a PR cannot weaken the checks that
# gate it. Path lists live in .github/pr-policy.conf. Needs: bash, gh (GH_TOKEN), and the
# environment variables GITHUB_REPOSITORY, REPO_OWNER, BASE_SHA, HEAD_SHA.
set -euo pipefail

mode=${1:?usage: pr-policy.sh protected|merge-gate <pr-number>}
pr=${2:?usage: pr-policy.sh protected|merge-gate <pr-number>}
repo=${GITHUB_REPOSITORY:?}
owner=${REPO_OWNER:?}
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

PROTECTED_PATHS=()
TEST_PATHS=()
SENSITIVE_PATHS=()
CONTRACT_PACKAGE=""
# shellcheck source=../pr-policy.conf
source "$here/../pr-policy.conf"

summary() { echo "$*"; [[ -n ${GITHUB_STEP_SUMMARY:-} ]] && echo "$*" >>"$GITHUB_STEP_SUMMARY"; return 0; }
failed=0
fail() { echo "::error::$*"; summary "- ❌ $*"; failed=1; }
pass() { summary "- ✅ $*"; }

matches_any() {
  local file=$1 pattern
  shift
  for pattern in "$@"; do
    # [[ == ]] glob matching: `*` also matches `/`, so `gateway/*` covers the whole tree.
    # shellcheck disable=SC2053
    [[ $file == $pattern ]] && return 0
  done
  return 1
}

labels=$(gh api "repos/$repo/issues/$pr/labels" --paginate --jq '.[].name')
has_label() { grep -qxF "$1" <<<"$labels"; }

# status <TAB> filename <TAB> previous filename (renames)
files=$(gh api "repos/$repo/pulls/$pr/files" --paginate \
  --jq '.[] | [.status, .filename, (.previous_filename // "")] | @tsv')

protected=()
sensitive=()
while IFS=$'\t' read -r status file previous; do
  [[ -z ${file:-} ]] && continue
  for path in "$file" ${previous:+"$previous"}; do
    if matches_any "$path" "${PROTECTED_PATHS[@]}"; then protected+=("$path"); fi
    if [[ $status != added ]] && matches_any "$path" "${TEST_PATHS[@]}"; then
      protected+=("$path (existing test, $status)")
    fi
    if matches_any "$path" "${SENSITIVE_PATHS[@]}"; then sensitive+=("$path"); fi
  done
done <<<"$files"

# A major version bump of the API contract is a sensitive change.
contract_major_bump() {
  [[ -n $CONTRACT_PACKAGE ]] || return 1
  grep -q -P "\t\Q$CONTRACT_PACKAGE\E\t" <<<"$files" || return 1
  local base head
  base=$(gh api -H "Accept: application/vnd.github.raw" "repos/$repo/contents/$CONTRACT_PACKAGE?ref=$BASE_SHA" 2>/dev/null |
    sed -n 's/^[[:space:]]*"version":[[:space:]]*"\([0-9]*\)\..*/\1/p' | head -1) || true
  head=$(gh api -H "Accept: application/vnd.github.raw" "repos/$repo/contents/$CONTRACT_PACKAGE?ref=$HEAD_SHA" 2>/dev/null |
    sed -n 's/^[[:space:]]*"version":[[:space:]]*"\([0-9]*\)\..*/\1/p' | head -1) || true
  [[ -n $base && -n $head && $head -gt $base ]]
}
if contract_major_bump; then sensitive+=("$CONTRACT_PACKAGE (contract major version bump)"); fi

# The latest add/remove event of a label must be an add by the owner, made directly (not through a
# GitHub App such as the Claude connection or Actions), so agents cannot approve their own work.
label_added_by_owner() {
  local label=$1 last event actor app
  last=$(gh api "repos/$repo/issues/$pr/events" --paginate \
    --jq ".[] | select((.event == \"labeled\" or .event == \"unlabeled\") and .label.name == \"$label\")
              | [.event, .actor.login, (.performed_via_github_app.slug // \"\")] | @tsv" | tail -1)
  IFS=$'\t' read -r event actor app <<<"$last"
  [[ ${event:-} == labeled ]] || return 1
  [[ ${actor,,} == "${owner,,}" ]] || { echo "label '$label' was added by '$actor', not the owner"; return 1; }
  [[ -z ${app:-} ]] || { echo "label '$label' was added through the app '$app', not by the owner directly"; return 1; }
}

case $mode in
protected)
  summary "### protected-paths"
  if ((${#protected[@]} == 0)); then
    pass "No protected paths touched."
  elif has_label infra-change; then
    pass "Protected paths touched with the \`infra-change\` label: ${protected[*]}"
  else
    fail "Protected paths touched without the \`infra-change\` label: ${protected[*]}"
  fi
  ;;
merge-gate)
  summary "### merge-gate"
  if has_label agent-approved; then pass "\`agent-approved\` is present."; else fail "Missing \`agent-approved\` (agent review)."; fi
  needs_human=("${sensitive[@]}" "${protected[@]}")
  if ((${#needs_human[@]} == 0)); then
    pass "No sensitive paths: owner approval not required."
  elif ! has_label human-approved; then
    fail "Sensitive changes need \`human-approved\` from @$owner: ${needs_human[*]}"
  elif reason=$(label_added_by_owner human-approved); then
    pass "\`human-approved\` added by @$owner for: ${needs_human[*]}"
  else
    fail "\`human-approved\` is not valid: $reason"
  fi
  ;;
*)
  echo "unknown mode: $mode" >&2
  exit 2
  ;;
esac

exit $failed
