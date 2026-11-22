import { createHmac, timingSafeEqual } from "node:crypto";

/** Maximum clock difference, in seconds, between the sender's timestamp and now. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

const HEADER_PATTERN = /^t=(\d{1,12}),v1=([0-9a-f]{64})$/;

/** Hex HMAC-SHA256 of `<t>.<raw body>`, the value the sender puts in `v1`. */
export function computeSignature(secret: string, timestamp: number, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

/**
 * Verifies `X-Shop-Signature: t=<unix seconds>,v1=<hex>` against the raw request body.
 * Returns false for a missing or malformed header, a timestamp more than 5 minutes away
 * from `nowSeconds` (past or future) and a wrong signature.
 */
export function verifySignature(
  header: string | null,
  rawBody: string,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  if (!header) return false;
  const match = HEADER_PATTERN.exec(header.trim());
  if (!match) return false;
  const timestamp = Number(match[1]);
  const provided = Buffer.from(match[2] ?? "", "hex");
  if (Math.abs(nowSeconds - timestamp) > SIGNATURE_TOLERANCE_SECONDS) return false;
  const expected = Buffer.from(computeSignature(secret, timestamp, rawBody), "hex");
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}
