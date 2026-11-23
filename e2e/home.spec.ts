import { expect, test } from "@playwright/test";

import { expectNoAxeViolations, expectNoHorizontalScroll } from "./support/journeys";
import { loginByApi, newEmail } from "./support/session";

test.describe("home journeys", () => {
  test("renders the hero, flash sale, categories and recommendations", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toContainText("12.12");

    const flash = page.getByRole("region", { name: "Flash sale" });
    await expect(flash).toBeVisible();
    const card = flash.locator("article", { hasText: "ANC Pro" });
    await expect(card).toContainText("890.000₫");
    await expect(card).toContainText("1.790.000₫");
    await expect(card).toContainText("-50%");

    // The countdown leaves its "--" placeholder and keeps running.
    const timer = flash.getByRole("timer");
    await expect(timer).not.toContainText("--");
    const first = await timer.textContent();
    await expect.poll(async () => timer.textContent(), { timeout: 5000 }).not.toBe(first);

    const categories = page.getByRole("region", { name: "Danh mục nổi bật" });
    await expect(categories.getByRole("listitem")).toHaveCount(6);

    const recommendations = page.getByRole("region", { name: "Gợi ý cho bạn" });
    await expect(recommendations).toBeVisible();
    await expect(recommendations.locator("article").first()).toBeVisible();
  });

  test("hides recommendations without an error when the backend is slow", async ({
    page,
  }, testInfo) => {
    await loginByApi(page, newEmail("slow", testInfo.workerIndex));
    await page.goto("/", { waitUntil: "load" });
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("region", { name: "Flash sale" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Gợi ý cho bạn" })).toHaveCount(0);
    await expect(page.getByText(/lỗi|error/i)).toHaveCount(0);
  });

  test("has no accessibility violations and no horizontal scroll", async ({ page }, testInfo) => {
    await page.goto("/");
    await expect(page.getByRole("region", { name: "Gợi ý cho bạn" })).toBeVisible();
    await expect(page.getByRole("timer")).not.toContainText("--");
    await expectNoAxeViolations(page);
    if (testInfo.project.name === "phone") await expectNoHorizontalScroll(page);
  });
});
