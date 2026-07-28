import { beforeEach, describe, expect, it } from "vitest";
import { completeSale, createProductWithVariants, createShop, db } from "./index";

const deviceId = "device-test";
beforeEach(async () => {
  await db.delete();
  await db.open();
});

async function fixture() {
  const shop = await createShop({
    ownerUid: "user-a",
    name: "Shop test",
    allowNegativeStock: false,
    defaultLowStockThreshold: 2,
    deviceId,
  });
  const product = await createProductWithVariants({
    shopId: shop.id,
    deviceId,
    name: "Áo polo",
    productCode: "POLO",
    purchasePrice: 100000,
    salePrice: 250000,
    openingStock: 3,
    lowStockThreshold: 1,
    attributes: [
      { name: "Màu", values: [{ value: "Đen" }] },
      { name: "Size", values: [{ value: "M" }, { value: "L" }] },
    ],
  });
  const variant = product.variants[0];
  if (!variant) throw new Error("Fixture product did not create a variant");
  return { shop, product, variant };
}

describe("atomic sale completion", () => {
  it("writes sale, exact line, stock ledger, payment, audit and outbox atomically", async () => {
    const { shop, variant } = await fixture();
    const result = await completeSale({
      shopId: shop.id,
      deviceId,
      sourceChannel: "direct",
      paymentMethod: "cash",
      deliveryStatus: "not_required",
      lines: [{ variantId: variant.id, quantity: 2, unitPrice: variant.salePrice, discount: 0 }],
      discount: 0,
      shippingFeeCharged: 0,
      amountPaid: 500000,
    });
    expect(await db.sales.get(result.sale.id)).toBeDefined();
    expect(await db.saleLines.where("saleId").equals(result.sale.id).count()).toBe(1);
    expect((await db.variants.get(variant.id))?.stockQuantity).toBe(1);
    expect(
      (await db.stockMovements.where("referenceId").equals(result.sale.id).first())?.quantityDelta,
    ).toBe(-2);
    expect(await db.payments.where("referenceId").equals(result.sale.id).count()).toBe(1);
    expect(await db.auditLogs.where("entityId").equals(result.sale.id).count()).toBe(1);
    expect(await db.outbox.where("shopId").equals(shop.id).count()).toBeGreaterThan(0);
  });

  it("rolls back every table when a middle step fails", async () => {
    const { shop, variant } = await fixture();
    const beforeStock = (await db.variants.get(variant.id))?.stockQuantity;
    const beforeSales = await db.sales.count();
    await expect(
      completeSale(
        {
          shopId: shop.id,
          deviceId,
          sourceChannel: "direct",
          paymentMethod: "cash",
          deliveryStatus: "not_required",
          lines: [
            { variantId: variant.id, quantity: 1, unitPrice: variant.salePrice, discount: 0 },
          ],
          discount: 0,
          shippingFeeCharged: 0,
          amountPaid: 250000,
        },
        { failAt: "after-stock" },
      ),
    ).rejects.toThrow("Injected");
    expect(await db.sales.count()).toBe(beforeSales);
    expect((await db.variants.get(variant.id))?.stockQuantity).toBe(beforeStock);
    expect(
      (await db.stockMovements.toArray()).filter((movement) => movement.referenceType === "sale"),
    ).toHaveLength(0);
  });

  it("rejects insufficient stock without partial writes", async () => {
    const { shop, variant } = await fixture();
    await expect(
      completeSale({
        shopId: shop.id,
        deviceId,
        sourceChannel: "direct",
        paymentMethod: "cash",
        deliveryStatus: "not_required",
        lines: [{ variantId: variant.id, quantity: 4, unitPrice: variant.salePrice, discount: 0 }],
        discount: 0,
        shippingFeeCharged: 0,
        amountPaid: 0,
      }),
    ).rejects.toThrow("không đủ");
    expect((await db.variants.get(variant.id))?.stockQuantity).toBe(3);
    expect(await db.sales.count()).toBe(0);
  });
});
