import type { CartSyncState } from "../use-debounced-quantity";

const LABELS: Record<CartSyncState, string> = {
  saved: "Đã lưu",
  waiting: "Đang chờ…",
  saving: "Đang lưu…",
};

/** Next to the cart title: reports whether quantity changes are saved, waiting or in flight. */
export function CartSyncLabel({ state }: { state: CartSyncState }) {
  return (
    <span aria-live="polite" className="text-[13px] font-medium text-stone-600">
      {LABELS[state]}
    </span>
  );
}
