#!/usr/bin/env bash
# Tests for .claude/hooks/guard.sh. Needs bash and jq. Run: bash scripts/tests/guard.test.sh
set -uo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
project=$(mktemp -d)
trap 'rm -rf "$project"' EXIT
mkdir -p "$project/.claude/state"

failures=0
run() { # tool json-input-object -> exit code
  CLAUDE_PROJECT_DIR=$project bash "$root/.claude/hooks/guard.sh" <<<"$1" >/dev/null 2>&1
  echo $?
}
bash_input() { jq -cn --arg c "$1" '{tool_name: "Bash", tool_input: {command: $c}}'; }
edit_input() { jq -cn --arg p "$1" '{tool_name: "Edit", tool_input: {file_path: $p}}'; }
check() { # expectation(block|allow) name input
  local code expected
  code=$(run "$3")
  [[ $1 == block ]] && expected=2 || expected=0
  if [[ $code == "$expected" ]]; then echo "ok   - $1: $2"; else
    echo "FAIL - $1: $2 (exit $code)"
    failures=$((failures + 1))
  fi
}

echo worker >"$project/.claude/state/role"

check block "force push" "$(bash_input 'git push --force origin issue-1')"
check block "force push short flag" "$(bash_input 'git push -f')"
check block "force push with lease" "$(bash_input 'git push --force-with-lease origin HEAD')"
check block "force push refspec" "$(bash_input 'git push origin +issue-1')"
check block "push to main" "$(bash_input 'git push origin main')"
check block "push HEAD to main" "$(bash_input 'git push origin HEAD:main')"
check block "delete remote branch" "$(bash_input 'git push origin --delete issue-1')"
check block "delete remote branch refspec" "$(bash_input 'git push origin :issue-1')"
check block "delete local branch" "$(bash_input 'git branch -D issue-1')"
check block "gh repo edit" "$(bash_input 'gh repo edit --enable-auto-merge')"
check block "gh secret" "$(bash_input 'gh secret set X')"
check block "gh label" "$(bash_input 'gh label create foo')"
check block "branch protection via api" "$(bash_input 'gh api -X PUT repos/o/r/branches/main/protection --input p.json')"
check block "repo settings via api" "$(bash_input 'gh api -X PATCH repos/o/r -f allow_auto_merge=true')"
check block "add human-approved" "$(bash_input 'gh pr edit 5 --add-label human-approved')"
check block "add approved to an epic" "$(bash_input 'gh issue edit 3 --add-label approved')"
check block "human-approved via api" "$(bash_input 'gh api repos/o/r/issues/5/labels -f "labels[]=human-approved"')"
check block "worker adds infra-change" "$(bash_input 'gh issue edit 3 --add-label infra-change')"
check block "edit a workflow" "$(edit_input "$project/.github/workflows/ci.yml")"
check block "edit claude settings" "$(edit_input "$project/.claude/settings.json")"
check block "sed into .github" "$(bash_input 'sed -i s/a/b/ .github/workflows/ci.yml')"
check block "graphql mutation" "$(bash_input 'gh api graphql -f query="mutation { updateRepository(input: {}) { clientMutationId } }"')"

check allow "normal push" "$(bash_input 'git push -u origin issue-12-cart-qty')"
check allow "commit" "$(bash_input 'git commit -m "feat(cart): add quantity update"')"
check allow "add agent-approved" "$(bash_input 'gh pr edit 5 --add-label agent-approved --remove-label review')"
check allow "create PR with labels" "$(bash_input 'gh pr create --title t --body b --label review --label area:cart')"
check allow "auto-merge" "$(bash_input 'gh pr merge 5 --auto --squash')"
check allow "comment via api" "$(bash_input 'gh api repos/o/r/issues/5/comments -f body=hi')"
check allow "edit heartbeat comment" "$(bash_input 'gh api -X PATCH repos/o/r/issues/comments/123 -f body=hi')"
check allow "read-only api" "$(bash_input 'gh api repos/o/r/pulls/5/files')"
check allow "edit source" "$(edit_input "$project/core/src/main/java/com/mayshop/core/product/Product.java")"
check allow "write task state" "$(edit_input "$project/.claude/state/current-task")"
check allow "run tests" "$(bash_input 'make lint test')"

echo planner >"$project/.claude/state/role"
check allow "planner adds infra-change" "$(bash_input 'gh issue edit 3 --add-label infra-change')"
check block "planner adds approved" "$(bash_input 'gh issue edit 3 --add-label approved')"

echo
if ((failures)); then echo "$failures test(s) failed"; exit 1; fi
echo "all guard tests passed"
