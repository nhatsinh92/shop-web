import type { components } from "./generated/core";

type Problem = components["schemas"]["Problem"];
export type FieldError = components["schemas"]["FieldError"];

/** Error for every failed API call: HTTP errors (Problem), network failures (status 0). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail: string;
  readonly errors?: FieldError[];

  constructor(init: { status: number; code: string; detail: string; errors?: FieldError[] }) {
    super(init.detail);
    this.name = "ApiError";
    this.status = init.status;
    this.code = init.code;
    this.detail = init.detail;
    if (init.errors) this.errors = init.errors;
  }
}

function isProblem(body: unknown): body is Partial<Problem> {
  return typeof body === "object" && body !== null && typeof (body as Problem).code === "string";
}

/** Maps a non-2xx response to an ApiError; non-Problem bodies become UNKNOWN_ERROR. */
export async function apiErrorFromResponse(res: Response): Promise<ApiError> {
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/problem+json")) {
    const body: unknown = await res.json().catch(() => null);
    if (isProblem(body)) {
      return new ApiError({
        status: res.status,
        code: body.code as string,
        detail: body.detail ?? body.title ?? res.statusText,
        ...(body.errors ? { errors: body.errors } : {}),
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
