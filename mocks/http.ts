import { createOpenApiHttp } from "openapi-msw";

import type { paths as CartPaths } from "../src/lib/api/generated/cart";
import type { paths as CorePaths } from "../src/lib/api/generated/core";

/**
 * Typed MSW `http` helpers, one per spec. Paths, params, query and response bodies are checked
 * against the generated contract types, so a handler that drifts from the contract fails `tsc`.
 * `baseUrl: "*"` matches any origin (browser, jsdom, gateway).
 */
export const coreHttp = createOpenApiHttp<CorePaths>({ baseUrl: "*" });
export const cartHttp = createOpenApiHttp<CartPaths>({ baseUrl: "*" });
