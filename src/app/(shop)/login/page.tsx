import { Suspense } from "react";

import { LoginForm } from "@/features/auth";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Đăng nhập" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-6 pt-10 pb-16">
      <h1 className="text-2xl font-bold text-ink">Đăng nhập</h1>
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
