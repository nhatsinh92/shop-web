import { AccountView } from "@/features/account";
import { CurrentUserProfile, LogoutButton } from "@/features/auth";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Tài khoản" };

// Static shell; the profile is a client component. proxy.ts redirects guests to /login.
export default function AccountPage() {
  return <AccountView profileSlot={<CurrentUserProfile />} logoutSlot={<LogoutButton />} />;
}
