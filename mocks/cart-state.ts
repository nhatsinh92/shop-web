import { buildCart, cartFixture, cartLine, type Cart, type CartItem } from "./fixtures/cart";
import { productSummaryFixtures } from "./fixtures/products";

export const MAX_LINES = 50;
export const MAX_QTY = 10;

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
