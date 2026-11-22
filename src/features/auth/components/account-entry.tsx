"use client";

import { CircleUserRound } from "lucide-react";
import Link from "next/link";

import { useSessionHint } from "../session-hint";

const BOX = "flex min-h-touch items-center gap-2 rounded-lg px-3 text-sm font-medium";

/**
 * Header account entry (artboard Main, tag CLIENT): "Đăng nhập" for guests, "Tài khoản" when the
 * hint cookie says a session exists. Renders an inert placeholder of the same size until known.
 */
export function AccountEntry() {
  const hint = useSessionHint();

  if (hint === "unknown") {
    return (
      <span aria-hidden="true" className={`${BOX} invisible`}>
        <CircleUserRound className="size-[22px]" strokeWidth={1.8} />
        Tài khoản
      </span>
    );
  }

  const signedIn = hint === "signed-in";
  return (
    <Link
      href={signedIn ? "/account" : "/login"}
      className={`${BOX} text-ink no-underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none`}
    >
      <CircleUserRound aria-hidden="true" className="size-[22px]" strokeWidth={1.8} />
      {signedIn ? "Tài khoản" : "Đăng nhập"}
    </Link>
  );
}
