import { expect, test } from "@playwright/test";

async function openDemoShop(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(page.getByText("Chế độ phát triển cục bộ")).toBeVisible();
  await page.getByRole("button", { name: /Mở SỔ TAY/ }).click();
  await expect(page.getByRole("heading", { name: /Bán đúng áo/ })).toBeVisible();
  await page.getByRole("button", { name: /Tiếp tục/ }).click();
  await expect(page.getByRole("heading", { name: /Đặt tên cho shop/ })).toBeVisible();
  await page.getByRole("button", { name: /Tiếp tục/ }).click();
  await expect(page.getByRole("heading", { name: /Cách bạn quản lý kho/ })).toBeVisible();
  await page.getByRole("button", { name: /Tiếp tục/ }).click();
  await expect(page.getByRole("heading", { name: /Khởi động shop/ })).toBeVisible();
  await page.getByRole("button", { name: /Vào shop/ }).click();
  await expect(page.getByRole("link", { name: /Quét QR để bán/ })).toBeVisible();
}

test("local onboarding creates demo shop and opens mobile overview", async ({ page }) => {
  await openDemoShop(page);
  await expect(page.getByRole("main").getByText("Pocket Store 01")).toBeVisible();
});

test("camera denial keeps manual SKU fallback available", async ({ page }) => {
  await openDemoShop(page);
  await page.goto("/scan");
  await expect(page.getByRole("button", { name: /Nhập SKU/ })).toBeVisible();
  await page.getByRole("button", { name: /Nhập SKU/ }).click();
  await expect(page.getByPlaceholder(/ATB-001/)).toBeVisible();
});
