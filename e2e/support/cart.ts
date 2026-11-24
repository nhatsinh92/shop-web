import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

import { STUB_PASSWORD, STUB_PORT } from "./session";
import type { CartMode } from "./stub-cart";

/** Switches the failure mode of one user's cart in the stub (`down` fails every cart call). */
export async function setCartMode(page: Page, email: string, mode: CartMode): Promise<void> {
  const res = await page.request.post(
    `http://localhost:${STUB_PORT}/__stub/cart-mode?email=${encodeURIComponent(email)}&mode=${mode}`,
  );
  if (!res.ok()) throw new Error(`stub cart-mode failed: ${res.status()}`);
}

/** Signs in through the /login form, as a shopper does (this runs the guest-cart merge). */
export async function submitLoginForm(page: Page, email: string): Promise<void> {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu").fill(STUB_PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
}

/** Reads the persisted query cache (IndexedDB, written by idb-keyval) as text, or null. */
async function persistedCache(page: Page): Promise<string | null> {
  return page.evaluate(
    () =>
      new Promise<string | null>((done) => {
        const open = indexedDB.open("keyval-store");
        open.onerror = () => done(null);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains("keyval")) return done(null);
          const get = db.transaction("keyval").objectStore("keyval").get("may-query-cache");
          get.onerror = () => done(null);
          get.onsuccess = () => done(typeof get.result === "string" ? get.result : null);
        };
      }),
  );
}

/** Waits until the cart is saved in IndexedDB (the persister writes on a throttle). */
export async function expectCartPersisted(page: Page, sku: string): Promise<void> {
  await expect.poll(async () => (await persistedCache(page))?.includes(sku) ?? false).toBe(true);
}

export async function persistedCartText(page: Page): Promise<string | null> {
  return persistedCache(page);
}
