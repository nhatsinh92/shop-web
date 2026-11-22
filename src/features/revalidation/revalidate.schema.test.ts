import { describe, expect, it } from "vitest";

import { revalidateBodySchema } from "./revalidate.schema";

describe("revalidateBodySchema", () => {
  it("accepts allowed tags and ignores other event fields", () => {
    const r = revalidateBodySchema.safeParse({
      eventId: "x",
      tags: ["products", "flash-sale", "product-3fa85f64-5717-4562-b3fc-2c963f66afa6"],
    });
    expect(r.success).toBe(true);
  });
  it.each([["orders"], ["product-123"], ["Products"], ["products "]])("rejects %s", (tag) => {
    expect(revalidateBodySchema.safeParse({ tags: [tag] }).success).toBe(false);
  });
});
