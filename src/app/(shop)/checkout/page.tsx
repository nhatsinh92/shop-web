import { Suspense } from "react";

import { CheckoutHeader, CheckoutSkeleton } from "@/features/checkout";

import { CheckoutContent, type CheckoutSearchParams } from "./checkout-content";

// Checkout page: dynamic (no cache). The slim header and step bar render outside the Suspense
// hole; only CheckoutContent reads `searchParams`.
export default function CheckoutPage({ searchParams }: { searchParams: CheckoutSearchParams }) {
  return (
    <>
      <CheckoutHeader />
      <main className="mx-auto max-w-content px-6 pt-7 pb-16">
        <Suspense fallback={<CheckoutSkeleton />}>
          <CheckoutContent searchParams={searchParams} />
        </Suspense>
      </main>
    </>
  );
}
