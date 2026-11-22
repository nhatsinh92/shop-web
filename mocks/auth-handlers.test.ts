import { describe, expect, it } from "vitest";

import { authOverrides } from "./auth-handlers";
import { demoCredentials, userProfileFixture } from "./fixtures/auth";
import { server } from "./node";

function post(path: string, body?: unknown): Promise<Response> {
  return fetch(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function me(cookie?: string): Promise<Response> {
  return fetch("http://localhost/api/auth/me", {
    headers: cookie ? { cookie } : undefined,
  });
}

describe("auth MSW handlers", () => {
  it("login with demo credentials answers 200 with the profile and session cookies", async () => {
    const res = await post("/api/auth/login", demoCredentials);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(userProfileFixture);
    const cookies = res.headers.getSetCookie();
    expect(cookies).toHaveLength(3);
    expect(cookies.some((c) => c.startsWith("logged_in=1"))).toBe(true);
    expect(cookies.some((c) => c.startsWith("access_token="))).toBe(true);
    expect(cookies.some((c) => c.startsWith("refresh_token="))).toBe(true);
  });

  it("login with other credentials answers 401 AUTH_INVALID_CREDENTIALS problem", async () => {
    const res = await post("/api/auth/login", { email: demoCredentials.email, password: "nope" });
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
    expect((await res.json()).code).toBe("AUTH_INVALID_CREDENTIALS");
  });

  it("me answers 200 with the profile when logged_in=1 is sent", async () => {
    const res = await me("logged_in=1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(userProfileFixture);
  });

  it("me answers 401 AUTH_UNAUTHENTICATED without the session hint", async () => {
    const res = await me();
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("AUTH_UNAUTHENTICATED");
  });

  it("refresh answers 204 and renews logged_in=1", async () => {
    const res = await post("/api/auth/refresh");
    expect(res.status).toBe(204);
    expect(res.headers.getSetCookie().some((c) => c.startsWith("logged_in=1"))).toBe(true);
  });

  it("logout answers 204 and clears logged_in with Max-Age=0", async () => {
    const res = await post("/api/auth/logout");
    expect(res.status).toBe(204);
    expect(
      res.headers
        .getSetCookie()
        .some((c) => c.startsWith("logged_in=;") && c.includes("Max-Age=0")),
    ).toBe(true);
  });

  it("override: login answers 429 RATE_LIMITED", async () => {
    server.use(authOverrides.loginRateLimited);
    const res = await post("/api/auth/login", demoCredentials);
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe("RATE_LIMITED");
  });

  it("override: refresh answers 401 AUTH_REFRESH_INVALID", async () => {
    server.use(authOverrides.refreshInvalid);
    const res = await post("/api/auth/refresh");
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("AUTH_REFRESH_INVALID");
  });

  it("override: logout answers 503", async () => {
    server.use(authOverrides.logoutUnavailable);
    const res = await post("/api/auth/logout");
    expect(res.status).toBe(503);
  });

  it("keeps the existing cart summary handler", async () => {
    const res = await fetch("http://localhost/api/cart/summary");
    expect(await res.json()).toEqual({ itemCount: 3 });
  });
});
