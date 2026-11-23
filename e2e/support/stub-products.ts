import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

import type * as FixtureModule from "../../mocks/fixtures/products";

// Loaded lazily by path (not `import.meta`), so Playwright can import the helpers of
// stub-gateway.ts too. Playwright and `node e2e/support/stub-gateway.ts` both run from the root.
let fixtures: Promise<typeof FixtureModule> | undefined;
function loadFixtures(): Promise<typeof FixtureModule> {
  fixtures ??= import(pathToFileURL(resolve("mocks/fixtures/products.ts")).href) as Promise<
    typeof FixtureModule
  >;
  return fixtures;
}

/** Server-side calls are slower than the 250 ms budgets of the streamed holes. */
export const SLOW_DELAY_MS = 800;

export interface ProductContext {
  /** True when the caller's token says it belongs to the `slow` scenario. */
  slow: boolean;
  /** Server-to-server calls carry `Authorization`; browser calls only carry the cookie. */
  serverSide: boolean;
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

function json(res: ServerResponse, status: number, body: unknown, type = "application/json") {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

/** Answers the six product operations; returns false when the route is not one of them. */
export async function handleProductRoute(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  ctx: ProductContext,
): Promise<boolean> {
  if (req.method !== "GET") return false;
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const [api, resource, id, action] = parts;
  if (api !== "api") return false;
  const isProducts = resource === "products";
  const isSale = resource === "flash-sales" && id === "current" && parts.length === 3;
  const isRecs = resource === "recommendations" && parts.length === 2;
  if (!isProducts && !isSale && !isRecs) return false;

  const f = await loadFixtures();
  const notFound = () => json(res, 404, f.productNotFoundProblem, "application/problem+json");
  // Only the server-side streamed holes are slowed, so the browser fallback can still answer.
  const slowDown = () => (ctx.slow && ctx.serverSide ? sleep(SLOW_DELAY_MS) : undefined);

  if (isSale) json(res, 200, f.createFlashSale());
  else if (isRecs) {
    await slowDown();
    const slug = url.searchParams.get("productSlug");
    const limit = Number(url.searchParams.get("limit") ?? 5);
    const items = f.productSummaryFixtures
      .filter((p) => p.slug !== slug)
      .slice(0, Number.isInteger(limit) && limit > 0 ? limit : 5);
    json(res, 200, { items });
  } else if (parts.length === 2) {
    json(res, 200, { items: f.productSummaryFixtures, nextCursor: null });
  } else if (id && parts.length === 3) {
    const product = f.productDetailFixtures.find((p) => p.slug === id);
    if (product) json(res, 200, product);
    else notFound();
  } else if (id && action === "availability" && parts.length === 4) {
    const availability = f.availabilityFixtures[id];
    if (availability) json(res, 200, availability);
    else notFound();
  } else if (id && action === "member-price" && parts.length === 4) {
    const hasToken =
      Boolean(req.headers.authorization) || /access_token=/.test(req.headers.cookie ?? "");
    if (!hasToken) {
      json(res, 401, f.unauthenticatedProblem, "application/problem+json");
      return true;
    }
    await slowDown();
    const price = f.memberPriceFor(id);
    if (price) json(res, 200, price);
    else notFound();
  } else {
    notFound();
  }
  return true;
}
