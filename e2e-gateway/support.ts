import { expect } from "@playwright/test";
import type { APIRequestContext, APIResponse, Page } from "@playwright/test";

import type { components } from "../src/lib/api/generated/cart";
import { formatVnd } from "../src/lib/format";

export type Cart = components["schemas"]["Cart"];
export type CartItem = components["schemas"]["CartItem"];

/**
 * The seed users of shop-api's `seed/README.md`. Their demo passwords are not kept in this
 * repository: export them as E2E_SEED_PASSWORD_LINH, E2E_SEED_PASSWORD_MINH and
 * E2E_SEED_PASSWORD_AN (see README.md, "Cart journeys against the real gateway").
 */
function seedPassword(name: string): string {
  const variable = `E2E_SEED_PASSWORD_${name.toUpperCase()}`;
  const value = process.env[variable];
  if (!value) {
    throw new Error(`${variable} is not set: take the password from shop-api seed/README.md`);
  }
  return value;
}

export const SEED_USERS = {
  linh: {
    email: "linh@example.com",
    get password() {
      return seedPassword("linh");
    },
  },
  minh: {
    email: "minh@example.com",
    get password() {
      return seedPassword("minh");
    },
  },
  an: {
    email: "an@example.com",
    get password() {
      return seedPassword("an");
    },
  },
};
export type SeedUser = { readonly email: string; readonly password: string };

/** Seed products: ANC Pro has colour variants (default black), the bottle has none. */
export const ANC = { path: "/product/tai-nghe-khong-day-anc-pro", sku: "SKU-ANC-PRO-BLK" };
export const BOTTLE = { path: "/product/binh-giu-nhiet-inox-750ml", sku: "SKU-BOTTLE-750" };

const ORIGIN = { Origin: "http://localhost:3000" };
const MAX_RATE_LIMIT_WAITS = 3;

/**
 * POSTs a login; on 429 (5 logins per email per minute at the gateway) it waits for Retry-After and
 * tries again, so repeated runs against one demo stay green.
 */
async function postLogin(request: APIRequestContext, user: SeedUser): Promise<APIResponse> {
  for (let attempt = 0; ; attempt++) {
    const res = await request.post("/api/auth/login", {
      data: { email: user.email, password: user.password },
      headers: ORIGIN,
    });
    if (res.status() !== 429 || attempt === MAX_RATE_LIMIT_WAITS) return res;
    const wait = Number(res.headers()["retry-after"] ?? "10");
    await new Promise((resolve) => setTimeout(resolve, (wait + 1) * 1000));
  }
}

/** Signs in through the gateway; the cookies land in the page's context. */
export async function loginByApi(page: Page, user: SeedUser): Promise<void> {
  const res = await postLogin(page.request, user);
  if (!res.ok()) throw new Error(`login of ${user.email} failed: ${res.status()}`);
}

/** Fills the login form like a user; a 429 from an earlier run is waited out first. */
export async function loginByForm(page: Page, user: SeedUser): Promise<void> {
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Mật khẩu").fill(user.password);
  const answered = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/auth/login");
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  const res = await answered;
  if (res.status() === 429) {
    const wait = Number(res.headers()["retry-after"] ?? "10");
    await page.waitForTimeout((wait + 1) * 1000);
    await page.getByRole("button", { name: "Đăng nhập" }).click();
  }
}

/** The cart of the page's context, as the gateway answers it. */
export async function cartFromApi(page: Page): Promise<Cart> {
  const res = await page.request.get("/api/cart");
  expect(res.status()).toBe(200);
  return (await res.json()) as Cart;
}

/** Empties the cart of the page's context through the API, so a journey starts from no lines. */
export async function emptyCart(page: Page): Promise<void> {
  for (const item of (await cartFromApi(page)).items) {
    const res = await page.request.delete(`/api/cart/items/${encodeURIComponent(item.sku)}`, {
      headers: ORIGIN,
    });
    expect([200, 204, 404]).toContain(res.status());
  }
  expect((await cartFromApi(page)).items).toHaveLength(0);
}

/** A seed user's own session, with that user's cart emptied. */
export async function loginWithEmptyCart(page: Page, user: SeedUser): Promise<void> {
  await loginByApi(page, user);
  await emptyCart(page);
}

/**
 * Adds the product on its page. The toast is optimistic (it shows before the server answers), so
 * this waits for the POST itself and requires a 2xx before the caller reads the cart back.
 */
export async function addOnProductPage(page: Page, path: string): Promise<void> {
  await page.goto(path);
  // A 401 is retried once by the client after a refresh, so this waits for the successful answer.
  const added = page.waitForResponse(
    (r) =>
      r.ok() && r.request().method() === "POST" && new URL(r.url()).pathname === "/api/cart/items",
  );
  await page.getByRole("button", { name: "Thêm vào giỏ" }).click();
  await expect(page.getByText("Đã thêm 1 sản phẩm vào giỏ")).toBeVisible();
  await added;
}

/**
 * Counts session refreshes seen by the page: the browser's own `POST /api/auth/refresh`, plus any
 * other response that sets a new `refresh_token` (the server-side refresh of src/proxy.ts, which
 * answers a navigation or prefetch with the rotated cookies).
 */
export function countRefreshes(page: Page): { total: () => number; detail: string[] } {
  const detail: string[] = [];
  page.on("response", async (response) => {
    const path = new URL(response.url()).pathname;
    if (path === "/api/auth/refresh" && response.request().method() === "POST") {
      detail.push(`browser ${path} ${response.status()}`);
      return;
    }
    const setCookies = await response.headerValues("set-cookie").catch(() => []);
    if (
      setCookies.some(
        (value) => value.startsWith("refresh_token=") && !value.startsWith("refresh_token=;"),
      )
    ) {
      detail.push(`server ${path}`);
    }
  });
  return { total: () => detail.length, detail };
}

/** A cart line on /cart, scoped to the lines region (a hidden streamed copy is in the DOM too). */
export function line(page: Page, name: string) {
  return page
    .getByRole("region", { name: "Sản phẩm trong giỏ" })
    .locator("article", { hasText: name });
}

/** Every line shows the API's name, unit price, quantity and variant; the summary its count. */
export async function expectCartMatchesApi(page: Page, cart: Cart): Promise<void> {
  for (const item of cart.items) {
    const row = line(page, item.name);
    await expect(row).toBeVisible();
    await expect(row).toContainText(formatVnd(item.unitPrice.amount));
    await expect(row.getByText(String(item.quantity), { exact: true })).toBeVisible();
    if (item.variantLabel) await expect(row).toContainText(item.variantLabel);
  }
  await expect(page.getByText(`Tạm tính (${cart.itemCount} sản phẩm)`)).toBeVisible();
}

export async function cookieNames(page: Page): Promise<string[]> {
  return (await page.context().cookies()).map((cookie) => cookie.name);
}
