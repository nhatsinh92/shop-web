import { expect } from "@playwright/test";
import type { Page, Request } from "@playwright/test";

import { STUB_PORT, loginByApi, newEmail } from "./session";
import type { Scenario } from "./stub-gateway";

export const KEYBOARD_SKU = "SKU-KB-75";
export const BOTTLE_SKU = "SKU-BOTTLE-750";
export const VALID_PHONE = "0901234567";

export type CheckoutScenario = Extract<Scenario, "ok" | `checkout-${string}`>;

/** Signs in as a fresh user and puts the keyboard and the bottle in the cart through the API. */
export async function signInWithCart(
  page: Page,
  scenario: CheckoutScenario,
  workerIndex: number,
): Promise<string> {
  const email = newEmail(scenario, workerIndex);
  await loginByApi(page, email);
  for (const sku of [KEYBOARD_SKU, BOTTLE_SKU]) {
    const res = await page.request.post("/api/cart/items", { data: { sku, quantity: 1 } });
    if (!res.ok()) throw new Error(`stub cart add failed: ${res.status()}`);
  }
  return email;
}

/** From the cart to the checkout page; resolves with the reservation id of the URL. */
export async function startCheckout(page: Page): Promise<string> {
  await page.goto("/cart");
  await page.getByRole("link", { name: "Thanh toán" }).click();
  await expect(page).toHaveURL(/\/checkout\?reservation=/);
  return reservationId(page);
}

export function reservationId(page: Page): string {
  const id = new URL(page.url()).searchParams.get("reservation");
  if (!id) throw new Error(`no reservation in ${page.url()}`);
  return id;
}

export async function fillAddress(page: Page, phone = VALID_PHONE): Promise<void> {
  await page.getByLabel("Họ và tên").fill("Nguyễn Minh Anh");
  await page.getByLabel("Số điện thoại").fill(phone);
  await page.getByLabel("Địa chỉ", { exact: true }).fill("12 Nguyễn Huệ");
  await page.getByLabel("Phường/Xã", { exact: true }).fill("Bến Nghé");
  await page.getByLabel("Tỉnh/Thành phố", { exact: true }).fill("TP. Hồ Chí Minh");
}

export const placeOrderButton = (page: Page) => page.getByRole("button", { name: "Đặt hàng" });

export async function chooseCard(page: Page, outcome: "Thất bại" | "Quá thời gian" | "Thành công") {
  await page.getByRole("radio", { name: /Thẻ tín dụng/ }).click();
  await page.getByLabel("Kết quả thanh toán (demo)").selectOption({ label: outcome });
}

/** Collects every `POST /api/orders` the page sends (the listener sees aborted ones too). */
export function recordOrderRequests(page: Page): Request[] {
  const sent: Request[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/orders") {
      sent.push(request);
    }
  });
  return sent;
}

export const idempotencyKeyOf = (request: Request) => request.headers()["idempotency-key"];

/** The orders the stub stored for this user. */
export async function storedOrders(page: Page, email: string): Promise<number> {
  const res = await page.request.get(
    `http://localhost:${STUB_PORT}/__stub/orders?email=${encodeURIComponent(email)}`,
  );
  return ((await res.json()) as { count: number }).count;
}

/** Waits until every ordered line is gone from the cart (the page removes them after ordering). */
export async function expectCartEmpty(page: Page): Promise<void> {
  await expect
    .poll(async () => {
      const res = await page.request.get("/api/cart");
      return ((await res.json()) as { items: unknown[] }).items.length;
    })
    .toBe(0);
}
