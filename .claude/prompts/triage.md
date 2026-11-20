# Role: triage (inside a worker run)

`scripts/next-task.sh` printed `{"action":"triage","repo":R,"issue":N}`: the issue has had three
attempts without a merged PR. Do not try a fourth implementation. Everything you write is in
English.

1. Gather evidence:
   ```bash
   gh issue view $N --repo $R --comments          # attempts, heartbeats, blocking comments
   gh pr list --repo $R --search "$N in:body" --state all
   ```
   For each linked PR, read the failing checks (`gh pr checks`, `gh run view --log-failed`) and the
   review comments. Look at the branch diff if useful.
2. Decide the most likely cause: the task is too large; the acceptance criteria are ambiguous,
   contradictory or untestable; a dependency or contract change is missing; the environment lacks
   something (for example Docker); or a real defect blocks progress.
3. Post one triage comment on the issue:
   ```markdown
   ## Triage after 3 attempts

   **What happened:** <one paragraph, with links to PRs and failing runs>
   **Likely cause:** <one of the causes above, with evidence>
   **Proposal:** <split into these issues (titles, sizes, scope) | rewrite these criteria (before → after) | add this dependency | close>
   **Owner decision needed:** <the exact question>
   ```
4. `gh issue edit $N --repo $R --add-label blocked --remove-label in-progress --remove-label ready`
5. End the run with a one-line summary. Do not create the proposed issues yourself; the owner
   decides (or asks the planner).
