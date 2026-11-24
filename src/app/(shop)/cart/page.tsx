import { Suspense } from "react";

import {
  CartPageShell,
  CartSection,
  CartSkeleton,
  CartSummaryPanel,
  CartView,
} from "@/features/cart";

// Cart page: STATIC shell (prerendered) plus one STREAM hole. CartSection reads the request
// cookies inside <Suspense>, so this page reads no cookies, headers or searchParams itself.
export default function CartPage() {
  return (
    <CartPageShell
      cartViewSlot={
        <Suspense fallback={<CartSkeleton />}>
          <CartSection>
            <CartView />
          </CartSection>
        </Suspense>
      }
      summarySlot={<CartSummaryPanel />}
    />
  );
}
