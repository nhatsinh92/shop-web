# shop-web — agent guide

Frontend of "Mây", a high-traffic e-commerce app for the 12.12 sale. This repository is built mostly
by Claude Code cloud sessions (worker, reviewer, planner) started by scheduled tasks. Read this file,
`AGENTS.md` (Next.js 16 docs ship in `node_modules/next/dist/docs/`; read them, not your memory)
and your role prompt in `.claude/prompts/` before working.

## Language

Everything written into this repository is **English**: code, comments, docs, issues, PR titles and
descriptions, review comments, commit messages and branch names. User-facing UI copy is
Vietnamese, taken from the design files.

## Stack

- Next.js 16 App Router with `cacheComponents: true` and `partialPrefetching: true`, Turbopack,
  React 19, TypeScript strict (`noUncheckedIndexedAccess`), pnpm.
- Server data: TanStack Query v5 (IndexedDB persistence wired in `src/lib/query/persister.ts`,
  opt-in per query with `meta: { persist: true }`). UI state: Zustand. Forms: React Hook Form + Zod.
- Styling: Tailwind CSS v4 (tokens in `src/app/globals.css`), shadcn/ui on Radix in
  `src/components/ui/`, lucide-react icons, `cn()` from `src/lib/utils.ts`. Font: Be Vietnam Pro via
  `next/font/google`.
- Tests: Vitest + Testing Library + MSW (`mocks/`), Playwright + axe (`e2e/`).
- API contract: `@shop/api-contract`, released by shop-api as a GitHub Release tarball (Phase 1).

## Commands

| Command             | What it does                                                                                    |
| ------------------- | ----------------------------------------------------------------------------------------------- |
| `make install`      | `pnpm install --frozen-lockfile`                                                                |
| `make lint`         | ESLint (feature boundaries, TanStack Query, no raw hex), `next typegen` + `tsc`, Prettier check |
| `make test`         | Vitest unit and component tests with MSW                                                        |
| `make build`        | Production build (`next build`)                                                                 |
| `make demo`         | Production build + `next start` on :3000; `/api/*` is rewritten to the gateway on :8080         |
| `make e2e`          | Playwright smoke + axe against the production build, desktop (1280) and phone (390)             |
| `make test-scripts` | Fixture tests for the picker scripts (needs jq)                                                 |
| `make dev-mock`     | Dev server with MSW answering `/api/*` (no backend needed)                                      |
| `pnpm format`       | Prettier write (also sorts Tailwind classes)                                                    |

Run `make lint test` before every push, and `make e2e` when you touch pages or layout.

GitHub access in Claude Code cloud sessions is **REST only** (GraphQL, and therefore `gh pr` /
`gh issue`, is blocked by the session proxy). Use `scripts/gh-task.sh` for issues, labels,
comments, PRs, checks (`checks-wait`, `failed-logs`) and auto-merge, or `gh api repos/...`.

## Folder conventions (copy the reference feature)

```
src/app/                    routes only; composes features. (shop)/layout.tsx, (shop)/page.tsx
src/features/<name>/
  index.ts                  the feature's public entry (explicit named exports, no export *)
  client.ts                 optional client-safe entry: hooks client components in app/ need; never
                            reaches *.server.ts or server-only code
  api.ts                    browser calls to /api/* (through the gateway, never a route handler)
  queries.ts                query key factory (<name>Keys) + queryOptions() factories
  <thing>.schema.ts         Zod schemas and inferred types
  components/<thing>.tsx    components, with <thing>.test.tsx next to them
  stores/<thing>-store.ts   Zustand stores for UI state only
src/components/ui/          shadcn/ui primitives (a new primitive is its own task)
src/lib/                    http client, query client and persister, mocking, utils
src/proxy.ts                token refresh for /cart, /account/*, /checkout (Phase 2)
mocks/                      MSW handlers (generated from the contract from Phase 1)
e2e/                        Playwright journeys
design/                     design source files (reference only; never import)
```

Reference feature: `src/features/cart` (`CartBadge`, a client component with `useQuery`) composed
into `src/features/site-header` by `src/app/(shop)/layout.tsx`. Copy this shape.

Boundaries (enforced by `eslint-plugin-boundaries`):

- Features never import other features. `app/` composes them (pass components as props/slots).
- `app/` imports a feature only through its `index.ts` (or `client.ts` from a client component).
- Features may import `components/ui` and `lib`; `components/ui` imports only `lib`.
- Files are 150–400 lines, named descriptively (`product-form.tsx`, `product.schema.ts`).

## State, caching and rendering rules

- Server data lives in TanStack Query only, never copied into Zustand. Query keys come from the
  feature's key factory.
- The root layout and any shared shell never read `cookies()`, `headers()` or `searchParams`.
  User-specific UI is a client component or a dynamic hole inside `<Suspense>`.
- Shared data: `'use cache'` + `cacheLife(...)` + `cacheTag(...)`; never cache user data in Next.js.
- Every dynamic hole has a time budget and a fallback (see `docs/handoff/technical-notes.md`).
- The render-strategy tags on the artboards (STATIC / CACHE / STREAM / CLIENT) are acceptance
  criteria.

## Styling rules

- Colours, radii and font sizes come from theme tokens (`bg-brand`, `text-ink`, `rounded-lg`, ...).
  A raw hex colour in `src/` fails lint; only `globals.css` defines colour values.
- No CSS-in-JS runtimes; no inline `style` except computed values (for example a progress width).
- Real buttons, links and labels; visible focus rings; touch targets at least 44 px (`h-touch`);
  contrast at least 4.5:1. axe runs in Playwright.
- Every page matches its artboard at desktop width and stacks cleanly at 390 px.

## What may change and what must not

Each issue's **Scope** section is binding. Protected paths fail the `protected-paths` check unless
the PR carries `infra-change` (added only by the owner or the planner), and `merge-gate` also needs
the owner's `human-approved` label:

- `.github/**`, `.claude/**`
- Lint, type and coverage config: `eslint.config.mjs`, `tsconfig.json`, `vitest.config.mts`,
  `vitest.setup.ts`, `playwright.config.ts`, `.prettierrc.json`, `.prettierignore`
- Existing test files (`*.test.ts(x)`, `e2e/**`) that already exist on `main`

Security-sensitive code (`src/proxy.ts`, `src/features/auth/**`, `next.config.ts`) is **not**
protected (owner decision 2026-11-22): it merges on `agent-approved` and green CI, and the reviewer applies the
security checklist in its prompt.

Never add `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, `.skip` or `.only` to make a check
pass; fix the code. Never edit tests or fixtures so that they pass; if a test is wrong, say so in
the PR and leave it for the owner.

## How to read an issue

Issues follow `.github/ISSUE_TEMPLATE/task.md`: labels, `Depends on`, `Epic`, Context (contract
section, epic section, **design artboard**), Goal, Scope (binding), Acceptance criteria (each needs a
test), Verification (at least `make lint test`, new-code coverage at least 80%), Out of scope.

## When to stop and leave a comment

Stop, comment on the issue (what is unclear, the options, what you need) and end the run instead of
guessing when: a criterion is ambiguous or untestable; the design and the issue disagree; the task
needs a change outside its scope, to a protected path or to the contract; a dependency is missing;
or the same check fails three times for a reason you do not understand. Label the issue `blocked`
when you cannot continue at all.

## Conventions

- Branch `claude/issue-<number>-<short-slug>` (cloud sessions may push only `claude/` branches);
  one issue per PR; PR body has `Closes #<n>`.
- Conventional Commits, small steps, pushed after each step.
