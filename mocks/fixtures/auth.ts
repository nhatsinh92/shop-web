import type { components } from "../../src/lib/api/generated/core";

/** The signed-in demo member returned by the mock login and `GET /api/auth/me`. */
export const userProfileFixture: components["schemas"]["UserProfile"] = {
  id: "3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f",
  email: "demo@may.vn",
  displayName: "Demo Member",
  memberTier: "GOLD",
};

/** The only credentials the mock login handler accepts. */
export const demoCredentials = {
  email: "demo@may.vn",
  password: "demo-password",
} as const satisfies components["schemas"]["LoginRequest"];

const attributes = "Path=/; Secure; SameSite=Lax";

/** `Set-Cookie` headers of a successful login or refresh (fake token values, never a body). */
export const sessionCookies: string[] = [
  `access_token=fake-access-token; Max-Age=900; HttpOnly; ${attributes}`,
  `refresh_token=fake-refresh-token; Max-Age=2592000; HttpOnly; ${attributes}`,
  `logged_in=1; Max-Age=2592000; ${attributes}`,
];

/** `Set-Cookie` headers of a logout: all three cookies cleared with `Max-Age=0`. */
export const clearedSessionCookies: string[] = [
  `access_token=; Max-Age=0; HttpOnly; ${attributes}`,
  `refresh_token=; Max-Age=0; HttpOnly; ${attributes}`,
  `logged_in=; Max-Age=0; ${attributes}`,
];

/** True when the request cookie header carries the `logged_in=1` session hint. */
export function hasSessionHint(request: Request): boolean {
  const header = request.headers.get("cookie") ?? "";
  return header.split(";").some((part) => part.trim() === "logged_in=1");
}

function problem(status: number, title: string, code: string): components["schemas"]["Problem"] {
  return { type: "about:blank", title, status, code };
}

export const invalidCredentialsProblem = problem(
  401,
  "Invalid credentials",
  "AUTH_INVALID_CREDENTIALS",
);
export const unauthenticatedProblem = problem(401, "Unauthenticated", "AUTH_UNAUTHENTICATED");
export const refreshInvalidProblem = problem(401, "Invalid refresh token", "AUTH_REFRESH_INVALID");
export const rateLimitedProblem = problem(429, "Too many requests", "RATE_LIMITED");
