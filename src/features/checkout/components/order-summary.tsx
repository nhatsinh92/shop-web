"use client";

import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";

import { formatVnd } from "@/lib/format";

import { readCartPrices } from "../cart-prices";

import type { Reservation } from "../api";

const noopSubscribe = () => () => {};

/** The cart prices of this reservation; empty on the server and without the stored entry. */
function useCartPrices(reservationId: string) {
  // A string snapshot keeps the store stable; the storage is not readable during server render.
  const raw = useSyncExternalStore(
    noopSubscribe,
    () => JSON.stringify(readCartPrices(reservationId)),
    () => "{}",
  );
  return useMemo(() => JSON.parse(raw) as ReturnType<typeof readCartPrices>, [raw]);
}

/**
 * Order summary card (no voucher row). Totals are computed here: `subtotal` comes from the
 * reservation, the shipping fee from the selected option (a prop), the total is their sum.
 */
export function OrderSummary({
  reservation,
  shippingFee,
}: {
  reservation: Reservation;
  shippingFee: number;
}) {
  const cartPrices = useCartPrices(reservation.id);
  const changed = reservation.items.filter((item) => item.priceChanged).length;
  const memberDiscount = reservation.items.reduce((sum, item) => {
    const cart = cartPrices[item.sku]?.amount;
    return cart !== undefined && item.unitPrice.amount < cart
      ? sum + (cart - item.unitPrice.amount) * item.quantity
      : sum;
  }, 0);

  return (
    <div className="flex flex-col gap-3.5 rounded-2xl border border-stone-200 bg-white p-5">
      {changed > 0 ? (
        <p role="status" className="rounded-lg bg-info-bg px-3 py-2 text-sm text-info">
          Giá của {changed} sản phẩm đã thay đổi so với giỏ hàng
        </p>
      ) : null}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold text-ink">
          Đơn hàng ({reservation.items.length} sản phẩm)
        </h2>
        <Link
          href="/cart"
          className="inline-flex h-touch items-center text-sm font-semibold text-brand"
        >
          Sửa
        </Link>
      </div>
      <ul className="flex flex-col gap-3">
        {reservation.items.map((item) => {
          const cart = cartPrices[item.sku]?.amount;
          const memberPrice = cart !== undefined && item.unitPrice.amount < cart;
          return (
            <li key={item.sku} className="flex justify-between gap-3 text-sm">
              <div className="min-w-0">
                <p className="font-semibold text-ink">{item.name}</p>
                <p className="text-stone-600">
                  {item.variantLabel ? `${item.variantLabel} · ` : ""}x{item.quantity}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end">
                <span className="font-semibold text-ink tabular-nums">
                  {formatVnd(item.lineTotal.amount)}
                </span>
                {memberPrice ? (
                  <s className="text-stone-600 tabular-nums">{formatVnd(cart * item.quantity)}</s>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-sm font-semibold text-success">Giá và tồn kho đã được xác nhận</p>
      <dl className="flex flex-col gap-2 border-t border-stone-200 pt-3 text-sm">
        <Row label="Tạm tính" value={formatVnd(reservation.subtotal.amount)} />
        {memberDiscount > 0 ? (
          <Row label="Giá thành viên" value={`−${formatVnd(memberDiscount)}`} success />
        ) : null}
        <Row label="Vận chuyển" value={shippingFee === 0 ? "Miễn phí" : formatVnd(shippingFee)} />
        <div className="flex justify-between gap-3 border-t border-stone-200 pt-3 text-base font-extrabold text-ink">
          <dt>Tổng thanh toán</dt>
          <dd className="tabular-nums">{formatVnd(reservation.subtotal.amount + shippingFee)}</dd>
        </div>
      </dl>
    </div>
  );
}

function Row({ label, value, success }: { label: string; value: string; success?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${success ? "text-success" : "text-ink"}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
