/** Time budget for the refresh call made by the proxy. */
export const REFRESH_BUDGET_MS = 300;

export type RefreshResult =
  /** Refreshed: `setCookies` are the raw Set-Cookie headers, `tokens` the rotated values. */
  | { status: "refreshed"; setCookies: string[]; tokens: Record<string, string> }
  /** The refresh token is missing, expired or revoked (401). */
  | { status: "unauthorized" }
  /** Timeout, network error or 5xx: keep going with the request unchanged. */
  | { status: "unavailable" };

const ROTATED_COOKIES = ["access_token", "refresh_token"] as const;

function coreBaseUrl(): string {
  return process.env.CORE_INTERNAL_URL || "http://localhost:8081";
}

function cookieNameAndValue(setCookie: string): [string, string] | null {
  const pair = setCookie.split(";")[0] ?? "";
  const index = pair.indexOf("=");
  if (index <= 0) return null;
  return [pair.slice(0, index).trim(), pair.slice(index + 1).trim()];
}

/**
 * Calls POST /api/auth/refresh with only the refresh_token cookie. Never throws and never logs
 * token values.
 */
export async function refreshSession(
  refreshToken: string,
  budgetMs: number = REFRESH_BUDGET_MS,
): Promise<RefreshResult> {
  let res: Response;
  try {
    res = await globalThis.fetch(`${coreBaseUrl()}/api/auth/refresh`, {
      method: "POST",
      headers: { cookie: `refresh_token=${refreshToken}`, accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(budgetMs),
    });
  } catch {
    return { status: "unavailable" };
  }
  if (res.status === 401) return { status: "unauthorized" };
  if (!res.ok) return { status: "unavailable" };

  const setCookies = res.headers.getSetCookie();
  const tokens: Record<string, string> = {};
  for (const header of setCookies) {
    const pair = cookieNameAndValue(header);
    if (pair && (ROTATED_COOKIES as readonly string[]).includes(pair[0])) {
      tokens[pair[0]] = pair[1];
    }
  }
  return { status: "refreshed", setCookies, tokens };
}

/** Replaces or appends the rotated tokens in a Cookie header, keeping every other cookie. */
export function mergeCookieHeader(
  cookieHeader: string | null,
  replacements: Record<string, string>,
): string {
  const pending = new Map(Object.entries(replacements));
  const parts = (cookieHeader ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const name = part.split("=")[0]?.trim() ?? "";
      const next = pending.get(name);
      if (next === undefined) return part;
      pending.delete(name);
      return `${name}=${next}`;
    });
  for (const [name, value] of pending) parts.push(`${name}=${value}`);
  return parts.join("; ");
}
