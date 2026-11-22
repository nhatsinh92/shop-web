import { http, HttpResponse } from "msw";

import {
  clearedSessionCookies,
  demoCredentials,
  hasSessionHint,
  invalidCredentialsProblem,
  rateLimitedProblem,
  refreshInvalidProblem,
  sessionCookies,
  unauthenticatedProblem,
  userProfileFixture,
} from "./fixtures/auth";
import { coreHttp } from "./http";

function problemHeaders(extra: Record<string, string> = {}): Headers {
  return new Headers({ "Content-Type": "application/problem+json", ...extra });
}

function cookieHeaders(cookies: string[]): Headers {
  const headers = new Headers();
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return headers;
}

/** Default auth handlers, typed against the contract through `coreHttp`. */
export const authHandlers = [
  coreHttp.post("/api/auth/login", async ({ request, response }) => {
    const body = await request.clone().json();
    if (body.email !== demoCredentials.email || body.password !== demoCredentials.password) {
      return response(401).json(invalidCredentialsProblem, { headers: problemHeaders() });
    }
    return response(200).json(userProfileFixture, {
      headers: cookieHeaders(sessionCookies),
    });
  }),
  coreHttp.get("/api/auth/me", ({ request, response }) =>
    hasSessionHint(request)
      ? response(200).json(userProfileFixture)
      : response(401).json(unauthenticatedProblem, { headers: problemHeaders() }),
  ),
  coreHttp.post("/api/auth/refresh", ({ response }) =>
    response(204).empty({ headers: cookieHeaders(sessionCookies) }),
  ),
  coreHttp.post("/api/auth/logout", ({ response }) =>
    response(204).empty({ headers: cookieHeaders(clearedSessionCookies) }),
  ),
];

/** Per-scenario overrides for `server.use(...)` in tests. */
export const authOverrides = {
  loginRateLimited: coreHttp.post("/api/auth/login", ({ response }) =>
    response(429).json(rateLimitedProblem, {
      headers: problemHeaders({ "Retry-After": "5" }),
    }),
  ),
  refreshInvalid: coreHttp.post("/api/auth/refresh", ({ response }) =>
    response(401).json(refreshInvalidProblem, { headers: problemHeaders() }),
  ),
  /** 503 is not a documented logout response, so this one uses plain MSW instead of `coreHttp`. */
  logoutUnavailable: http.post("*/api/auth/logout", () =>
    HttpResponse.json(
      {
        type: "about:blank",
        title: "Unavailable",
        status: 503,
        code: "SERVICE_UNAVAILABLE",
      },
      { status: 503 },
    ),
  ),
};
