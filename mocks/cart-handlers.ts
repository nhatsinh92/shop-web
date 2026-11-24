import { delay } from "msw";

import { buildCart, cartFixture, cartLine, emptyCartFixture, type CartItem } from "./fixtures/cart";
import { productSummaryFixtures } from "./fixtures/products";
import { cartHttp } from "./http";

import type { components } from "../src/lib/api/generated/cart";

type Cart = components["schemas"]["Cart"];
type Problem = components["schemas"]["Problem"];

const MAX_LINES = 50;
const MAX_QTY = 10;

let lines: CartItem[] = structuredClone(cartFixture.items);

/** The shared in-memory cart behind the default and stateful cart handlers. */
export const cartState = {
  get(): Cart {
    return buildCart(structuredClone(lines));
  },
  set(items: CartItem[]): void {
    lines = structuredClone(items);
  },
  reset(): void {
    lines = structuredClone(cartFixture.items);
  },
  find(sku: string): CartItem | undefined {
    return lines.find((line) => line.sku === sku);
  },
  /** Sets the absolute quantity of an existing line; false when the SKU is not in the cart. */
  setQuantity(sku: string, quantity: number): boolean {
    const index = lines.findIndex((line) => line.sku === sku);
    const line = lines[index];
    if (!line) return false;
    lines[index] = {
      ...line,
      quantity,
      lineTotal: { amount: line.unitPrice.amount * quantity, currency: "VND" },
    };
    return true;
  },
  remove(sku: string): boolean {
    const before = lines.length;
    lines = lines.filter((line) => line.sku !== sku);
    return lines.length < before;
  },
  /** Adds units of a catalogue SKU; false when the SKU is not in the product fixtures. */
  add(sku: string, quantity: number): boolean {
    const existing = this.find(sku);
    if (existing) return this.setQuantity(sku, Math.min(MAX_QTY, existing.quantity + quantity));
    const product = productSummaryFixtures.find((p) => p.sku === sku);
    if (!product) return false;
    lines.push(
      cartLine({
        sku,
        slug: product.slug,
        name: product.name,
        imageUrl: product.imageUrl,
        unitPrice: product.price.amount,
        ...(product.listPrice ? { listPrice: product.listPrice.amount } : {}),
        stockLevel: "IN_STOCK",
        quantity: Math.min(MAX_QTY, quantity),
        available: true,
      }),
    );
    return true;
  },
};

// Tests reset MSW handlers after each test (vitest.setup.ts); reset the cart at the same moment.
if (typeof afterEach === "function") afterEach(() => cartState.reset());

const problemHeaders = () => new Headers({ "Content-Type": "application/problem+json" });

function problem(status: number, code: string, title: string): Problem {
  return { type: "about:blank", title, status, code };
}

/** The cart after an add: one line is enough for tests; the badge reads only `itemCount`. */
function cartAfterAdd(quantity: number): Cart {
  return {
    items: [],
    itemCount: 3 + quantity,
    subtotal: { amount: 0, currency: "VND" },
    updatedAt: new Date(0).toISOString(),
  };
}

/** Returns true when the request must answer 401 (used by `cartUnauthenticatedOnce`). */
type Reject = () => boolean;
const never: Reject = () => false;

const unauthorized = () => problem(401, "AUTH_UNAUTHENTICATED", "Unauthenticated");

const getCart = cartHttp.get("/api/cart", ({ response }) => response(200).json(cartState.get()));

const patchHandler = (reject: Reject = never) =>
  cartHttp.patch("/api/cart/items/{sku}", async ({ params, request, response }) => {
    if (reject()) return response(401).json(unauthorized(), { headers: problemHeaders() });
    const { quantity } = (await request.json()) as { quantity: number };
    if (!cartState.find(params.sku)) {
      return response(404).json(problem(404, "CART_ITEM_NOT_FOUND", "Cart item not found"), {
        headers: problemHeaders(),
      });
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      return response(400).json(problem(400, "VALIDATION_FAILED", "Validation failed"), {
        headers: problemHeaders(),
      });
    }
    if (quantity > MAX_QTY) {
      return response(422).json(
        { ...problem(422, "CART_QTY_LIMIT", "Quantity limit"), limit: MAX_QTY },
        { headers: problemHeaders() },
      );
    }
    cartState.setQuantity(params.sku, quantity);
    return response(200).json(cartState.get());
  });

const deleteHandler = (reject: Reject = never) =>
  cartHttp.delete("/api/cart/items/{sku}", ({ params, response }) => {
    if (reject()) return response(401).json(unauthorized(), { headers: problemHeaders() });
    if (!cartState.remove(params.sku)) {
      return response(404).json(problem(404, "CART_ITEM_NOT_FOUND", "Cart item not found"), {
        headers: problemHeaders(),
      });
    }
    return response(200).json(cartState.get());
  });

const mergeHandler = (reject: Reject = never) =>
  cartHttp.post("/api/cart/merge", ({ response }) =>
    reject()
      ? response(401).json(unauthorized(), { headers: problemHeaders() })
      : response(200).json(cartState.get()),
  );

/** Add on the shared cart: unknown SKU 404, 51st distinct SKU 422, quantity capped at the limit. */
const addHandler = (reject: Reject = never) =>
  cartHttp.post("/api/cart/items", async ({ request, response }) => {
    if (reject()) return response(401).json(unauthorized(), { headers: problemHeaders() });
    const body = (await request.json()) as { sku: string; quantity: number };
    if (!cartState.find(body.sku) && cartState.get().items.length >= MAX_LINES) {
      return response(422).json(
        { ...problem(422, "CART_ITEMS_LIMIT", "Too many items"), limit: MAX_LINES },
        { headers: problemHeaders() },
      );
    }
    if (!cartState.add(body.sku, body.quantity)) {
      return response(404).json(problem(404, "PRODUCT_NOT_FOUND", "Product not found"), {
        headers: problemHeaders(),
      });
    }
    return response(200).json(cartState.get());
  });

const statefulSummary = cartHttp.get("/api/cart/summary", ({ response }) =>
  response(200).json({ itemCount: cartState.get().itemCount }),
);

export const cartHandlers = [
  getCart,
  patchHandler(),
  deleteHandler(),
  mergeHandler(),
  cartHttp.post("/api/cart/items", async ({ request, response }) => {
    const body = (await request.json()) as { sku: string; quantity: number };
    return response(200).json(cartAfterAdd(body.quantity));
  }),
];

/** Per-scenario overrides for `server.use(...)` in tests and the dev mock. */
export const cartOverrides = {
  /** All six cart operations on the shared in-memory cart (summary and add agree with the cart). */
  statefulCart: () => [
    getCart,
    statefulSummary,
    addHandler(),
    patchHandler(),
    deleteHandler(),
    mergeHandler(),
  ],
  /** `GET /api/cart` answers after `ms` milliseconds. */
  slowCart: (ms: number) =>
    cartHttp.get("/api/cart", async ({ response }) => {
      await delay(ms);
      return response(200).json(cartState.get());
    }),
  /** 503 `SERVICE_UNAVAILABLE` on `GET /api/cart`. */
  cartUnavailable: cartHttp.get("/api/cart", ({ response }) =>
    response(503).json(problem(503, "SERVICE_UNAVAILABLE", "Unavailable"), {
      headers: problemHeaders(),
    }),
  ),
  /** An empty cart: no items, totals 0. */
  emptyCart: cartHttp.get("/api/cart", ({ response }) => response(200).json(emptyCartFixture)),
  /** 422 `CART_QTY_LIMIT` on `PATCH /api/cart/items/{sku}`. */
  patchQtyLimit: cartHttp.patch("/api/cart/items/{sku}", ({ response }) =>
    response(422).json(
      { ...problem(422, "CART_QTY_LIMIT", "Quantity limit"), limit: MAX_QTY },
      { headers: problemHeaders() },
    ),
  ),
  /** 409 `CART_OUT_OF_STOCK` on `PATCH /api/cart/items/{sku}`. */
  patchOutOfStock: cartHttp.patch("/api/cart/items/{sku}", ({ response }) =>
    response(409).json(problem(409, "CART_OUT_OF_STOCK", "Out of stock"), {
      headers: problemHeaders(),
    }),
  ),
  /** 503 `SERVICE_UNAVAILABLE` on `PATCH /api/cart/items/{sku}`. */
  patchUnavailable: cartHttp.patch("/api/cart/items/{sku}", ({ response }) =>
    response(503).json(problem(503, "SERVICE_UNAVAILABLE", "Unavailable"), {
      headers: problemHeaders(),
    }),
  ),
  /** `PATCH` applies, then answers after `ms` milliseconds (out-of-order response tests). */
  patchDelayed: (ms: number) =>
    cartHttp.patch("/api/cart/items/{sku}", async ({ params, request, response }) => {
      const { quantity } = (await request.json()) as { quantity: number };
      cartState.setQuantity(params.sku, quantity);
      const snapshot = cartState.get();
      await delay(ms);
      return response(200).json(snapshot);
    }),
  /** 503 `SERVICE_UNAVAILABLE` on `POST /api/cart/merge`. */
  mergeUnavailable: cartHttp.post("/api/cart/merge", ({ response }) =>
    response(503).json(problem(503, "SERVICE_UNAVAILABLE", "Unavailable"), {
      headers: problemHeaders(),
    }),
  ),
  /** `POST /api/cart/merge` answers after `ms` milliseconds. */
  mergeDelayed: (ms: number) =>
    cartHttp.post("/api/cart/merge", async ({ response }) => {
      await delay(ms);
      return response(200).json(cartState.get());
    }),
  /** The first cart write answers 401 `AUTH_UNAUTHENTICATED`; later writes use the shared cart. */
  cartUnauthenticatedOnce: () => {
    let rejected = false;
    const first = () => {
      if (rejected) return false;
      rejected = true;
      return true;
    };
    return [
      getCart,
      statefulSummary,
      addHandler(first),
      patchHandler(first),
      deleteHandler(first),
      mergeHandler(first),
    ];
  },
  /** Add answers after `ms` milliseconds (optimistic update tests). */
  delayedAdd: (ms: number) =>
    cartHttp.post("/api/cart/items", async ({ response }) => {
      await delay(ms);
      return response(200).json(cartAfterAdd(0));
    }),
  /** 409 `CART_OUT_OF_STOCK`. */
  addOutOfStock: cartHttp.post("/api/cart/items", ({ response }) =>
    response(409).json(problem(409, "CART_OUT_OF_STOCK", "Out of stock"), {
      headers: problemHeaders(),
    }),
  ),
  /** 422 `CART_QTY_LIMIT`. */
  addQtyLimit: cartHttp.post("/api/cart/items", ({ response }) =>
    response(422).json(problem(422, "CART_QTY_LIMIT", "Quantity limit"), {
      headers: problemHeaders(),
    }),
  ),
  /** 503 `SERVICE_UNAVAILABLE`. */
  addUnavailable: cartHttp.post("/api/cart/items", ({ response }) =>
    response(503).json(problem(503, "SERVICE_UNAVAILABLE", "Unavailable"), {
      headers: problemHeaders(),
    }),
  ),
};
