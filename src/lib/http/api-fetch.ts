/**
 * Browser HTTP client for /api/* (rewritten to the gateway locally, routed by the ingress in
 * production). Cookies travel with every request; JavaScript never reads the tokens.
 *
 * Phase 1 (epic contract-client) replaces the hand-written types with ones generated from
 * @shop/api-contract and adds the single-flight refresh on 401 (docs/handoff/technical-notes.md §5).
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(
  path: string,
  parse: (body: unknown) => T,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "include",
    headers: { accept: "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const problem = (await res.json().catch(() => null)) as {
      code?: string;
      title?: string;
    } | null;
    throw new ApiError(res.status, problem?.code, problem?.title ?? res.statusText);
  }
  return parse(await res.json());
}
