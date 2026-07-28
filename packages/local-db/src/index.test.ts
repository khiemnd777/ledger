import { beforeEach, describe, expect, it } from "vitest";
import {
  addExpense,
  adjustStock,
  cancelCompletedPurchase,
  completeSale,
  createCustomer,
  createProductWithVariants,
  createShop,
  createSupplier,
  db,
  receiveStock,
  resolveVariant,
  setExpenseActive,
  setPartyActive,
  setProductActive,
  updateExpense,
  updateParty,
  updateProduct,
  updatePurchaseDetails,
  updateSaleDetails,
} from "./index";

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

describe("ledger-safe CRUD", () => {
  it("updates and deactivates a product together with its variants", async () => {
    const { shop, product, variant } = await fixture();
    const result = await updateProduct({
      shopId: shop.id,
      deviceId,
      productId: product.product.id,
      name: "Áo polo premium",
      productCode: "POLO-P",
      material: "Cotton",
      description: "Bản mới",
      variants: product.variants.map((item) => ({
        id: item.id,
        salePrice: item.id === variant.id ? 275000 : item.salePrice,
        purchasePrice: item.purchasePrice,
        lowStockThreshold: 2,
        active: true,
      })),
    });
    expect(result.product).toMatchObject({ name: "Áo polo premium", productCode: "POLO-P" });
    expect((await db.variants.get(variant.id))?.salePrice).toBe(275000);

    await setProductActive(shop.id, deviceId, product.product.id, false);
    expect((await db.products.get(product.product.id))?.active).toBe(false);
    expect((await db.variants.get(variant.id))?.active).toBe(true);
    await expect(resolveVariant(shop.id, variant.id)).rejects.toThrow("tạm ẩn");
    expect(
      (await db.outbox.toArray()).some(
        (event) => event.entityId === product.product.id && event.action === "delete",
      ),
    ).toBe(true);

    await setProductActive(shop.id, deviceId, product.product.id, true);
    expect((await db.products.get(product.product.id))?.deletedAt).toBeUndefined();
  });

  it("updates, deactivates and restores customers and suppliers without changing debt", async () => {
    const { shop } = await fixture();
    const customer = await createCustomer({ shopId: shop.id, deviceId, name: "Lan" });
    const supplier = await createSupplier({ shopId: shop.id, deviceId, name: "Xưởng A" });
    await updateParty({
      shopId: shop.id,
      deviceId,
      partyType: "customer",
      partyId: customer.id,
      name: "Lan Anh",
      phone: "0901",
      address: "HCM",
      note: "Khách thân thiết",
    });
    await setPartyActive({
      shopId: shop.id,
      deviceId,
      partyType: "supplier",
      partyId: supplier.id,
      active: false,
    });
    expect(await db.customers.get(customer.id)).toMatchObject({ name: "Lan Anh", phone: "0901" });
    expect(await db.suppliers.get(supplier.id)).toMatchObject({ active: false, totalPayable: 0 });
    await setPartyActive({
      shopId: shop.id,
      deviceId,
      partyType: "supplier",
      partyId: supplier.id,
      active: true,
    });
    expect((await db.suppliers.get(supplier.id))?.deletedAt).toBeUndefined();
  });

  it("updates, voids and restores an expense with audit and delete outbox", async () => {
    const { shop } = await fixture();
    const expense = await addExpense({
      shopId: shop.id,
      deviceId,
      category: "Đóng gói",
      amount: 50000,
    });
    await updateExpense({
      shopId: shop.id,
      deviceId,
      expenseId: expense.id,
      category: "Quảng cáo",
      amount: 75000,
      date: "2026-07-28T00:00:00.000Z",
      note: "Chiến dịch tháng 7",
    });
    await setExpenseActive(shop.id, deviceId, expense.id, false);
    expect(await db.expenses.get(expense.id)).toMatchObject({
      category: "Quảng cáo",
      amount: 75000,
    });
    expect((await db.expenses.get(expense.id))?.deletedAt).toBeDefined();
    expect(
      (await db.outbox.toArray()).some(
        (event) => event.entityId === expense.id && event.action === "delete",
      ),
    ).toBe(true);
    await setExpenseActive(shop.id, deviceId, expense.id, true);
    expect((await db.expenses.get(expense.id))?.deletedAt).toBeUndefined();
  });

  it("edits sale metadata and adjusts stock through immutable movements", async () => {
    const { shop, variant } = await fixture();
    const completed = await completeSale({
      shopId: shop.id,
      deviceId,
      sourceChannel: "direct",
      paymentMethod: "cash",
      deliveryStatus: "packing",
      lines: [{ variantId: variant.id, quantity: 1, unitPrice: 250000, discount: 0 }],
      discount: 0,
      shippingFeeCharged: 0,
      amountPaid: 250000,
    });
    const updated = await updateSaleDetails({
      shopId: shop.id,
      deviceId,
      saleId: completed.sale.id,
      deliveryStatus: "shipping",
      note: "Giao buổi chiều",
    });
    expect(updated).toMatchObject({ deliveryStatus: "shipping", note: "Giao buổi chiều" });
    const before = (await db.variants.get(variant.id))?.stockQuantity ?? 0;
    const adjustment = await adjustStock({
      shopId: shop.id,
      deviceId,
      variantId: variant.id,
      quantityDelta: 2,
      reason: "Kiểm kê bổ sung",
    });
    expect(adjustment.variant.stockQuantity).toBe(before + 2);
    expect(adjustment.movement).toMatchObject({
      movementType: "adjustment_in",
      quantityDelta: 2,
    });
  });

  it("edits a purchase and cancels it with stock, debt and payment reversals", async () => {
    const { shop, variant } = await fixture();
    const supplierA = await createSupplier({ shopId: shop.id, deviceId, name: "Xưởng A" });
    const supplierB = await createSupplier({ shopId: shop.id, deviceId, name: "Xưởng B" });
    const purchase = await receiveStock({
      shopId: shop.id,
      deviceId,
      supplierId: supplierA.id,
      amountPaid: 100000,
      lines: [{ variantId: variant.id, quantity: 2, unitCost: 100000 }],
    });
    await updatePurchaseDetails({
      shopId: shop.id,
      deviceId,
      purchaseId: purchase.id,
      supplierId: supplierB.id,
      receivedAt: "2026-07-28T10:00:00.000Z",
      note: "Sửa đúng xưởng",
    });
    expect((await db.suppliers.get(supplierA.id))?.totalPayable).toBe(0);
    expect((await db.suppliers.get(supplierB.id))?.totalPayable).toBe(100000);
    const beforeCancel = (await db.variants.get(variant.id))?.stockQuantity;
    const cancelled = await cancelCompletedPurchase(shop.id, deviceId, purchase.id);
    expect(cancelled.status).toBe("cancelled");
    expect((await db.variants.get(variant.id))?.stockQuantity).toBe((beforeCancel ?? 0) - 2);
    expect((await db.suppliers.get(supplierB.id))?.totalPayable).toBe(0);
    const payments = await db.payments.where("referenceId").equals(purchase.id).toArray();
    expect(payments.map((payment) => payment.direction).sort()).toEqual(["incoming", "outgoing"]);
  });
});
