import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("home smoke", () => {
  test("renders the static shell with the header", async ({ page }, testInfo) => {
    // No backend in this test: the cart summary fails and the badge stays hidden.
    await page.route("**/api/**", (route) => route.fulfill({ status: 503 }));
    await page.goto("/");

    await expect(page.getByRole("link", { name: "Mây." })).toBeVisible();
    await expect(page.getByRole("searchbox", { name: "Tìm kiếm sản phẩm" })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Giỏ hàng/ })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("12.12");

    await page.screenshot({
      path: testInfo.outputPath(`home-${testInfo.project.name}.png`),
      fullPage: true,
    });
  });

  test("has no detectable accessibility violations", async ({ page }) => {
    await page.route("**/api/**", (route) => route.fulfill({ status: 503 }));
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
