import { Skeleton } from "@/components/ui/skeleton";

/** Fallback while the member price streams in (artboard Tweak memberState=loading). */
export function MemberPriceSkeleton() {
  return <Skeleton aria-busy="true" aria-label="Đang tải giá thành viên" className="h-6 w-72" />;
}
