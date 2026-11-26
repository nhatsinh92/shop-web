import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";

import { flagsOverride } from "../../../mocks/flags-handlers";
import { productOverrides } from "../../../mocks/product-handlers";
import { server } from "../../../mocks/node";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/flags", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/flags")>();
  return { ...actual, getFlags: vi.fn(actual.getFlags) };
});

import { getFlags } from "@/lib/flags";

import { RecommendationsSection } from "./components/recommendations-section";
import { RECOMMENDATIONS_BUDGET_MS } from "./recommendations.server";

const emptyItems = () => HttpResponse.json({ items: [] });

function spyOnRecommendations() {
  const calls: string[] = [];
  server.events.on("request:start", ({ request }) => {
    if (new URL(request.url).pathname === "/api/recommendations") calls.push(request.url);
  });
  return calls;
}

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  server.events.removeAllListeners();
  vi.mocked(getFlags).mockRestore();
  errorSpy.mockRestore();
});

describe("RecommendationsSection feature flag", () => {
  it("renders nothing and sends no recommendations request when recommendations is off", async () => {
    server.use(flagsOverride("all-off"));
    const calls = spyOnRecommendations();
    const { container } = render(await RecommendationsSection());
    expect(container).toBeEmptyDOMElement();
    expect(calls).toEqual([]);
  });

  it("renders the items when recommendations is on", async () => {
    const calls = spyOnRecommendations();
    render(await RecommendationsSection());
    expect(screen.getByRole("heading", { name: "Gợi ý cho bạn" })).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(5);
    expect(calls).toHaveLength(1);
  });

  it("renders nothing for an empty list when on", async () => {
    server.use(http.get("*/api/recommendations", emptyItems));
    const { container } = render(await RecommendationsSection());
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for an error when on", async () => {
    server.use(http.get("*/api/recommendations", () => new HttpResponse(null, { status: 503 })));
    const { container } = render(await RecommendationsSection());
    expect(container).toBeEmptyDOMElement();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("renders as with the flag on when the flags reader fails (defaults)", async () => {
    server.use(flagsOverride("error"));
    render(await RecommendationsSection());
    expect(screen.getAllByRole("article")).toHaveLength(5);
  });

  it("resolves within the 250 ms budget when flags take 100 ms and the data call hangs", async () => {
    const actual = await vi.importActual<typeof import("@/lib/flags")>("@/lib/flags");
    vi.mocked(getFlags).mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 100));
      return { ...actual.DEFAULT_FLAGS };
    });
    server.use(productOverrides.delayedRecommendations("infinite"));
    const startedAt = Date.now();
    const { container } = render(await RecommendationsSection());
    const elapsed = Date.now() - startedAt;
    expect(container).toBeEmptyDOMElement();
    expect(elapsed).toBeGreaterThanOrEqual(RECOMMENDATIONS_BUDGET_MS - 20);
    expect(elapsed).toBeLessThan(RECOMMENDATIONS_BUDGET_MS + 100);
  });
});
