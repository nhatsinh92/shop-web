import { cartLineFixtures } from "./cart";
import { productSummaryFixtures } from "./products";

import type { components } from "../../src/lib/api/generated/core";

type Schemas = components["schemas"];
export type Reservation = Schemas["Reservation"];
export type ReservationItem = Schemas["ReservationItem"];
export type ShippingOption = Schemas["ShippingOption"];
export type PaymentMethod = Schemas["PaymentMethod"];
export type Order = Schemas["Order"];
export type Money = Schemas["Money"];

/** How long a reservation holds the stock, as in the contract. */
export const RESERVATION_TTL_MS = 10 * 60 * 1000;

export const vnd = (amount: number): Money => ({ amount, currency: "VND" });

/** Standard delivery is free ("Miễn phí" in the UI); express costs a fee. */
export const shippingOptionFixtures: ShippingOption[] = [
  {
    id: "STANDARD",
    name: "Giao tiêu chuẩn",
    fee: vnd(0),
    estimatedDelivery: "Nhận hàng 2–3 ngày",
  },
  {
    id: "EXPRESS_2H",
    name: "Giao hỏa tốc 2 giờ",
    fee: vnd(35_000),
    estimatedDelivery: "Nhận hàng trong 2 giờ",
  },
];

/** The three payment methods of the Checkout artboard; the card can be turned off per test. */
export function paymentMethodFixtures(options: { cardAvailable?: boolean } = {}): PaymentMethod[] {
  return [
    { id: "COD", name: "Thanh toán khi nhận hàng (COD)", available: true },
    { id: "EWALLET", name: "Ví điện tử", available: true },
    { id: "CARD", name: "Thẻ tín dụng / ghi nợ", available: options.cardAvailable ?? true },
  ];
}

type Priced = { name: string; imageUrl: string; variantLabel?: string; unitPrice: number };

/** Name, image, variant and current price of a SKU: the cart fixtures first, then the catalogue. */
export function checkoutSku(sku: string): Priced | undefined {
  const line = cartLineFixtures.find((item) => item.sku === sku);
  if (line) {
    return {
      name: line.name,
      imageUrl: line.imageUrl,
      ...(line.variantLabel ? { variantLabel: line.variantLabel } : {}),
      unitPrice: line.unitPrice.amount,
    };
  }
  const product = productSummaryFixtures.find((p) => p.sku === sku);
  if (!product) return undefined;
  return { name: product.name, imageUrl: product.imageUrl, unitPrice: product.price.amount };
}

/** A reserved line; `priceChanged` is true only when the expected price differs from the current one. */
export function reservationItem(
  sku: string,
  quantity: number,
  expectedUnitPrice?: number,
): ReservationItem | undefined {
  const priced = checkoutSku(sku);
  if (!priced) return undefined;
  return {
    sku,
    name: priced.name,
    imageUrl: priced.imageUrl,
    ...(priced.variantLabel ? { variantLabel: priced.variantLabel } : {}),
    quantity,
    unitPrice: vnd(priced.unitPrice),
    lineTotal: vnd(priced.unitPrice * quantity),
    priceChanged: expectedUnitPrice !== undefined && expectedUnitPrice !== priced.unitPrice,
  };
}

export function buildReservation(
  id: string,
  items: ReservationItem[],
  expiresAt: string,
  status: Reservation["status"] = "ACTIVE",
): Reservation {
  return {
    id,
    status,
    expiresAt,
    items,
    subtotal: vnd(items.reduce((sum, item) => sum + item.lineTotal.amount, 0)),
  };
}

/** The order number shown on the artboard's success state. */
export const FIRST_ORDER_NUMBER = 87;

export const orderNumber = (sequence: number): string =>
  `MY-1212-${String(sequence).padStart(4, "0")}`;

/** The artboard's order: the three cart lines, standard delivery, paid on delivery. */
export const orderFixture: Order = {
  id: "0b8f4c1e-52f4-4c5e-9a1e-6c1d2f3a4b5c",
  number: orderNumber(FIRST_ORDER_NUMBER),
  status: "PLACED",
  items: cartLineFixtures.map(({ sku, quantity, unitPrice, lineTotal }) => ({
    sku,
    quantity,
    unitPrice,
    lineTotal,
  })),
  subtotal: vnd(cartLineFixtures.reduce((sum, item) => sum + item.lineTotal.amount, 0)),
  shippingFee: vnd(0),
  total: vnd(cartLineFixtures.reduce((sum, item) => sum + item.lineTotal.amount, 0)),
  payment: { method: "COD", status: "NOT_REQUIRED" },
  createdAt: "2026-12-12T00:00:00.000Z",
};
