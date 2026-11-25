/** Step bar: the cart is done, the form is current, the confirmation comes next. */
export function CheckoutSteps() {
  return (
    <ol aria-label="Các bước" className="flex flex-wrap items-center gap-2 text-sm">
      <li className="font-semibold text-success">✓ Giỏ hàng</li>
      <li aria-hidden="true" className="text-stone-400">
        —
      </li>
      <li aria-current="step" className="font-bold text-ink">
        2 Thông tin &amp; thanh toán
      </li>
      <li aria-hidden="true" className="text-stone-400">
        —
      </li>
      <li className="text-stone-600">3 Hoàn tất</li>
    </ol>
  );
}
