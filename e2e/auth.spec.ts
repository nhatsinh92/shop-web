import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { STUB_PASSWORD, loginByApi, newEmail, refreshCallCount } from "./support/session";
import { readClaims } from "./support/stub-gateway";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function submitLogin(page: Page, email: string, password = STUB_PASSWORD) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu").fill(password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
}

async function cookieNamed(page: Page, name: string) {
  return (await page.context().cookies()).find((cookie) => cookie.name === name);
}

/** The persisted query cache (idb-keyval: database "keyval-store", key "may-query-cache"). */
async function persistedQueryCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const open = indexedDB.open("keyval-store");
        open.onerror = () => resolve(0);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains("keyval")) return resolve(0);
          const get = db.transaction("keyval").objectStore("keyval").get("may-query-cache");
          get.onerror = () => resolve(0);
          get.onsuccess = () => {
            try {
              const stored: unknown = get.result ? JSON.parse(String(get.result)) : null;
              const queries = (stored as { clientState?: { queries?: unknown[] } } | null)
                ?.clientState?.queries;
              resolve(Array.isArray(queries) ? queries.length : 0);
            } catch {
              resolve(1);
            }
          };
        };
      }),
  );
}

async function seedPersistedQuery(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("keyval-store");
        open.onupgradeneeded = () => open.result.createObjectStore("keyval");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction("keyval", "readwrite");
          const value = JSON.stringify({
            buster: "v1",
            timestamp: Date.now(),
            clientState: {
              mutations: [],
              queries: [{ queryKey: ["cart"], queryHash: '["cart"]' }],
            },
          });
          tx.objectStore("keyval").put(value, "may-query-cache");
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
}

test.describe("login", () => {
  test("valid credentials land on / with the account link in the header", async ({
    page,
  }, testInfo) => {
    await page.goto("/login");
    await submitLogin(page, newEmail("ok", testInfo.workerIndex));
    await expect(page).toHaveURL((url) => url.pathname === "/");
    await expect(page.getByRole("link", { name: "Tài khoản" })).toBeVisible();
  });

  test("invalid credentials show the AUTH_INVALID_CREDENTIALS message", async ({
    page,
  }, testInfo) => {
    await page.goto("/login");
    await submitLogin(page, newEmail("ok", testInfo.workerIndex), "wrong-password");
    await expect(page.getByText("Email hoặc mật khẩu không đúng.")).toBeVisible();
    await expect(page).toHaveURL((url) => url.pathname === "/login");
  });
});

test.describe("redirect", () => {
  test("a guest on /account goes to /login?next=%2Faccount and returns after login", async ({
    page,
  }, testInfo) => {
    const email = newEmail("ok", testInfo.workerIndex);
    await page.goto("/account");
    await expect(page).toHaveURL((url) => url.pathname === "/login");
    expect(new URL(page.url()).search).toBe("?next=%2Faccount");

    await submitLogin(page, email);
    await expect(page).toHaveURL((url) => url.pathname === "/account");
    await expect(page.getByText(email)).toBeVisible();
    await expect(page.getByText("Nguyễn Minh Anh")).toBeVisible();
  });

  test("an off-site next parameter is ignored and lands on /", async ({ page }, testInfo) => {
    await page.goto("/login?next=//evil.example");
    await submitLogin(page, newEmail("ok", testInfo.workerIndex));
    await expect(page).toHaveURL((url) => url.pathname === "/");
    expect(new URL(page.url()).hostname).not.toBe("evil.example");
  });
});

test.describe("refresh", () => {
  test("proxy.ts refreshes an expiring token once before render and /me never gets a 401", async ({
    page,
  }, testInfo) => {
    const email = newEmail("short-ttl", testInfo.workerIndex);
    await loginByApi(page, email);
    const before = await cookieNamed(page, "access_token");
    expect(before).toBeDefined();
    expect(readClaims(before?.value)?.exp ?? 0).toBeLessThan(Date.now() / 1000 + 60);
    expect(await refreshCallCount(page, email)).toBe(0);

    const meStatuses: number[] = [];
    page.on("response", (response) => {
      if (new URL(response.url()).pathname === "/api/auth/me") meStatuses.push(response.status());
    });

    const document = await page.goto("/account");
    // The refresh happened on the server before the HTML response was produced.
    expect(await refreshCallCount(page, email)).toBe(1);
    const rotated = (await document?.headersArray())?.filter(
      (header) =>
        header.name.toLowerCase() === "set-cookie" && header.value.startsWith("access_token="),
    );
    expect(rotated).toHaveLength(1);

    await expect(page.getByText(email)).toBeVisible();
    const after = await cookieNamed(page, "access_token");
    expect(after?.value).not.toBe(before?.value);
    expect(readClaims(after?.value)?.exp ?? 0).toBeGreaterThan(Date.now() / 1000 + 60);
    expect(meStatuses.length).toBeGreaterThan(0);
    expect(meStatuses).not.toContain(401);
    expect(await refreshCallCount(page, email)).toBe(1);
  });
});

test.describe("logout", () => {
  for (const [title, scenario] of [
    ["clears the hint cookie and persisted queries", "ok"],
    ["cleans up locally when the logout call fails with 503", "logout-fails"],
  ] as const) {
    test(title, async ({ page }, testInfo) => {
      const email = newEmail(scenario, testInfo.workerIndex);
      await loginByApi(page, email);
      await page.goto("/account");
      await expect(page.getByText(email)).toBeVisible();
      expect(await cookieNamed(page, "logged_in")).toBeDefined();
      await seedPersistedQuery(page);
      expect(await persistedQueryCount(page)).toBe(1);

      const logoutCall = page.waitForResponse(
        (response) => new URL(response.url()).pathname === "/api/auth/logout",
      );
      await page.getByRole("button", { name: "Đăng xuất" }).click();
      expect((await logoutCall).status()).toBe(scenario === "ok" ? 204 : 503);

      await expect(page).toHaveURL((url) => url.pathname === "/");
      await expect(page.getByRole("link", { name: "Đăng nhập" })).toBeVisible();
      expect(await cookieNamed(page, "logged_in")).toBeUndefined();
      await expect.poll(() => persistedQueryCount(page)).toBe(0);
    });
  }
});

test.describe("accessibility", () => {
  test("/login has no axe violations", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Đăng nhập" })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test("/account has no axe violations", async ({ page }, testInfo) => {
    const email = newEmail("ok", testInfo.workerIndex);
    await loginByApi(page, email);
    await page.goto("/account");
    await expect(page.getByText(email)).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });
});
