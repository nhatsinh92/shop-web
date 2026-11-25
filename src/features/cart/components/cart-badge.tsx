"use client";

import { useQuery } from "@tanstack/react-query";
import { ShoppingCart } from "lucide-react";
import Link from "next/link";

import { useCartCountHint } from "@/lib/hints/cart-count";

import { cartQueries } from "../queries";

/**
 * Header cart link with the item-count badge. A client component, so the header stays part of
 * the static shell (artboard Main, tag CLIENT). Falls back to the `cart_count` hint while loading or on error; no badge without a hint.
 */
export function CartBadge() {
  const { data } = useQuery(cartQueries.summary());
  const hint = useCartCountHint();
  // The real count wins; the hint only covers a pending or failed query and is never cached.
  const count = data?.itemCount ?? hint ?? 0;
  const shown = count > 99 ? "99+" : String(count);
  const label = count > 0 ? `Giỏ hàng, ${shown} sản phẩm` : "Giỏ hàng";

  return (
    <Link
      href="/cart"
      aria-label={label}
      className="relative flex min-h-touch items-center gap-2 rounded-lg px-3 text-sm font-medium text-ink no-underline"
    >
      <ShoppingCart aria-hidden="true" className="size-[22px]" strokeWidth={1.8} />
      Giỏ hàng{" "}
      {count > 0 && (
        <span
          data-testid="cart-count"
          className="absolute top-0.5 left-[26px] flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1 text-[11px] font-bold text-white"
        >
          {shown}
        </span>
      )}
    </Link>
  );
}
