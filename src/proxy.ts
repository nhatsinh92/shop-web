import { NextResponse, type NextRequest } from "next/server";

import { isTokenExpiring, isTokenUsable } from "@/lib/auth/access-token";
import { mergeCookieHeader, refreshSession } from "@/lib/auth/refresh-session.server";

/** /cart is open to guests; /account/* and /checkout need a session. */
function requiresSession(pathname: string): boolean {
  return pathname !== "/cart";
}

function redirectToLogin(request: NextRequest): NextResponse {
  const { pathname, search, origin } = request.nextUrl;
  const url = new URL("/login", origin);
  url.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(url, 307);
}

function noSession(request: NextRequest): NextResponse {
  return requiresSession(request.nextUrl.pathname) ? redirectToLogin(request) : NextResponse.next();
}

/** Refreshes expiring tokens before render so Server Components see the new ones. */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const accessToken = request.cookies.get("access_token")?.value;
  const refreshToken = request.cookies.get("refresh_token")?.value;

  if (!isTokenExpiring(accessToken)) return NextResponse.next();

  if (!refreshToken) {
    // Nothing to refresh with: a still-valid access token keeps the session alive.
    return isTokenUsable(accessToken) ? NextResponse.next() : noSession(request);
  }

  const result = await refreshSession(refreshToken);
  if (result.status === "unavailable") return NextResponse.next();
  if (result.status === "unauthorized") return noSession(request);

  const headers = new Headers(request.headers);
  headers.set("cookie", mergeCookieHeader(request.headers.get("cookie"), result.tokens));
  const response = NextResponse.next({ request: { headers } });
  for (const setCookie of result.setCookies) response.headers.append("set-cookie", setCookie);
  return response;
}

// Router prefetches are skipped (#132): a prefetch of /cart (for example from the header) carries
// the same old cookies as the browser's own refresh and rotated the session a second time at once.
// Next hides `next-router-prefetch` from `request.headers` in Proxy, so only the matcher can see it.
// The real navigation still runs the proxy and refreshes before render. The matcher must stay a
// literal: Next reads it statically at build time.
export const config = {
  matcher: [
    {
      source: "/cart",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
    {
      source: "/account/:path*",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
    {
      source: "/checkout",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
