"use client";

import { useEffect } from "react";

import { cn } from "@/lib/utils";

import { formatCountdown, useCountdown } from "./use-countdown";

/**
 * Hold banner of the Checkout artboard: counts down to `expiresAt` and calls `onExpire` once at 0.
 * Under a minute the time takes the accent colour; the countdown itself is silent for screen
 * readers and a polite live region announces the last minute once.
 */
export function HoldBanner({ expiresAt, onExpire }: { expiresAt: string; onExpire?: () => void }) {
  const seconds = useCountdown(expiresAt);

  useEffect(() => {
    if (seconds === 0) onExpire?.();
  }, [seconds, onExpire]);

  const lastMinute = seconds !== null && seconds > 0 && seconds <= 60;
  return (
    <div className="rounded-xl bg-info-bg px-4 py-3 text-sm text-info">
      <p>
        Sản phẩm đang được giữ cho bạn. Hoàn tất trong{" "}
        <strong
          aria-live="off"
          className={cn("tabular-nums", seconds !== null && seconds < 60 && "text-brand")}
        >
          {formatCountdown(seconds)}
        </strong>{" "}
        để giữ giá flash sale.
      </p>
      <p role="status" aria-live="polite" className="sr-only">
        {lastMinute ? "Còn 1 phút để hoàn tất đơn hàng" : ""}
      </p>
    </div>
  );
}
