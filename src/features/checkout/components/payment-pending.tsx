"use client";

import Link from "next/link";

import { useOrderPolling } from "../use-order-polling";

import type { Order } from "../api";

/** `PENDING_PAYMENT`: polls the order and tells the shopper that the payment is being confirmed. */
export function PaymentPending({
  order,
  onSettled,
  onTimeout,
}: {
  order: Order;
  onSettled: (order: Order) => void;
  onTimeout: (order: Order) => void;
}) {
  useOrderPolling(order, { onSettled, onTimeout });
  return (
    <div
      role="status"
      className="flex items-center gap-2.5 rounded-xl border border-info/40 bg-info-bg p-4"
    >
      <span
        aria-hidden="true"
        className="size-4.5 shrink-0 animate-spin rounded-full border-[2.5px] border-info/30 border-t-info"
      />
      <p className="font-bold text-info">Đang xác nhận thanh toán…</p>
    </div>
  );
}

/** The payment was still pending after the polling budget: no new order is placed from here. */
export function PaymentUnconfirmed({ order }: { order: Order }) {
  return (
    <div
      role="status"
      className="flex flex-col gap-1.5 rounded-xl border border-info/40 bg-info-bg p-4"
    >
      <p className="font-extrabold text-info">Chưa xác nhận được thanh toán</p>
      <p className="text-sm text-info">
        Đơn #{order.number} đang chờ kết quả thanh toán. Bạn không cần đặt lại.
      </p>
      <Link
        href="/"
        className="inline-flex h-touch items-center text-sm font-bold text-info underline"
      >
        Về trang chủ
      </Link>
    </div>
  );
}
