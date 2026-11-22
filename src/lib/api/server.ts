import createClient, { type Client } from "openapi-fetch";

import { apiErrorFromResponse, networkError } from "./api-error";
import type { paths as CartPaths } from "./generated/cart";
import type { paths as CorePaths } from "./generated/core";

export type ApiService = "core" | "cart";

type ServicePaths = { core: CorePaths; cart: CartPaths };

export interface ServerApiOptions {
  /** Time budget for every call; when it elapses the call rejects with ApiTimeoutError. */
  budgetMs: number;
  /** Headers forwarded explicitly by the caller (this module never reads request headers). */
  headers?: HeadersInit;
}

/** Thrown when a server-side call exceeds its time budget; the hole should render its fallback. */
export class ApiTimeoutError extends Error {
  readonly service: ApiService;
  readonly path: string;
  readonly budgetMs: number;

  constructor(init: { service: ApiService; path: string; budgetMs: number }) {
    super(`${init.service} ${init.path} exceeded its ${init.budgetMs} ms budget`);
    this.name = "ApiTimeoutError";
    this.service = init.service;
    this.path = init.path;
    this.budgetMs = init.budgetMs;
  }
}

const DEFAULT_URLS: Record<ApiService, { env: string; fallback: string }> = {
  core: { env: "CORE_INTERNAL_URL", fallback: "http://localhost:8081" },
  cart: { env: "CART_INTERNAL_URL", fallback: "http://localhost:8082" },
};

function baseUrlFor(service: ApiService): string {
  const { env, fallback } = DEFAULT_URLS[service];
  return process.env[env] || fallback;
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && error.name === "TimeoutError";
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/**
 * Typed client for Server Components calling core or cart-service over the internal network.
 * Every request has a hard time budget, is never cached by Next.js and never retries.
 */
export function serverApi<S extends ApiService>(
  service: S,
  options: ServerApiOptions,
): Client<ServicePaths[S]> {
  const { budgetMs, headers } = options;
  if (!Number.isFinite(budgetMs) || budgetMs <= 0) {
    throw new RangeError(`budgetMs must be a positive number, got ${budgetMs}`);
  }

  async function transport(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(budgetMs)]);
    let res: Response;
    try {
      res = await globalThis.fetch(new Request(request, { signal, cache: "no-store" }));
    } catch (error) {
      if (isTimeout(error)) throw new ApiTimeoutError({ service, path, budgetMs });
      if (isAbort(error)) throw error;
      throw networkError(error);
    }
    if (!res.ok) throw await apiErrorFromResponse(res);
    return res;
  }

  return createClient<ServicePaths[S]>({
    baseUrl: baseUrlFor(service),
    cache: "no-store",
    headers: { accept: "application/json", ...Object.fromEntries(new Headers(headers)) },
    fetch: transport,
  });
}
