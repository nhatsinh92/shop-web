import { http, HttpResponse } from "msw";

import { productDetailFixtures, productSummaryFixtures } from "../../../mocks/fixtures/products";
import { server } from "../../../mocks/node";

const { cacheLife, cacheTag } = vi.hoisted(() => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife, cacheTag }));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));

import { getSimilarProducts } from "./catalog.server";

const CORE = "http://localhost:8081";

function detail(slug: string) {
  const found = productDetailFixtures.find((p) => p.slug === slug);
  if (!found) throw new Error(`no fixture ${slug}`);
  return found;
}

const ancPro = detail("tai-nghe-khong-day-anc-pro");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getSimilarProducts with the parent category (#75)", () => {
  it("fills the ANC Pro, alone in its leaf category, with five products of the parent", async () => {
    const similar = await getSimilarProducts(ancPro);

    expect(similar).toHaveLength(5);
    expect(similar.map((p) => p.slug)).not.toContain(ancPro.slug);
    const parent = ancPro.category.path.at(-2)!.slug;
    for (const item of similar) {
      expect(detail(item.slug).category.path.map((c) => c.slug)).toContain(parent);
    }
    expect(cacheLife).toHaveBeenCalledWith("hours");
    expect(cacheTag).toHaveBeenCalledWith("products");
  });

  it("puts leaf products first and does not repeat a product listed under both categories", async () => {
    const [a, b, c, d, e, f] = productSummaryFixtures;
    server.use(
      http.get(`${CORE}/api/products`, ({ request }) => {
        const category = new URL(request.url).searchParams.get("category");
        const items = category === ancPro.category.slug ? [a!, b!] : [b!, c!, d!, e!, f!];
        return HttpResponse.json({ items, nextCursor: null });
      }),
    );

    const similar = await getSimilarProducts({ ...ancPro, slug: "not-in-any-list" });

    expect(similar.map((p) => p.slug)).toEqual([a, b, c, d, e].map((p) => p!.slug));
  });

  it("reads the parent category first and the leaf category last", async () => {
    const categories: (string | null)[] = [];
    server.events.on("request:start", ({ request }) => {
      categories.push(new URL(request.url).searchParams.get("category"));
    });

    await getSimilarProducts(ancPro);
    server.events.removeAllListeners();

    expect(categories).toEqual([ancPro.category.path.at(-2)!.slug, ancPro.category.slug]);
  });

  it("uses only the leaf category for a product at the root", async () => {
    const root = { ...ancPro, category: { ...ancPro.category, path: [ancPro.category.path[0]!] } };
    const categories: (string | null)[] = [];
    server.events.on("request:start", ({ request }) => {
      categories.push(new URL(request.url).searchParams.get("category"));
    });

    await getSimilarProducts(root);
    server.events.removeAllListeners();

    expect(categories).toEqual([root.category.slug]);
  });
});
