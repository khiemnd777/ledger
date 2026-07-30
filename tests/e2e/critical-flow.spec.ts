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

  await page.reload();
  await expect(page.getByRole("main").getByText("Pocket Store 01")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Bán đúng áo/ })).toHaveCount(0);

  await page.goto("/onboarding");
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("main").getByText("Pocket Store 01")).toBeVisible();
});

test("camera denial keeps manual SKU fallback available", async ({ page }) => {
  await openDemoShop(page);
  await page.goto("/scan");
  await expect(page.getByRole("button", { name: /Nhập SKU/ })).toBeVisible();
  await page.getByRole("button", { name: /Nhập SKU/ }).click();
  await expect(page.getByPlaceholder(/ATB-001/)).toBeVisible();
});

test("choosing a variant from inventory adds it to the sale", async ({ page }) => {
  await openDemoShop(page);
  await page.goto("/sell");
  await page.getByRole("link", { name: /Chọn từ kho áo/ }).click();

  await expect(page).toHaveURL(/\/inventory\?mode=select$/);
  await expect(page.getByRole("heading", { name: "Chọn áo vào đơn" })).toBeVisible();
  await page
    .getByRole("button", { name: /Thêm .+ vào đơn/ })
    .first()
    .click();
  await expect(page.getByRole("link", { name: "Xem đơn (1)" })).toBeVisible();

  await page.getByRole("link", { name: "Xem đơn (1)" }).click();
  await expect(page.getByRole("heading", { name: "1 biến thể trong đơn" })).toBeVisible();
});

test("QR labels are generated before opening the system print dialog", async ({ page }) => {
  await openDemoShop(page);
  await page.goto("/inventory");
  await page.getByRole("link", { name: "Tem QR" }).click();

  await expect(page.getByRole("heading", { name: "Tem QR" })).toBeVisible();
  await expect(page.getByText("In trực tiếp bằng máy in hệ thống")).toBeVisible();
  await page.evaluate(() => {
    window.print = () => {
      document.documentElement.dataset.printInvoked = "true";
    };
  });
  const printButton = page.getByRole("button", { name: "In tem" });
  await expect(printButton).toBeEnabled();
  await printButton.click();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.printInvoked))
    .toBe("true");
});

test("image picker rejects invalid files and previews a valid image", async ({ page }) => {
  await openDemoShop(page);
  await page.goto("/products/new");
  await page.getByRole("button", { name: /Tiếp tục/ }).click();

  const imageInput = page.getByLabel(/Chọn ảnh/);
  await imageInput.setInputFiles({
    name: "not-an-image.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not-an-image"),
  });
  await expect(page.getByRole("alert")).toContainText("chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP");

  await imageInput.setInputFiles({
    name: "shirt.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  });
  await expect(page.getByAltText("Xem trước shirt.jpg")).toBeVisible();
  await page.getByRole("button", { name: "Bỏ ảnh shirt.jpg" }).click();
  await expect(page.getByAltText("Xem trước shirt.jpg")).toHaveCount(0);
});

test("opening stock is entered independently for each product variant", async ({ page }) => {
  await openDemoShop(page);
  await page.goto("/products/new");

  await page.getByRole("button", { name: "Giá trị" }).click();
  await page.getByRole("textbox", { name: /^Màu/ }).fill("Đen");
  await page.getByRole("textbox", { name: /^Size/ }).fill("M, L");
  await page.getByRole("button", { name: "Tồn đầu" }).click();

  await page.getByLabel("Tồn đầu Đen · M · Cổ tròn").fill("5");
  await page.getByLabel("Tồn đầu Đen · L · Cổ tròn").fill("10");

  await expect(page.getByText("Tổng số áo ban đầu").locator("..")).toContainText("15 áo");
  await expect(page.getByText("Tồn dự kiến").locator("..")).toContainText("15 áo");
});
