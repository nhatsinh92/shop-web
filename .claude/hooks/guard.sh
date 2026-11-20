#!/usr/bin/env bash
# PreToolUse guard for agent sessions (see .claude/settings.json). Defence in depth: the real gate is
# the merge-gate check on GitHub. Reads the hook JSON on stdin; exit 2 blocks the tool call and
# shows the message to the model.
#
# Blocks:
#   - force pushes, pushes to main/master, deleting branches (local or remote)
#   - gh repo edit/delete/rename/archive, gh secret/variable/ruleset/label, workflow enable/disable
#   - gh api calls that change anything outside issues, pull requests and their comments
#   - adding or removing the owner-only labels human-approved and approved (and infra-change,
#     except for the planner)
#   - edits under .github/ or .claude/ unless the current task's issue carries `infra-change`
#     (the session records its task in .claude/state/current-task as "owner/repo#number")
set -uo pipefail

input=$(cat)
if ! command -v jq >/dev/null 2>&1; then
  echo "guard: jq is not installed; refusing tool calls until scripts/cloud-setup.sh has run." >&2
  exit 2
fi

tool=$(jq -r '.tool_name // empty' <<<"$input")
project=${CLAUDE_PROJECT_DIR:-$(pwd)}
state_dir="$project/.claude/state"
role=$(cat "$state_dir/role" 2>/dev/null || echo worker)

block() {
  echo "Blocked by .claude/hooks/guard.sh: $*" >&2
  echo "If the task really needs this, stop and leave a comment on the issue for the owner." >&2
  exit 2
}

infra_task() {
  local task repo number
  task=$(cat "$state_dir/current-task" 2>/dev/null) || return 1
  repo=${task%%#*} number=${task##*#}
  [[ -n $repo && $number =~ ^[0-9]+$ ]] || return 1
  gh issue view "$number" --repo "$repo" --json labels --jq '[.labels[].name] | index("infra-change") != null' 2>/dev/null |
    grep -q true
}

protected_path() { [[ $1 =~ (^|/)\.(github|claude)/ ]] && [[ ! $1 =~ (^|/)\.claude/state/ ]]; }

case $tool in
Edit | Write | MultiEdit | NotebookEdit)
  path=$(jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' <<<"$input")
  if protected_path "$path" && ! infra_task; then
    block "editing $path needs an issue labelled infra-change (protected path)."
  fi
  exit 0
  ;;
Bash) ;;
*) exit 0 ;;
esac

cmd=$(jq -r '.tool_input.command // empty' <<<"$input")
flat=$(tr '\n' ' ' <<<"$cmd")

# Regexes live in variables: bash cannot parse `;`, `&` or `|` literally inside [[ =~ ]].
SEP='[^;&|]*'                 # stays within one shell command
S='[[:space:]]'
re_push="git$S+(${SEP}$S)?push"
re_force="push${SEP}(--force|$S-f($S|\$)|--force-with-lease|$S\+[^[:space:]])"
re_del_remote="push${SEP}(--delete|$S-d($S|\$)|$S:[^[:space:]])"
re_push_main="push${SEP}$S(origin$S+)?(HEAD:)?(refs/heads/)?(main|master)($S|\$|;|&)"
re_del_local="git$S+branch${SEP}$S(-D|-d|--delete)($S|\$)"
re_repo="gh$S+repo$S+(edit|delete|rename|archive|unarchive|deploy-key)"
re_owner_cmd="gh$S+(secret|variable|ruleset|label|ssh-key|gpg-key|auth$S+(login|logout|refresh|token))"
re_workflow="gh$S+workflow$S+(enable|disable)"
re_api="gh$S+api"
re_api_mutating="(-X|--method)[[:space:]=]*(POST|PATCH|PUT|DELETE)"
re_api_fields="$S(-f|-F|--field|--raw-field|--input)$S"
re_api_allowed="repos/[^/[:space:]]+/[^/[:space:]]+/(issues|pulls)(/|[[:space:]\"']|\$)"
re_owner_label_any="(human-approved|(^|[^-a-z])approved([^-a-z]|\$))"
re_label_edit="gh$S+(issue|pr)$S+(edit|create)"
re_label_flag="--(add|remove)-label|--label"
re_shell_write="(>|tee$S|sed$S+-i|cp$S|mv$S|rm$S|truncate$S|git$S+(rm|mv)$S)${SEP}\.(github|claude)/"

# git: force push, push to main, branch deletion
if [[ $flat =~ $re_push ]]; then
  [[ $flat =~ $re_force ]] && block "force pushes are not allowed."
  [[ $flat =~ $re_del_remote ]] && block "deleting remote branches is not allowed."
  [[ $flat =~ $re_push_main ]] && block "pushing to main is not allowed; open a pull request."
fi
[[ $flat =~ $re_del_local ]] && block "deleting branches is not allowed."

# gh: repository settings and other owner-only operations
[[ $flat =~ $re_repo ]] && block "changing repository settings is not allowed."
[[ $flat =~ $re_owner_cmd ]] && block "gh ${BASH_REMATCH[1]} is not allowed."
[[ $flat =~ $re_workflow ]] && block "enabling or disabling workflows is not allowed."

# gh api: mutating calls only on issues, pull requests and comments
if [[ $flat =~ $re_api ]] && { [[ $flat =~ $re_api_mutating ]] || [[ $flat =~ $re_api_fields ]]; }; then
  if [[ $flat =~ gh$S+api$S+graphql ]]; then
    if [[ $flat =~ mutation ]] && ! [[ $flat =~ (addComment|updateIssueComment) ]]; then
      block "GraphQL mutations other than comments are not allowed; use gh issue/pr commands."
    fi
  elif ! [[ $flat =~ $re_api_allowed ]]; then
    block "gh api calls that change anything other than issues, pull requests or comments are not allowed."
  fi
  if [[ $flat =~ issues/[0-9]+/labels ]]; then
    [[ $flat =~ $re_owner_label_any ]] && block "owner-only labels cannot be changed by agents."
    [[ $flat =~ infra-change ]] && [[ $role != planner ]] && block "infra-change is added only by the owner or the planner."
  fi
  [[ $flat =~ git/refs ]] && block "changing git refs through the API is not allowed."
fi

# Owner-only labels through gh issue/pr edit or create
if [[ $flat =~ $re_label_edit ]] && [[ $flat =~ $re_label_flag ]]; then
  [[ $flat =~ human-approved ]] && block "human-approved is added only by the owner."
  [[ $flat =~ (^|[^-a-z])approved([^-a-z]|$) ]] && block "approved is added only by the owner."
  [[ $flat =~ infra-change ]] && [[ $role != planner ]] && block "infra-change is added only by the owner or the planner."
fi

# Shell writes into protected paths
if [[ $flat =~ $re_shell_write ]] && [[ ! $flat =~ \.claude/state/ ]] && ! infra_task; then
  block "writing under .github/ or .claude/ needs an issue labelled infra-change (protected path)."
fi

exit 0
