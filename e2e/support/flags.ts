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
 * `getFlags` is cached for about 5 s per server instance, so a flip shows up after that. Reloads
 * until `visible()` reports the wanted state (default 15 s budget).
 */
export async function reloadUntil(page: Page, visible: () => Promise<boolean>, want: boolean) {
  await expect
    .poll(
      async () => {
        await page.reload();
        return visible();
      },
      { timeout: 15_000, intervals: [1000] },
    )
    .toBe(want);
}

/** Collects browser console errors and uncaught page errors for the test. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}
