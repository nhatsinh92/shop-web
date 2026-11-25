import type { CreateReservationInput } from "./api";

type ReservationLine = CreateReservationInput["items"][number];
type CartPrices = Record<string, NonNullable<ReservationLine["expectedUnitPrice"]>>;

const keyFor = (reservationId: string) => `checkout:cart-prices:${reservationId}`;

/** Remembers the cart price of each SKU sent as `expectedUnitPrice`, for the order summary. */
export function saveCartPrices(reservationId: string, lines: ReservationLine[]): void {
  const prices: CartPrices = {};
  for (const { sku, expectedUnitPrice } of lines) {
    if (expectedUnitPrice) prices[sku] = expectedUnitPrice;
  }
  try {
    sessionStorage.setItem(keyFor(reservationId), JSON.stringify(prices));
  } catch {
    // Storage can be blocked; the summary then omits the member-price row.
  }
}

/** The cart prices stored by `saveCartPrices`, or an empty object (another device, no storage). */
export function readCartPrices(reservationId: string): CartPrices {
  try {
    const raw = sessionStorage.getItem(keyFor(reservationId));
    return raw ? (JSON.parse(raw) as CartPrices) : {};
  } catch {
    return {};
  }
}
