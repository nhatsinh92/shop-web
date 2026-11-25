import type { components } from "./generated/core";

type Problem = components["schemas"]["Problem"];
export type FieldError = components["schemas"]["FieldError"];
/** One out-of-stock line of a 409 `CHECKOUT_OUT_OF_STOCK` problem. */
export type StockShortage = components["schemas"]["OutOfStockProblem"]["unavailable"][number];

/** Error for every failed API call: HTTP errors (Problem), network failures (status 0). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail: string;
  readonly errors?: FieldError[];
  declare readonly unavailable?: StockShortage[];

  constructor(init: {
    status: number;
    code: string;
    detail: string;
    errors?: FieldError[];
    unavailable?: StockShortage[];
  }) {
    super(init.detail);
    this.name = "ApiError";
    this.status = init.status;
    this.code = init.code;
    this.detail = init.detail;
    if (init.errors) this.errors = init.errors;
    if (init.unavailable) this.unavailable = init.unavailable;
  }
}

function isProblem(body: unknown): body is Partial<Problem> {
  return typeof body === "object" && body !== null && typeof (body as Problem).code === "string";
}

function isStockShortage(entry: unknown): entry is StockShortage {
  if (typeof entry !== "object" || entry === null) return false;
  const { sku, requested, available } = entry as Record<string, unknown>;
  return typeof sku === "string" && typeof requested === "number" && typeof available === "number";
}

/** The well-formed `unavailable` entries of a problem body, or undefined when there is no list. */
function readUnavailable(body: Record<string, unknown>): StockShortage[] | undefined {
  const { unavailable } = body;
  return Array.isArray(unavailable) ? unavailable.filter(isStockShortage) : undefined;
}

/** Maps a non-2xx response to an ApiError; non-Problem bodies become UNKNOWN_ERROR. */
export async function apiErrorFromResponse(res: Response): Promise<ApiError> {
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/problem+json")) {
    const body: unknown = await res.json().catch(() => null);
    if (isProblem(body)) {
      const unavailable = readUnavailable(body as Record<string, unknown>);
      return new ApiError({
        status: res.status,
        code: body.code as string,
        detail: body.detail ?? body.title ?? res.statusText,
        ...(body.errors ? { errors: body.errors } : {}),
        ...(unavailable ? { unavailable } : {}),
      });
    }
  }
  return new ApiError({ status: res.status, code: "UNKNOWN_ERROR", detail: res.statusText });
}

export function networkError(cause: unknown): ApiError {
  const error = new ApiError({
    status: 0,
    code: "NETWORK_ERROR",
    detail: cause instanceof Error ? cause.message : "Network request failed",
  });
  error.cause = cause;
  return error;
}
