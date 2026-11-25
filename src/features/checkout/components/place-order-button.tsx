import { Button } from "@/components/ui/button";

/** "Đặt hàng": disabled with "Đang xử lý…" and a spinner while the order is being placed. */
export function PlaceOrderButton({
  pending,
  disabled = false,
  onClick,
}: {
  pending: boolean;
  /** Not ready to place (shipping options not loaded yet). */
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      onClick={onClick}
      disabled={pending || disabled}
      aria-busy={pending}
      className="h-14 rounded-xl bg-brand text-base font-bold text-white hover:bg-brand/90 disabled:bg-brand-deep disabled:opacity-100"
    >
      {pending ? (
        <>
          <span
            aria-hidden="true"
            className="size-4.5 animate-spin rounded-full border-[2.5px] border-white/40 border-t-white"
          />
          Đang xử lý…
        </>
      ) : (
        "Đặt hàng"
      )}
    </Button>
  );
}
