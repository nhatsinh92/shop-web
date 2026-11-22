import createClient from "openapi-fetch";

import { ApiError, apiErrorFromResponse, networkError } from "./api-error";
import type { paths as CartPaths } from "./generated/cart";
import type { paths as CorePaths } from "./generated/core";

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/** fetch that throws ApiError for network failures and non-2xx responses (aborts pass through). */
async function apiTransport(request: Request): Promise<Response> {
  let res: Response;
  try {
    res = await globalThis.fetch(request);
  } catch (error) {
    if (isAbort(error)) throw error;
    throw networkError(error);
  }
  if (!res.ok) throw await apiErrorFromResponse(res);
  return res;
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
