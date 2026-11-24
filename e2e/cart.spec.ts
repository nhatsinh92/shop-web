import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { cartLineFixtures } from "../mocks/fixtures/cart";

import {
  expectCartPersisted,
  persistedCartText,
  setCartMode,
  submitLoginForm,
} from "./support/cart";
import { ANC_PATH, expectNoAxeViolations, expectNoHorizontalScroll } from "./support/journeys";
import { loginByApi, newEmail, refreshCallCount } from "./support/session";

const [anc, keyboard, bottle] = cartLineFixtures;
if (!anc || !keyboard || !bottle) throw new Error("cart fixtures changed");

const REDIRECT_SLACK_MS = 250;
const STALE_TEXT = "Đang hiển thị giỏ hàng đã lưu";

async function openCartAs(page: Page, scenario: "ok" | "cart-full" | "cart-slow", worker: number) {
  const email = newEmail(scenario, worker);
  await loginByApi(page, email);
  await page.goto("/cart");
  return email;
}

function line(page: Page, name: string) {
  // Scoped to the region: while the stream swaps in, a hidden copy of the lines is in the DOM.
  return page
    .getByRole("region", { name: "Sản phẩm trong giỏ" })
    .locator("article", { hasText: name });
}

async function expectPhoneFits(page: Page, project: string) {
  if (project === "phone") await expectNoHorizontalScroll(page);
}

test.describe("cart page states", () => {
  test("loaded: three artboard lines and the summary", async ({ page }, testInfo) => {
    await openCartAs(page, "cart-full", testInfo.workerIndex);

    await expect(page.getByRole("heading", { level: 1 })).toContainText("4 sản phẩm");
    for (const item of cartLineFixtures) await expect(line(page, item.name)).toBeVisible();
    await expect(line(page, anc.name)).toContainText("890.000₫");
    await expect(line(page, anc.name).locator("s")).toHaveText("1.790.000₫");
    await expect(line(page, anc.name)).toContainText("Sắp hết");
    await expect(line(page, anc.name)).toContainText("Màu: Đen nhám");
    await expect(line(page, keyboard.name)).toContainText("1.150.000₫");
    await expect(line(page, bottle.name)).toContainText("378.000₫");
    await expect(line(page, bottle.name).getByText("2", { exact: true })).toBeVisible();
    await expect(page.getByText("Đã lưu")).toBeVisible();
    await expect(page.getByText("Tạm tính (4 sản phẩm)")).toBeVisible();
    await expect(page.getByText("2.418.000₫").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Thanh toán" })).toBeVisible();

    await expectNoAxeViolations(page);
    await expectPhoneFits(page, testInfo.project.name);
  });

  test("empty: empty frame, deal link and a disabled checkout", async ({ page }, testInfo) => {
    await openCartAs(page, "ok", testInfo.workerIndex);

    await expect(page.getByText("Giỏ hàng đang trống")).toBeVisible();
    await expect(page.getByRole("link", { name: "Săn deal 12.12" })).toHaveAttribute("href", "/");
    await expect(page.getByRole("button", { name: "Thanh toán" })).toBeDisabled();

    await expectNoAxeViolations(page);
    await expectPhoneFits(page, testInfo.project.name);
  });

  test("slow backend: the server streams without the cart and the client shows the lines", async ({
    page,
  }, testInfo) => {
    await openCartAs(page, "cart-slow", testInfo.workerIndex);
    // The delayed server fetch exceeds the 250 ms budget, so the streamed HTML has no cart data.
    const html = await (await page.request.get("/cart")).text();
    expect(html).not.toContain(keyboard.sku);
    for (const item of cartLineFixtures) await expect(line(page, item.name)).toBeVisible();
    await expect(page.getByText("Tạm tính (4 sản phẩm)")).toBeVisible();
  });

  test("a fast backend hydrates the cart into the streamed HTML", async ({ page }, testInfo) => {
    await openCartAs(page, "cart-full", testInfo.workerIndex);
    const html = await (await page.request.get("/cart")).text();
    expect(html).toContain(keyboard.sku);
  });

  test("stale: saved lines and a banner while the backend fails; retry shows the live cart", async ({
    page,
  }, testInfo) => {
    const email = await openCartAs(page, "cart-full", testInfo.workerIndex);
    await expect(line(page, anc.name)).toBeVisible();
    await expectCartPersisted(page, keyboard.sku);

    await setCartMode(page, email, "down");
    await page.reload();
    await expect(page.getByText(STALE_TEXT)).toBeVisible();
    for (const item of cartLineFixtures) await expect(line(page, item.name)).toBeVisible();
    await expectNoAxeViolations(page);
    await expectPhoneFits(page, testInfo.project.name);

    await setCartMode(page, email, "ok");
    await page.getByRole("button", { name: "Thử lại" }).click();
    await expect(page.getByText(STALE_TEXT)).toHaveCount(0);
    for (const item of cartLineFixtures) await expect(line(page, item.name)).toBeVisible();
  });
});

test.describe("cart quantity", () => {
  test("five clicks on + within 400 ms send one PATCH with the final quantity", async ({
    page,
  }, testInfo) => {
    await openCartAs(page, "cart-full", testInfo.workerIndex);
    const patches: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "PATCH") patches.push(request.url());
    });
    const patched = page.waitForResponse((response) => response.request().method() === "PATCH");

    const plus = page.getByRole("button", { name: `Tăng số lượng ${bottle.name}` });
    await expect(line(page, bottle.name)).toBeVisible();
    for (let i = 0; i < 5; i++) await plus.click();
    await expect(line(page, bottle.name)).toContainText("1.323.000₫");
    await expect(page.getByText("Đã lưu")).toBeVisible();

    // The stub answers a PATCH with the full cart, so its body shows the quantity that was sent.
    const cart = (await (await patched).json()) as { items: { sku: string; quantity: number }[] };
    expect(cart.items.find((item) => item.sku === bottle.sku)?.quantity).toBe(7);
    expect(patches).toHaveLength(1);
  });

  test("a failing PATCH rolls the line back and shows the error toast", async ({
    page,
  }, testInfo) => {
    const email = await openCartAs(page, "cart-full", testInfo.workerIndex);
    await expect(line(page, bottle.name)).toBeVisible();
    await setCartMode(page, email, "patch-fails");

    await page.getByRole("button", { name: `Tăng số lượng ${bottle.name}` }).click();
    await expect(page.getByText("Sản phẩm không đủ số lượng trong kho.")).toBeVisible();
    await expect(line(page, bottle.name)).toContainText("378.000₫");
    await expect(page.getByText("Tạm tính (4 sản phẩm)")).toBeVisible();
  });
});

test.describe("cart and login", () => {
  test("a guest cart is merged into the user cart after login", async ({ page }, testInfo) => {
    await page.goto(ANC_PATH);
    await page.getByRole("button", { name: "Thêm vào giỏ" }).click();
    await expect(page.getByText("Đã thêm 1 sản phẩm vào giỏ")).toBeVisible();

    await page.goto("/login?next=/cart");
    await submitLoginForm(page, newEmail("ok", testInfo.workerIndex));
    await expect(page).toHaveURL((url) => url.pathname === "/cart");
    await expect(line(page, anc.name)).toBeVisible();
    await expect(page.getByText("Tạm tính (1 sản phẩm)")).toBeVisible();
  });

  test("a merge delayed 3 s does not delay the redirect by more than 1 s", async ({
    page,
  }, testInfo) => {
    await page.goto(ANC_PATH);
    await page.getByRole("button", { name: "Thêm vào giỏ" }).click();
    await expect(page.getByText("Đã thêm 1 sản phẩm vào giỏ")).toBeVisible();

    await page.goto("/login?next=/cart");
    let loginAnswered = 0;
    page.on("response", (response) => {
      if (new URL(response.url()).pathname === "/api/auth/login") loginAnswered = Date.now();
    });
    await submitLoginForm(page, newEmail("cart-merge-slow", testInfo.workerIndex));
    await page.waitForURL((url) => url.pathname === "/cart");
    expect(loginAnswered).toBeGreaterThan(0);
    // The merge budget is 1 s; the redirect itself adds a few dozen ms, far below the stub's 3 s.
    expect(Date.now() - loginAnswered).toBeLessThan(1000 + REDIRECT_SLACK_MS);
  });

  test("an expired access cookie refreshes once and the item lands in the user cart", async ({
    page,
    context,
  }, testInfo) => {
    const email = newEmail("short-ttl", testInfo.workerIndex);
    await loginByApi(page, email);
    await page.goto(ANC_PATH);
    await page.getByRole("button", { name: "Thêm vào giỏ" }).click();
    await expect(page.getByText("Đã thêm 1 sản phẩm vào giỏ")).toBeVisible();
    expect(await refreshCallCount(page, email)).toBe(1);

    const jar = await context.cookies();
    expect(jar.find((cookie) => cookie.name === "guest_cart")).toBeUndefined();
    await page.goto("/cart");
    await expect(line(page, anc.name)).toBeVisible();
    await expect(page.getByText("Tạm tính (1 sản phẩm)")).toBeVisible();
  });

  test("a user's persisted cart never shows for the next user on the same browser", async ({
    page,
  }, testInfo) => {
    await openCartAs(page, "cart-full", testInfo.workerIndex);
    await expect(line(page, anc.name)).toBeVisible();
    await expectCartPersisted(page, anc.sku);

    await page.goto("/account");
    const logoutCall = page.waitForResponse(
      (r) => new URL(r.url()).pathname === "/api/auth/logout",
    );
    await page.getByRole("button", { name: "Đăng xuất" }).click();
    await logoutCall;
    await expect(page).toHaveURL((url) => url.pathname === "/");
    expect((await persistedCartText(page)) ?? "").not.toContain(anc.sku);

    await page.goto("/login");
    await submitLoginForm(page, newEmail("ok", testInfo.workerIndex));
    await expect(page).toHaveURL((url) => url.pathname === "/");
    await page.goto("/cart");
    // Scoped to the lines region: while the response streams, the hidden Suspense copy matches too.
    await expect(
      page.getByRole("region", { name: "Sản phẩm trong giỏ" }).getByText("Giỏ hàng đang trống"),
    ).toBeVisible();
    await expect(page.getByText(anc.name)).toHaveCount(0);
    await expect(page.getByText(bottle.name)).toHaveCount(0);
  });
});
