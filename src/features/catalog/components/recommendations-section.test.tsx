import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";

import { productOverrides } from "../../../../mocks/product-handlers";
import { server } from "../../../../mocks/node";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

import { RecommendationsSection } from "./recommendations-section";
import { RecommendationsSkeleton } from "./recommendations-skeleton";

async function renderSection() {
  return render(await RecommendationsSection()).container;
}

describe("RecommendationsSection", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => errorSpy.mockRestore());

  it("renders the heading and one product card per recommendation, without a reason line", async () => {
    await renderSection();
    expect(screen.getByRole("heading", { name: "Gợi ý cho bạn" })).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(5);
    expect(screen.queryByText(/Vì bạn đã xem/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/₫/).length).toBeGreaterThan(0);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("renders nothing and logs once on a timeout", async () => {
    server.use(productOverrides.delayedRecommendations(400));
    const container = await renderSection();
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("renders nothing and logs once on a 503", async () => {
    server.use(
      http.get("*/api/recommendations", () =>
        HttpResponse.json(
          { type: "about:blank", title: "Unavailable", status: 503, code: "UNAVAILABLE" },
          { status: 503, headers: { "content-type": "application/problem+json" } },
        ),
      ),
    );
    await renderSection();
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.queryByText(/lỗi/i)).not.toBeInTheDocument();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("renders nothing for an empty list", async () => {
    server.use(http.get("*/api/recommendations", () => HttpResponse.json({ items: [] })));
    await renderSection();
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });
});

describe("RecommendationsSkeleton", () => {
  it("shows five busy placeholder cards with an accessible label", () => {
    render(<RecommendationsSkeleton />);
    const region = screen.getByLabelText("Gợi ý cho bạn");
    expect(region).toHaveAttribute("aria-busy", "true");
    expect(screen.getAllByTestId("recommendation-skeleton-card")).toHaveLength(5);
  });
});
