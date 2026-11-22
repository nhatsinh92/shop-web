"use client";

import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, messageFor } from "@/lib/api";

import { authQueries } from "../queries";
import type { UserProfile } from "../api";

export const MEMBER_TIER_LABELS: Record<UserProfile["memberTier"], string> = {
  STANDARD: "Thành viên Tiêu chuẩn",
  SILVER: "Thành viên Bạc",
  GOLD: "Thành viên Vàng",
  PLATINUM: "Thành viên Bạch kim",
};

function ProfileSkeleton() {
  return (
    <div data-testid="profile-skeleton" aria-busy="true" className="flex flex-col gap-3">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-5 w-64" />
      <Skeleton className="h-6 w-40" />
    </div>
  );
}

/** Name, email and member tier of the signed-in user (CLIENT). The proxy handles 401 redirects. */
export function CurrentUserProfile() {
  const { data, error, isPending, refetch, isFetching } = useQuery(authQueries.me());

  if (data) {
    return (
      <dl className="flex flex-col gap-2">
        <dt className="sr-only">Tên hiển thị</dt>
        <dd className="text-xl font-bold text-ink">{data.displayName}</dd>
        <dt className="sr-only">Email</dt>
        <dd className="text-base text-ink">{data.email}</dd>
        <dt className="sr-only">Hạng thành viên</dt>
        <dd className="w-fit rounded-full bg-muted px-3 py-1 text-sm font-medium text-ink">
          {MEMBER_TIER_LABELS[data.memberTier]}
        </dd>
      </dl>
    );
  }

  if (isPending || (error instanceof ApiError && error.status === 401)) {
    return <ProfileSkeleton />;
  }

  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-lg border p-4">
      <p className="text-sm text-destructive">{messageFor(error)}</p>
      <Button
        type="button"
        variant="outline"
        className="h-touch"
        disabled={isFetching}
        onClick={() => void refetch()}
      >
        Thử lại
      </Button>
    </div>
  );
}
