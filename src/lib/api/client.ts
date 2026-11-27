import createClient from "openapi-fetch";

import { ApiError, apiErrorFromResponse, networkError } from "./api-error";
import type { paths as CartPaths } from "./generated/cart";
import type { paths as CorePaths } from "./generated/core";
import { canRefreshFor, refreshSession, refreshedSince, requestClock } from "./refresh";

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

async function send(request: Request): Promise<Response> {
  try {
    return await globalThis.fetch(request);
  } catch (error) {
    if (isAbort(error)) throw error;
    throw networkError(error);
  }
}

/**
 * fetch that throws ApiError for network failures and non-2xx responses (aborts pass through).
 * A 401 triggers one shared session refresh, then a single retry of the request. If a refresh
 * already succeeded after this request was sent, the request only carried the old cookies, so it
 * is retried without refreshing again (#159).
 */
async function apiTransport(request: Request): Promise<Response> {
  const retryable = canRefreshFor(request.url) ? request.clone() : null;
  const sentAt = requestClock();
  const res = await send(request);
  if (res.ok) return res;
  if (res.status !== 401 || !retryable) throw await apiErrorFromResponse(res);

  const refreshed = refreshedSince(sentAt) || (await refreshSession(new URL(request.url).origin));
  if (!refreshed) throw await apiErrorFromResponse(res);
  retryable.signal.throwIfAborted();

  const retried = await send(retryable);
  if (!retried.ok) throw await apiErrorFromResponse(retried);
  return retried;
}

/** Typed browser client for /api/*. Cookies travel on every call; tokens are never read in JS. */
export const api = createClient<CorePaths & CartPaths>({
  baseUrl: globalThis.location?.origin ?? "",
  credentials: "include",
  headers: { accept: "application/json" },
  fetch: apiTransport,
});

/** Returns `data` of a 2xx result, throws ApiError otherwise. */
export function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.error !== undefined || result.data === undefined) {
    if (result.response.ok) return undefined as T;
    throw new ApiError({
      status: result.response.status,
      code: "UNKNOWN_ERROR",
      detail: result.response.statusText,
    });
  }
  return result.data;
}
