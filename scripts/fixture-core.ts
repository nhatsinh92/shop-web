// A small stand-in for core that answers the six product operations from mocks/fixtures/products.ts.
// `next build` prerenders cached product data, so CI and cloud sessions (no backend) point
// CORE_INTERNAL_URL at this server. Plain Node `http`, no MSW. Run by scripts/with-fixture-core.sh.
// Node strips the types (22.18+); the fixtures are loaded at runtime with an explicit extension.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";

import type * as FixtureModule from "../mocks/fixtures/products";

const fixtures = (await import(
  new URL("../mocks/fixtures/products.ts", import.meta.url).href
)) as typeof FixtureModule;

const DEFAULT_LIMIT = 20;
const JSON_TYPE = "application/json";
const PROBLEM_TYPE = "application/problem+json";

function send(res: ServerResponse, status: number, body: unknown, type = JSON_TYPE, extra = {}) {
  res.writeHead(status, { "Content-Type": type, ...extra });
  res.end(JSON.stringify(body));
}

const problem = (res: ServerResponse, status: number, body: unknown) =>
  send(res, status, body, PROBLEM_TYPE);

function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ offset })).toString("base64url");
}

/** The offset a cursor points to, or null when it cannot be read. */
function decodeCursor(cursor: string): number | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (typeof parsed === "object" && parsed !== null && "offset" in parsed) {
      const { offset } = parsed;
      if (typeof offset === "number" && Number.isInteger(offset) && offset >= 0) return offset;
    }
  } catch {
    // not decodable
  }
  return null;
}

function hasCredentials(req: IncomingMessage): boolean {
  if (req.headers.authorization) return true;
  return (req.headers.cookie ?? "").split(";").some((c) => c.trim().startsWith("access_token="));
}

function listProducts(url: URL, res: ServerResponse) {
  const category = url.searchParams.get("category");
  const limit = Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT);
  const cursor = url.searchParams.get("cursor");
  const start = cursor === null ? 0 : decodeCursor(cursor);
  if (start === null) return problem(res, 400, fixtures.paginationCursorInvalidProblem);
  const matching = category
    ? fixtures.productSummaryFixtures.filter((_, i) =>
        fixtures.productDetailFixtures[i]?.category.path.some((c) => c.slug === category),
      )
    : fixtures.productSummaryFixtures;
  const pageSize = Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_LIMIT;
  const next = start + pageSize;
  send(
    res,
    200,
    {
      items: matching.slice(start, next),
      nextCursor: next < matching.length ? encodeCursor(next) : null,
    },
    JSON_TYPE,
    { "Cache-Control": "public, max-age=120, stale-while-revalidate=600" },
  );
}

function route(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://fixture-core");
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const [api, resource, id, action] = parts;
  const notFound = () => problem(res, 404, fixtures.productNotFoundProblem);
  if (req.method !== "GET" || api !== "api") return notFound();

  if (resource === "products" && parts.length === 2) return listProducts(url, res);
  if (resource === "products" && id && parts.length === 3) {
    const product = fixtures.productDetailFixtures.find((p) => p.slug === id);
    return product ? send(res, 200, product) : notFound();
  }
  if (resource === "products" && id && action === "availability" && parts.length === 4) {
    const availability = fixtures.availabilityFixtures[id];
    return availability ? send(res, 200, availability) : notFound();
  }
  if (resource === "products" && id && action === "member-price" && parts.length === 4) {
    if (!hasCredentials(req)) return problem(res, 401, fixtures.unauthenticatedProblem);
    const price = fixtures.memberPriceFor(id);
    return price ? send(res, 200, price) : notFound();
  }
  if (resource === "flash-sales" && id === "current" && parts.length === 3) {
    return send(res, 200, fixtures.createFlashSale());
  }
  if (resource === "recommendations" && parts.length === 2) {
    const slug = url.searchParams.get("productSlug");
    const limit = Number(url.searchParams.get("limit") ?? 5);
    const items = fixtures.productSummaryFixtures
      .filter((p) => p.slug !== slug)
      .slice(0, Number.isInteger(limit) && limit > 0 ? limit : 5);
    return send(res, 200, { items });
  }
  return notFound();
}

/** Starts the fixture core on `port` (0 picks a free one) and resolves once it listens. */
export function startFixtureCore(port = 0): Promise<{ server: Server; port: number }> {
  const server = createServer(route);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, port: typeof address === "object" && address ? address.port : port });
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { server, port } = await startFixtureCore(Number(process.env.FIXTURE_CORE_PORT ?? 0));
  console.log(`fixture-core listening on ${port}`);
  const stop = () => server.close(() => process.exit(0));
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}
