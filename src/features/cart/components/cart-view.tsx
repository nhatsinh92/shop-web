"use client";

import { useIsRestoring, useQuery } from "@tanstack/react-query";

import { messageFor } from "@/lib/api/error-messages";

import { cartQueries } from "../queries";
import { CartEmptyState } from "./cart-empty-state";
import { CartLineItem } from "./cart-line-item";
import { CartSkeleton } from "./cart-skeleton";
import { CartStaleBanner } from "./cart-stale-banner";

/**
 * The cart lines (artboard Cart, tag CLIENT). Order of preference: hydrated or restored data, then
 * the skeleton. A failed refresh with saved data shows the stale banner; a failure with nothing
 * saved shows the empty-cart frame with the error text and a retry.
 */
export function CartView() {
  const isRestoring = useIsRestoring();
  const { data, error, isError, refetch } = useQuery(cartQueries.mine());
  const retry = () => void refetch();

  if (!data) {
    if (isError) return <CartEmptyState message={messageFor(error)} onRetry={retry} />;
    // While IndexedDB is being read a skeleton would flash right before the saved lines.
    return isRestoring ? null : <CartSkeleton />;
  }

  const stale = isError;
  return (
    <div className="flex flex-col gap-3">
      {stale && <CartStaleBanner onRetry={retry} />}
      <h1 className="rounded-2xl border border-stone-200 bg-white px-5 py-3.5 text-xl font-extrabold text-ink">
        Giỏ hàng <span className="font-medium text-stone-600">({data.itemCount} sản phẩm)</span>
      </h1>
      {data.items.length === 0 ? (
        <CartEmptyState />
      ) : (
        data.items.map((line) => <CartLineItem key={line.sku} line={line} />)
      )}
      {stale && data.items.length > 0 && (
        <p className="text-xs text-warning">Tổng tiền tạm tính theo giá đã lưu</p>
      )}
    </div>
  );
}
