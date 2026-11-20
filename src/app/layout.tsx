import type { Metadata } from "next";
import { Be_Vietnam_Pro } from "next/font/google";

import { Toaster } from "@/components/ui/sonner";

import { Providers } from "./providers";
import "./globals.css";

const beVietnamPro = Be_Vietnam_Pro({
  variable: "--font-be-vietnam-pro",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Mây", template: "%s · Mây" },
  description: "Mây — siêu sale ngày đôi 12.12",
};

// The root layout is part of every static shell: it must never read cookies(), headers()
// or searchParams. User-specific UI lives in client components or Suspense holes.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi" className={beVietnamPro.variable}>
      <body className="min-h-dvh">
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}
