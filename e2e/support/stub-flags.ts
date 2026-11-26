import type { IncomingMessage, ServerResponse } from "node:http";

/** The operator flags of `GET /api/flags` (contract core.yaml `getFeatureFlags`). */
export interface StubFlags {
  recommendations: boolean;
  memberPrice: boolean;
  onlinePayment: boolean;
}

export type FlagName = keyof StubFlags;

const FLAG_NAMES: FlagName[] = ["recommendations", "memberPrice", "onlinePayment"];

/**
 * Flags are global to the stub and to the Next server (`getFlags` is cached for about 5 s per
 * instance and carries no identity), so they cannot be keyed by user like the other scenarios.
 * Specs that flip them run in the serial `flags` Playwright project and always reset them.
 */
const flags: StubFlags = { recommendations: true, memberPrice: true, onlinePayment: true };

export function resetFlags(): void {
  for (const name of FLAG_NAMES) flags[name] = true;
}

function json(res: ServerResponse, status: number, body?: unknown) {
  const headers: Record<string, string> = { "cache-control": "no-store" };
  if (body !== undefined) headers["content-type"] = "application/json";
  res.writeHead(status, headers);
  res.end(body === undefined ? undefined : JSON.stringify(body));
}

/**
 * Answers `GET /api/flags` (all flags on by default) and the control route
 * `POST /__stub/flags?recommendations=off&memberPrice=on`: each listed flag is set, the others
 * keep their value; `POST /__stub/flags?reset=1` turns everything back on.
 * Returns false for any other route.
 */
export function handleFlagsRoute(req: IncomingMessage, res: ServerResponse, url: URL): boolean {
  if (url.pathname === "/api/flags" && req.method === "GET") {
    json(res, 200, flags);
    return true;
  }
  if (url.pathname === "/__stub/flags" && req.method === "POST") {
    if (url.searchParams.get("reset") === "1") resetFlags();
    for (const name of FLAG_NAMES) {
      const value = url.searchParams.get(name);
      if (value === "on" || value === "off") flags[name] = value === "on";
    }
    json(res, 200, flags);
    return true;
  }
  return false;
}
