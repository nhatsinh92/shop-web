// The Idempotency-Key of "Đặt hàng": one UUID per order attempt, kept in sessionStorage under the
// reservation id together with a hash of the request body. A retry with the same body (network
// error, timeout, reload) reuses the key; a different body or a new reservation gets a new one.

const keyFor = (reservationId: string) => `checkout:idempotency:${reservationId}`;

interface StoredKey {
  key: string;
  hash: string;
}

/** FNV-1a (32 bit) of a string, as hex: a cheap fingerprint of the request body, not a secret. */
export function hashBody(body: unknown): string {
  const text = JSON.stringify(body);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

function read(reservationId: string): StoredKey | null {
  try {
    const raw = sessionStorage.getItem(keyFor(reservationId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredKey>;
    return typeof parsed.key === "string" && typeof parsed.hash === "string"
      ? { key: parsed.key, hash: parsed.hash }
      : null;
  } catch {
    return null;
  }
}

/** The stored key when its body hash matches, otherwise a new key that replaces the entry. */
export function keyForRequest(reservationId: string, body: unknown): string {
  const hash = hashBody(body);
  const stored = read(reservationId);
  if (stored && stored.hash === hash) return stored.key;
  const key = crypto.randomUUID();
  try {
    sessionStorage.setItem(keyFor(reservationId), JSON.stringify({ key, hash }));
  } catch {
    // Storage can be blocked; the key then only lives for this attempt.
  }
  return key;
}

/** Forgets the key: the next attempt makes a new one. */
export function clearKey(reservationId: string): void {
  try {
    sessionStorage.removeItem(keyFor(reservationId));
  } catch {
    // Nothing stored, nothing to clear.
  }
}
