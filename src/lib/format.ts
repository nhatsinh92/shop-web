const vndNumber = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

/** Formats a VND amount the way the designs show it: `890.000₫` (dot grouping, no space). */
export function formatVnd(amount: number): string {
  return `${vndNumber.format(amount)}₫`;
}
