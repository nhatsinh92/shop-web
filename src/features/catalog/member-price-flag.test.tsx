import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";

import { flagsOverride } from "../../../mocks/flags-handlers";
import { memberPriceFor, productDetailFixtures } from "../../../mocks/fixtures/products";
import { productOverrides } from "../../../mocks/product-handlers";
import { server } from "../../../mocks/node";

const { cookieGet } = vi.hoisted(() => ({ cookieGet: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: cookieGet }) }));
vi.mock("@/lib/flags", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/flags")>();
  return { ...actual, getFlags: vi.fn(actual.getFlags) };
});

import { getFlags } from "@/lib/flags";

import { MemberPrice } from "./components/member-price";
import { MEMBER_PRICE_BUDGET_MS, getMemberPriceForRequest } from "./member-price.server";

const slug = productDetailFixtures[0]!.slug;

function cookies(values: Record<string, string>) {
  cookieGet.mockImplementation((name: string) =>
    name in values ? { name, value: values[name] } : undefined,
  );
}

function spyOnMemberPrice() {
  const calls: string[] = [];
  server.events.on("request:start", ({ request }) => {
    if (new URL(request.url).pathname.endsWith("/member-price")) calls.push(request.url);
  });
  return calls;
}

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  cookieGet.mockReset();
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  server.use(
    http.get("*/api/products/:slug/member-price", ({ params }) =>
      HttpResponse.json(memberPriceFor(String(params.slug))),
    ),
  );
});
afterEach(() => {
  server.events.removeAllListeners();
  vi.mocked(getFlags).mockRestore();
  errorSpy.mockRestore();
});

describe("member price with memberPrice off", () => {
  it.each([
    ["an access cookie", { access_token: "tok-1" }],
    ["only a session hint", { logged_in: "1" }],
    ["a guest", {}],
  ])("returns none without calling the endpoint for %s", async (_name, jar) => {
    server.use(flagsOverride("all-off"));
    cookies(jar);
    const calls = spyOnMemberPrice();
    expect(await getMemberPriceForRequest(slug)).toEqual({ kind: "none" });
    expect(calls).toEqual([]);
  });

  it("MemberPrice renders no line, no login link and no client component", async () => {
    server.use(flagsOverride("all-off"));
    cookies({ access_token: "tok-1" });
    const calls = spyOnMemberPrice();
    const client = new QueryClient();
    const { container } = render(
      <QueryClientProvider client={client}>{await MemberPrice({ slug })}</QueryClientProvider>,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(calls).toEqual([]);
  });

  it("MemberPrice renders no login prompt for a guest", async () => {
    server.use(flagsOverride("all-off"));
    cookies({});
    const { container } = render(await MemberPrice({ slug }));
    expect(container).toBeEmptyDOMElement();
  });
});

describe("member price with memberPrice on", () => {
  it("renders the four result kinds as today", async () => {
    cookies({ access_token: "tok-1" });
    expect(await getMemberPriceForRequest(slug)).toMatchObject({ kind: "price" });

    cookies({ logged_in: "1" });
    expect(await getMemberPriceForRequest(slug)).toEqual({ kind: "client" });

    cookies({});
    expect(await getMemberPriceForRequest(slug)).toEqual({ kind: "guest" });
    render(await MemberPrice({ slug }));
    expect(screen.getByRole("link", { name: "Đăng nhập để xem giá thành viên" })).toBeVisible();

    cookies({ access_token: "tok-1" });
    server.use(
      http.get("*/api/products/:slug/member-price", () => new HttpResponse(null, { status: 500 })),
    );
    expect(await getMemberPriceForRequest(slug)).toEqual({ kind: "none" });
  });

  it("behaves as with the flag on when the flags reader fails (defaults)", async () => {
    server.use(flagsOverride("error"));
    cookies({});
    expect(await getMemberPriceForRequest(slug)).toEqual({ kind: "guest" });
  });

  it("resolves within the 250 ms budget when flags take 100 ms and the data call hangs", async () => {
    const actual = await vi.importActual<typeof import("@/lib/flags")>("@/lib/flags");
    vi.mocked(getFlags).mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 100));
      return { ...actual.DEFAULT_FLAGS };
    });
    cookies({ access_token: "tok-1" });
    server.use(productOverrides.delayedMemberPrice("infinite"));
    const startedAt = Date.now();
    const result = await getMemberPriceForRequest(slug);
    const elapsed = Date.now() - startedAt;
    expect(result).toEqual({ kind: "client" });
    expect(elapsed).toBeGreaterThanOrEqual(MEMBER_PRICE_BUDGET_MS - 20);
    expect(elapsed).toBeLessThan(MEMBER_PRICE_BUDGET_MS + 100);
  });
});
