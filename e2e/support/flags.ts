import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

import { STUB_PORT } from "./session";
import type { FlagName } from "./stub-flags";

export const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "phone", width: 390, height: 844 },
] as const;

const stubUrl = () => `http://localhost:${STUB_PORT}`;

/** Sets the given flags in the stub (`POST /__stub/flags`); flags not listed keep their value. */
export async function setFlags(
  page: Page,
  flags: Partial<Record<FlagName, "on" | "off">>,
): Promise<void> {
  const query = new URLSearchParams(flags as Record<string, string>).toString();
  const res = await page.request.post(`${stubUrl()}/__stub/flags?${query}`);
  if (!res.ok()) throw new Error(`stub flags failed: ${res.status()}`);
}

/** Turns every flag back on. Specs call it in `afterEach`, so other tests see the defaults. */
export async function resetFlags(page: Page): Promise<void> {
  const res = await page.request.post(`${stubUrl()}/__stub/flags?reset=1`);
  if (!res.ok()) throw new Error(`stub flags reset failed: ${res.status()}`);
}

/**
 * The holes stream in after the shell, so judge a page only once it has settled. Image requests
 * can keep the network busy for a while in the sandbox, hence the short, forgiving wait.
 */
export async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => undefined);
}

/**
 * `getFlags` is cached for about 5 s per server instance, so a flip shows up after that. Reloads
 * until `visible()` reports the wanted state (default 15 s budget).
 */
export async function reloadUntil(page: Page, visible: () => Promise<boolean>, want: boolean) {
  await expect
    .poll(
      async () => {
        await page.reload();
        await settle(page);
        return visible();
      },
      { timeout: 15_000, intervals: [1000] },
    )
    .toBe(want);
}

/**
 * Collects what a shopper's console would show as a failure: uncaught page errors, console errors
 * and failed `/api/*` calls. Plain "Failed to load resource" lines are left out: they come from
 * image and prefetch requests that the sandbox cannot serve, whatever the flags say.
 */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().startsWith("Failed to load resource")) {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    const { pathname } = new URL(response.url());
    if (pathname.startsWith("/api/") && response.status() >= 400) {
      errors.push(`${response.status()} ${pathname}`);
    }
  });
  return errors;
}
