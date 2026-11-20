---
name: Task
about: One PR-sized task (size S or M), written by the planner from an approved epic
title: "[area] Short imperative title"
labels: []
---

## [area] Short imperative title

Labels: area:<area>, phase:<n>, size:<S|M>
Depends on: #<issue> (<why>), #<issue> (<why>) <!-- or "none"; other repo: shop-web#<n> -->
Epic: #<epic issue> (plans/epics/<name>.md)

### Context

- Contract: @shop/api-contract <version> → <file>.yaml <METHOD> <path>
- Epic: plans/epics/<name>.md § <section>
- Design (FE tasks only): <canvas artboard link>

### Goal

<One sentence: the outcome when this task is done.>

### Scope

- May change: <paths>
- Must not change: <paths>

### Acceptance criteria

- [ ] <Checkable by a test or a command>
- [ ] <...>

### Verification

- make lint test pass (and the contract test, when an endpoint is involved)
- New-code coverage ≥ 80%

### Out of scope

<What not to do, with links to the issues that will do it.>
