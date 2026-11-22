"use client";

import { Button } from "@/components/ui/button";

import { useLogout } from "../logout";

export function LogoutButton() {
  const { mutate, isPending } = useLogout();
  return (
    <Button
      type="button"
      variant="outline"
      className="h-touch"
      disabled={isPending}
      onClick={() => mutate()}
    >
      Đăng xuất
    </Button>
  );
}
