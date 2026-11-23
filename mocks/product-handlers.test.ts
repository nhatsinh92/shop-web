import { describe, expect, it } from "vitest";

import {
  availabilityFixtures,
  categoryFixtures,
  createFlashSale,
  flashSaleFixture,
  goldPrice,
  productDetailFixtures,
  productSummaryFixtures,
} from "./fixtures/products";
import { server } from "./node";
import { productOverrides } from "./product-handlers";

const base = "http://localhost";

function get(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${base}${path}`, init);
}

const ancSlug = "tai-nghe-khong-day-anc-pro";

describe("product fixtures", () => {
  it("has the ten products with matching summaries and the seed categories", () => {
    expect(productDetailFixtures).toHaveLength(10);
    expect(productSummaryFixtures.map((p) => p.sku)).toEqual(
      productDetailFixtures.map((p) => p.sku),
    );
    expect(categoryFixtures.map((c) => c.slug)).toContain("am-thanh");
  });

  it("ANC Pro id, slug and three SKUs match seed/products.sql", () => {
    const anc = productDetailFixtures.find((p) => p.slug === ancSlug);
    expect(anc?.id).toBe("00000000-0000-4000-8000-000000000001");
    expect(anc?.variants.map((v) => v.sku)).toEqual([
      "SKU-ANC-PRO-BLK",
      "SKU-ANC-PRO-WHT",
      "SKU-ANC-PRO-BLU",
    ]);
    expect(productDetailFixtures.map((p) => p.sku)).toEqual([
      "SKU-ANC-PRO-BLK",
      "SKU-AIRFRY-6L",
      "SKU-JACKET-WP",
      "SKU-KB-75",
      "SKU-BOTTLE-750",
      "SKU-MOUSE-SIL",
      "SKU-STAND-AL",
      "SKU-SLEEVE-14",
      "SKU-LAMP-LED",
      "SKU-PAD-90",
    ]);
  });

  it("ANC Pro matches the seed numbers: 1 290 000, list 1 790 000, sale 890 000, LOW / 40, GOLD 845 500", async () => {
    const anc = productDetailFixtures.find((p) => p.slug === ancSlug);
    expect(anc?.price.amount).toBe(1_290_000);
    expect(anc?.listPrice?.amount).toBe(1_790_000);
    expect(anc?.variants.map((v) => v.options[0]?.value)).toEqual([
      "Đen nhám",
      "Trắng sứ",
      "Xanh đêm",
    ]);
    const item = flashSaleFixture.items.find((i) => i.slug === ancSlug);
    expect(item?.salePrice.amount).toBe(890_000);
    for (const v of anc?.variants ?? []) {
      expect(availabilityFixtures[v.sku]).toMatchObject({
        stockLevel: "LOW",
        approxQuantity: 40,
        price: { amount: 890_000 },
      });
    }
    expect(goldPrice(890_000)).toBe(845_500);
    const res = await get(`/api/products/${ancSlug}/member-price`, {
      headers: { Authorization: "Bearer x" },
    });
    expect((await res.json()).price.amount).toBe(845_500);
  });

  it("flash sale items carry the artboard sale prices and sold shares", () => {
    expect(flashSaleFixture.items.map((i) => [i.salePrice.amount, i.soldPercent])).toEqual([
      [890_000, 82],
      [1_290_000, 64],
      [359_000, 47],
      [1_150_000, 91],
      [189_000, 30],
    ]);
  });

  it("flash sale window started one hour ago and ends in two hours, relative to now", () => {
    const now = new Date("2026-12-12T10:00:00.000Z");
    const sale = createFlashSale(now);
    expect(sale.startsAt).toBe("2026-12-12T09:00:00.000Z");
    expect(sale.endsAt).toBe("2026-12-12T12:00:00.000Z");
    const live = createFlashSale();
    expect(new Date(live.startsAt).getTime()).toBeLessThan(Date.now());
    expect(new Date(live.endsAt).getTime()).toBeGreaterThan(Date.now());
  });
});

describe("product MSW handlers", () => {
  it("listProducts filters by category leaf slug", async () => {
    const res = await get("/api/products?category=am-thanh");
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.items.map((i: { slug: string }) => i.slug)).toEqual([ancSlug]);
    expect(body.nextCursor).toBeNull();
  });

  it("listProducts honours limit and cursor in a stable order with nextCursor on a full page", async () => {
    const first = await (await get("/api/products?limit=4")).json();
    expect(first.items).toHaveLength(4);
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await (
      await get(`/api/products?limit=4&cursor=${encodeURIComponent(first.nextCursor)}`)
    ).json();
    const third = await (
      await get(`/api/products?limit=4&cursor=${encodeURIComponent(second.nextCursor)}`)
    ).json();
    const slugs = [...first.items, ...second.items, ...third.items].map(
      (i: { slug: string }) => i.slug,
    );
    expect(slugs).toEqual(productSummaryFixtures.map((p) => p.slug));
    expect(third.nextCursor).toBeNull();
  });

  it("listProducts answers 400 PAGINATION_CURSOR_INVALID for a cursor that does not decode", async () => {
    const res = await get("/api/products?cursor=not-a-cursor");
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("PAGINATION_CURSOR_INVALID");
  });

  it("getProduct answers 200 with the detail for a known slug", async () => {
    const res = await get(`/api/products/${ancSlug}`);
    expect(res.status).toBe(200);
    expect((await res.json()).brand).toBeTruthy();
  });

  it("getProduct with an unknown slug answers 404 problem+json PRODUCT_NOT_FOUND", async () => {
    const res = await get("/api/products/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
    expect((await res.json()).code).toBe("PRODUCT_NOT_FOUND");
  });

  it("getProductAvailability answers per SKU and 404 for an unknown SKU", async () => {
    const ok = await get("/api/products/SKU-ANC-PRO-BLK/availability");
    expect(await ok.json()).toEqual(availabilityFixtures["SKU-ANC-PRO-BLK"]);
    const missing = await get("/api/products/NOPE/availability");
    expect(missing.status).toBe(404);
  });

  it("getCurrentFlashSale answers 200 with five items", async () => {
    const res = await get("/api/flash-sales/current");
    expect(res.status).toBe(200);
    expect((await res.json()).items).toHaveLength(5);
  });

  it("getMemberPrice answers 200 with the GOLD price for an access_token cookie", async () => {
    const res = await get(`/api/products/${ancSlug}/member-price`, {
      headers: { cookie: "access_token=abc" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      sku: "SKU-ANC-PRO-BLK",
      memberTier: "GOLD",
      price: { amount: 845_500, currency: "VND" },
    });
  });

  it("getMemberPrice answers 401 AUTH_UNAUTHENTICATED without a cookie or header", async () => {
    const res = await get(`/api/products/${ancSlug}/member-price`);
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("AUTH_UNAUTHENTICATED");
  });

  it("getMemberPrice answers 404 for an unknown slug when signed in", async () => {
    const res = await get("/api/products/nope/member-price", {
      headers: { Authorization: "Bearer x" },
    });
    expect(res.status).toBe(404);
  });

  it("listRecommendations never returns the product itself and honours limit", async () => {
    const res = await get(`/api/recommendations?productSlug=${ancSlug}&limit=3`);
    const body = await res.json();
    expect(body.items).toHaveLength(3);
    expect(body.items.map((i: { slug: string }) => i.slug)).not.toContain(ancSlug);
  });
});

describe("product MSW overrides", () => {
  it("noFlashSale answers 404 FLASH_SALE_NONE", async () => {
    server.use(productOverrides.noFlashSale);
    const res = await get("/api/flash-sales/current");
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("FLASH_SALE_NONE");
  });

  it("outOfStock answers OUT_OF_STOCK without approxQuantity", async () => {
    server.use(productOverrides.outOfStock);
    const res = await get("/api/products/SKU-ANC-PRO-BLK/availability");
    expect(await res.json()).toEqual({
      sku: "SKU-ANC-PRO-BLK",
      price: { amount: 890_000, currency: "VND" },
      stockLevel: "OUT_OF_STOCK",
    });
    expect((await get("/api/products/NOPE/availability")).status).toBe(404);
  });

  it("delayedRecommendations answers only after the delay", async () => {
    server.use(productOverrides.delayedRecommendations(60));
    const started = Date.now();
    const res = await get("/api/recommendations");
    expect(res.status).toBe(200);
    expect(Date.now() - started).toBeGreaterThanOrEqual(50);
    expect((await res.json()).items).toHaveLength(5);
  });

  it("delayedMemberPrice answers only after the delay", async () => {
    server.use(productOverrides.delayedMemberPrice(60));
    const started = Date.now();
    const res = await get(`/api/products/${ancSlug}/member-price`);
    expect(res.status).toBe(200);
    expect(Date.now() - started).toBeGreaterThanOrEqual(50);
    expect((await get("/api/products/nope/member-price")).status).toBe(404);
  });
});
