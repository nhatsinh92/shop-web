import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

import type * as ProductFixtures from "../../mocks/fixtures/products";
import type { components } from "../../src/lib/api/generated/cart";

type Cart = components["schemas"]["Cart"];
type CartItem = components["schemas"]["CartItem"];

// Loaded lazily by path, like stub-products.ts: Node needs the `.ts` extension and the fixtures'
// own imports are type-only. (mocks/fixtures/cart.ts imports `./products` without an extension,
// which plain Node cannot resolve, so the artboard lines are rebuilt here.)
let fixtures: Promise<typeof ProductFixtures> | undefined;
function loadFixtures(): Promise<typeof ProductFixtures> {
  fixtures ??= import(pathToFileURL(resolve("mocks/fixtures/products.ts")).href) as Promise<
    typeof ProductFixtures
  >;
  return fixtures;
}

/** The server-side cart read is slower than the 250 ms budget of the streamed hole. */
export const CART_SLOW_DELAY_MS = 800;
/** `cart-merge-slow` users: the merge answers after this long (the client gives up after 1 s). */
export const MERGE_SLOW_DELAY_MS = 3000;
/** The gateway rejects an access token with less than this long left (the proxy's refresh window). */
export const TOKEN_MIN_LEFT_SECONDS = 60;

const MAX_QUANTITY = 10;
const GUEST_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * Runtime failure modes, switched per user through `POST /__stub/cart-mode`: `down` fails every
 * cart call, `summary-down` answers 503 on `GET /api/cart/summary` only (the badge call).
 */
export type CartMode = "ok" | "down" | "patch-fails" | "summary-down";

export interface CartContext {
  /** Claims of the access token (Bearer from the server, else the cookie); null when absent. */
  token: { email: string; exp: number } | null;
  /** True when the caller sent an `Authorization: Bearer` header (a server-side call). */
  serverSide: boolean;
  /** The non-httpOnly `logged_in=1` hint cookie is present. */
  hint: boolean;
  /** Value of the `guest_cart` cookie, if any. */
  guestId: string | undefined;
  /** Scenario tag of the signed-in user ("ok" for guests). */
  scenario: string;
}

/** User carts keyed by email, guest carts by `guest:<id>`: parallel tests never share state. */
const carts = new Map<string, Map<string, number>>();
const modes = new Map<string, CartMode>();

const SEED_LINES: { sku: string; quantity: number; listPrice: number; variantLabel?: string }[] = [
  { sku: "SKU-ANC-PRO-BLK", quantity: 1, listPrice: 1_790_000, variantLabel: "Màu: Đen nhám" },
  { sku: "SKU-KB-75", quantity: 1, listPrice: 1_690_000 },
  { sku: "SKU-BOTTLE-750", quantity: 2, listPrice: 320_000 },
];

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));
const money = (amount: number) => ({ amount, currency: "VND" as const });

function json(
  res: ServerResponse,
  status: number,
  body?: unknown,
  extra: Record<string, string | string[]> = {},
) {
  const headers: Record<string, string | string[]> = { "cache-control": "no-store", ...extra };
  if (body !== undefined) headers["content-type"] ??= "application/json";
  res.writeHead(status, headers);
  res.end(body === undefined ? undefined : JSON.stringify(body));
}

function problem(res: ServerResponse, status: number, code: string, title: string) {
  json(
    res,
    status,
    { type: `about:blank#${code}`, title, status, code },
    { "content-type": "application/problem+json" },
  );
}

function readJson(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  return new Promise((done) => {
    let raw = "";
    req.on("data", (chunk: Buffer) => (raw += chunk.toString("utf8")));
    req.on("end", () => {
      try {
        const value: unknown = JSON.parse(raw || "{}");
        done(
          typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null,
        );
      } catch {
        done(null);
      }
    });
  });
}

function seeded(scenario: string): Map<string, number> {
  const cart = new Map<string, number>();
  if (scenario === "cart-full" || scenario === "cart-slow") {
    for (const line of SEED_LINES) cart.set(line.sku, line.quantity);
  }
  return cart;
}

async function lineFor(sku: string, quantity: number): Promise<CartItem | null> {
  const f = await loadFixtures();
  const summary = f.productSummaryFixtures.find((p) => p.sku === sku);
  const detail = f.productDetailFixtures.find((p) => p.sku === sku || hasVariant(p, sku));
  const availability = f.availabilityFixtures[sku];
  const seed = SEED_LINES.find((line) => line.sku === sku);
  const product =
    summary ?? (detail ? f.productSummaryFixtures.find((p) => p.slug === detail.slug) : undefined);
  if (!product || !availability) return null;
  const unit = availability.price.amount;
  const list = seed?.listPrice ?? product.listPrice?.amount;
  return {
    sku,
    slug: product.slug,
    name: product.name,
    imageUrl: product.imageUrl,
    ...(seed?.variantLabel ? { variantLabel: seed.variantLabel } : {}),
    unitPrice: money(unit),
    ...(list && list > unit ? { listPrice: money(list) } : {}),
    quantity,
    lineTotal: money(unit * quantity),
    stockLevel:
      availability.stockLevel === "OUT_OF_STOCK" ? "OUT_OF_STOCK" : availability.stockLevel,
    available: availability.stockLevel !== "OUT_OF_STOCK",
  };
}

function hasVariant(product: unknown, sku: string): boolean {
  const variants = (product as { variants?: { sku: string }[] }).variants ?? [];
  return variants.some((variant) => variant.sku === sku);
}

async function render(cart: Map<string, number>): Promise<Cart> {
  const items: CartItem[] = [];
  for (const [sku, quantity] of cart) {
    const line = await lineFor(sku, quantity);
    if (line) items.push(line);
  }
  return {
    items,
    itemCount: items.reduce((sum, line) => sum + line.quantity, 0),
    subtotal: money(items.reduce((sum, line) => sum + line.lineTotal.amount, 0)),
    updatedAt: new Date().toISOString(),
  };
}

type Owner =
  | { kind: "user"; key: string; email: string }
  | { kind: "guest"; key: string; id: string | null }
  | { kind: "rejected" };

/** Resolves who the request belongs to, following the 401 rules of cart.yaml. */
function ownerOf(ctx: CartContext): Owner {
  if (ctx.token) {
    const left = ctx.token.exp - Date.now() / 1000;
    if (left <= TOKEN_MIN_LEFT_SECONDS) return { kind: "rejected" };
    return { kind: "user", key: ctx.token.email, email: ctx.token.email };
  }
  // No usable token but the hint cookie: a signed-in user whose access cookie is gone or expired.
  if (ctx.hint) return { kind: "rejected" };
  return { kind: "guest", key: `guest:${ctx.guestId ?? ""}`, id: ctx.guestId ?? null };
}

function cartOf(owner: Exclude<Owner, { kind: "rejected" }>, scenario: string) {
  let cart = carts.get(owner.key);
  if (!cart) {
    cart = owner.kind === "user" ? seeded(scenario) : new Map();
    if (owner.kind === "user" || owner.key !== "guest:") carts.set(owner.key, cart);
  }
  return cart;
}

const guestCookie = (id: string) =>
  `guest_cart=${id}; Max-Age=${GUEST_TTL_SECONDS}; Path=/; HttpOnly; SameSite=Lax`;
const clearedGuestCookie = "guest_cart=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax";

/** Answers the cart operations and the `/__stub/cart-mode` control; false for other routes. */
export async function handleCartRoute(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  ctx: CartContext,
): Promise<boolean> {
  if (url.pathname === "/__stub/cart-mode" && req.method === "POST") {
    const email = url.searchParams.get("email") ?? "";
    modes.set(email, (url.searchParams.get("mode") as CartMode | null) ?? "ok");
    json(res, 204);
    return true;
  }

  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts[0] !== "api" || parts[1] !== "cart") return false;
  const [, , sub, sku] = parts;
  const route = `${req.method} ${sub ?? ""}${sku ? "/{sku}" : ""}`;
  const known = [
    "GET ",
    "GET summary",
    "POST items",
    "PATCH items/{sku}",
    "DELETE items/{sku}",
    "POST merge",
  ];
  if (!known.includes(route)) return false;

  const owner = ownerOf(ctx);
  if (owner.kind === "rejected") {
    problem(res, 401, "AUTH_UNAUTHENTICATED", "Authentication required");
    return true;
  }
  const mode = owner.kind === "user" ? (modes.get(owner.email) ?? "ok") : "ok";
  if (mode === "down") {
    problem(res, 503, "SERVICE_UNAVAILABLE", "Cart unavailable");
    return true;
  }
  if (mode === "summary-down" && route === "GET summary") {
    problem(res, 503, "SERVICE_UNAVAILABLE", "Cart summary unavailable");
    return true;
  }
  const cart = cartOf(owner, ctx.scenario);
  const write = (extra: Record<string, string | string[]> = {}) =>
    render(cart).then((body) => json(res, 200, body, extra));

  switch (route) {
    case "GET ": {
      if (ctx.serverSide && ctx.scenario === "cart-slow") await sleep(CART_SLOW_DELAY_MS);
      await write();
      return true;
    }
    case "GET summary": {
      const total = [...cart.values()].reduce((sum, quantity) => sum + quantity, 0);
      json(res, 200, { itemCount: total });
      return true;
    }
    case "POST items": {
      if (ctx.scenario === "cart-conflict") {
        problem(res, 409, "CART_OUT_OF_STOCK", "Out of stock");
        return true;
      }
      const body = await readJson(req);
      const quantity = Number(body?.["quantity"]);
      const itemSku = String(body?.["sku"] ?? "");
      if (!Number.isInteger(quantity) || quantity < 1 || !itemSku) {
        problem(res, 400, "VALIDATION_FAILED", "Invalid body");
        return true;
      }
      // The first guest write creates the guest cart and sets its cookie.
      let target = cart;
      let extra: Record<string, string | string[]> = {};
      if (owner.kind === "guest" && !owner.id) {
        const id = randomUUID();
        target = new Map();
        carts.set(`guest:${id}`, target);
        extra = { "set-cookie": guestCookie(id) };
      }
      target.set(itemSku, Math.min(MAX_QUANTITY, (target.get(itemSku) ?? 0) + quantity));
      json(res, 200, await render(target), extra);
      return true;
    }
    case "PATCH items/{sku}": {
      if (mode === "patch-fails") {
        problem(res, 409, "CART_OUT_OF_STOCK", "Out of stock");
        return true;
      }
      const body = await readJson(req);
      const quantity = Number(body?.["quantity"]);
      if (!sku || !cart.has(sku)) {
        problem(res, 404, "CART_ITEM_NOT_FOUND", "Item not in cart");
        return true;
      }
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
        problem(res, 409, "CART_QTY_LIMIT", "Quantity limit");
        return true;
      }
      cart.set(sku, quantity);
      await write();
      return true;
    }
    case "DELETE items/{sku}": {
      if (!sku || !cart.delete(sku)) {
        problem(res, 404, "CART_ITEM_NOT_FOUND", "Item not in cart");
        return true;
      }
      await write();
      return true;
    }
    default: {
      // POST merge: needs a signed-in user; sums the guest cart into the user cart, then drops it.
      if (owner.kind !== "user") {
        problem(res, 401, "AUTH_UNAUTHENTICATED", "Authentication required");
        return true;
      }
      if (ctx.scenario === "cart-merge-slow") await sleep(MERGE_SLOW_DELAY_MS);
      if (ctx.guestId) {
        const guest = carts.get(`guest:${ctx.guestId}`);
        for (const [itemSku, quantity] of guest ?? []) {
          cart.set(itemSku, Math.min(MAX_QUANTITY, (cart.get(itemSku) ?? 0) + quantity));
        }
        carts.delete(`guest:${ctx.guestId}`);
      }
      await write({ "set-cookie": clearedGuestCookie });
      return true;
    }
  }
}
