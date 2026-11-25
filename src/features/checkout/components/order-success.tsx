import Link from "next/link";

import type { Order } from "../api";

/** The summary card's `done` state: "Đặt hàng thành công", the order number and the way home. */
export function OrderSuccess({ order }: { order: Order }) {
  return (
    <div
      role="status"
      className="flex flex-col gap-1.5 rounded-xl border border-success/40 bg-success-bg p-4"
    >
      <p className="font-extrabold text-success">Đặt hàng thành công</p>
      <p className="text-sm text-success">Mã đơn #{order.number}</p>
      <Link
        href="/"
        className="inline-flex h-touch items-center text-sm font-bold text-success underline"
      >
        Về trang chủ
      </Link>
    </div>
  );
}
