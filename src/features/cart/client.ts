// Client-safe entry of the cart feature: only what client components in app/ need.
// Never re-export anything that reaches cart.server.ts or "server-only".
export { mergeGuestCart } from "./merge-guest-cart";
