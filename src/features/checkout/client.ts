// Client-safe entry of the checkout feature: only what client components in app/ need.
// Never re-export anything that reaches checkout.server.ts or "server-only".
export { checkoutKeys, checkoutQueries, orderKeys, orderQueries } from "./queries";
export {
  createCheckoutReservation,
  getCheckoutReservation,
  getOrder,
  listPaymentMethods,
  listShippingOptions,
  placeOrder,
} from "./api";
export type {
  CreateReservationInput,
  MockPaymentOutcome,
  Order,
  PaymentMethod,
  PaymentMethods,
  PlaceOrderInput,
  PlaceOrderOptions,
  Reservation,
  ReservationItem,
  ShippingOption,
  ShippingOptions,
} from "./api";
export { shippingAddressSchema } from "./checkout.schema";
export type { ShippingAddressValues } from "./checkout.schema";
