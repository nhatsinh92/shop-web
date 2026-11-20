# Epic: Contract client

Phase 1 · repository `shop-web` · area `contract-client` · tracking issue: _created with this PR_

## Goal

Make `@shop/api-contract` the only source of API shapes in shop-web: generated types, a typed
client with the agreed error mapping and single-flight token refresh, and MSW handlers checked
against the contract. Bumping the package regenerates everything; a breaking change fails the
build.

## Scope

In scope:

- Install the contract package from its pinned GitHub Release tarball URL.
- Generate TypeScript types from the bundled specs; commit the output; CI fails on drift.
- A typed browser client for `/api/*` (cookies included) with Problem → `ApiError` mapping and the
  single-flight refresh on 401 (`docs/handoff/technical-notes.md` §5).
- A server-side fetch helper for SSR holes (internal network, explicit timeout) — no caching of
  user data.
- Typed MSW handlers for tests and mock mode; the provisional cart summary schema in
  `src/features/cart` moves to the generated types.
- A user-facing message map (Vietnamese copy) for the error codes in `errors.yaml`.

Out of scope: any page or feature UI (Phases 2–5), `proxy.ts` (Phase 2), login flows.

## Decisions

| Topic            | Decision                                                                                                                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Package source   | `pnpm add <release tarball URL>` pinned to an exact version; Renovate-style bumps are manual tasks.                                                                                                                            |
| Type generation  | `openapi-typescript` from the bundled specs into `src/lib/api/generated/` (committed). `pnpm gen:api` regenerates; CI runs it and fails on a diff.                                                                             |
| Client           | `openapi-fetch` wrapped in `src/lib/api/client.ts`: `credentials: 'include'`, Problem parsing into `ApiError { status, code, detail }`, single-flight refresh via `POST /api/auth/refresh`, one retry.                         |
| Server fetch     | `src/lib/api/server.ts`: same types, base URL from `CORE_INTERNAL_URL` / `CART_INTERNAL_URL`, `AbortSignal.timeout(budget)`, never inside `'use cache'` with user data.                                                        |
| Mocks            | `openapi-msw` typed handlers in `mocks/`, so a handler that does not match the contract fails type-checking. (Compatibility with MSW 3 is checked in the first task; fallback: hand-typed handlers using the generated types.) |
| Error messages   | `src/lib/api/error-messages.ts` maps each `code` to Vietnamese copy; unknown codes fall back to a generic message.                                                                                                             |
| Breaking changes | A breaking contract change surfaces as TypeScript errors in `make lint` (tsc) and therefore fails CI.                                                                                                                          |

## Expected tasks (the planner details them after approval)

1. Install the contract package and generate types with a drift check in CI (S; touches CI → `infra-change`).
2. Typed client with Problem → `ApiError` mapping (S).
3. Single-flight refresh on 401 with tests for concurrent requests (S).
4. Server fetch helper with time budgets (S).
5. Typed MSW handlers; migrate the cart badge to generated types (M).
6. Error-code message map (S).

Task 1 depends on a shop-api pre-release (`shop-api` Contract v1 task "Conventions and shared
components" at least); tasks 2–6 depend on task 1.

## Risks and mitigations

| Risk                                     | Mitigation                                                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| The contract is not released yet         | Start from the first `0.x` pre-release; the version is pinned, so later bumps are explicit tasks.                   |
| Generated code churn makes reviews noisy | Generated files live in one folder, are excluded from lint and coverage, and are reviewed only for the drift check. |
| `openapi-msw` lags behind MSW 3          | Verified in task 5; fallback is hand-typed handlers using the generated types.                                      |
| Refresh storms at peak                   | Single-flight refresh and one retry only; refresh failures clear the session and go to login.                       |

## Done when

- `pnpm add` of a new contract version followed by `pnpm gen:api` updates the generated types, and
  CI fails if they are not committed.
- A breaking change in the contract (for example a renamed field used by the app) fails
  `make lint`.
- Unit tests cover error mapping, single-flight refresh (N parallel 401s → one refresh call) and
  the server fetch timeout.
