import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";

import { server } from "@mocks/node";
import { memberPriceFor, productDetailFixtures } from "@mocks/fixtures/products";

import { MemberPrice } from "./member-price";
import { MemberPriceClient } from "./member-price-client";
import { MemberPriceLine, TIER_LABELS } from "./member-price-line";

const { getForRequest } = vi.hoisted(() => ({ getForRequest: vi.fn() }));
vi.mock("../member-price.server", () => ({ getMemberPriceForRequest: getForRequest }));

const slug = productDetailFixtures[0]!.slug;

function withClient(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const problem401 = () =>
  HttpResponse.json(
    { type: "about:blank", title: "Unauthorized", status: 401, code: "AUTH_UNAUTHENTICATED" },
    { status: 401, headers: { "content-type": "application/problem+json" } },
  );

// The browser sends the access cookie; node fetch under MSW does not, so answer directly.
beforeEach(() => {
  server.use(
    http.get("*/api/products/:slug/member-price", ({ params }) =>
      HttpResponse.json(memberPriceFor(String(params.slug))),
    ),
  );
});

describe("MemberPrice", () => {
  it("renders the member price line for a 200 (GOLD → Vàng)", async () => {
    getForRequest.mockResolvedValue({ kind: "price", price: memberPriceFor(slug) });
    render(await MemberPrice({ slug }));
    expect(screen.getByTestId("member-price")).toHaveTextContent(
      /^Giá thành viên Vàng của bạn: .+₫$/,
    );
  });

  it("links guests to the login page with an encoded next", async () => {
    getForRequest.mockResolvedValue({ kind: "guest" });
    render(await MemberPrice({ slug: "a b" }));
    expect(screen.getByRole("link", { name: "Đăng nhập để xem giá thành viên" })).toHaveAttribute(
      "href",
      "/login?next=%2Fproduct%2Fa%20b",
    );
  });

  it("renders nothing for any other error", async () => {
    getForRequest.mockResolvedValue({ kind: "none" });
    const { container } = render(await MemberPrice({ slug }));
    expect(container).toBeEmptyDOMElement();
  });

  it("hands over to the client component for the client result", async () => {
    getForRequest.mockResolvedValue({ kind: "client" });
    withClient(await MemberPrice({ slug }));
    expect(await screen.findByTestId("member-price")).toBeInTheDocument();
  });
});

describe("MemberPriceLine", () => {
  it("labels every tier in Vietnamese", () => {
    expect(TIER_LABELS).toEqual({
      STANDARD: "Tiêu chuẩn",
      SILVER: "Bạc",
      GOLD: "Vàng",
      PLATINUM: "Bạch kim",
    });
  });

  it("formats the price", () => {
    render(
      <MemberPriceLine
        price={{ sku: "S", memberTier: "GOLD", price: { amount: 845500, currency: "VND" } }}
      />,
    );
    expect(screen.getByTestId("member-price")).toHaveTextContent(
      "Giá thành viên Vàng của bạn: 845.500₫",
    );
  });
});

describe("MemberPriceClient", () => {
  it("shows the same line after fetching through /api/*", async () => {
    withClient(<MemberPriceClient slug={slug} />);
    expect(await screen.findByTestId("member-price")).toHaveTextContent(
      "Giá thành viên Vàng của bạn",
    );
  });

  it("refreshes after a 401 and shows the price from the retry", async () => {
    let calls = 0;
    let refreshed = 0;
    server.use(
      http.get("*/api/products/:slug/member-price", () => {
        calls += 1;
        return calls === 1 ? problem401() : HttpResponse.json(memberPriceFor(slug));
      }),
      http.post("*/api/auth/refresh", () => {
        refreshed += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    withClient(<MemberPriceClient slug={slug} />);
    expect(await screen.findByTestId("member-price")).toBeInTheDocument();
    expect({ calls, refreshed }).toEqual({ calls: 2, refreshed: 1 });
  });

  it("renders nothing on a final error", async () => {
    server.use(
      http.get("*/api/products/:slug/member-price", () => new HttpResponse(null, { status: 500 })),
    );
    const { container } = withClient(<MemberPriceClient slug={slug} />);
    await vi.waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
