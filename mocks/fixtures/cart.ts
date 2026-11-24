import type { components } from "../../src/lib/api/generated/cart";
import { productSummaryFixtures } from "./products";

type Schemas = components["schemas"];
export type Cart = Schemas["Cart"];
export type CartItem = Schemas["CartItem"];

export const cartSummaryFixture: Schemas["CartSummary"] = { itemCount: 3 };

const vnd = (amount: number): Schemas["Money"] => ({ amount, currency: "VND" });

/** A cart line with `lineTotal` computed from the unit price. */
export function cartLine(
  line: Omit<CartItem, "lineTotal" | "unitPrice" | "listPrice"> & {
    unitPrice: number;
    listPrice?: number;
  },
): CartItem {
  const { unitPrice, listPrice, ...rest } = line;
  return {
    ...rest,
    unitPrice: vnd(unitPrice),
    ...(listPrice ? { listPrice: vnd(listPrice) } : {}),
    lineTotal: vnd(unitPrice * line.quantity),
  };
}

/** Wraps lines in a `Cart` with `itemCount` and `subtotal` recomputed from them. */
export function buildCart(items: CartItem[], updatedAt: string = "2026-12-12T00:00:00.000Z"): Cart {
  return {
    items,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: vnd(items.reduce((sum, item) => sum + item.lineTotal.amount, 0)),
    updatedAt,
  };
}

function imageFor(sku: string): string {
  const product = productSummaryFixtures.find((p) => p.sku === sku);
  if (!product) throw new Error(`Unknown fixture SKU ${sku}`);
  return product.imageUrl;
}

function slugFor(sku: string): string {
  return productSummaryFixtures.find((p) => p.sku === sku)?.slug ?? "";
}

function nameFor(sku: string): string {
  return productSummaryFixtures.find((p) => p.sku === sku)?.name ?? "";
}

/** The three lines of the Cart artboard (4 units, flash-sale prices). */
export const cartLineFixtures: CartItem[] = [
  cartLine({
    sku: "SKU-ANC-PRO-BLK",
    slug: slugFor("SKU-ANC-PRO-BLK"),
    name: nameFor("SKU-ANC-PRO-BLK"),
    imageUrl: imageFor("SKU-ANC-PRO-BLK"),
    variantLabel: "Màu: Đen nhám",
    unitPrice: 890_000,
    listPrice: 1_790_000,
    stockLevel: "LOW",
    quantity: 1,
    available: true,
  }),
  cartLine({
    sku: "SKU-KB-75",
    slug: slugFor("SKU-KB-75"),
    name: nameFor("SKU-KB-75"),
    imageUrl: imageFor("SKU-KB-75"),
    unitPrice: 1_150_000,
    listPrice: 1_690_000,
    stockLevel: "IN_STOCK",
    quantity: 1,
    available: true,
  }),
  cartLine({
    sku: "SKU-BOTTLE-750",
    slug: slugFor("SKU-BOTTLE-750"),
    name: nameFor("SKU-BOTTLE-750"),
    imageUrl: imageFor("SKU-BOTTLE-750"),
    unitPrice: 189_000,
    listPrice: 320_000,
    stockLevel: "IN_STOCK",
    quantity: 2,
    available: true,
  }),
];

export const cartFixture: Cart = buildCart(cartLineFixtures);

export const emptyCartFixture: Cart = buildCart([]);
