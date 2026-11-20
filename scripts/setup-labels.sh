#!/usr/bin/env bash
# Creates or updates the labels used by the agent workflow. Idempotent.
#   scripts/setup-labels.sh [owner/repo]   (defaults to the current repository)
set -euo pipefail
repo=${1:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}

label() { gh label create "$1" --repo "$repo" --color "$2" --description "$3" --force >/dev/null && echo "  $1"; }

echo "Labels for $repo:"
# Workflow state
label ready             0E8A16 "Dependencies closed and epic approved: a worker may start it"
label in-progress       FBCA04 "A worker is on it (see the heartbeat comment)"
label review            1D76DB "PR waiting for the reviewer"
label changes-requested D93F0B "Reviewer asked for changes; the next worker run fixes them"
label blocked           B60205 "Cannot continue: see the triage or blocking comment"
label agent-approved    0E8A16 "Approved by the reviewer agent"
label human-approved    5319E7 "Approved by the repository owner (only the owner adds it)"
label approved          5319E7 "Epic approved by the owner (only the owner adds it)"
label epic              3E4B9E "Tracks an epic file in plans/epics/"
label infra-change      C5DEF5 "Allowed to touch protected paths (owner or planner only)"
label e2e               BFD4F2 "Run end-to-end tests on this PR"
# Phases and sizes
for n in 0 1 2 3 4 5 6; do label "phase:$n" EDEDED "Phase $n of the roadmap"; done
label size:S C2E0C6 "Small: well under 400 changed lines"
label size:M FEF2C0 "Medium: under about 400 changed lines"
# Areas, one per task
case ${repo##*/} in
shop-api) areas=(contract gateway auth product order checkout cart-service infra e2e) ;;
shop-web) areas=(contract-client design-system layout auth home pdp cart checkout infra e2e) ;;
*) areas=(infra e2e) ;;
esac
for area in "${areas[@]}"; do label "area:$area" D4C5F9 "Area: $area"; done
