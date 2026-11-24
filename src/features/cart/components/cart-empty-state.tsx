import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * The empty-cart frame. With `message` and `onRetry` it is the error frame for a cart that could
 * not be loaded and has nothing saved.
 */
export function CartEmptyState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-stone-200 bg-white px-5 py-12 text-center">
      <span className="text-lg font-bold text-ink">Giỏ hàng đang trống</span>
      {message && (
        <p role="alert" className="text-sm text-stone-600">
          {message}
        </p>
      )}
      {onRetry && (
        <Button
          type="button"
          variant="outline"
          onClick={onRetry}
          className="h-touch px-5 font-semibold"
        >
          Thử lại
        </Button>
      )}
      <Link
        href="/"
        className="flex h-touch items-center rounded-xl bg-brand px-5 font-bold text-white no-underline"
      >
        Săn deal 12.12
      </Link>
    </div>
  );
}
