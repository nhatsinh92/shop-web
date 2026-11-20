import { http, HttpResponse } from "msw";

/**
 * MSW handlers for tests and local mock mode. Phase 1 (epic contract-client) generates these
 * from @shop/api-contract; until then they mirror the provisional schemas in src/features.
 */
export const handlers = [http.get("*/api/cart/summary", () => HttpResponse.json({ itemCount: 3 }))];
