# Technical Notes — Patterns Agreed During Design

Reference patterns behind the plan in `shop-build-plan.md`. Agents should follow these unless an epic says otherwise. Code is illustrative: check current library docs (Next.js 16 Cache Components, TanStack Query v5, Spring Cloud Gateway) before copying.

## 1. State ownership (frontend)

| Kind of state | Owner | Never |
| --- | --- | --- |
| Server data (products, cart, profile) | TanStack Query | Copied into Zustand |
| UI state (filters, modals, drawers) | Zustand | Fetched data |
| Form state | React Hook Form + Zod (schemas shared with the API types) | Hand-rolled `useState` forms |

- Query keys come from one factory per feature (`cartKeys.mine`, `productKeys.detail(id)`) and `queryOptions()`.
- Zustand stores holding per-user data in SSR are created per request (store factory + React context); pure client UI stores may be global.
- On logout: clear cookies server side, `queryClient.clear()`, and remove the persisted IndexedDB cache.

## 2. File organisation for agents

- Feature folders, colocated; split by reason to change; files roughly 150–400 lines.
- Descriptive file names (`product-form.tsx`, `product.schema.ts`) so search finds them.
- No barrel files inside features; at most one explicit public `index.ts` per feature, no `export *`.

## 3. Caching rules (Next.js 16, `cacheComponents: true`)

- Shared data: `'use cache'` + `cacheLife(...)` + `cacheTag(...)`; backend events call a webhook route that runs `revalidateTag`.
- `cookies()`, `headers()` and `searchParams` are not allowed inside `'use cache'`; read them outside and pass values in, or keep the component dynamic inside `<Suspense>`.
- User data is never cached in Next.js shared caches; per-user caching lives in backend Redis (`cart:{userId}`, `profile:{userId}`), short TTL, invalidated on write.
- The root layout never reads cookies. The header's user parts are client components (or Suspense holes).
- A non-httpOnly hint cookie (`logged_in=1`, `cart_count=N`, nothing sensitive) lets the client render the right skeleton instantly.

## 4. Cart page: stream with a budget, fall back to the client

```tsx
// app/(shop)/cart/page.tsx — static shell
export default function CartPage() {
  return (
    <CartShell>
      <Suspense fallback={<CartSkeleton />}>
        <CartSection />
      </Suspense>
    </CartShell>
  );
}

// features/cart/components/cart-section.tsx — Server Component
export async function CartSection() {
  const token = (await cookies()).get('access_token')?.value;
  if (!token) return <GuestCart />;

  const qc = new QueryClient();
  const data = await Promise.race([
    getCartInternal(token),               // cart-service over the internal network
    sleep(250).then(() => null),          // budget exceeded → let the client take over
  ]).catch(() => null);

  if (data) qc.setQueryData(cartKeys.mine, data);
  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <CartView />                        {/* 'use client'; useQuery(cartKeys.mine) */}
    </HydrationBoundary>
  );
}
```

`CartView` renders, in order of preference: hydrated data → persisted IndexedDB cache → skeleton. If the background refetch fails it shows the saved cart with the stale banner and a retry button (see `design/Cart.dc.html`, state `stale`).

Quantity changes: optimistic update in the query cache, debounce 400 ms, one PATCH per burst, roll back on error.

## 5. Auth flows

Browser (single-flight refresh):

```ts
let refreshing: Promise<void> | null = null;

export async function api(input: string, init?: RequestInit) {
  let res = await fetch(input, { ...init, credentials: 'include' });
  if (res.status !== 401) return res;
  refreshing ??= fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
    .then((r) => { if (!r.ok) throw new Error('refresh failed'); })
    .finally(() => { refreshing = null; });
  await refreshing;                       // every 401 waits on the same refresh
  return fetch(input, { ...init, credentials: 'include' });
}
```

SSR (`proxy.ts`, matched only on routes with authenticated dynamic holes):

```ts
export async function proxy(req: NextRequest) {
  const access = req.cookies.get('access_token')?.value;
  if (access && !isExpiringSoon(access)) return NextResponse.next();   // decode exp only

  const refresh = req.cookies.get('refresh_token')?.value;
  if (!refresh) return NextResponse.redirect(new URL('/login', req.url));

  const r = await fetch(`${AUTH_URL}/refresh`, { method: 'POST', headers: { cookie: `refresh_token=${refresh}` } });
  if (!r.ok) return NextResponse.redirect(new URL('/login', req.url));
  const { accessToken, refreshToken } = await r.json();

  const headers = new Headers(req.headers);                            // new tokens visible to this render
  headers.set('cookie', `access_token=${accessToken}; refresh_token=${refreshToken}`);
  const res = NextResponse.next({ request: { headers } });
  res.cookies.set('access_token', accessToken, { httpOnly: true, secure: true, sameSite: 'lax' });
  res.cookies.set('refresh_token', refreshToken, { httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
  return res;
}
export const config = { matcher: ['/cart', '/account/:path*', '/checkout'] };
```

- Server Components cannot set cookies; refreshing happens only in `proxy.ts`, route handlers or server actions.
- Refresh token rotation needs a grace period (the previous token stays valid for a few seconds) so parallel tabs do not log the user out.
- `getSession()` is wrapped in React `cache()` so one request decodes the JWT once.

## 6. Gateway

- Spring Cloud Gateway reads the access token from the cookie, verifies it with JWKS from `core` (cached), and forwards `Authorization: Bearer`.
- Routes: `/api/cart/**` → `cart-service`, everything else under `/api/**` → `core`.
- Redis-backed rate limiting per user and per IP; CORS only for the web origin; CSRF protection via `SameSite=Lax` plus an `Origin` check on state-changing requests.
- Optional instant revocation: a Redis denylist of session ids, checked by the gateway (adds about 1 ms).

## 7. Peak-day behaviour

- Pre-scale on a schedule before the event; load-test at 3–5× expected traffic.
- Prerender and warm the flash-sale PDPs; price/stock `cacheLife` of a few seconds so a burst produces one backend call.
- Stale-while-revalidate everywhere shared data is cached; serve the last good value when the backend errors.
- Every dynamic hole has a time budget (150–300 ms) and a fallback; no hole may hold the stream.
- Feature flags switch optional holes (recommendations, shipping estimate) off under load.
- Waiting room and rate limits sit at checkout, never on the cart page.
- Watch: shell TTFB, per-hole duration, fallback rate, cache hit rate. A rising fallback rate is the early warning.
