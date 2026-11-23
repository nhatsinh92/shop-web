import { describe, expect, it } from "vitest";

import { productDetailFixtures } from "./fixtures/products";

const ancSlug = "tai-nghe-khong-day-anc-pro";

describe("listProducts category filter (#75)", () => {
  it("returns the products of subcategories for a parent slug", async () => {
    const anc = productDetailFixtures.find((p) => p.slug === ancSlug)!;
    const parent = anc.category.path.at(-2)!.slug;
    const res = await fetch(`http://localhost/api/products?category=${parent}&limit=50`);
    const body = (await res.json()) as { items: { slug: string }[] };

    expect(res.status).toBe(200);
    expect(body.items.map((p) => p.slug)).toContain(ancSlug);
    const leafOnly = productDetailFixtures.filter((p) => p.category.slug === parent);
    expect(body.items.length).toBeGreaterThan(leafOnly.length);
  });
});
