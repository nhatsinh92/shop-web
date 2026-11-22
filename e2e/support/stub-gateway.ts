import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";

import type { components as CartComponents } from "../../src/lib/api/generated/cart";
import type { components as CoreComponents } from "../../src/lib/api/generated/core";

type UserProfile = CoreComponents["schemas"]["UserProfile"];

export const STUB_PASSWORD = "correct-password";
export const ACCESS_TTL_SECONDS = 300;
export const SHORT_ACCESS_TTL_SECONDS = 30;

/** Scenarios are selected per request by the tag in the login email: `shopper+<tag>.<id>@host`. */
export type Scenario = "ok" | "short-ttl" | "logout-fails";

export function emailFor(scenario: Scenario, id: string): string {
  return `shopper+${scenario}.${id}@example.com`;
}

export function scenarioOf(email: string): Scenario {
  const tag = email.split("@")[0]?.split("+")[1]?.split(".")[0];
  return tag === "short-ttl" || tag === "logout-fails" ? tag : "ok";
}

function base64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

/** Unsigned JWT-shaped access token (the stub is the only verifier) with a real `exp`. */
export function accessToken(email: string, ttlSeconds: number, nowMs = Date.now()): string {
  const iat = Math.floor(nowMs / 1000);
  const header = base64url({ alg: "none", typ: "JWT" });
  const payload = base64url({ sub: email, email, iat, exp: iat + ttlSeconds });
  return `${header}.${payload}.`;
}

export function readClaims(token: string | undefined): { email: string; exp: number } | null {
  const payload = token?.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      email?: unknown;
      exp?: unknown;
    };
    if (typeof claims.email !== "string" || typeof claims.exp !== "number") return null;
    return { email: claims.email, exp: claims.exp };
  } catch {
    return null;
  }
}

export function refreshTokenFor(email: string, generation: number): string {
  return `rt.${Buffer.from(email).toString("base64url")}.${generation}`;
}

export function emailFromRefreshToken(token: string | undefined): string | null {
  const match = /^rt\.([A-Za-z0-9_-]+)\.\d+$/.exec(token ?? "");
  return match?.[1] ? Buffer.from(match[1], "base64url").toString("utf8") : null;
}

export function profileFor(email: string): UserProfile {
  return {
    id: "6f1c1c6e-2f43-4a53-9d0a-7a1e5c1d9b10",
    email,
    displayName: "Nguyễn Minh Anh",
    memberTier: "GOLD",
  };
}

type Problem = CoreComponents["schemas"]["Problem"];
type LoginRequest = CoreComponents["schemas"]["LoginRequest"];
type CartSummary = CartComponents["schemas"]["CartSummary"];

const port = Number(process.env.E2E_STUB_PORT ?? 4010);
const REFRESH_TTL_SECONDS = 14 * 24 * 60 * 60;

/** Refresh calls per user email, so parallel tests never see each other's calls. */
const refreshCalls = new Map<string, number>();

function cookies(req: IncomingMessage): Record<string, string> {
  const jar: Record<string, string> = {};
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index > 0) jar[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  }
  return jar;
}

// No `Secure` flag: the stub is reached over plain http through the Next.js rewrite.
function sessionCookies(email: string, ttl: number, generation: number): string[] {
  return [
    `access_token=${accessToken(email, ttl)}; Max-Age=${ACCESS_TTL_SECONDS}; Path=/; HttpOnly; SameSite=Lax`,
    `refresh_token=${refreshTokenFor(email, generation)}; Max-Age=${REFRESH_TTL_SECONDS}; Path=/; HttpOnly; SameSite=Lax`,
    `logged_in=1; Max-Age=${REFRESH_TTL_SECONDS}; Path=/; SameSite=Lax`,
  ];
}

function clearedCookies(): string[] {
  return [
    "access_token=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax",
    "refresh_token=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax",
    "logged_in=; Max-Age=0; Path=/; SameSite=Lax",
  ];
}

function send(
  res: ServerResponse,
  status: number,
  body?: unknown,
  extra: Record<string, unknown> = {},
) {
  const headers: Record<string, string | string[]> = { "cache-control": "no-store" };
  for (const [name, value] of Object.entries(extra)) headers[name] = value as string | string[];
  if (body !== undefined) headers["content-type"] ??= "application/json";
  res.writeHead(status, headers);
  res.end(body === undefined ? undefined : JSON.stringify(body));
}

function problem(res: ServerResponse, status: number, code: string, title: string) {
  const body: Problem = { type: `about:blank#${code}`, title, status, code };
  send(res, status, body, { "content-type": "application/problem+json" });
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk: Buffer) => (raw += chunk.toString("utf8")));
    req.on("end", () => resolve(raw));
  });
}

async function login(req: IncomingMessage, res: ServerResponse) {
  let body: Partial<LoginRequest> = {};
  try {
    body = JSON.parse(await readBody(req)) as Partial<LoginRequest>;
  } catch {
    return problem(res, 400, "VALIDATION_FAILED", "Invalid body");
  }
  if (!body.email || body.password !== STUB_PASSWORD) {
    return problem(res, 401, "AUTH_INVALID_CREDENTIALS", "Invalid credentials");
  }
  const ttl =
    scenarioOf(body.email) === "short-ttl" ? SHORT_ACCESS_TTL_SECONDS : ACCESS_TTL_SECONDS;
  send(res, 200, profileFor(body.email), { "set-cookie": sessionCookies(body.email, ttl, 0) });
}

function refresh(req: IncomingMessage, res: ServerResponse) {
  const email = emailFromRefreshToken(cookies(req)["refresh_token"]);
  if (!email) return problem(res, 401, "AUTH_REFRESH_INVALID", "Refresh token rejected");
  refreshCalls.set(email, (refreshCalls.get(email) ?? 0) + 1);
  // Rotated tokens always get the normal TTL, so a refresh visibly replaces a short-lived token.
  send(res, 204, undefined, {
    "set-cookie": sessionCookies(email, ACCESS_TTL_SECONDS, refreshCalls.get(email) ?? 1),
  });
}

function logout(req: IncomingMessage, res: ServerResponse) {
  const jar = cookies(req);
  const email =
    readClaims(jar["access_token"])?.email ?? emailFromRefreshToken(jar["refresh_token"]);
  if (email && scenarioOf(email) === "logout-fails") {
    return problem(res, 503, "SERVICE_UNAVAILABLE", "Logout unavailable");
  }
  send(res, 204, undefined, { "set-cookie": clearedCookies() });
}

function me(req: IncomingMessage, res: ServerResponse) {
  const claims = readClaims(cookies(req)["access_token"]);
  if (!claims || claims.exp * 1000 <= Date.now()) {
    return problem(res, 401, "AUTH_REQUIRED", "Authentication required");
  }
  send(res, 200, profileFor(claims.email));
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${port}`);
  const route = `${req.method} ${url.pathname}`;
  switch (route) {
    case "POST /api/auth/login":
      return void login(req, res);
    case "POST /api/auth/refresh":
      return refresh(req, res);
    case "POST /api/auth/logout":
      return logout(req, res);
    case "GET /api/auth/me":
      return me(req, res);
    case "GET /api/cart/summary": {
      const summary: CartSummary = { itemCount: 0 };
      return send(res, 200, summary);
    }
    case "GET /__stub/health":
      return send(res, 200, { status: "UP" });
    case "GET /__stub/refresh-calls":
      return send(res, 200, { count: refreshCalls.get(url.searchParams.get("email") ?? "") ?? 0 });
    default:
      return problem(res, 404, "NOT_FOUND", "Not found");
  }
});

// Started by Playwright's webServer (`node e2e/support/stub-gateway.ts`); specs only import helpers.
if (process.argv[1]?.endsWith("stub-gateway.ts")) {
  server.listen(port, () => console.log(`stub gateway listening on :${port}`));
}
