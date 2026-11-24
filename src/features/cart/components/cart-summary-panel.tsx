"use client";

import { useIsRestoring, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatVnd } from "@/lib/format";

import { cartQueries } from "../queries";
import {
  hydrateCartSelection,
  isLineSelected,
  useCartSelectionStore,
} from "../stores/cart-selection-store";

const checkoutClass = "h-touch w-full rounded-xl text-base font-bold";

/**
 * Summary amounts for the STATIC "Tóm tắt" card (artboard Cart). A client component: it sits
 * outside the cart's Suspense, so until the cart query has data it shows a skeleton and a disabled
 * "Thanh toán" button, never 0₫. Totals count selected, available lines only.
 */
export function CartSummaryPanel() {
  // Load the saved selection after mount so the first client render matches the server HTML.
  useEffect(() => {
    hydrateCartSelection();
  }, []);
  const { data } = useQuery(cartQueries.mine());
  const isRestoring = useIsRestoring();
  const selection = useCartSelectionStore((state) => state);

  const lines = (data?.items ?? []).filter(
    (line) => line.available && isLineSelected(selection, line.sku),
  );
  const units = lines.reduce((sum, line) => sum + line.quantity, 0);
  const total = lines.reduce((sum, line) => sum + line.lineTotal.amount, 0);
  const ready = data !== undefined;

  return (
    <div className="flex flex-col gap-3.5" aria-busy={!ready || isRestoring}>
      {ready ? (
        <>
          <Row label={`Tạm tính (${units} sản phẩm)`} value={formatVnd(total)} />
          <Row label="Phí vận chuyển" value="Miễn phí" />
          <div className="flex items-baseline justify-between gap-3 border-t border-stone-200 pt-3.5">
            <span className="font-bold text-ink">Tổng cộng</span>
            <span className="text-xl font-extrabold text-brand-deep tabular-nums">
              {formatVnd(total)}
            </span>
          </div>
        </>
      ) : (
        <div data-testid="cart-summary-skeleton" className="flex flex-col gap-3.5">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-7 w-full" />
        </div>
      )}
      {lines.length > 0 ? (
        <Button asChild className={checkoutClass}>
          <Link href="/checkout">Thanh toán</Link>
        </Button>
      ) : (
        <Button disabled className={checkoutClass}>
          Thanh toán
        </Button>
      )}
      <p className="text-xs text-stone-600">Giá và tồn kho được xác nhận ở bước thanh toán</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm text-stone-700">
      <span>{label}</span>
      <span className="font-semibold text-ink tabular-nums">{value}</span>
    </div>
  );
}
