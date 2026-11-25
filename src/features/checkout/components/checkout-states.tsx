import Link from "next/link";

function StateCard({
  title,
  actionHref,
  actionLabel,
}: {
  title: string;
  actionHref: string;
  actionLabel: string;
}) {
  return (
    <section className="mx-auto flex max-w-xl flex-col items-center gap-4 rounded-2xl border border-stone-200 bg-white p-8 text-center">
      <h1 className="text-xl font-extrabold text-ink">{title}</h1>
      <Link
        href={actionHref}
        className="flex h-touch items-center rounded-lg bg-brand px-5 text-sm font-semibold text-white"
      >
        {actionLabel}
      </Link>
    </section>
  );
}

/** 404 on the reservation. */
export function CheckoutNotFound() {
  return (
    <StateCard
      title="Không tìm thấy phiên thanh toán"
      actionHref="/cart"
      actionLabel="Quay lại giỏ hàng"
    />
  );
}

/** The reservation already became an order. */
export function CheckoutConsumed() {
  return <StateCard title="Đơn hàng này đã được đặt" actionHref="/" actionLabel="Về trang chủ" />;
}
