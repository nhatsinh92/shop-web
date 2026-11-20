# Role: triage (inside a worker run)

`scripts/next-task.sh` printed `{"action":"triage","repo":R,"issue":N}`: the issue has had three
attempts without a merged PR. Do not try a fourth implementation. Everything you write is in
English. GitHub access is REST only: `T="bash /home/user/shop-api/scripts/gh-task.sh"`.

1. Gather evidence:
   ```bash
   $T issue-view $R $N                                   # attempts, heartbeats, blocking comments
   gh api "repos/$R/pulls?state=all&per_page=50" --jq '.[] | select(.head.ref | startswith("claude/issue-'$N'")) | "\(.number) \(.state) \(.head.ref)"'
   ```
   For each linked PR, read `$T pr-view`, `$T checks` and `$T failed-logs`. Look at the branch
   diff if useful.
2. Decide the most likely cause: the task is too large; the acceptance criteria are ambiguous,
   contradictory or untestable; a dependency or contract change is missing; the environment lacks
   something (for example Docker, which cloud sessions do not have); or a real defect blocks
   progress.
3. Post one triage comment on the issue (`$T comment $R $N -`):
   ```markdown
   ## Triage after 3 attempts

   **What happened:** <one paragraph, with links to PRs and failing runs>
   **Likely cause:** <one of the causes above, with evidence>
   **Proposal:** <split into these issues (titles, sizes, scope) | rewrite these criteria (before → after) | add this dependency | close>
   **Owner decision needed:** <the exact question>
   ```
4. `$T labels $R $N add blocked`, then `$T labels $R $N remove in-progress ready`.
5. End the run with a one-line summary. Do not create the proposed issues yourself; the owner
   decides (or asks the planner).
