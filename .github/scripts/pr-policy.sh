#!/usr/bin/env bash
# Pull request policy check, run by .github/workflows/pr-policy.yml.
#
#   pr-policy.sh protected <pr>   fails when the PR touches a protected path without `infra-change`
#
# The workflow runs this script from the PR's *base* commit, so a PR cannot weaken the check that
# applies to it. Path lists live in .github/pr-policy.conf. Needs: bash, gh (GH_TOKEN), and the
# environment variable GITHUB_REPOSITORY.
set -euo pipefail

mode=${1:?usage: pr-policy.sh protected <pr-number>}
pr=${2:?usage: pr-policy.sh protected <pr-number>}
repo=${GITHUB_REPOSITORY:?}
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

PROTECTED_PATHS=()
TEST_PATHS=()
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
while IFS=$'\t' read -r status file previous; do
  [[ -z ${file:-} ]] && continue
  for path in "$file" ${previous:+"$previous"}; do
    if matches_any "$path" "${PROTECTED_PATHS[@]}"; then protected+=("$path"); fi
    if [[ $status != added ]] && matches_any "$path" "${TEST_PATHS[@]}"; then
      protected+=("$path (existing test, $status)")
    fi
  done
done <<<"$files"

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
*)
  echo "unknown mode: $mode" >&2
  exit 2
  ;;
esac

exit $failed
