/** Refresh when the access token has this many seconds or less left. */
export const REFRESH_THRESHOLD_SECONDS = 60;

/**
 * Reads the `exp` claim (seconds since the epoch) from a JWT payload. The signature is never
 * checked (the gateway does that); a malformed token or one without a numeric `exp` gives null.
 */
export function readTokenExpiry(token: string | undefined): number | null {
  if (!token) return null;
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
    const claims: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof claims !== "object" || claims === null) return null;
    const exp = (claims as { exp?: unknown }).exp;
    return typeof exp === "number" && Number.isFinite(exp) ? exp : null;
  } catch {
    return null;
  }
}

/** True when the token is missing, malformed, has no `exp`, or expires within the threshold. */
export function isTokenExpiring(
  token: string | undefined,
  nowMs: number = Date.now(),
  thresholdSeconds: number = REFRESH_THRESHOLD_SECONDS,
): boolean {
  const exp = readTokenExpiry(token);
  if (exp === null) return true;
  return exp * 1000 - nowMs <= thresholdSeconds * 1000;
}

/** True when the token carries an `exp` that is still in the future. */
export function isTokenUsable(token: string | undefined, nowMs: number = Date.now()): boolean {
  const exp = readTokenExpiry(token);
  return exp !== null && exp * 1000 > nowMs;
}
