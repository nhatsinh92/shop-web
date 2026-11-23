import { expect, test } from "@playwright/test";

import { ANC_PATH, expectNoAxeViolations, expectNoHorizontalScroll } from "./support/journeys";
import { loginByApi, newEmail } from "./support/session";

const MEMBER_LINE = "Giá thành viên Vàng của bạn: 845.500₫";

test.describe("product page journeys", () => {
  test("shows the ANC Pro artboard content", async ({ page }) => {
    await page.goto(ANC_PATH);

    const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(crumbs).toContainText("Trang chủ");
    await expect(crumbs.getByText("Tai nghe không dây chống ồn ANC Pro")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("ANC Pro");

    await expect(page.getByText("890.000₫", { exact: true })).toBeVisible();
    await expect(page.locator("s", { hasText: "1.790.000₫" })).toBeVisible();
    await expect(page.getByText("-50%", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Flash sale 12.12")).toBeVisible();
    await expect(page.getByText("Sắp hết · còn khoảng 40 sản phẩm")).toBeVisible();

    await expect(page.getByText("Màu sắc:")).toContainText("Đen nhám");
    await expect(page.getByRole("radio")).toHaveCount(3);
    await page.getByText("Trắng sứ").click();
    await expect(page.getByText("Màu sắc:")).toContainText("Trắng sứ");

    const more = page.getByRole("button", { name: "Tăng số lượng" });
    const less = page.getByRole("button", { name: "Giảm số lượng" });
    await expect(less).toBeDisabled();
    for (let i = 0; i < 12; i++) if (await more.isEnabled()) await more.click();
    await expect(more).toBeDisabled();
    await expect(page.getByText("10", { exact: true })).toBeVisible();

    const similar = page.getByRole("region", { name: "Sản phẩm tương tự" });
    await expect(similar.locator("article")).toHaveCount(5);
  });

  test("member price: guest sees the login prompt", async ({ page }) => {
    await page.goto(ANC_PATH);
    const link = page.getByRole("link", { name: "Đăng nhập để xem giá thành viên" });
    await expect(link).toHaveAttribute("href", /^\/login\?next=/);
  });

  test("member price: a signed-in member sees the Gold price", async ({ page }, testInfo) => {
    await loginByApi(page, newEmail("ok", testInfo.workerIndex));
    await page.goto(ANC_PATH);
    await expect(page.getByText(MEMBER_LINE)).toBeVisible();
  });

  test("member price: the client fallback answers when the server is slow", async ({
    page,
  }, testInfo) => {
    await loginByApi(page, newEmail("slow", testInfo.workerIndex));
    await page.goto(ANC_PATH);
    await expect(page.getByText(MEMBER_LINE)).toBeVisible();
  });

  test("add to cart raises the badge and shows the toast", async ({ page }, testInfo) => {
    await loginByApi(page, newEmail("ok", testInfo.workerIndex));
    await page.goto(ANC_PATH);
    const badge = page.getByTestId("cart-count");
    await expect(badge).toHaveCount(0);

    await page.getByRole("button", { name: "Tăng số lượng" }).click();
    await page.getByRole("button", { name: "Thêm vào giỏ" }).click();
    await expect(page.getByText("Đã thêm 2 sản phẩm vào giỏ")).toBeVisible();
    await expect(badge).toHaveText("2");

    await page.getByRole("button", { name: "Thêm vào giỏ" }).click();
    await expect(badge).toHaveText("4");
  });

  test("add to cart rolls the badge back when the stub answers 409", async ({ page }, testInfo) => {
    await loginByApi(page, newEmail("cart-conflict", testInfo.workerIndex));
    await page.goto(ANC_PATH);
    await expect(page.getByTestId("cart-count")).toHaveCount(0);

    await page.getByRole("button", { name: "Thêm vào giỏ" }).click();
    await expect(page.getByText("Sản phẩm không đủ số lượng trong kho.")).toBeVisible();
    await expect(page.getByTestId("cart-count")).toHaveCount(0);
  });

  test("an unknown slug shows the not-found page with status 404", async ({ page }) => {
    const response = await page.goto("/product/khong-ton-tai");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Không tìm thấy sản phẩm" })).toBeVisible();
  });

  test("has no accessibility violations and no horizontal scroll", async ({ page }, testInfo) => {
    await page.goto(ANC_PATH);
    await expect(page.getByText("Sắp hết · còn khoảng 40 sản phẩm")).toBeVisible();
    await expect(page.getByRole("link", { name: "Đăng nhập để xem giá thành viên" })).toBeVisible();
    await expectNoAxeViolations(page);
    if (testInfo.project.name === "phone") await expectNoHorizontalScroll(page);
  });
});
