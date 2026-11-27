import { expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "../e2e/support/journeys";

import {
  type Cart,
  ANC,
  BOTTLE,
  SEED_USERS,
  addOnProductPage,
  cartFromApi,
  cookieNames,
  countRefreshes,
  expectCartMatchesApi,
  line,
  loginByForm,
  loginWithEmptyCart,
} from "./support";

// Cart journeys through the real gateway, cart-service and core (#103). Each test starts from a
// cart it owns: a fresh guest context, or a seed user's cart emptied through the API first, so
// the suite can run again against the same `make demo`.
//
// Slow, failing and partial-backend scenarios (cart-slow, cart-down, patch-fails, the delayed
// merge) stay stub-only in e2e/cart.spec.ts: the real stack cannot be made slow or failing on
// demand here (toxiproxy belongs to shop-api's `make demo-peak`).

test.describe("guest cart", () => {
  test("two seed products added on their pages show on /cart as the API answers them", async ({
    page,
  }) => {
    await addOnProductPage(page, ANC.path);
    await addOnProductPage(page, BOTTLE.path);

    await page.goto("/cart");
    const cart = await cartFromApi(page);
    expect(cart.items.map((item) => item.sku).sort()).toEqual([ANC.sku, BOTTLE.sku].sort());
    const anc = cart.items.find((item) => item.sku === ANC.sku);
    expect(anc?.variantLabel).toBeTruthy();
    await expectCartMatchesApi(page, cart);

    await expectNoAxeViolations(page);
  });

  test("a new guest sees the empty cart and a disabled checkout", async ({ page }) => {
    await page.goto("/cart");

    await expect(
      page.getByRole("region", { name: "Sản phẩm trong giỏ" }).getByText("Giỏ hàng đang trống"),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Thanh toán" })).toBeDisabled();

    await expectNoAxeViolations(page);
  });

  test("five clicks on + within 400 ms send one PATCH with the final quantity", async ({
    page,
  }) => {
    await addOnProductPage(page, BOTTLE.path);
    await page.goto("/cart");
    const [bottle] = (await cartFromApi(page)).items;
    if (!bottle) throw new Error("the bottle is not in the cart");
    await expect(line(page, bottle.name)).toBeVisible();

    // The app sends the PATCH body as a stream, which Playwright does not expose; the gateway
    // answers a PATCH with the whole cart, so its response shows the quantity that was sent.
    const patches: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "PATCH") patches.push(request.url());
    });
    const patched = page.waitForResponse((response) => response.request().method() === "PATCH");

    const plus = page.getByRole("button", { name: `Tăng số lượng ${bottle.name}` });
    const started = Date.now();
    for (let i = 0; i < 5; i++) await plus.click();
    expect(Date.now() - started).toBeLessThan(400);
    const response = await patched;
    expect(response.ok()).toBe(true);
    await expect(page.getByText("Đã lưu")).toBeVisible();

    const answered = (await response.json()) as Cart;
    expect(answered.items.find((item) => item.sku === bottle.sku)?.quantity).toBe(
      bottle.quantity + 5,
    );
    expect(patches).toHaveLength(1);
    await page.reload();
    await expect(
      line(page, bottle.name).getByText(String(bottle.quantity + 5), { exact: true }),
    ).toBeVisible();
    expect((await cartFromApi(page)).items[0]?.quantity).toBe(bottle.quantity + 5);
  });

  test("a removed line is gone after a reload", async ({ page }) => {
    await addOnProductPage(page, ANC.path);
    await addOnProductPage(page, BOTTLE.path);
    await page.goto("/cart");
    const before = await cartFromApi(page);
    const anc = before.items.find((item) => item.sku === ANC.sku);
    if (!anc) throw new Error("ANC Pro is not in the cart");

    const removed = page.waitForResponse((response) => response.request().method() === "DELETE");
    await page.getByRole("button", { name: `Xóa ${anc.name}` }).click();
    expect((await removed).ok()).toBe(true);

    await page.reload();
    await expect(line(page, anc.name)).toHaveCount(0);
    const after = await cartFromApi(page);
    expect(after.items.map((item) => item.sku)).toEqual([BOTTLE.sku]);
    await expectCartMatchesApi(page, after);
  });
});

test.describe("guest and user carts", () => {
  test("a guest item is merged into the seed user's cart on login and guest_cart is gone", async ({
    browser,
    page,
  }) => {
    const user = SEED_USERS.minh;
    const own = await browser.newPage();
    await loginWithEmptyCart(own, user);
    await own.close();

    await addOnProductPage(page, BOTTLE.path);
    expect(await cookieNames(page)).toContain("guest_cart");

    await page.goto("/login?next=/cart");
    await loginByForm(page, user);
    await expect(page).toHaveURL((url) => url.pathname === "/cart");
    const cart = await cartFromApi(page);
    expect(cart.items.map((item) => item.sku)).toEqual([BOTTLE.sku]);
    await expectCartMatchesApi(page, cart);
    expect(await cookieNames(page)).not.toContain("guest_cart");
  });

  test("an expired access cookie refreshes once and the item lands in the user cart", async ({
    page,
    context,
  }) => {
    await loginWithEmptyCart(page, SEED_USERS.an);
    // As the browser does on expiry: access_token is gone, logged_in and refresh_token stay.
    await context.clearCookies({ name: "access_token" });
    expect(await cookieNames(page)).toEqual(expect.arrayContaining(["logged_in", "refresh_token"]));

    // Browser and server-side (src/proxy.ts) refreshes together: exactly one rotation.
    const refreshes = countRefreshes(page);
    await addOnProductPage(page, ANC.path);

    expect(refreshes.total(), refreshes.detail.join(", ")).toBe(1);
    expect((await cartFromApi(page)).items.map((item) => item.sku)).toEqual([ANC.sku]);
    expect(await cookieNames(page)).not.toContain("guest_cart");
  });

  test("after user A logs out and user B logs in, /cart never shows A's lines", async ({
    browser,
    page,
  }) => {
    const [a, b] = [SEED_USERS.linh, SEED_USERS.an];
    const other = await browser.newPage();
    await loginWithEmptyCart(other, b);
    await other.close();

    await loginWithEmptyCart(page, a);
    await addOnProductPage(page, ANC.path);
    await page.goto("/cart");
    const aCart = await cartFromApi(page);
    const ancName = aCart.items[0]?.name;
    if (!ancName) throw new Error("A's cart is empty");
    await expect(line(page, ancName)).toBeVisible();
    await expectNoAxeViolations(page);

    await page.goto("/account");
    const loggedOut = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/auth/logout");
    await page.getByRole("button", { name: "Đăng xuất" }).click();
    await loggedOut;
    await expect(page).toHaveURL((url) => url.pathname === "/");

    await page.goto("/login?next=/cart");
    await loginByForm(page, b);
    await expect(page).toHaveURL((url) => url.pathname === "/cart");
    await expect(
      page.getByRole("region", { name: "Sản phẩm trong giỏ" }).getByText("Giỏ hàng đang trống"),
    ).toBeVisible();
    await expect(line(page, ancName)).toHaveCount(0);
    expect((await cartFromApi(page)).items).toHaveLength(0);
  });
});
