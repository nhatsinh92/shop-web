import Link from "next/link";

import { CheckoutSteps } from "./checkout-steps";

/** Slim header of the checkout page (artboard Checkout): brand, "Thanh toán" and the step bar. */
export function CheckoutHeader() {
  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-content flex-wrap items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex h-touch items-center rounded-lg text-3xl font-extrabold tracking-tight text-ink"
          >
            Mây<span className="text-brand">.</span>
          </Link>
          <span aria-hidden="true" className="h-6 w-px bg-stone-300" />
          <p className="text-lg font-bold text-ink">Thanh toán</p>
        </div>
        <CheckoutSteps />
      </div>
    </header>
  );
}
