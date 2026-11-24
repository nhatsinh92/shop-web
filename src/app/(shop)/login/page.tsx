import { Suspense } from "react";

import type { Metadata } from "next";

import { LoginWithCartMerge } from "./login-with-cart-merge";

export const metadata: Metadata = { title: "Đăng nhập" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-6 pt-10 pb-16">
      <h1 className="text-2xl font-bold text-ink">Đăng nhập</h1>
      <Suspense fallback={null}>
        <LoginWithCartMerge />
      </Suspense>
    </main>
  );
}
