import { http, HttpResponse } from "msw";

import { productOverrides } from "../../../mocks/product-handlers";
import {
  flashSaleFixture,
  productDetailFixtures,
  productSummaryFixtures,
} from "../../../mocks/fixtures/products";
import { server } from "../../../mocks/node";

const { cacheLife, cacheTag, notFound } = vi.hoisted(() => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  notFound: vi.fn((): never => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife, cacheTag }));
vi.mock("next/navigation", () => ({ notFound }));

import {
  AVAILABILITY_BUDGET_MS,
  FLASH_SALE_BUDGET_MS,
  PRODUCT_BUDGET_MS,
  PRODUCT_LIST_BUDGET_MS,
  getAvailability,
  getCurrentFlashSale,
  getProductBySlug,
  getSimilarProducts,
  listStaticProductSlugs,
} from "./catalog.server";

const CORE = "http://localhost:8081";
const seen: Request[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  seen.length = 0;
  server.events.on("request:start", ({ request }) => {
    seen.push(request.clone());
  });
});
afterEach(() => {
  server.events.removeAllListeners();
});

const first = productDetailFixtures[0]!;

describe("time budgets", () => {
  it("are between 150 and 300 ms", () => {
    for (const ms of [
      FLASH_SALE_BUDGET_MS,
      PRODUCT_BUDGET_MS,
      AVAILABILITY_BUDGET_MS,
      PRODUCT_LIST_BUDGET_MS,
    ]) {
      expect(ms).toBeGreaterThanOrEqual(150);
      expect(ms).toBeLessThanOrEqual(300);
    }
  });
});

describe("getCurrentFlashSale", () => {
  it("returns the sale with cacheLife minutes and tag flash-sale", async () => {
    const sale = await getCurrentFlashSale();
    expect(sale?.items.length).toBe(flashSaleFixture.items.length);
    expect(cacheLife).toHaveBeenCalledWith("minutes");
    expect(cacheTag).toHaveBeenCalledWith("flash-sale");
  });

  it("returns null on FLASH_SALE_NONE", async () => {
    server.use(productOverrides.noFlashSale);
    await expect(getCurrentFlashSale()).resolves.toBeNull();
  });

  it("throws on a 503 instead of returning empty data", async () => {
    server.use(
      http.get(`${CORE}/api/flash-sales/current`, () => new HttpResponse(null, { status: 503 })),
    );
    await expect(getCurrentFlashSale()).rejects.toMatchObject({ status: 503 });
  });
});

describe("getProductBySlug", () => {
  it("uses cacheLife hours and tags products and product-{id}", async () => {
    const product = await getProductBySlug(first.slug);
    expect(product.id).toBe(first.id);
    expect(cacheLife).toHaveBeenCalledWith("hours");
    expect(cacheTag).toHaveBeenCalledWith("products");
    expect(cacheTag).toHaveBeenCalledWith(`product-${first.id}`);
  });

  it("calls notFound() on PRODUCT_NOT_FOUND", async () => {
    await expect(getProductBySlug("no-such-product")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledOnce();
  });

  it("throws other errors", async () => {
    server.use(
      http.get(`${CORE}/api/products/:slug`, () => new HttpResponse(null, { status: 503 })),
    );
    await expect(getProductBySlug(first.slug)).rejects.toMatchObject({ status: 503 });
    expect(notFound).not.toHaveBeenCalled();
  });
});

describe("getAvailability", () => {
  it("uses cacheLife seconds and tag product-{id}", async () => {
    const availability = await getAvailability(first.sku, first.id);
    expect(availability.sku).toBe(first.sku);
    expect(cacheLife).toHaveBeenCalledWith("seconds");
    expect(cacheTag).toHaveBeenCalledWith(`product-${first.id}`);
  });
});

describe("getSimilarProducts", () => {
  it("requests the leaf category with limit 6, drops the current product and returns at most five", async () => {
    const similar = await getSimilarProducts(first);
    const url = new URL(seen.at(-1)!.url);
    expect(url.pathname).toBe("/api/products");
    expect(url.searchParams.get("category")).toBe(first.category.slug);
    expect(url.searchParams.get("limit")).toBe("6");
    expect(similar.some((p) => p.slug === first.slug)).toBe(false);
    expect(similar.length).toBeLessThanOrEqual(5);
    expect(cacheLife).toHaveBeenCalledWith("hours");
    expect(cacheTag).toHaveBeenCalledWith("products");
  });

  it("caps the result at five when the other six all match", async () => {
    server.use(
      http.get(`${CORE}/api/products`, () =>
        HttpResponse.json({ items: productSummaryFixtures.slice(0, 6), nextCursor: null }),
      ),
    );
    const similar = await getSimilarProducts({ ...first, slug: "not-in-list" });
    expect(similar).toHaveLength(5);
  });
});

describe("listStaticProductSlugs", () => {
  it("returns flash sale slugs plus the first page, de-duplicated", async () => {
    const slugs = await listStaticProductSlugs();
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const item of flashSaleFixture.items) expect(slugs).toContain(item.slug);
    expect(slugs).toContain(productSummaryFixtures[0]!.slug);
  });

  it("throws when there is nothing to prerender", async () => {
    server.use(
      productOverrides.noFlashSale,
      http.get(`${CORE}/api/products`, () => HttpResponse.json({ items: [], nextCursor: null })),
    );
    await expect(listStaticProductSlugs()).rejects.toThrow(/no products/);
  });
});

describe("requests", () => {
  it("never send an authorization header", async () => {
    await getCurrentFlashSale();
    await getProductBySlug(first.slug);
    await getAvailability(first.sku, first.id);
    await getSimilarProducts(first);
    await listStaticProductSlugs();
    expect(seen.length).toBeGreaterThanOrEqual(5);
    for (const request of seen) expect(request.headers.get("authorization")).toBeNull();
  });
});
