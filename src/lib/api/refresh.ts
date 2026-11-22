/** Single-flight session refresh for the browser client. Tokens only ever travel in cookies. */

const REFRESH_PATH = "/api/auth/refresh";
const NO_REFRESH_PATHS = new Set([REFRESH_PATH, "/api/auth/login", "/api/auth/logout"]);

type SessionExpiredListener = () => void;

const listeners = new Set<SessionExpiredListener>();
let inFlight: Promise<boolean> | null = null;

/** Registers a listener called once per failed refresh. Returns an unsubscribe function. */
export function onSessionExpired(listener: SessionExpiredListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** True when a 401 from this request may be answered with a refresh and one retry. */
export function canRefreshFor(url: string): boolean {
  return !NO_REFRESH_PATHS.has(new URL(url).pathname);
}

async function callRefresh(origin: string): Promise<boolean> {
  try {
    const res = await globalThis.fetch(new URL(REFRESH_PATH, origin), {
      method: "POST",
      credentials: "include",
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Refreshes the session; concurrent callers share one `POST /api/auth/refresh`.
 * Resolves true on success, false on failure (listeners are notified once per failed refresh).
 */
export function refreshSession(origin: string): Promise<boolean> {
  inFlight ??= callRefresh(origin)
    .then((ok) => {
      if (!ok) for (const listener of [...listeners]) listener();
      return ok;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}
