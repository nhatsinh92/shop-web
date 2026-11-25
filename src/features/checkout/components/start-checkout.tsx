"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { messageFor } from "@/lib/api/error-messages";

import { createCheckoutReservation } from "../api";
import { saveCartPrices } from "../cart-prices";
import { CheckoutSkeleton } from "./checkout-skeleton";

import type { CreateReservationInput } from "../api";

export interface StartLine {
  sku: string;
  name: string;
  quantity: number;
  unitPrice: NonNullable<CreateReservationInput["items"][number]["expectedUnitPrice"]>;
}

/** Reserves the lines and remembers their cart prices for the order summary. */
export async function reserveLines(items: CreateReservationInput["items"]) {
  const reservation = await createCheckoutReservation({ items });
  saveCartPrices(reservation.id, items);
  return reservation;
}

/**
 * Reserves the selected cart lines once and replaces the URL with `?reservation=<id>`. The lines
 * come from `app/` (features never import each other), as does `onOutOfStock`, which refreshes the
 * cart after a 409.
 */
export function StartCheckout({
  lines,
  isPending,
  onOutOfStock,
}: {
  lines: StartLine[];
  isPending: boolean;
  onOutOfStock?: () => void;
}) {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    // The ref guards React's double mount: only the first run sends the request.
    if (isPending || started.current) return;
    started.current = true;
    if (lines.length === 0) {
      router.replace("/cart");
      return;
    }
    const items = lines.map(({ sku, quantity, unitPrice }) => ({
      sku,
      quantity,
      expectedUnitPrice: unitPrice,
    }));
    reserveLines(items).then(
      (reservation) => {
        router.replace(`/checkout?reservation=${reservation.id}`);
      },
      (failure: unknown) => {
        if (
          failure instanceof ApiError &&
          failure.status === 409 &&
          failure.code === "CHECKOUT_OUT_OF_STOCK"
        ) {
          const names = new Map(lines.map((line) => [line.sku, line.name]));
          for (const { sku, available } of failure.unavailable ?? []) {
            toast.error(`Không đủ hàng: ${names.get(sku) ?? sku} (còn ${available})`);
          }
          router.replace("/cart");
          onOutOfStock?.();
          return;
        }
        setError(failure);
      },
    );
    // `error` is a dependency so that clearing it (the retry button) runs the effect again.
  }, [isPending, lines, onOutOfStock, router, error]);

  if (error) {
    return (
      <div role="alert" className="mx-auto flex max-w-xl flex-col items-center gap-4 p-8">
        <p className="text-center text-ink">{messageFor(error)}</p>
        <Button
          onClick={() => {
            started.current = false;
            setError(null);
          }}
        >
          Thử lại
        </Button>
      </div>
    );
  }
  return <CheckoutSkeleton message="Đang giữ hàng cho bạn…" />;
}
