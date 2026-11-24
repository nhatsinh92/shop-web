import { CircleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Warning shown when the backend failed but a saved cart is displayed. */
export function CartStaleBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warning-border bg-warning-bg px-[18px] py-3.5"
    >
      <div className="flex items-center gap-3">
        <CircleAlert aria-hidden="true" className="size-5 flex-none text-warning" />
        <span className="text-sm text-warning">
          Đang hiển thị giỏ hàng đã lưu. Giá và tồn kho sẽ được xác nhận khi thanh toán.
        </span>
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={onRetry}
        className="h-touch border-warning px-4 text-sm font-semibold text-warning"
      >
        Thử lại
      </Button>
    </div>
  );
}
