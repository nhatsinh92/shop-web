import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { VIEWPORTS, reloadUntil, resetFlags, setFlags, settle, trackErrors } from "./support/flags";
import { ANC_PATH, expectNoAxeViolations, expectNoHorizontalScroll } from "./support/journeys";
import { loginByApi, newEmail } from "./support/session";

const recommendations = (page: Page) => page.getByRole("region", { name: "Gợi ý cho bạn" });
const memberRow = (page: Page) => page.getByText(/Giá thành viên/);
const memberLogin = (page: Page) =>
  page.getByRole("link", { name: "Đăng nhập để xem giá thành viên" });

for (const viewport of VIEWPORTS) {
  test.describe(`flag journeys at ${viewport.width}px`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test.afterEach(async ({ page }) => {
      await resetFlags(page);
    });

    test("recommendations off hides the section, on brings it back", async ({ page }) => {
      const errors = trackErrors(page);
      await page.goto("/");
      await expect(recommendations(page)).toBeVisible();

      await setFlags(page, { recommendations: "off" });
      await reloadUntil(page, () => recommendations(page).isVisible(), false);
      await expect(page.getByRole("heading", { name: "Gợi ý cho bạn" })).toHaveCount(0);
      await expect(page.getByRole("heading", { level: 1 })).toContainText("12.12");
      await expect(page.getByRole("region", { name: "Flash sale" })).toBeVisible();
      await expect(page.getByRole("region", { name: "Danh mục nổi bật" })).toBeVisible();
      await expectNoAxeViolations(page);
      if (viewport.name === "phone") await expectNoHorizontalScroll(page);

      await setFlags(page, { recommendations: "on" });
      await reloadUntil(page, () => recommendations(page).isVisible(), true);
      expect(errors).toEqual([]);
    });

    for (const signedIn of [false, true]) {
      test(`memberPrice off hides the member price (${signedIn ? "signed in" : "guest"})`, async ({
        page,
      }, testInfo) => {
        const errors = trackErrors(page);
        const memberPriceCalls: string[] = [];
        page.on("request", (request) => {
          if (/\/api\/products\/[^/]+\/member-price/.test(request.url())) {
            memberPriceCalls.push(request.url());
          }
        });
        if (signedIn) await loginByApi(page, newEmail("ok", testInfo.workerIndex));

        await setFlags(page, { memberPrice: "off" });
        // The flags cache can still hold "on" for a few seconds: wait until the row is gone.
        await page.goto(ANC_PATH);
        await reloadUntil(
          page,
          async () => (await memberRow(page).count()) + (await memberLogin(page).count()) > 0,
          false,
        );
        await expect(page.getByRole("heading", { level: 1 })).toContainText("ANC Pro");
        await expect(page.getByText("Sắp hết · còn khoảng 40 sản phẩm")).toBeVisible();
        await expect(memberRow(page)).toHaveCount(0);
        await expect(memberLogin(page)).toHaveCount(0);

        // Requests of the last, settled load only: earlier loads may have raced the flags cache.
        memberPriceCalls.length = 0;
        errors.length = 0;
        await page.reload();
        await expect(page.getByText("Sắp hết · còn khoảng 40 sản phẩm")).toBeVisible();
        await settle(page);
        expect(memberPriceCalls).toEqual([]);
        expect(errors).toEqual([]);

        await expectNoAxeViolations(page);
        if (viewport.name === "phone") await expectNoHorizontalScroll(page);
      });
    }
  });
}
