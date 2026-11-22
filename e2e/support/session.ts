import type { Page } from "@playwright/test";

import { STUB_PASSWORD, emailFor } from "./stub-gateway";
import type { Scenario } from "./stub-gateway";

export const STUB_PORT = Number(process.env.E2E_STUB_PORT ?? 4010);

let counter = 0;

/** A fresh user per test: scenario tag plus a unique id, so parallel tests never share state. */
export function newEmail(scenario: Scenario, workerIndex: number): string {
  counter += 1;
  return emailFor(scenario, `${workerIndex}-${Date.now()}-${counter}`);
}

export { STUB_PASSWORD };

/** Signs in through the same endpoint as the form; the cookies land in the page's context. */
export async function loginByApi(page: Page, email: string): Promise<void> {
  const res = await page.request.post("/api/auth/login", {
    data: { email, password: STUB_PASSWORD },
  });
  if (!res.ok()) throw new Error(`stub login failed: ${res.status()}`);
}

export async function refreshCallCount(page: Page, email: string): Promise<number> {
  const res = await page.request.get(
    `http://localhost:${STUB_PORT}/__stub/refresh-calls?email=${encodeURIComponent(email)}`,
  );
  return ((await res.json()) as { count: number }).count;
}
