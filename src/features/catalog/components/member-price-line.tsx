import type { MemberPrice } from "../api";
import { formatVnd } from "@/lib/format";

export const TIER_LABELS: Record<MemberPrice["memberTier"], string> = {
  STANDARD: "Tiêu chuẩn",
  SILVER: "Bạc",
  GOLD: "Vàng",
  PLATINUM: "Bạch kim",
};

/** The artboard's member price line: "Giá thành viên Vàng của bạn: 845.500₫". */
export function MemberPriceLine({ price }: { price: MemberPrice }) {
  return (
    <p className="text-base font-semibold text-brand-deep" data-testid="member-price">
      Giá thành viên {TIER_LABELS[price.memberTier]} của bạn: {formatVnd(price.price.amount)}
    </p>
  );
}
