const ROWS = [
  { label: "Giao hàng", text: "Freeship" },
  { label: "Đổi trả", text: "Miễn phí trong 15 ngày" },
  { label: "Bảo hành", text: "12 tháng chính hãng" },
] as const;

/** Static service copy; the delivery date is Phase 6. */
export function ProductServiceInfo() {
  return (
    <ul className="flex flex-col gap-3 rounded-2xl border border-border px-5 py-4 text-sm">
      {ROWS.map((row) => (
        <li key={row.label} className="flex gap-3">
          <strong className="min-w-28">{row.label}</strong>
          <span>{row.text}</span>
        </li>
      ))}
    </ul>
  );
}
