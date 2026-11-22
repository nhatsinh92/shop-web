# Epic: Home + PDP

Phase 3 · repository `shop-web` · areas `contract-client`, `catalog`, `home`, `pdp`, `cart`,
`revalidation`, `infra`, `e2e` · tracking issue: _created with this PR_

## Goal

Build the home page and the product page to their artboards with the render strategy tagged on
them: static shells from the CDN, shared data in `'use cache'` holes tagged for revalidation
(flash sale for minutes, product info for hours, price and stock for seconds), user-aware holes
(recommendations on the home page, member price on the product page) streamed in `<Suspense>` with
a time budget and a graceful fallback,
and a signed webhook route that runs `revalidateTag` when shop-api publishes `product.updated`
(shop-api Phase 3, Product).

## Scope

In scope:

- Pin `@shop/api-contract` `1.2.0` (the release of shop-api's Product epic) and regenerate types.
- MSW handlers and fixtures for the six product operations, built from the seed data.
- Build-time data: `next build` prerenders cached holes, so it needs a core; a fixture server
  serves the fixtures when no `CORE_INTERNAL_URL` is set (see Decisions).
- A `catalog` feature: server fetchers with `cacheLife` / `cacheTag`, the product card, VND
  formatting, the flash sale section, the product page components, similar products,
  recommendations (home only) and the member price.
- Home `/`: hero, flash sale with countdown, featured categories, recommendations
  (`design/Main.dc.html`).
- Product page `/product/[slug]`: breadcrumb, gallery, title, price and stock, member price,
  variant selection, quantity, add to cart, service info, description, similar products
  (`design/PDP.dc.html`).
- Add to cart on the product page with the toast and an optimistic badge update, through the
  `cart` feature (owner decision 1).
- `POST /hooks/revalidate`: verifies the signature and revalidates the tags.
- Playwright journeys for home and the product page (desktop and phone, axe), including a slow
  recommendations / member-price backend.

Out of scope: search, category pages and filters (category links are static, owner decision 3);
recommendations on the product page (the PDP artboard has none; it shows similar products); the
wishlist (named in the plan's rendering table, but there is no artboard element and no contract
operation); reviews and ratings; the cart page and optimistic quantity updates with debounce (Cart,
Phase 4); the delivery-date estimate (feature-flagged optional hole, Phase 6); vouchers; Lighthouse
budgets and feature flags (Phase 6).

## Decisions

See `docs/handoff/technical-notes.md` § 1 (state ownership), § 3 (caching rules), § 7 (time
budgets and fallbacks) and the rendering table in `docs/handoff/shop-build-plan.md`. Before using
`cacheLife`, `cacheTag`, `revalidateTag` or `generateStaticParams`, read
`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/` (Next.js 16 changed them).

| Topic                    | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Feature placement        | Features never import each other, and the flash sale, recommendations, similar products and the product page all render the same product card, so all product UI and data lives in one feature, `src/features/catalog/` (files split by reason: `catalog.server.ts` fetchers, `components/product-card.tsx`, `components/flash-sale-section.tsx`, `components/member-price.tsx`, …). Add to cart lives in `src/features/cart/` and is passed into the product page as a slot by `app/`. The webhook lives in `src/features/revalidation/`. VND formatting (`890.000₫`) goes to `src/lib/format.ts`.                                                                                                                                                                                                                                                                                                                                                                                      |
| Server data              | Shared data is read by the Next.js server from `core` over the internal network with `serverApi("core", …)` (`src/lib/api/server.ts`) inside `'use cache'` functions. Fetch errors are thrown, never cached as empty data, so the previous good value keeps being served (stale-while-revalidate). Expected "no data" answers are values, not errors: `FLASH_SALE_NONE` (404) is cached as `null` by the flash sale function (same `cacheLife('minutes')` and tag `flash-sale`), so home requests outside a sale do not reach `core`; `PRODUCT_NOT_FOUND` maps to `notFound()`.                                                                                                                                                                                                                                                                                                                                                                                                          |
| Cache lifetimes and tags | Flash sale: `cacheLife('minutes')`, tag `flash-sale`. Product detail by slug: `cacheLife('hours')`, tag `product-{id}` (the id from the response) and `products`. Availability by SKU: `cacheLife('seconds')`, tag `product-{id}`; `seconds` is excluded from prerenders (expire under 5 minutes), so the price and stock block sits in its own `<Suspense>` with a skeleton. Similar products: `listProducts?category=<leaf slug>&limit=6`, `cacheLife('hours')`, tag `products`, current product removed, five shown (artboard tag `CACHE · hours`; recommendations are private and cannot be cached).                                                                                                                                                                                                                                                                                                                                                                                 |
| Home                     | `src/app/(shop)/page.tsx` stays prerendered: hero and category tiles are static, the flash sale is a cached hole in the shell, the countdown is a client component counting to `endsAt` (server time from the response, no `Date.now()` during render). No sale (`null`, see Server data) or a countdown reaching zero hides the section. Card prices: the sale price, struck `listPrice ?? price`, and `-{round(100 × (1 − salePrice / (listPrice ?? price)))}%` (the seed numbers in shop-api's Product epic give the artboard values). Card stock line from `soldPercent`: ≥ 80 → "Sắp hết", otherwise "Đã bán {soldPercent}%" (the contract has no sold count; owner decision 2).                                                                                                                                                                                                                                                                                                    |
| Product page             | `src/app/(shop)/product/[slug]/page.tsx`. `generateStaticParams` returns the slugs of the current flash sale plus the first page of `listProducts` (Cache Components requires at least one; a build without data fails loudly instead of producing an empty route). Other slugs render on first request and are cached (ISR). `PRODUCT_NOT_FOUND` → `notFound()`. The price box shows the availability price; next to it the struck price `listPrice ?? price` of the product detail and `-{round(100 × (1 − shown / struck))}%`, both only when the struck price is higher than the shown price (`Availability` has no list price; during a flash sale its price is the sale price, so the ANC Pro shows 890.000₫, struck 1.790.000₫, −50 % as on the artboard); "Flash sale 12.12" label and the sold bar when the SKU is in the cached flash sale; stock line "Sắp hết · còn khoảng {approxQuantity} sản phẩm" when `LOW`, "Hết hàng" (and add to cart disabled) when `OUT_OF_STOCK`. |
| Variants and quantity    | Selected variant and quantity are UI state in a small Zustand store created per product page (store factory + context, technical notes § 1); variant buttons are a Radix `RadioGroup` with the colour names from `variants[].options`; quantity 1–10. Rating, review count and sold count on the artboard have no contract field and are left out (owner decision 2; the PDP's "Đã bán 12,4k" is left out too).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Recommendations          | Home page only (the PDP artboard has no recommendations; its "Sản phẩm tương tự" block is the cached similar products). A Server Component inside `<Suspense>` reads the access cookie, calls `listRecommendations` (no `productSlug`) with a 250 ms budget, and forwards the token as Bearer when present. Timeout or error → renders nothing (artboard: "timeout → ẩn"); the skeleton matches the artboard's loading state. The "Vì bạn đã xem …" line is dropped: the contract has no reason field and the backend list is not personalised (owner decision 2).                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Member price             | A Server Component inside `<Suspense>` ("đọc cookie trong Suspense") with a 250 ms budget. Access cookie present → `getMemberPrice`; 200 → "Giá thành viên {tier} của bạn: {price}". Guests (no cookie and no `logged_in` hint) → a "Đăng nhập để xem giá thành viên" link to `/login?next=/product/<slug>`. Timeout, 401 or no access cookie while `logged_in=1` → a client component fetches it through `/api/*` with `useQuery` (`catalogKeys.memberPrice(slug)`, never persisted), so the single-flight refresh covers an expired token (the gap noted in the Layout + auth epic). The voucher line of the artboard is left out (no contract data). The product page is not added to the `proxy.ts` matcher.                                                                                                                                                                                                                                                                         |
| Add to cart              | `AddToCartButton` in the `cart` feature, optimistic as the artboard tag says (`CLIENT → gateway · optimistic`): on click it cancels in-flight `cartKeys` queries, adds the quantity to the cached summary count with `setQueryData` (the header badge updates at once) and shows the Sonner toast "Đã thêm {n} sản phẩm vào giỏ" with "Xem giỏ"; then `POST /api/cart/items` with the selected SKU and quantity through the browser client. On error it restores the previous summary and shows the mapped error message; on settle it invalidates `cartKeys`. No debounce (quantity bursts belong to the cart page, Phase 4). Against MSW until shop-api's Cart epic is merged.                                                                                                                                                                                                                                                                                                         |
| Revalidation route       | `src/app/hooks/revalidate/route.ts` (not under `/api/*`, which the ingress sends to the gateway). Verifies `X-Shop-Signature` (HMAC-SHA256 of `<t>.<raw body>` with `REVALIDATE_SECRET`, constant-time compare, `t` within 5 minutes), validates the body with Zod against the contract's webhook schema, accepts only tags matching `products`, `flash-sale` or `product-<uuid>`, and calls `revalidateTag(tag, { expire: 0 })` for each, so the next request gets fresh data (with `'max'` the next request would still be served the stale value, see the `revalidateTag` doc; `updateTag` exists only in Server Actions). This is affordable because shop-api sends webhooks only for price and detail changes, never for stock-only changes. 204 on success, 401 on a bad signature, 400 on a bad body; no secret configured → 404.                                                                                                                                                 |
| Build-time data          | CI and `make build` have no backend. A small fixture server (`scripts/fixture-core.ts`, serving the MSW fixtures over HTTP for the product operations) is started by `make build` when `CORE_INTERNAL_URL` is not set, and stopped after the build. `make demo` with the shop-api demo running builds against the real core. The CI workflow is not changed (it calls `make build`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| E2E                      | The stub gateway (`e2e/support/stub-gateway.ts`) gets the product operations from the same fixtures plus a slow scenario (delayed recommendations and member price) to prove the fallbacks. Editing an existing `e2e/**` file is a protected change (`infra-change`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

## Contract impact

None requested from this repository. It consumes shop-api `1.2.0` (the `productRevalidate` webhook
schema and `ProductUpdated`); until that release exists the pin task waits. Every other
operation used here is in `1.0.0`.

## Expected tasks (the planner details them after approval)

1. [contract-client] Pin `@shop/api-contract` `1.2.0` and regenerate types (S).
2. [catalog] Typed MSW handlers and fixtures for the six product operations from the seed data (S).
3. [infra] Fixture core server for `make build` without a backend (S).
4. [catalog] Server fetchers with `cacheLife` / `cacheTag`, `formatVnd`, the product card (M).
5. [home] Home page: hero, flash sale section with countdown, category tiles; `/` stays
   prerendered (M).
6. [catalog] Recommendations hole on the home page with 250 ms budget, skeleton and
   hide-on-timeout (S).
7. [pdp] Product page route: `generateStaticParams`, breadcrumb, gallery, description, similar
   products, not found (M).
8. [pdp] Price and stock block (availability and flash sale), variant and quantity selection (M).
9. [pdp] Member price hole with guest prompt and client fallback (M).
10. [cart] Add to cart button with optimistic badge update, rollback and toast, composed into the
    product page (S).
11. [revalidation] Signed `POST /hooks/revalidate` with tag allowlist (S).
12. [e2e] Home and product page journeys with axe, desktop and phone, and the slow-hole scenario
    (M, `infra-change`: existing `e2e/support/stub-gateway.ts`).

Dependencies: 2 and 3 first (3 after 2); 4 after 2 and 3; 5 and 7 after 4; 6 after 5; 8 after 7;
9 after 8; 10 after 8; 11 after 1; 12 after 5–10. Task 1 waits for shop-api's contract task. Only task 12 touches a protected path and needs
`infra-change` and the owner's `human-approved`.

## Risks and mitigations

| Risk                                                                  | Mitigation                                                                                                                                                                                                      |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A hole reads cookies outside `<Suspense>` and the shell turns dynamic | The existing static-shell test plus a build check that `/` and a seeded `/product/<slug>` are reported as (partially) prerendered.                                                                              |
| User data leaks into a shared cache                                   | Member price and recommendations never run inside `'use cache'`; a unit test asserts their fetchers are not cached and send `Authorization` only from the request's cookie.                                     |
| A slow backend holds the stream                                       | 250 ms budgets through `serverApi`; Playwright's slow scenario checks the page completes and the holes fall back.                                                                                               |
| Builds fail without a backend                                         | Fixture server for `make build`; real data in `make demo`.                                                                                                                                                      |
| A forged webhook flushes the cache at peak                            | HMAC with timestamp, tag allowlist, secret from environment only; route tests cover bad signature, old timestamp and unknown tags.                                                                              |
| `revalidateTag` reaches only the instance that received the webhook   | One instance in the MVP and the demo. Several replicas at peak need a shared cache handler (or a fan-out of the webhook); planned with peak readiness (Phase 6), meanwhile the cache lifetimes bound staleness. |
| A flash sale starts with no event                                     | No product changes when a window opens, so no webhook fires; `cacheLife('minutes')` shows the new sale within minutes. Warm-up at the window start is Phase 6.                                                  |
| Countdown hydration mismatch                                          | Countdown is client-only and starts from `endsAt` after mount; the server renders the static label.                                                                                                             |

## Done when

- Home and the product page match their artboards at 1280 px and stack at 390 px, with axe clean,
  in Playwright against a production build.
- `next build` reports `/` and the seeded product pages as prerendered, with dynamic holes only for
  recommendations on `/` and for price and stock and the member price on the product pages.
- With the stub's slow scenario, both pages finish rendering, recommendations are hidden and the
  member price falls back to the client fetch.
- A signed webhook with `product-{id}` makes the very next request show the changed price (route
  test plus, after shop-api's Product epic is merged, a manual check against `make demo` noted in
  the epic's closing comment).
- `make lint test` and `make e2e` are green on `main`.

## Owner decisions (2026-11-22)

1. **Add to cart in this phase:** built now against MSW, optimistic as the artboard tag says (badge
   count updated in the query cache, rolled back on error). Debounced quantity bursts stay in the
   Cart epic.
2. **Artboard data the contract does not have:** left out without extending the contract: rating
   and review count, sold counts ("Đã bán 640", "Đã bán 12,4k"; the flash sale card shows the
   percentage), the recommendation reason, the voucher line and the delivery date.
3. **Category navigation:** header categories and the "Danh mục nổi bật" tiles stay static copy
   with no target page in the MVP.
