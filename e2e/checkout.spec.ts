import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { cartLineFixtures } from "../mocks/fixtures/cart";

import {
  chooseCard,
  expectCartEmpty,
  fillAddress,
  idempotencyKeyOf,
  placeOrderButton,
  recordOrderRequests,
  reservationId,
  signInWithCart,
  startCheckout,
  storedOrders,
} from "./support/checkout";
import { expectNoAxeViolations, expectNoHorizontalScroll } from "./support/journeys";

const keyboard = cartLineFixtures[1];
if (!keyboard) throw new Error("cart fixtures changed");

const SUCCESS = "Đặt hàng thành công";

/** Axe plus, at phone width, the no-horizontal-scroll check for the state on screen. */
async function expectAccessibleState(page: Page, project: string) {
  await expectNoAxeViolations(page);
  if (project === "phone") await expectNoHorizontalScroll(page);
}

test.describe("checkout journeys", () => {
  test("COD success: reserve, keep the id on reload, place the order and empty the cart", async ({
    page,
  }, testInfo) => {
    await signInWithCart(page, "ok", testInfo.workerIndex);
    const id = await startCheckout(page);

    await expect(page.getByText(/Hoàn tất trong\s+(10:00|09:59|09:58)/)).toBeVisible();
    await expectAccessibleState(page, testInfo.project.name);

    await page.reload();
    expect(reservationId(page)).toBe(id);
    await expect(page.getByRole("heading", { name: "Địa chỉ giao hàng" })).toBeVisible();

    await fillAddress(page);
    await placeOrderButton(page).click();
    await expect(page.getByText(SUCCESS)).toBeVisible();
    await expect(page.getByText(/Mã đơn #MY-/)).toBeVisible();
    await expectAccessibleState(page, testInfo.project.name);

    await expectCartEmpty(page);
    await page.goto("/cart");
    // Scoped to the region: while the stream swaps in, a hidden copy is in the DOM.
    await expect(
      page.getByRole("region", { name: "Sản phẩm trong giỏ" }).getByText("Giỏ hàng đang trống"),
    ).toBeVisible();
  });

  test("submitting state is accessible while the order is in flight", async ({
    page,
  }, testInfo) => {
    await signInWithCart(page, "ok", testInfo.workerIndex);
    await startCheckout(page);
    await fillAddress(page);

    let release: () => void = () => undefined;
    const gate = new Promise<void>((done) => (release = done));
    await page.route("**/api/orders", async (route) => {
      await gate;
      await route.continue();
    });

    await placeOrderButton(page).click();
    await expect(page.getByRole("button", { name: "Đang xử lý…" })).toBeDisabled();
    await expectAccessibleState(page, testInfo.project.name);

    release();
    await expect(page.getByText(SUCCESS)).toBeVisible();
  });

  test("double click on Đặt hàng sends exactly one order request", async ({ page }, testInfo) => {
    const email = await signInWithCart(page, "ok", testInfo.workerIndex);
    await startCheckout(page);
    await fillAddress(page);
    const sent = recordOrderRequests(page);

    await placeOrderButton(page).dblclick();
    await expect(page.getByText(SUCCESS)).toBeVisible();

    expect(sent).toHaveLength(1);
    expect(await storedOrders(page, email)).toBe(1);
  });

  test("payment failure: card fails, then Đổi sang COD places the order", async ({
    page,
  }, testInfo) => {
    const email = await signInWithCart(page, "ok", testInfo.workerIndex);
    const first = await startCheckout(page);
    await fillAddress(page);
    await chooseCard(page, "Thất bại");
    await placeOrderButton(page).click();

    await expect(page.getByText("Thanh toán không thành công")).toBeVisible();
    await expectAccessibleState(page, testInfo.project.name);

    await page.getByRole("button", { name: "Đổi sang COD" }).click();
    await expect.poll(() => reservationId(page)).not.toBe(first);
    await expect(page.getByRole("radio", { name: /Thanh toán khi nhận hàng/ })).toBeChecked();
    await placeOrderButton(page).click();
    await expect(page.getByText(SUCCESS)).toBeVisible();
    expect(await storedOrders(page, email)).toBe(2);
  });

  test("payment timeout: Quá thời gian, then Thử lại with Thành công places the order", async ({
    page,
  }, testInfo) => {
    await signInWithCart(page, "ok", testInfo.workerIndex);
    const first = await startCheckout(page);
    await fillAddress(page);
    await chooseCard(page, "Quá thời gian");
    await placeOrderButton(page).click();

    await expect(page.getByText("Thanh toán quá thời gian chờ")).toBeVisible();
    await page.getByRole("button", { name: "Thử lại" }).click();
    await expect.poll(() => reservationId(page)).not.toBe(first);

    await page.getByLabel("Kết quả thanh toán (demo)").selectOption({ label: "Thành công" });
    await placeOrderButton(page).click();
    await expect(page.getByText(SUCCESS)).toBeVisible();
  });

  test("expiry: Hết thời gian giữ hàng, Giữ hàng lại keeps the typed values", async ({
    page,
  }, testInfo) => {
    await signInWithCart(page, "checkout-short-hold", testInfo.workerIndex);
    const first = await startCheckout(page);
    await fillAddress(page);

    await expect(page.getByText("Hết thời gian giữ hàng")).toBeVisible({ timeout: 15_000 });
    await expectAccessibleState(page, testInfo.project.name);

    await page.getByRole("button", { name: "Giữ hàng lại" }).click();
    await expect.poll(() => reservationId(page)).not.toBe(first);
    await expect(page.getByText("Hết thời gian giữ hàng")).toBeHidden();
    await expect(page.getByLabel("Họ và tên")).toHaveValue("Nguyễn Minh Anh");
    await expect(page.getByLabel("Số điện thoại")).toHaveValue("0901234567");
  });

  test("out of stock at reserve: back on the cart with the shortage toast", async ({
    page,
  }, testInfo) => {
    await signInWithCart(page, "checkout-out-of-stock", testInfo.workerIndex);
    await page.goto("/cart");
    await page.getByRole("link", { name: "Thanh toán" }).click();

    await expect(page.getByText(`Không đủ hàng: ${keyboard.name} (còn 1)`)).toBeVisible();
    await expect(page).toHaveURL(/\/cart$/);
  });

  test("validation: an invalid phone is flagged and focused, no order is sent", async ({
    page,
  }, testInfo) => {
    await signInWithCart(page, "ok", testInfo.workerIndex);
    await startCheckout(page);
    await fillAddress(page, "12345");
    const sent = recordOrderRequests(page);

    await placeOrderButton(page).click();

    await expect(page.getByText("Số điện thoại không hợp lệ")).toBeVisible();
    await expect(page.getByLabel("Số điện thoại")).toBeFocused();
    expect(sent).toHaveLength(0);
  });

  test("network error then an edit sends a new Idempotency-Key", async ({ page }, testInfo) => {
    const email = await signInWithCart(page, "checkout-net-error", testInfo.workerIndex);
    await startCheckout(page);
    await fillAddress(page);
    const sent = recordOrderRequests(page);

    await placeOrderButton(page).click();
    await expect(placeOrderButton(page)).toBeEnabled();
    expect(sent).toHaveLength(1);

    await page.getByLabel("Ghi chú").fill("Giao giờ hành chính");
    await placeOrderButton(page).click();
    await expect(page.getByText(SUCCESS)).toBeVisible();

    expect(sent).toHaveLength(2);
    const [firstKey, secondKey] = sent.map(idempotencyKeyOf);
    expect(firstKey).toBeTruthy();
    expect(secondKey).toBeTruthy();
    expect(secondKey).not.toBe(firstKey);
    expect(await storedOrders(page, email)).toBe(1);
  });

  test("network error then a retry without editing reuses the Idempotency-Key", async ({
    page,
  }, testInfo) => {
    await signInWithCart(page, "checkout-net-error", testInfo.workerIndex);
    await startCheckout(page);
    await fillAddress(page);
    const sent = recordOrderRequests(page);

    await placeOrderButton(page).click();
    await expect(placeOrderButton(page)).toBeEnabled();
    await placeOrderButton(page).click();
    await expect(page.getByText(SUCCESS)).toBeVisible();

    expect(sent).toHaveLength(2);
    expect(idempotencyKeyOf(sent[1]!)).toBe(idempotencyKeyOf(sent[0]!));
  });

  test("without a session /checkout redirects to /login with next", async ({ page }) => {
    await page.goto("/checkout");
    await expect(page).toHaveURL(/\/login\?next=(%2F|\/)checkout/);
  });
});
