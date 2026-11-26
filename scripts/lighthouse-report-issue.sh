#!/usr/bin/env bash
# Opens or updates the "Lighthouse budgets failing" issue from Lighthouse CI assertion results.
# Usage: scripts/lighthouse-report-issue.sh <owner/repo> <run-url> [assertion-results.json]
# The results file defaults to .lighthouseci/assertion-results.json (written by `lhci assert`).
# With no failed assertion nothing is written. With a failure, an open issue with the title below
# gets a comment, otherwise a new issue is created (labels bug, area:infra).
# Env: GH (the gh command, default "gh"; tests replace it). Needs jq.
set -euo pipefail

repo=${1:?usage: lighthouse-report-issue.sh <owner/repo> <run-url> [results.json]}
run_url=${2:?usage: lighthouse-report-issue.sh <owner/repo> <run-url> [results.json]}
results=${3:-.lighthouseci/assertion-results.json}
gh=${GH:-gh}
title="Lighthouse budgets failing"

if [[ -s $results ]]; then
  lines=$(jq -r '[.[] | select(.level == "error" and (.passed // false) == false)]
    | .[] | "- `\(.url)`: `\(.auditId // .name)` is \(.actual) (budget \(.operator // "") \(.expected))"' "$results")
  [[ -n $lines ]] || exit 0 # every assertion passed: no issue, no comment
else
  lines="- No assertion results found: the run failed before the budgets were checked."
fi

body=$(printf 'Nightly Lighthouse run failed.\n\n%s\n\nRun: %s\n' "$lines" "$run_url")

existing=$($gh api -X GET "repos/$repo/issues" -f state=open -f labels=bug,area:infra --paginate \
  --jq ".[] | select(.title == \"$title\") | .number" | head -n1)

if [[ -n $existing ]]; then
  $gh api "repos/$repo/issues/$existing/comments" -f body="$body" >/dev/null
  echo "commented on #$existing"
else
  $gh api "repos/$repo/issues" -f title="$title" -f body="$body" -f 'labels[]=bug' -f 'labels[]=area:infra' >/dev/null
  echo "opened a new issue"
fi
