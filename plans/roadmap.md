# shop-web roadmap

Derived from the approved build plan (`docs/handoff/shop-build-plan.md`, "Frontend plan"). The
owner approves this roadmap and each epic; the planner turns approved epics into task issues.
Next.js 16 (App Router, `cacheComponents: true`), TanStack Query v5, Zustand, React Hook Form + Zod,
Tailwind CSS v4 + shadcn/ui, pnpm. UI source of truth: `design/` and the live canvas.

| Phase | Epic                                        | Deliverables                                                                                                                                                                             | Done when                                                                      | Status                             |
| ----- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------- |
| 0     | Bootstrap                                   | Next.js scaffold, Tailwind theme + shadcn/ui primitives, ESLint boundaries, providers, MSW, Playwright, CI + merge-gate, CLAUDE.md, a reference feature, picker scripts and role prompts | `make demo` serves a production build; lint blocks cross-feature imports       | In review (PR #1)                  |
| 1     | [Contract client](epics/contract-client.md) | Generated types and client from `@shop/api-contract`, error mapping, single-flight refresh                                                                                               | Bumping the package regenerates types; a breaking change fails the build       | Epic drafted, waiting for approval |
| 2     | Layout + auth                               | Header (client badge and account), login page, `proxy.ts`, logout clears query cache and IndexedDB                                                                                       | Root layout reads no cookies; login and refresh journeys pass                  | Not started                        |
| 3     | Home + PDP                                  | Static shells, cached flash sale and product data with tags, streamed member price and recommendations, revalidation webhook route                                                       | Home and PDP match artboards; streamed holes time out gracefully               | Not started                        |
| 4     | Cart                                        | Static shell, streamed cart with 250 ms budget, hydration + IndexedDB persistence, optimistic updates with 400 ms debounce, stale banner                                                 | All three cart states match the artboard; slowed backend shows the stale state | Not started                        |
| 5     | Checkout                                    | Dynamic page, RHF + Zod form, reservation countdown, `Idempotency-Key` on submit, mock payment outcomes                                                                                  | Double click places one order; failures show recoverable errors                | Not started                        |
| 6     | Peak readiness                              | Feature flags for optional holes, Lighthouse budgets, `cart_count` hint cookie, load-test journeys                                                                                       | Lighthouse budgets pass; flags switch holes off without errors                 | Not started                        |

## Cross-repo dependencies

- Phase 1 needs at least a pre-release of `@shop/api-contract` from shop-api's Contract v1 epic;
  1.0.0 closes it.
- Phases 2–5 build against MSW mocks generated from the contract, and switch to the real gateway
  when the matching shop-api phase is merged.

## Deviations from the plan, decided during bootstrap

| Topic                   | Plan                           | Now                                               | Why                                                                                                        |
| ----------------------- | ------------------------------ | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Contract package source | npm package on GitHub Packages | Pinned GitHub Release tarball URL from shop-api   | GitHub Packages needs an owner-matching scope and a token even for public packages; approved by the owner. |
| Toast primitive         | shadcn/ui Toast                | shadcn/ui Sonner (`src/components/ui/sonner.tsx`) | shadcn/ui replaced its Toast component with Sonner.                                                        |
| `cn()` helper           | `clsx` + `tailwind-merge`      | Same, kept as planned                             | shadcn now defaults to its `cn` package; the plan's choice was kept.                                       |

## Housekeeping tasks (infra, not tied to a phase)

- New-code coverage gate (80%) in CI (today the reviewer checks it from the coverage report).
