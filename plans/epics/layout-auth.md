# Epic: Layout + auth

Phase 2 · repository `shop-web` · areas `layout`, `auth`, `e2e` · tracking issue: _created with this
PR_

## Goal

Give the shop a session: the header shows the right account entry from the first paint without
the root layout reading cookies, users log in on `/login`, `proxy.ts` refreshes tokens before
authenticated pages render, and logout clears every trace of the user in the browser (query cache
and IndexedDB). The login, refresh and logout journeys pass in Playwright.

## Scope

In scope:

- Auth mock handlers (`/api/auth/login`, `refresh`, `logout`, `me`) typed from the contract, for
  unit tests and `make dev-mock`.
- A client session hint read from the non-httpOnly `logged_in` cookie, and the header account
  slot: "Đăng nhập" for guests, "Tài khoản" for signed-in users.
- `/login` with React Hook Form + Zod, error messages from `src/lib/api/error-messages.ts`, and a
  safe return path.
- `src/proxy.ts` matched on `/cart`, `/account/:path*` and `/checkout`, refreshing tokens close to
  expiry before render.
- A minimal `/account` page (profile from `GET /api/auth/me`, logout button) so logout has a
  place in the UI.
- Logout and session-expiry cleanup: `queryClient.clear()`, removal of the persisted IndexedDB
  cache, navigation to `/login`.
- Playwright journeys for login, refresh and logout against a stub gateway.

Out of scope: registration, password reset, account settings, order history (the account page
only shows the profile and logout); guest cart merge on login (Cart epic, Phase 4); member price
and recommendations (Phase 3); the `cart_count` hint cookie (Phase 6).

## Decisions

See `docs/handoff/technical-notes.md` § 1 (logout cleanup), § 3 (no cookies in the root layout,
hint cookies) and § 5 (auth flows). The owner decision of 2026-11-20 on shop-api#2 applies:
tokens come only in `Set-Cookie`, so `proxy.ts` reads the rotated tokens from the `Set-Cookie`
headers of the refresh response, not from a JSON body as in the illustrative snippet.

| Topic                                  | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Root layout                            | `src/app/layout.tsx` and `src/app/(shop)/layout.tsx` never call `cookies()`, `headers()` or read `searchParams`. The header stays a Server Component in the static shell; the account entry is a client component passed in as a slot, like `CartBadge`.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Session hint                           | `useSessionHint()` reads `logged_in` from `document.cookie` with `useSyncExternalStore` (server snapshot: unknown). Unknown renders a neutral placeholder of the same size, so there is no layout shift. The hint only picks the UI; it is never trusted for authorisation.                                                                                                                                                                                                                                                                                                                                                                                                    |
| Feature placement                      | Session hint, login form, logout and the account entry live in `src/features/auth/` (a protected, security-sensitive path: those PRs need `infra-change` from the planner and the owner's `human-approved`). The account page view lives in `src/features/account/`; `app/` composes both.                                                                                                                                                                                                                                                                                                                                                                                     |
| Login                                  | `/login` is a static shell with a client form (RHF + Zod: email, password ≥ 1 character; server rules stay on the server). On success: invalidate the `auth` query keys, then `router.replace(next)`. `next` is accepted only as a same-origin relative path starting with a single `/`; anything else falls back to `/`. The form reads `next` with `useSearchParams()` inside a `<Suspense>` boundary, so the page shell stays prerendered. `AUTH_INVALID_CREDENTIALS` and `RATE_LIMITED` show their messages from the error map next to the form.                                                                                                                           |
| Current user                           | `authKeys.me` with `queryOptions()` calling `GET /api/auth/me`; never persisted to IndexedDB (no `meta.persist`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `proxy.ts`                             | Decodes only the `exp` of `access_token` (no verification; the gateway verifies). Refreshes when it expires within 60 seconds, and also when there is no `access_token` cookie at all but a `refresh_token` is present (the browser drops the access cookie when its `Max-Age` ends), by calling `POST /api/auth/refresh` on `CORE_INTERNAL_URL` with the `refresh_token` cookie, then copies the `Set-Cookie` headers to the response and rewrites the request `cookie` header so the current render sees the new tokens. Time budget 300 ms (technical notes § 7); on timeout or failure it continues without refreshing and the browser's single-flight refresh takes over. |
| Unauthenticated requests in `proxy.ts` | `/account/:path*` and `/checkout` without a usable session redirect to `/login?next=<path>`. `/cart` never redirects: guests have a cart (`guest_cart` cookie, owner decision on shop-api#2), so the proxy only refreshes there.                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Logout                                 | `POST /api/auth/logout`, then (also when the call fails) `queryClient.clear()`, expire the non-httpOnly `logged_in` hint cookie on the client (so the header shows the guest entry even if the server never cleared it), delete the persisted cache key from IndexedDB (`src/lib/query/persister.ts`), `router.replace('/')`. The same cleanup runs from `onSessionExpired` (`src/lib/api/refresh.ts`), followed by navigation to `/login`.                                                                                                                                                                                                                                    |
| Copy and design                        | No artboard covers `/login` or `/account`. They use the existing tokens and `components/ui` primitives (Input, Label, Button), the content width and spacing of the Cart artboard, and Vietnamese copy that the worker lists in the PR for the owner's review (see open question 1).                                                                                                                                                                                                                                                                                                                                                                                           |
| E2E backend                            | Browser-side MSW does not intercept server-side fetches from `proxy.ts`, so Playwright starts a small stub gateway (Node `http` server in `e2e/support/`, responses typed from the generated contract types) and the app with `GATEWAY_URL` and `CORE_INTERNAL_URL` pointing at it. The stub issues short-lived fake tokens so the refresh journey runs in seconds. Adding it to `playwright.config.ts` is a protected change (`infra-change`).                                                                                                                                                                                                                                |

## Gateway behaviour this epic relies on

shop-api's Auth + gateway epic (owner decisions 2026-11-22): the gateway **strips an invalid or
expired access cookie and forwards the request anonymously** instead of answering 401, and it
**never rate limits `/api/cart/**`**. So a signed-in user whose access token is no longer usable
gets guest answers from public and optional-auth operations rather than a 401. `proxy.ts`
(refresh on a missing or expiring access token) covers `/cart`, `/account/*` and `/checkout`
server side; client-side gaps on optional-auth operations are handled in the epics that add them
(member price in Phase 3, cart in Phase 4).

## Contract impact

None. Every operation used here is in `@shop/api-contract` 1.0.0, which the app already pins. If
shop-api's Auth + gateway epic releases `1.1.0` (gateway-level 403 and 429 responses), pinning
it is a small follow-up task; the client already maps those codes.

## Expected tasks (the planner details them after approval)

1. [auth] Typed MSW handlers and fixtures for the four auth operations (S).
2. [auth] Session hint hook and the header account entry, composed by `(shop)/layout.tsx`; a
   build check that `/` stays prerendered (S, `infra-change`: `src/features/auth/**`).
3. [auth] `/login` page with RHF + Zod, error messages and safe `next` (M, `infra-change`).
4. [auth] `proxy.ts` refresh before render, with redirect rules and the time budget (M,
   `infra-change`: `src/proxy.ts`).
5. [auth] Logout and session-expiry cleanup (query cache, IndexedDB, navigation) (S,
   `infra-change`).
6. [layout] `/account` page with the profile and the logout button (S).
7. [e2e] Stub gateway and Playwright journeys: login, refresh on an expiring token, logout,
   redirect to login from `/account` (M, `infra-change`: `playwright.config.ts`, `e2e/**`).

Dependencies: 1 first; 2, 3 and 4 after 1; 5 after 3; 6 after 2 and 5; 7 after 3, 4 and 5.
Tasks 2–5 and 7 need the owner's `human-approved` label; 1 and 6 merge on the agent review.

## Risks and mitigations

| Risk                                                          | Mitigation                                                                                                                                                                |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A hidden `cookies()` call makes the whole shell dynamic       | Task 2 adds a check that `next build` reports `/` as prerendered; any dynamic read must sit in a `<Suspense>` hole.                                                       |
| Refresh storms when many tabs or SSR requests refresh at once | Browser refresh is single-flight (Phase 1); the backend grace period accepts parallel refreshes of the same token; `proxy.ts` refreshes only within 60 seconds of expiry. |
| Open redirect through `next`                                  | Only same-origin relative paths are accepted; unit tests cover `//evil.example`, absolute URLs and `javascript:`.                                                         |
| Stale user data after logout on a shared device               | Logout clears the query cache and the IndexedDB key even when the API call fails; a unit test asserts both.                                                               |
| `proxy.ts` on the hot path at peak                            | Matched only on `/cart`, `/account/*` and `/checkout`, decode-only fast path, 300 ms budget with fall-through.                                                            |
| Many PRs wait for the owner                                   | Non-protected tasks (1, 6) and shop-api work continue meanwhile; tasks are small.                                                                                         |

## Done when

- `next build` reports `/` as prerendered, and neither root nor shop layout reads cookies, headers
  or `searchParams` (checked in task 2).
- Playwright (desktop and phone, with axe) passes: log in on `/login` → header shows "Tài khoản";
  an expiring access token on `/account` is refreshed by `proxy.ts` before render; logout returns
  to the guest header and leaves no persisted query cache in IndexedDB and no `logged_in` cookie, also when the logout call fails.
- `make lint test` and `make e2e` are green on `main`.
- After shop-api's Auth + gateway epic is merged, the same journeys pass manually against
  `make demo` (noted in the epic's closing comment).

## Owner decisions (2026-11-22)

1. **Login and account design:** built from the existing tokens and primitives; the worker lists
   the Vietnamese copy in the PR for the owner's review.
2. **Where login is reached:** a full `/login` page only; no header dialog in this phase.
3. **`/cart` for guests:** `proxy.ts` never redirects `/cart` to login; it only refreshes there.
