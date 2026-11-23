import { delay } from "msw";

import {
  availabilityFixtures,
  availabilityFor,
  createFlashSale,
  flashSaleNoneProblem,
  memberPriceFor,
  paginationCursorInvalidProblem,
  productDetailFixtures,
  productNotFoundProblem,
  productSummaryFixtures,
  unauthenticatedProblem,
} from "./fixtures/products";
import { coreHttp } from "./http";

const DEFAULT_LIMIT = 20;

function problemHeaders(): Headers {
  return new Headers({ "Content-Type": "application/problem+json" });
}

function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ offset })).toString("base64url");
}

/** Returns the offset a cursor points to, or null when it cannot be read. */
function decodeCursor(cursor: string): number | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (typeof parsed === "object" && parsed !== null && "offset" in parsed) {
      const { offset } = parsed;
      if (typeof offset === "number" && Number.isInteger(offset) && offset >= 0) return offset;
    }
  } catch {
    // fall through: not decodable
  }
  return null;
}

/** True when the request carries an `access_token` cookie or an `Authorization` header. */
function hasCredentials(request: Request): boolean {
  if (request.headers.get("authorization")) return true;
  const cookie = request.headers.get("cookie") ?? "";
  return cookie.split(";").some((part) => part.trim().startsWith("access_token="));
}

/** Products of a category: the leaf slug itself, or any category above it. */
function inCategory(detail: (typeof productDetailFixtures)[number], slug: string): boolean {
  return detail.category.path.some((c) => c.slug === slug);
}

const listProducts = coreHttp.get("/api/products", ({ request, response }) => {
  const url = new URL(request.url);
  const category = url.searchParams.get("category");
  const limit = Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT);
  const cursor = url.searchParams.get("cursor");
  const start = cursor === null ? 0 : decodeCursor(cursor);
  if (start === null) {
    return response(400).json(paginationCursorInvalidProblem, { headers: problemHeaders() });
  }
  const matching = category
    ? productSummaryFixtures.filter((_, i) => {
        const detail = productDetailFixtures[i];
        return detail ? inCategory(detail, category) : false;
      })
    : productSummaryFixtures;
  const pageSize = Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_LIMIT;
  const items = matching.slice(start, start + pageSize);
  const nextOffset = start + pageSize;
  return response(200).json(
    { items, nextCursor: nextOffset < matching.length ? encodeCursor(nextOffset) : null },
    { headers: { "Cache-Control": "public, max-age=120, stale-while-revalidate=600" } },
  );
});

const getProduct = coreHttp.get("/api/products/{slug}", ({ params, response }) => {
  const product = productDetailFixtures.find((p) => p.slug === params.slug);
  return product
    ? response(200).json(product)
    : response(404).json(productNotFoundProblem, { headers: problemHeaders() });
});

const getProductAvailability = coreHttp.get(
  "/api/products/{sku}/availability",
  ({ params, response }) => {
    const availability = availabilityFixtures[params.sku];
    return availability
      ? response(200).json(availability)
      : response(404).json(productNotFoundProblem, { headers: problemHeaders() });
  },
);

const getCurrentFlashSale = coreHttp.get("/api/flash-sales/current", ({ response }) =>
  response(200).json(createFlashSale()),
);

const getMemberPrice = coreHttp.get(
  "/api/products/{slug}/member-price",
  ({ request, params, response }) => {
    if (!hasCredentials(request)) {
      return response(401).json(unauthenticatedProblem, { headers: problemHeaders() });
    }
    const price = memberPriceFor(params.slug);
    return price
      ? response(200).json(price)
      : response(404).json(productNotFoundProblem, { headers: problemHeaders() });
  },
);

const listRecommendations = coreHttp.get("/api/recommendations", ({ request, response }) => {
  const url = new URL(request.url);
  const productSlug = url.searchParams.get("productSlug");
  const limit = Number(url.searchParams.get("limit") ?? 5);
  const items = productSummaryFixtures
    .filter((p) => p.slug !== productSlug)
    .slice(0, Number.isInteger(limit) && limit > 0 ? limit : 5);
  return response(200).json({ items });
});

/** Default handlers for the six product operations, typed against the contract. */
export const productHandlers = [
  listProducts,
  getProduct,
  getProductAvailability,
  getCurrentFlashSale,
  getMemberPrice,
  listRecommendations,
];

/** Per-scenario overrides for `server.use(...)` in tests and the dev mock. */
export const productOverrides = {
  /** No sale is running: 404 `FLASH_SALE_NONE`. */
  noFlashSale: coreHttp.get("/api/flash-sales/current", ({ response }) =>
    response(404).json(flashSaleNoneProblem, { headers: problemHeaders() }),
  ),
  /** Every SKU is out of stock. */
  outOfStock: coreHttp.get("/api/products/{sku}/availability", ({ params, response }) =>
    availabilityFixtures[params.sku]
      ? response(200).json(
          availabilityFor(params.sku, 0, availabilityFixtures[params.sku]?.price.amount ?? 0),
        )
      : response(404).json(productNotFoundProblem, { headers: problemHeaders() }),
  ),
  /** Recommendations that answer after `ms` milliseconds (250 ms budget tests). */
  delayedRecommendations: (ms: number) =>
    coreHttp.get("/api/recommendations", async ({ response }) => {
      await delay(ms);
      return response(200).json({ items: productSummaryFixtures.slice(5, 10) });
    }),
  /** Member price that answers after `ms` milliseconds (250 ms budget tests). */
  delayedMemberPrice: (ms: number) =>
    coreHttp.get("/api/products/{slug}/member-price", async ({ params, response }) => {
      await delay(ms);
      const price = memberPriceFor(params.slug);
      return price
        ? response(200).json(price)
        : response(404).json(productNotFoundProblem, { headers: problemHeaders() });
    }),
};
