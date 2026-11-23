// Tests for scripts/fixture-core.ts. Run: node --test scripts/tests/fixture-core.test.ts
// (vitest.config.mts is protected and does not collect scripts/, so this uses node:test.)
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { after, before, describe, it } from "node:test";

import type * as FixtureCore from "../fixture-core";

// Loaded at runtime with an explicit extension (tsconfig does not allow .ts imports).
const { startFixtureCore } = (await import(
  new URL("../fixture-core.ts", import.meta.url).href
)) as typeof FixtureCore;

let server: Server;
let base: string;

before(async () => {
  const started = await startFixtureCore(0);
  server = started.server;
  base = `http://127.0.0.1:${started.port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));

const get = (path: string, headers: Record<string, string> = {}) => fetch(base + path, { headers });

describe("fixture core", () => {
  it("GET /api/products lists summaries with a cursor, honouring category and limit", async () => {
    const res = await get("/api/products?limit=3");
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /^application\/json/);
    const page = (await res.json()) as { items: { slug: string }[]; nextCursor: string | null };
    assert.equal(page.items.length, 3);
    assert.ok(page.nextCursor);

    const next = (await (
      await get(`/api/products?limit=3&cursor=${page.nextCursor}`)
    ).json()) as typeof page;
    assert.notEqual(next.items[0]?.slug, page.items[0]?.slug);

    const audio = (await (await get("/api/products?category=am-thanh")).json()) as typeof page;
    assert.ok(audio.items.length > 0 && audio.items.length < 10);
    assert.equal(audio.nextCursor, null);

    assert.equal((await get("/api/products?cursor=%21%21")).status, 400);
  });

  it("GET /api/products/{slug} returns the product, 404 PRODUCT_NOT_FOUND for an unknown slug", async () => {
    const res = await get("/api/products/tai-nghe-khong-day-anc-pro");
    assert.equal(res.status, 200);
    const product = (await res.json()) as {
      price: { amount: number };
      listPrice: { amount: number };
    };
    assert.equal(product.price.amount, 1_290_000);
    assert.equal(product.listPrice.amount, 1_790_000);

    const missing = await get("/api/products/khong-co");
    assert.equal(missing.status, 404);
    assert.match(missing.headers.get("content-type") ?? "", /^application\/problem\+json/);
    assert.equal(((await missing.json()) as { code: string }).code, "PRODUCT_NOT_FOUND");
  });

  it("GET /api/products/{sku}/availability returns the sale price and LOW stock", async () => {
    const res = await get("/api/products/SKU-ANC-PRO-BLK/availability");
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      stockLevel: string;
      approxQuantity: number;
      price: { amount: number };
    };
    assert.deepEqual(
      [body.stockLevel, body.approxQuantity, body.price.amount],
      ["LOW", 40, 890_000],
    );
    assert.equal((await get("/api/products/SKU-NOPE/availability")).status, 404);
  });

  it("GET /api/flash-sales/current returns a running sale", async () => {
    const res = await get("/api/flash-sales/current");
    assert.equal(res.status, 200);
    const sale = (await res.json()) as { startsAt: string; endsAt: string; items: unknown[] };
    const now = Date.now();
    assert.ok(Date.parse(sale.startsAt) < now && Date.parse(sale.endsAt) > now);
    assert.ok(sale.items.length > 0);
  });

  it("GET /api/products/{slug}/member-price needs credentials", async () => {
    const path = "/api/products/tai-nghe-khong-day-anc-pro/member-price";
    const anonymous = await get(path);
    assert.equal(anonymous.status, 401);
    assert.match(anonymous.headers.get("content-type") ?? "", /^application\/problem\+json/);
    assert.equal(((await anonymous.json()) as { code: string }).code, "AUTH_UNAUTHENTICATED");

    for (const headers of [
      { cookie: "a=b; access_token=x" },
      { authorization: "Bearer x" },
    ] as Record<string, string>[]) {
      const res = await get(path, headers);
      assert.equal(res.status, 200);
      assert.equal(((await res.json()) as { price: { amount: number } }).price.amount, 845_500);
    }
    assert.equal(
      (await get("/api/products/khong-co/member-price", { authorization: "x" })).status,
      404,
    );
  });

  it("GET /api/recommendations excludes the current product and honours limit", async () => {
    const res = await get("/api/recommendations?productSlug=tai-nghe-khong-day-anc-pro&limit=4");
    assert.equal(res.status, 200);
    const { items } = (await res.json()) as { items: { slug: string }[] };
    assert.equal(items.length, 4);
    assert.ok(items.every((p) => p.slug !== "tai-nghe-khong-day-anc-pro"));
  });

  it("answers 404 problem+json for other paths and methods", async () => {
    assert.equal((await get("/api/unknown")).status, 404);
    const post = await fetch(`${base}/api/products`, { method: "POST" });
    assert.equal(post.status, 404);
  });
});
