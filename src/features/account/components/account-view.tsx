import type { ReactNode } from "react";

type AccountViewProps = {
  /** The signed-in user's profile (client component owned by the auth feature). */
  profileSlot: ReactNode;
  /** The logout control (client component owned by the auth feature). */
  logoutSlot: ReactNode;
};

/** Layout of the /account page. Fetches nothing: app/ passes the data-bearing parts as slots. */
export function AccountView({ profileSlot, logoutSlot }: AccountViewProps) {
  return (
    <main className="mx-auto flex w-full max-w-content flex-col gap-6 px-6 pt-10 pb-16">
      <h1 className="text-2xl font-bold text-ink">Tài khoản của tôi</h1>
      <section aria-label="Thông tin tài khoản" className="flex flex-col gap-6 sm:max-w-md">
        {profileSlot}
        <div>{logoutSlot}</div>
      </section>
    </main>
  );
}
