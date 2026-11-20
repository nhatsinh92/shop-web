---
name: Epic
about: Tracks one epic file in plans/epics/. The owner labels it `approved` before tasks are created.
title: "Epic: <name>"
labels: [epic]
---

Epic file: plans/epics/<name>.md (merged in #<PR>)
Phase: <n>

The planner creates task issues only after this issue is labelled `approved`.
Task issues reference it with `Epic: #<this issue>`.
