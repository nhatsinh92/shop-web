# Epic: Checkout

Phase 5 · repository `shop-web` · areas `contract-client`, `cart`, `checkout`, `e2e` · tracking
issue: _created with this PR_

## Goal

Build the checkout page `/checkout` to its artboard (`design/Checkout.dc.html`, tag
`DYNAMIC · no cache · proxy.ts refresh`): the selected cart lines are reserved for 10 minutes with a
visible countdown, the user fills in the shipping address (React Hook Form + Zod), picks a shipping
option and a payment method, and places the order with an `Idempotency-Key`, so a double click
places one order. Failed or timed-out payments, an expired reservation and out-of-stock lines show
recoverable errors. Backed by shop-api's Checkout + order epic (Phase 5), contract `1.4.0`.

## Scope

In scope:

- Pin `@shop/api-contract` `1.4.0`, regenerate types, error messages for the checkout and order
  codes.
- MSW handlers and fixtures for the six checkout and order operations (stateful reservation and
  idempotency store), with scenario overrides.
- A client-safe hook in `src/features/cart` that returns the selected, available cart lines.
- A new feature `src/features/checkout/`: browser calls, query keys, server fetchers with budgets,
  the address schema, the page view (steps, hold banner and countdown, address form, shipping and
  payment options, order summary, place-order button with its three states) and the error states.
- The route `src/app/(shop)/checkout/page.tsx`, composing the cart hook and the checkout feature.
- Playwright journeys for checkout (desktop and phone, axe), including double click, payment
  failure and timeout, expiry and out of stock.

Out of scope: vouchers (the artboard's "Voucher SALE1212 −120.000₫" row; no contract operation, as
decided in the Cart epic); the terms page ("Điều khoản" stays plain text, open question 3); order
history and an order page under `/account`; real payment redirects (the mock answers at once);
feature flags and Lighthouse budgets (Peak readiness, Phase 6); any change to `src/proxy.ts` (it
already refreshes on `/checkout` and keeps the query string in `next`).

## Decisions

See `docs/handoff/technical-notes.md` § 1 (state ownership: form state in RHF + Zod, server data in
TanStack Query), § 3 (user data is never cached in Next.js), § 5 (single-flight refresh and
`proxy.ts`) and § 7 (every dynamic hole has a budget and a fallback). Read
`node_modules/next/dist/docs/` before using `searchParams`, `redirect` and dynamic rendering under
`cacheComponents` (do not rely on memory).

| Topic                | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Route and rendering  | `src/app/(shop)/checkout/page.tsx` is fully dynamic (artboard tag): it reads `searchParams.reservation` inside a `<Suspense>` boundary and never uses `'use cache'`. The slim header ("Mây", "Thanh toán") and the step bar ("✓ Giỏ hàng — 2 Thông tin & thanh toán — 3 Hoàn tất") render outside the hole. `proxy.ts` (Phase 2) already sends a request without a session to `/login?next=/checkout…`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Starting checkout    | The cart's "Thanh toán" stays a link to `/checkout` (Cart epic; the existing summary-panel test asserts it). Without a valid `reservation` UUID in the query, the page renders `StartCheckout` (client): it reads the selected lines from the cart (below), calls `POST /api/checkout/reservations` once (a ref guards React's double mount) with `{sku, quantity, expectedUnitPrice: unitPrice}` per line, and on 201 replaces the URL with `/checkout?reservation=<id>`, so a reload keeps the same reservation. While it runs: the page skeleton with "Đang giữ hàng cho bạn…". No selected line (empty cart, all unavailable) → `router.replace("/cart")`.                                                                                                                                                                                                                                                       |
| Cart lines           | `src/features/cart/client.ts` exports `useSelectedCheckoutLines()`: the selected, available lines of `cartQueries.mine()` (selection store from Phase 4) as `{sku, quantity, unitPrice}`, plus `isPending`. `app/(shop)/checkout/` composes it with `StartCheckout` through a prop, so features never import each other.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Server fetch         | With a reservation id, `CheckoutSection` (Server Component, `checkout.server.ts`) reads `access_token` from `cookies()` and fetches `getCheckoutReservation`, `listShippingOptions?reservationId=` and `listPaymentMethods` in parallel with `serverApi("core", { budgetMs: 300 })` each (technical notes § 7), and hydrates what arrived into the query cache through `HydrationBoundary`. A timeout or error leaves that query to the client (`useQuery`, `retry` 1) with its own skeleton; a 404 renders the "not found" state; a 401 is left to the client's single-flight refresh.                                                                                                                                                                                                                                                                                                                              |
| Queries              | `checkoutKeys.reservation(id)`, `checkoutKeys.shippingOptions(id)`, `checkoutKeys.paymentMethods()`, `orderKeys.detail(id)` with `queryOptions()` factories; `staleTime` 0, never `meta.persist` (checkout data is never written to IndexedDB).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Hold banner          | "Sản phẩm đang được giữ cho bạn. Hoàn tất trong mm:ss để giữ giá flash sale." counting down to `expiresAt` once per second (one `setInterval`, cleared on unmount), the remaining time computed from `expiresAt − Date.now()` on every tick so a sleeping tab catches up. Under 60 s the time uses the accent colour. The countdown is `aria-live="off"`; at 1 minute left a polite live region says "Còn 1 phút để hoàn tất đơn hàng". At 0 the page switches to the expired state.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Address form         | React Hook Form with `zodResolver(shippingAddressSchema)` from `checkout.schema.ts`, typed against the generated `ShippingAddress` so a contract change breaks the build. Fields, all required, with visible labels: "Họ và tên", "Số điện thoại", "Địa chỉ" (`line1`) as on the artboard, then "Phường/Xã", "Quận/Huyện", "Tỉnh/Thành phố" (the contract requires them; open question 1), and an optional "Ghi chú" (`note`, max 500). Lengths as in the contract; phone `^(0\|\+84)[35789][0-9]{8}$` (the server's rule) with "Số điện thoại không hợp lệ". Errors show under each field with `aria-describedby`; the first invalid field gets focus on submit. "Họ và tên" is prefilled from `/api/auth/me` `displayName` when empty.                                                                                                                                                                             |
| Shipping and payment | Two `RadioGroup`s (shadcn) styled as the artboard's option cards (min height 56 px, selected card `border-brand` and accent tint). Shipping: name, `estimatedDelivery`, fee or "Miễn phí"; default the first option. Payment: name and the artboard's description per method ("Trả tiền mặt khi nhận", "Chuyển sang ứng dụng ví để xác nhận", "Hỗ trợ trả góp 0%"); default `COD`; `available: false` → disabled with "Tạm thời không khả dụng".                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Order summary        | "Đơn hàng ({n} sản phẩm)" with "Sửa" linking to `/cart`; per line `name`, `variantLabel · x{quantity}` and `lineTotal` from the reservation (contract `1.4.0`). "Giá và tồn kho đã được xác nhận" (success colour); when any line has `priceChanged`, an info notice "Giá của {k} sản phẩm đã thay đổi so với giỏ hàng" above it. Rows "Tạm tính" (`subtotal`), "Vận chuyển" (selected fee or "Miễn phí") and "Tổng thanh toán" (`subtotal + fee`), computed on the client because the order is not created yet. No voucher row. Amounts with `formatVnd`.                                                                                                                                                                                                                                                                                                                                                           |
| Place order          | "Đặt hàng" submits the form. The `Idempotency-Key` is created with `crypto.randomUUID()` once per attempt and kept in `sessionStorage` under the reservation id, so a retry after a network error or a reload sends the same key; a new key is made only after a 4xx answer, a payment failure or a new reservation. While the request runs the button is disabled and shows "Đang xử lý…" (artboard `submitting`), so a double click sends one request; a second request with the same key would replay anyway. `409 IDEMPOTENCY_IN_PROGRESS` → retry after 1 s with the same key, up to 5 times. The call uses `AbortSignal.timeout(10_000)`; a timeout shows "Không nhận được phản hồi. Thử lại" and retrying reuses the key.                                                                                                                                                                                     |
| Outcomes             | 201 `PLACED` or `PAID` → the artboard's `done` state in the summary card: "Đặt hàng thành công", "Mã đơn #{number}" and "Về trang chủ"; the email sentence is not shown (no emails in the MVP, open question 2). Then the ordered SKUs are removed from the cart (one `DELETE /api/cart/items/{sku}` each, best effort, errors ignored) and `cartKeys.all` is invalidated. 201 `PAYMENT_FAILED` → an error panel "Thanh toán không thành công" (`FAILED`) or "Thanh toán quá thời gian chờ" (`TIMED_OUT`) with "Thử lại" (new reservation from the same lines, back to the form with its values kept) and "Đổi sang COD" (selects COD, then the same). 201 `PENDING_PAYMENT` → "Đang xác nhận thanh toán…" and `orderKeys.detail` polled every 2 s for up to 30 s, then the outcome above.                                                                                                                           |
| Errors               | `410 CHECKOUT_RESERVATION_EXPIRED` or the countdown reaching 0 → expired state: "Hết thời gian giữ hàng" with "Giữ hàng lại" (a new reservation from the same lines; the form keeps its values). `410 CHECKOUT_RESERVATION_CONSUMED` or `getCheckoutReservation` status `CONSUMED` → "Đơn hàng này đã được đặt" with "Về trang chủ". `409 CHECKOUT_OUT_OF_STOCK` when reserving → back to `/cart` with a toast "Không đủ hàng: {name} (còn {available})" per line and the cart refetched. `404` → "Không tìm thấy phiên thanh toán" with "Quay lại giỏ hàng". `400 VALIDATION_FAILED` → each `errors[].field` mapped to the form field (`shippingAddress.phone` → phone). `422 CHECKOUT_PAYMENT_METHOD_UNAVAILABLE` → the method is disabled and the payment methods refetched. `429` and `503` → toast with `messageFor(error)` and the button enabled again. All messages live in `src/lib/api/error-messages.ts`. |
| Mock payment outcome | When `NEXT_PUBLIC_MOCK_PAYMENT_CONTROLS=1` (set by `make demo`, `make dev-mock` and the e2e build; unset in a production configuration), the payment section shows a small select "Kết quả thanh toán (demo)": "Thành công", "Thất bại", "Quá thời gian"; a non-default value is sent as `X-Mock-Payment-Outcome: fail \| timeout` (contract `1.4.0`). Without the flag the control and the header are absent (a test asserts both).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Mocks                | `mocks/checkout-handlers.ts` keeps reservations, orders and idempotency keys in memory per test (reset with the existing handler reset): reservation from the request lines with the artboard's names and prices, `expiresAt` = now + 10 min, idempotent `placeOrder` (replay with `Idempotent-Replayed: true`, reused key → 422), and the mock-outcome header honoured. Overrides: `reservationOutOfStock`, `reservationExpiresIn(ms)`, `slowCheckout(ms)`, `checkoutUnavailable` (503), `orderInProgress(times)`, `cardUnavailable`. `make dev-mock` uses them.                                                                                                                                                                                                                                                                                                                                                    |
| Placement            | Everything checkout-specific lives in `src/features/checkout/`; its `index.ts` exports the server section and the shell pieces, `client.ts` the client components `app/` composes. Existing primitives (Button, Input, Label, RadioGroup, Skeleton, Sonner) are enough; a new primitive (for example a `Select` for the demo control, or a native `<select>` styled with tokens) would be its own task, so the demo control uses a native `<select>`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

## Contract impact

None from shop-web. It consumes `1.4.0` from shop-api's Checkout + order epic:
`expectedUnitPrice` on reservation lines (the cart price the user saw, so `priceChanged` means a
real change), `name` / `variantLabel` / `imageUrl` on reservation lines, `Order.number` for "Mã đơn
#MY-1212-0087", the demo-only `X-Mock-Payment-Outcome` header, and the codes
`CHECKOUT_RESERVATION_CONSUMED` and `CHECKOUT_PAYMENT_METHOD_UNAVAILABLE`. Until `1.4.0` is
released, tasks after task 1 cannot start.

## Expected tasks (the planner details them after approval)

1. [contract-client] Pin `1.4.0`, regenerate types, error messages for the checkout and order codes,
   MSW checkout and order handlers with fixtures and overrides (M).
2. [cart] `useSelectedCheckoutLines()` in `client.ts` with tests (S).
3. [checkout] Browser calls, key factories and `queryOptions`, server fetchers with the 300 ms
   budget, `checkout.schema.ts` (S).
4. [checkout] `/checkout` route: dynamic page, header and step bar, `StartCheckout`, `CheckoutSection`
   with `HydrationBoundary`, skeletons, not-found and consumed states (M).
5. [checkout] Hold banner with countdown and expired state with "Giữ hàng lại"; order summary with
   totals and the price-changed notice (M).
6. [checkout] Address form (RHF + Zod), shipping and payment option groups, the demo outcome control
   (M).
7. [checkout] Place order: idempotency key handling, submitting state, outcomes (success, payment
   failed / timed out, pending polling), error mapping, cart clean-up after success (M).
8. [e2e] Checkout journeys with axe: COD success, double click → one `POST /api/orders`, payment
   failure then COD, payment timeout, expiry (short `expiresAt` override), out of stock at reserve,
   validation errors; desktop and phone (M).

Dependencies: 1 first (after shop-api's contract task releases `1.4.0`); 2 and 3 after 1; 4 after
2 and 3; 5 and 6 after 4; 7 after 5 and 6; 8 after 7. New journey files go in `e2e/checkout.spec.ts`
(a new file, not protected). The real-gateway run waits for shop-api's Checkout + order epic to be
merged (roadmap "Cross-repo dependencies"), as with shop-web#103 for the cart.

## Risks and mitigations

| Risk                                                     | Mitigation                                                                                                                                                                        |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Double click or retry places two orders                  | Button disabled while submitting, one key per attempt kept in `sessionStorage`; the e2e journey double-clicks and asserts one `POST /api/orders` and one order in the mock store. |
| Reservation created twice on mount (Strict Mode, reload) | Ref guard; the URL holds the reservation id after the first success; the backend keeps one active reservation per user anyway.                                                    |
| Countdown drifts from the server                         | Recomputed from `expiresAt` on every tick; the server answers 410 after expiry and the page shows the expired state either way.                                                   |
| A hole holds the stream                                  | 300 ms budget per server fetch; a test with a 1 s MSW delay asserts the page streams and the client fetches.                                                                      |
| User data in a shared cache or IndexedDB                 | No `'use cache'` and no `meta.persist` in the feature; a unit test fails when a checkout file contains either.                                                                    |
| Address data lingers                                     | Form values live only in RHF state; nothing is persisted except the idempotency key.                                                                                              |
| The demo control ships to production                     | Read from `NEXT_PUBLIC_MOCK_PAYMENT_CONTROLS` at build time; tested on and off; the backend also ignores the header unless configured.                                            |
| Cart still shows ordered lines                           | Best-effort removal after success plus `cartKeys.all` invalidation; a failed removal leaves the lines for the user to remove (shop-api open question 3).                          |

## Open questions for the owner

1. **Address fields.** The artboard has one "Địa chỉ" field, the contract requires `ward`,
   `district` and `province`. Proposed: the artboard's three fields followed by "Phường/Xã",
   "Quận/Huyện" and "Tỉnh/Thành phố" as text inputs. Alternative: province and ward pickers (needs
   an address data source and a `Select` primitive task).
2. **Email sentence.** The artboard says "Đã gửi xác nhận qua email", but no email is sent in the
   MVP. Proposed: show only "Mã đơn #{number}". Alternative: keep the sentence as on the artboard.
3. **Terms link.** "Điều khoản" has no page. Proposed: plain text, not a link. Alternative: a link to
   a static `/terms` page (a small extra task).
4. **Countdown colour.** Proposed: the accent colour under 60 s; the artboard keeps one style.

## Done when

- `/checkout` matches the artboard in the idle, submitting and success states at 1280 px and stacks
  at 390 px, with axe passing (Playwright).
- From the cart, "Thanh toán" reserves the selected lines and the page shows the countdown from
  10:00; a reload keeps the same reservation.
- A double click on "Đặt hàng" sends one `POST /api/orders` and shows one order number.
- A failed and a timed-out mock payment show the error panel, and "Đổi sang COD" places the order.
- An expired reservation shows "Hết thời gian giữ hàng", and "Giữ hàng lại" continues with a new
  reservation and the form values kept.
- `/checkout` is reported as dynamic by `next build`, the feature contains no `'use cache'` and no
  persisted query, and `make lint test e2e` is green on `main`.
