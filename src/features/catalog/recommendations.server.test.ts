import { http, HttpResponse } from "msw";

import { productOverrides } from "../../../mocks/product-handlers";
import { server } from "../../../mocks/node";

const { cookieGet } = vi.hoisted(() => ({ cookieGet: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: cookieGet }) }));

import { RECOMMENDATIONS_BUDGET_MS, listRecommendations } from "./recommendations.server";

function captureAuthorization() {
  const seen: Array<string | null> = [];
  server.use(
    http.get("*/api/recommendations", ({ request }) => {
      seen.push(request.headers.get("authorization"));
      return HttpResponse.json({ items: [] });
    }),
  );
  return seen;
}

describe("listRecommendations", () => {
  beforeEach(() => cookieGet.mockReset());

  it("sends the bearer token when the request has an access cookie", async () => {
    cookieGet.mockReturnValue({ name: "access_token", value: "tok-1" });
    const seen = captureAuthorization();
    await listRecommendations();
    expect(cookieGet).toHaveBeenCalledWith("access_token");
    expect(seen).toEqual(["Bearer tok-1"]);
  });

  it("sends no Authorization header without the access cookie", async () => {
    cookieGet.mockReturnValue(undefined);
    const seen = captureAuthorization();
    await listRecommendations();
    expect(seen).toEqual([null]);
  });

  it("returns the recommended items", async () => {
    cookieGet.mockReturnValue(undefined);
    expect(await listRecommendations()).toHaveLength(5);
  });

  it("rejects when the backend exceeds the 250 ms budget", async () => {
    cookieGet.mockReturnValue(undefined);
    expect(RECOMMENDATIONS_BUDGET_MS).toBe(250);
    server.use(productOverrides.delayedRecommendations("infinite"));
    await expect(listRecommendations()).rejects.toMatchObject({ name: "ApiTimeoutError" });
  });
});
