// @vitest-environment node
import { revalidateTag } from "next/cache";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { handleRevalidate } from "./handle-revalidate";
import { computeSignature } from "./signature";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

const SECRET = "s3cret-value-for-tests";
const UUID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

function signed(body: string, secret = SECRET, t = Math.floor(Date.now() / 1000)) {
  return new Request("http://localhost/hooks/revalidate", {
    method: "POST",
    body,
    headers: { "x-shop-signature": `t=${t},v1=${computeSignature(secret, t, body)}` },
  });
}

describe("handleRevalidate", () => {
  beforeEach(() => {
    vi.stubEnv("REVALIDATE_SECRET", SECRET);
    vi.mocked(revalidateTag).mockClear();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("revalidates each de-duplicated tag once with expire 0 and answers 204", async () => {
    const tags = ["products", `product-${UUID}`, "products", "flash-sale"];
    const res = await handleRevalidate(signed(JSON.stringify({ eventId: UUID, tags })));
    expect(res.status).toBe(204);
    expect(revalidateTag).toHaveBeenCalledTimes(3);
    expect(revalidateTag).toHaveBeenCalledWith("products", { expire: 0 });
    expect(revalidateTag).toHaveBeenCalledWith(`product-${UUID}`, { expire: 0 });
    expect(revalidateTag).toHaveBeenCalledWith("flash-sale", { expire: 0 });
  });

  it("answers 401 problem+json for a bad signature and revalidates nothing", async () => {
    const res = await handleRevalidate(signed('{"tags":["products"]}', "wrong-secret"));
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toBe("application/problem+json");
    expect(((await res.json()) as { code: string }).code).toBe("REVALIDATE_SIGNATURE_INVALID");
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("answers 401 when the signature header is missing", async () => {
    const res = await handleRevalidate(
      new Request("http://localhost/hooks/revalidate", { method: "POST", body: "{}" }),
    );
    expect(res.status).toBe(401);
  });

  it("answers 404 for every request when no secret is configured", async () => {
    vi.stubEnv("REVALIDATE_SECRET", "");
    const res = await handleRevalidate(signed('{"tags":["products"]}'));
    expect(res.status).toBe(404);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it.each([
    ["an unknown tag", '{"tags":["products","orders"]}'],
    ["an empty list", '{"tags":[]}'],
    ["a missing tags field", "{}"],
    ["invalid JSON", "{not json"],
  ])("answers 400 and revalidates nothing for %s (all or nothing)", async (_name, body) => {
    const res = await handleRevalidate(signed(body));
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toBe("application/problem+json");
    expect(((await res.json()) as { code: string }).code).toBe("VALIDATION_FAILED");
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("never logs or returns the secret or the signature", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
    const bad = signed('{"tags":["nope"]}');
    const sig = bad.headers.get("x-shop-signature") ?? "";
    const responses = [await handleRevalidate(bad), await handleRevalidate(signed("{}", "x"))];
    for (const r of responses) {
      const text = await r.text();
      expect(text).not.toContain(SECRET);
      expect(text).not.toContain(sig);
    }
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});
