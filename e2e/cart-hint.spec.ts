import { expect, test } from "@playwright/test";

import { setCartMode } from "./support/cart";
import { VIEWPORTS } from "./support/flags";
import { ANC_PATH, expectNoAxeViolations, expectNoHorizontalScroll } from "./support/journeys";
import { loginByApi, newEmail } from "./support/session";

for (const viewport of VIEWPORTS) {
  test.describe(`header badge hint at ${viewport.width}px`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("keeps the hinted count when the summary fails and clears it on logout", async ({
      page,
    }, testInfo) => {
      const email = newEmail("ok", testInfo.workerIndex);
      await loginByApi(page, email);
      await page.goto(ANC_PATH);
      const badge = page.getByTestId("cart-count");
      await expect(badge).toHaveCount(0);

      await page.getByRole("button", { name: "Tăng số lượng" }).click();
      await page.getByRole("button", { name: "Thêm vào giỏ" }).click();
      await expect(badge).toHaveText("2");
      await expect
        .poll(async () => (await page.context().cookies()).map((c) => c.name))
        .toContain("cart_count");

      // The badge call fails from now on; the hint cookie keeps the count on a fresh load.
      await setCartMode(page, email, "summary-down");
      const summary = page.waitForResponse(
        (response) => new URL(response.url()).pathname === "/api/cart/summary",
      );
      await page.reload();
      expect((await summary).status()).toBe(503);
      await expect(badge).toHaveText("2");

      await expectNoAxeViolations(page);
      if (viewport.name === "phone") await expectNoHorizontalScroll(page);

      await page.goto("/account");
      await expect(page.getByText(email)).toBeVisible();
      await page.getByRole("button", { name: "Đăng xuất" }).click();
      await expect(page).toHaveURL((url) => url.pathname === "/");
      await expect(page.getByRole("link", { name: "Đăng nhập" })).toBeVisible();
      await expect(badge).toHaveCount(0);
      await page.reload();
      await expect(page.getByRole("link", { name: "Giỏ hàng" })).toBeVisible();
      await expect(badge).toHaveCount(0);
    });
  });
}
