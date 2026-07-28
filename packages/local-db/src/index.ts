import {
  type AuditLog,
  type CompleteSaleInput,
  type ConflictRecord,
  type Customer,
  calculateSaleTotals,
  createId,
  createMeta,
  type EntityMeta,
  type Expense,
  InsufficientStockError,
  movingAverageCost,
  nextDocumentNumber,
  nowIso,
  type OutboxEvent,
  type Payment,
  PocketError,
  type Product,
  type ProductAttribute,
  type ProductAttributeValue,
  type ProductVariant,
  type Purchase,
  type PurchaseLine,
  type ReturnExchange,
  type Sale,
  type SaleLine,
  type Shop,
  type SnapshotRecord,
  type StockMovement,
  type Supplier,
  touch,
} from "@pocket/domain";
import { createQrPayload } from "@pocket/qr";
import Dexie, { type EntityTable, type Table } from "dexie";

export class PocketDatabase extends Dexie {
  shops!: EntityTable<Shop, "id">;
  products!: EntityTable<Product, "id">;
  attributes!: EntityTable<ProductAttribute, "id">;
  attributeValues!: EntityTable<ProductAttributeValue, "id">;
  variants!: EntityTable<ProductVariant, "id">;
  customers!: EntityTable<Customer, "id">;
  suppliers!: EntityTable<Supplier, "id">;
  sales!: EntityTable<Sale, "id">;
  saleLines!: EntityTable<SaleLine, "id">;
  purchases!: EntityTable<Purchase, "id">;
  purchaseLines!: EntityTable<PurchaseLine, "id">;
  stockMovements!: EntityTable<StockMovement, "id">;
  returnExchanges!: EntityTable<ReturnExchange, "id">;
  payments!: EntityTable<Payment, "id">;
  expenses!: EntityTable<Expense, "id">;
  outbox!: EntityTable<OutboxEvent, "id">;
  snapshots!: EntityTable<SnapshotRecord, "id">;
  auditLogs!: EntityTable<AuditLog, "id">;
  conflicts!: EntityTable<ConflictRecord, "id">;

  constructor(name = "pocket-db") {
    super(name);
    this.version(1).stores({
      shops: "id, ownerUid, updatedAt, syncStatus",
      products: "id, shopId, productCode, name, active, updatedAt, syncStatus",
      attributes: "id, shopId, productId, [productId+position]",
      attributeValues: "id, shopId, attributeId, [attributeId+position]",
      variants: "id, shopId, productId, sku, qrValue, active, stockQuantity, syncStatus",
      customers: "id, shopId, name, phone, totalReceivable, active",
      suppliers: "id, shopId, name, phone, totalPayable, active",
      sales: "id, shopId, orderNumber, status, completedAt, customerId, sourceChannel",
      saleLines: "id, shopId, saleId, variantId, productId",
      purchases: "id, shopId, receiptNumber, status, receivedAt, supplierId",
      purchaseLines: "id, shopId, purchaseId, variantId, productId",
      stockMovements: "id, shopId, variantId, movementType, occurredAt, referenceId",
      returnExchanges: "id, shopId, saleId, saleLineId, type, completedAt",
      payments: "id, shopId, referenceType, referenceId, customerId, supplierId, paidAt",
      expenses: "id, shopId, category, date",
      outbox: "id, shopId, syncStatus, occurredAt, [shopId+syncStatus]",
      snapshots: "id, shopId, createdAt, schemaVersion",
      auditLogs: "id, shopId, createdAt, entityType, entityId",
      conflicts: "id, shopId, status, entityType, entityId",
    });
  }
}

export const db = new PocketDatabase();

export function getDeviceId(): string {
  const key = "pocket-device-id";
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const created = createId();
    localStorage.setItem(key, created);
    return created;
  } catch {
    return createId();
  }
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  return navigator.storage.persist();
}

export async function getStorageStatus(shopId: string) {
  const [estimate, persisted, pending, failed, lastSynced] = await Promise.all([
    navigator.storage?.estimate?.() ?? Promise.resolve({ usage: undefined, quota: undefined }),
    navigator.storage?.persisted?.() ?? Promise.resolve(false),
    db.outbox.where("[shopId+syncStatus]").equals([shopId, "pending"]).count(),
    db.outbox.where("[shopId+syncStatus]").equals([shopId, "failed"]).count(),
    db.outbox.where({ shopId, syncStatus: "synced" }).last(),
  ]);
  return {
    usage: estimate.usage ?? 0,
    quota: estimate.quota ?? 0,
    persisted,
    pending,
    failed,
    lastSuccessfulSync: lastSynced?.updatedAt,
    deviceId: getDeviceId(),
  };
}

function makeOutbox(
  meta: EntityMeta,
  entityType: OutboxEvent["entityType"],
  payload: unknown,
): OutboxEvent {
  return {
    ...createMeta(meta.shopId, meta.updatedByDeviceId),
    deviceId: meta.updatedByDeviceId,
    entityType,
    entityId: meta.id,
    action: meta.revision === 1 ? "create" : "update",
    entityRevision: meta.revision,
    payload,
    occurredAt: nowIso(),
    retryCount: 0,
  };
}

function makeAudit(
  meta: EntityMeta,
  action: string,
  entityType: AuditLog["entityType"],
  summary: string,
  details?: unknown,
): AuditLog {
  return {
    ...createMeta(meta.shopId, meta.updatedByDeviceId),
    action,
    entityType,
    entityId: meta.id,
    summary,
    details,
  };
}

export async function createShop(input: {
  ownerUid: string;
  name: string;
  allowNegativeStock: boolean;
  defaultLowStockThreshold: number;
  deviceId: string;
}): Promise<Shop> {
  const meta = createMeta("", input.deviceId);
  const shop: Shop = {
    id: meta.id,
    ownerUid: input.ownerUid,
    name: input.name.trim(),
    currency: "VND",
    timezone: "Asia/Ho_Chi_Minh",
    defaultLowStockThreshold: input.defaultLowStockThreshold,
    allowNegativeStock: input.allowNegativeStock,
    onboardingComplete: false,
    createdAt: meta.createdAt,
    createdByDeviceId: meta.createdByDeviceId,
    updatedAt: meta.updatedAt,
    updatedByDeviceId: meta.updatedByDeviceId,
    revision: 1,
    syncStatus: "pending",
  };
  await db.shops.add(shop);
  return shop;
}

export interface CreateProductInput {
  shopId: string;
  deviceId: string;
  name: string;
  productCode: string;
  material?: string;
  salePrice: number;
  purchasePrice: number;
  openingStock: number;
  lowStockThreshold: number;
  attributes: Array<{ name: string; values: Array<{ value: string; colorHex?: string }> }>;
}

export async function createProductWithVariants(input: CreateProductInput) {
  const product: Product = {
    ...createMeta(input.shopId, input.deviceId),
    name: input.name.trim(),
    productCode: input.productCode.trim().toUpperCase(),
    material: input.material,
    imageIds: [],
    trackInventory: true,
    hasVariants: input.attributes.length > 0,
    active: true,
  };
  const attributes: ProductAttribute[] = [];
  const values: ProductAttributeValue[] = [];
  for (const [attributeIndex, attributeInput] of input.attributes.entries()) {
    const attribute: ProductAttribute = {
      ...createMeta(input.shopId, input.deviceId),
      productId: product.id,
      name: attributeInput.name,
      position: attributeIndex,
    };
    attributes.push(attribute);
    for (const [valueIndex, valueInput] of attributeInput.values.entries()) {
      values.push({
        ...createMeta(input.shopId, input.deviceId),
        attributeId: attribute.id,
        value: valueInput.value,
        displayValue: valueInput.value,
        position: valueIndex,
        colorHex: valueInput.colorHex,
      });
    }
  }
  const groups = attributes.map((attribute) =>
    values.filter((value) => value.attributeId === attribute.id),
  );
  const combinations = groups.length > 0 ? cartesian(groups) : [[]];
  const variants = combinations.map((combination, index): ProductVariant => {
    const id = createId();
    return {
      ...createMeta(input.shopId, input.deviceId, id),
      productId: product.id,
      sku: `${product.productCode}-${String(index + 1).padStart(3, "0")}`,
      qrValue: createQrPayload(id),
      attributeValueIds: combination.map((value) => value.id),
      attributeSummary: combination.map((value) => value.displayValue).join(" · ") || "Mặc định",
      purchasePrice: input.purchasePrice,
      salePrice: input.salePrice,
      stockQuantity: input.openingStock,
      reservedQuantity: 0,
      lowStockThreshold: input.lowStockThreshold,
      active: true,
    };
  });
  const movements = variants
    .filter(() => input.openingStock !== 0)
    .map(
      (variant): StockMovement => ({
        ...createMeta(input.shopId, input.deviceId),
        variantId: variant.id,
        movementType: "opening_stock",
        quantityDelta: input.openingStock,
        quantityBefore: 0,
        quantityAfter: input.openingStock,
        unitCost: input.purchasePrice,
        referenceType: "opening",
        referenceId: product.id,
        reason: "Tồn kho đầu kỳ",
        occurredAt: nowIso(),
      }),
    );
  await db.transaction(
    "rw",
    [
      db.products,
      db.attributes,
      db.attributeValues,
      db.variants,
      db.stockMovements,
      db.auditLogs,
      db.outbox,
    ],
    async () => {
      await db.products.add(product);
      await db.attributes.bulkAdd(attributes);
      await db.attributeValues.bulkAdd(values);
      await db.variants.bulkAdd(variants);
      if (movements.length) await db.stockMovements.bulkAdd(movements);
      await db.auditLogs.add(
        makeAudit(product, "product.created", "product", `Đã tạo mẫu áo ${product.name}`, {
          variants: variants.length,
        }),
      );
      await db.outbox.bulkAdd([
        makeOutbox(product, "product", product),
        ...attributes.map((item) => makeOutbox(item, "attribute", item)),
        ...values.map((item) => makeOutbox(item, "attributeValue", item)),
        ...variants.map((item) => makeOutbox(item, "variant", item)),
        ...movements.map((item) => makeOutbox(item, "stockMovement", item)),
      ]);
    },
  );
  return { product, attributes, values, variants };
}

function cartesian<T>(groups: T[][]): T[][] {
  return groups.reduce<T[][]>(
    (result, group) => result.flatMap((row) => group.map((item) => [...row, item])),
    [[]],
  );
}

export async function resolveVariant(shopId: string, lookup: string): Promise<ProductVariant> {
  const normalized = lookup.trim();
  let variant = await db.variants.get(normalized);
  if (!variant) variant = await db.variants.where("qrValue").equals(normalized).first();
  if (!variant) variant = await db.variants.where("sku").equals(normalized.toUpperCase()).first();
  if (!variant)
    throw new PocketError(
      "VARIANT_MISSING",
      "Không tìm thấy biến thể áo.",
      "Kiểm tra QR hoặc nhập lại SKU.",
    );
  if (variant.shopId !== shopId)
    throw new PocketError(
      "QR_OTHER_SHOP",
      "Mã QR thuộc shop khác.",
      "Quét tem được tạo bởi shop hiện tại.",
    );
  if (!variant.active)
    throw new PocketError(
      "VARIANT_INACTIVE",
      "Biến thể này đã ngừng bán.",
      "Mở biến thể khác hoặc kích hoạt lại trong kho.",
    );
  return variant;
}

export interface CompleteSaleOptions {
  failAt?: "after-sale" | "after-lines" | "after-stock";
}

export async function completeSale(input: CompleteSaleInput, options: CompleteSaleOptions = {}) {
  const shop = await db.shops.get(input.shopId);
  if (!shop)
    throw new PocketError("SHOP_MISSING", "Không tìm thấy shop.", "Chọn lại shop và thử lại.");
  const combined = [
    ...input.lines
      .reduce((map, line) => {
        const current = map.get(line.variantId);
        map.set(
          line.variantId,
          current ? { ...current, quantity: current.quantity + line.quantity } : line,
        );
        return map;
      }, new Map<string, CompleteSaleInput["lines"][number]>())
      .values(),
  ];
  if (combined.length === 0)
    throw new PocketError(
      "EMPTY_CART",
      "Giỏ hàng đang trống.",
      "Quét QR hoặc chọn áo để thêm vào đơn.",
    );
  const totals = calculateSaleTotals(
    combined,
    input.discount,
    input.shippingFeeCharged,
    input.amountPaid,
  );
  const saleCount = await db.sales.where("shopId").equals(input.shopId).count();
  const saleMeta = createMeta(input.shopId, input.deviceId, input.id);
  const sale: Sale = {
    ...saleMeta,
    orderNumber: nextDocumentNumber("DH", saleCount + 1),
    customerId: input.customerId,
    sourceChannel: input.sourceChannel,
    status: "completed",
    subtotal: totals.subtotal,
    discount: input.discount,
    shippingFeeCharged: input.shippingFeeCharged,
    total: totals.total,
    amountPaid: totals.amountPaid,
    amountDue: totals.amountDue,
    paymentMethod: input.paymentMethod,
    deliveryStatus: input.deliveryStatus,
    note: input.note,
    completedAt: nowIso(),
  };
  const result: {
    sale: Sale;
    lines: SaleLine[];
    movements: StockMovement[];
    stockChanges: Array<{ variantId: string; before: number; after: number }>;
  } = {
    sale,
    lines: [],
    movements: [],
    stockChanges: [],
  };

  await db.transaction(
    "rw",
    [
      db.sales,
      db.saleLines,
      db.variants,
      db.products,
      db.stockMovements,
      db.payments,
      db.customers,
      db.auditLogs,
      db.outbox,
    ],
    async () => {
      const variants = await db.variants.bulkGet(combined.map((line) => line.variantId));
      const products = await db.products.bulkGet(
        variants.map((variant) => variant?.productId ?? ""),
      );
      for (const [index, cartLine] of combined.entries()) {
        const variant = variants[index];
        if (!variant || variant.shopId !== input.shopId || !variant.active) {
          throw new PocketError(
            "VARIANT_MISSING",
            "Một biến thể trong giỏ không còn khả dụng.",
            "Xóa sản phẩm lỗi và quét lại.",
          );
        }
        if (!shop.allowNegativeStock && variant.stockQuantity < cartLine.quantity) {
          throw new InsufficientStockError(variant.id, variant.stockQuantity, cartLine.quantity);
        }
      }
      await db.sales.add(sale);
      if (options.failAt === "after-sale") throw new Error("Injected transaction failure");

      for (const [index, cartLine] of combined.entries()) {
        const variant = variants[index] as ProductVariant;
        const product = products[index];
        if (!product)
          throw new PocketError(
            "PRODUCT_MISSING",
            "Mẫu áo không còn tồn tại.",
            "Kiểm tra lại dữ liệu sản phẩm.",
          );
        const line: SaleLine = {
          ...createMeta(input.shopId, input.deviceId),
          saleId: sale.id,
          productId: product.id,
          variantId: variant.id,
          productNameSnapshot: product.name,
          variantNameSnapshot: variant.attributeSummary,
          skuSnapshot: variant.sku,
          quantity: cartLine.quantity,
          unitPrice: cartLine.unitPrice,
          unitCostSnapshot: variant.purchasePrice,
          discount: cartLine.discount,
          lineTotal: cartLine.quantity * cartLine.unitPrice - cartLine.discount,
          returnedQuantity: 0,
        };
        result.lines.push(line);
      }
      await db.saleLines.bulkAdd(result.lines);
      if (options.failAt === "after-lines") throw new Error("Injected transaction failure");

      for (const [index, cartLine] of combined.entries()) {
        const variant = variants[index] as ProductVariant;
        const before = variant.stockQuantity;
        const updated = touch(
          { ...variant, stockQuantity: before - cartLine.quantity },
          input.deviceId,
        );
        const movement: StockMovement = {
          ...createMeta(input.shopId, input.deviceId),
          variantId: variant.id,
          movementType: "sale",
          quantityDelta: -cartLine.quantity,
          quantityBefore: before,
          quantityAfter: updated.stockQuantity,
          unitCost: variant.purchasePrice,
          referenceType: "sale",
          referenceId: sale.id,
          reason: `Xuất kho ${sale.orderNumber}`,
          occurredAt: sale.completedAt as string,
        };
        await db.variants.put(updated);
        result.movements.push(movement);
        result.stockChanges.push({ variantId: variant.id, before, after: updated.stockQuantity });
      }
      await db.stockMovements.bulkAdd(result.movements);
      if (options.failAt === "after-stock") throw new Error("Injected transaction failure");

      const events: OutboxEvent[] = [
        makeOutbox(sale, "sale", sale),
        ...result.lines.map((line) => makeOutbox(line, "saleLine", line)),
      ];
      events.push(
        ...result.movements.map((movement) => makeOutbox(movement, "stockMovement", movement)),
      );
      if (totals.amountPaid > 0) {
        const payment: Payment = {
          ...createMeta(input.shopId, input.deviceId),
          direction: "incoming",
          referenceType: "sale",
          referenceId: sale.id,
          customerId: input.customerId,
          amount: totals.amountPaid,
          paymentMethod: input.paymentMethod,
          paidAt: sale.completedAt as string,
        };
        await db.payments.add(payment);
        events.push(makeOutbox(payment, "payment", payment));
      }
      if (totals.amountDue > 0 && input.customerId) {
        const customer = await db.customers.get(input.customerId);
        if (!customer)
          throw new PocketError(
            "CUSTOMER_MISSING",
            "Không tìm thấy khách hàng.",
            "Chọn lại khách hàng.",
          );
        const updated = touch(
          { ...customer, totalReceivable: customer.totalReceivable + totals.amountDue },
          input.deviceId,
        );
        await db.customers.put(updated);
        events.push(makeOutbox(updated, "customer", updated));
      }
      await db.auditLogs.bulkAdd([
        makeAudit(sale, "sale.completed", "sale", `Hoàn tất ${sale.orderNumber}`, totals),
        ...result.movements.map((movement) =>
          makeAudit(
            movement,
            "stock.deducted",
            "stockMovement",
            `Đã trừ ${Math.abs(movement.quantityDelta)} áo`,
            movement,
          ),
        ),
      ]);
      await db.outbox.bulkAdd(events);
    },
  );
  return result;
}

export interface ReceiveStockInput {
  shopId: string;
  deviceId: string;
  supplierId?: string;
  amountPaid: number;
  note?: string;
  lines: Array<{ variantId: string; quantity: number; unitCost: number }>;
}

export async function receiveStock(input: ReceiveStockInput) {
  const total = input.lines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0);
  const count = await db.purchases.where("shopId").equals(input.shopId).count();
  const purchase: Purchase = {
    ...createMeta(input.shopId, input.deviceId),
    receiptNumber: nextDocumentNumber("NA", count + 1),
    supplierId: input.supplierId,
    total,
    amountPaid: Math.min(total, input.amountPaid),
    amountDue: Math.max(0, total - input.amountPaid),
    receivedAt: nowIso(),
    note: input.note,
    status: "completed",
  };
  await db.transaction(
    "rw",
    [
      db.purchases,
      db.purchaseLines,
      db.variants,
      db.stockMovements,
      db.suppliers,
      db.payments,
      db.auditLogs,
      db.outbox,
    ],
    async () => {
      await db.purchases.add(purchase);
      const events: OutboxEvent[] = [makeOutbox(purchase, "purchase", purchase)];
      for (const lineInput of input.lines.filter((line) => line.quantity > 0)) {
        const variant = await db.variants.get(lineInput.variantId);
        if (!variant || variant.shopId !== input.shopId)
          throw new PocketError(
            "VARIANT_MISSING",
            "Không tìm thấy biến thể nhập kho.",
            "Chọn lại áo.",
          );
        const line: PurchaseLine = {
          ...createMeta(input.shopId, input.deviceId),
          purchaseId: purchase.id,
          productId: variant.productId,
          variantId: variant.id,
          quantity: lineInput.quantity,
          unitCost: lineInput.unitCost,
          lineTotal: lineInput.quantity * lineInput.unitCost,
        };
        const nextCost = movingAverageCost(
          variant.stockQuantity,
          variant.purchasePrice,
          lineInput.quantity,
          lineInput.unitCost,
        );
        const updated = touch(
          {
            ...variant,
            stockQuantity: variant.stockQuantity + lineInput.quantity,
            purchasePrice: nextCost,
          },
          input.deviceId,
        );
        const movement: StockMovement = {
          ...createMeta(input.shopId, input.deviceId),
          variantId: variant.id,
          movementType: "purchase",
          quantityDelta: lineInput.quantity,
          quantityBefore: variant.stockQuantity,
          quantityAfter: updated.stockQuantity,
          unitCost: lineInput.unitCost,
          referenceType: "purchase",
          referenceId: purchase.id,
          reason: `Nhập áo ${purchase.receiptNumber}`,
          occurredAt: purchase.receivedAt,
        };
        await Promise.all([
          db.purchaseLines.add(line),
          db.variants.put(updated),
          db.stockMovements.add(movement),
        ]);
        events.push(
          makeOutbox(line, "purchaseLine", line),
          makeOutbox(updated, "variant", updated),
          makeOutbox(movement, "stockMovement", movement),
        );
      }
      if (purchase.amountPaid > 0) {
        const payment: Payment = {
          ...createMeta(input.shopId, input.deviceId),
          direction: "outgoing",
          referenceType: "purchase",
          referenceId: purchase.id,
          supplierId: input.supplierId,
          amount: purchase.amountPaid,
          paymentMethod: "bank_transfer",
          paidAt: purchase.receivedAt,
        };
        await db.payments.add(payment);
        events.push(makeOutbox(payment, "payment", payment));
      }
      if (purchase.amountDue > 0 && input.supplierId) {
        const supplier = await db.suppliers.get(input.supplierId);
        if (supplier) {
          const updated = touch(
            { ...supplier, totalPayable: supplier.totalPayable + purchase.amountDue },
            input.deviceId,
          );
          await db.suppliers.put(updated);
          events.push(makeOutbox(updated, "supplier", updated));
        }
      }
      await db.auditLogs.add(
        makeAudit(
          purchase,
          "purchase.completed",
          "purchase",
          `Đã nhập áo ${purchase.receiptNumber}`,
          { total },
        ),
      );
      await db.outbox.bulkAdd(events);
    },
  );
  return purchase;
}

export async function cancelCompletedSale(shopId: string, deviceId: string, saleId: string) {
  return db.transaction(
    "rw",
    [
      db.sales,
      db.saleLines,
      db.variants,
      db.stockMovements,
      db.payments,
      db.customers,
      db.auditLogs,
      db.outbox,
    ],
    async () => {
      const sale = await db.sales.get(saleId);
      if (!sale || sale.shopId !== shopId)
        throw new PocketError("SALE_MISSING", "Không tìm thấy đơn hàng.", "Tải lại danh sách đơn.");
      if (sale.status !== "completed")
        throw new PocketError(
          "SALE_NOT_CANCELLABLE",
          "Chỉ có thể hủy đơn đã hoàn tất và chưa đổi/trả.",
          "Dùng luồng Đổi / Trả nếu khách đã nhận áo.",
        );
      const lines = await db.saleLines.where("saleId").equals(sale.id).toArray();
      const movements: StockMovement[] = [];
      const events: OutboxEvent[] = [];
      for (const line of lines) {
        const variant = await db.variants.get(line.variantId);
        if (!variant)
          throw new PocketError(
            "VARIANT_MISSING",
            "Thiếu biến thể để hoàn tồn.",
            "Đồng bộ dữ liệu rồi thử lại.",
          );
        const updated = touch(
          { ...variant, stockQuantity: variant.stockQuantity + line.quantity },
          deviceId,
        );
        const movement: StockMovement = {
          ...createMeta(shopId, deviceId),
          variantId: variant.id,
          movementType: "sale_cancelled",
          quantityDelta: line.quantity,
          quantityBefore: variant.stockQuantity,
          quantityAfter: updated.stockQuantity,
          unitCost: line.unitCostSnapshot,
          referenceType: "sale",
          referenceId: sale.id,
          reason: `Hủy ${sale.orderNumber}`,
          occurredAt: nowIso(),
        };
        await db.variants.put(updated);
        movements.push(movement);
        events.push(
          makeOutbox(updated, "variant", updated),
          makeOutbox(movement, "stockMovement", movement),
        );
      }
      await db.stockMovements.bulkAdd(movements);
      if (sale.amountDue > 0 && sale.customerId) {
        const customer = await db.customers.get(sale.customerId);
        if (customer) {
          const updated = touch(
            {
              ...customer,
              totalReceivable: Math.max(0, customer.totalReceivable - sale.amountDue),
            },
            deviceId,
          );
          await db.customers.put(updated);
          events.push(makeOutbox(updated, "customer", updated));
        }
      }
      if (sale.amountPaid > 0) {
        const refund: Payment = {
          ...createMeta(shopId, deviceId),
          direction: "outgoing",
          referenceType: "return",
          referenceId: sale.id,
          customerId: sale.customerId,
          amount: sale.amountPaid,
          paymentMethod: sale.paymentMethod,
          paidAt: nowIso(),
          note: `Hoàn tiền khi hủy ${sale.orderNumber}`,
        };
        await db.payments.add(refund);
        events.push(makeOutbox(refund, "payment", refund));
      }
      const updatedSale: Sale = touch(
        { ...sale, status: "cancelled", cancelledAt: nowIso() },
        deviceId,
      );
      await db.sales.put(updatedSale);
      events.push(makeOutbox(updatedSale, "sale", updatedSale));
      await db.auditLogs.add(
        makeAudit(updatedSale, "sale.cancelled", "sale", `Đã hủy ${sale.orderNumber} và hoàn tồn`, {
          movements: movements.length,
        }),
      );
      await db.outbox.bulkAdd(events);
      return updatedSale;
    },
  );
}

export interface CompleteReturnExchangeInput {
  shopId: string;
  deviceId: string;
  saleLineId: string;
  type: "return" | "exchange";
  quantity: number;
  reason: ReturnExchange["reason"];
  restock: boolean;
  replacementVariantId?: string;
  paymentMethod: Payment["paymentMethod"];
}

export async function completeReturnExchange(input: CompleteReturnExchangeInput) {
  return db.transaction(
    "rw",
    [
      db.returnExchanges,
      db.sales,
      db.saleLines,
      db.variants,
      db.stockMovements,
      db.payments,
      db.customers,
      db.auditLogs,
      db.outbox,
    ],
    async () => {
      const line = await db.saleLines.get(input.saleLineId);
      if (!line || line.shopId !== input.shopId)
        throw new PocketError(
          "SALE_LINE_MISSING",
          "Không tìm thấy sản phẩm trong đơn.",
          "Chọn lại đơn hàng.",
        );
      if (line.returnedQuantity + input.quantity > line.quantity)
        throw new PocketError(
          "RETURN_QUANTITY",
          "Số lượng đổi/trả vượt quá số đã mua.",
          "Giảm số lượng.",
        );
      const sale = await db.sales.get(line.saleId);
      const returnedVariant = await db.variants.get(line.variantId);
      if (!sale || !returnedVariant)
        throw new PocketError(
          "RETURN_DATA_MISSING",
          "Dữ liệu đơn hàng không đầy đủ.",
          "Đồng bộ lại rồi thử lại.",
        );
      const replacement = input.replacementVariantId
        ? await db.variants.get(input.replacementVariantId)
        : undefined;
      if (input.type === "exchange" && !replacement)
        throw new PocketError(
          "REPLACEMENT_MISSING",
          "Chưa chọn áo đổi.",
          "Chọn size, màu hoặc mẫu áo mới.",
        );
      if (replacement && replacement.stockQuantity < input.quantity)
        throw new InsufficientStockError(replacement.id, replacement.stockQuantity, input.quantity);
      const returnedValue = line.unitPrice * input.quantity;
      const replacementValue = replacement ? replacement.salePrice * input.quantity : 0;
      const difference = replacementValue - returnedValue;
      const record: ReturnExchange = {
        ...createMeta(input.shopId, input.deviceId),
        saleId: sale.id,
        saleLineId: line.id,
        type: input.type,
        reason: input.reason,
        quantity: input.quantity,
        restock: input.restock,
        replacementVariantId: replacement?.id,
        priceDifference: difference,
        refundAmount:
          difference < 0 ? Math.abs(difference) : input.type === "return" ? returnedValue : 0,
        collectionAmount: difference > 0 ? difference : 0,
        completedAt: nowIso(),
      };
      const events: OutboxEvent[] = [makeOutbox(record, "returnExchange", record)];
      const movements: StockMovement[] = [];
      if (input.restock) {
        const updated = touch(
          { ...returnedVariant, stockQuantity: returnedVariant.stockQuantity + input.quantity },
          input.deviceId,
        );
        const movement: StockMovement = {
          ...createMeta(input.shopId, input.deviceId),
          variantId: returnedVariant.id,
          movementType: input.type === "exchange" ? "exchange_in" : "customer_return",
          quantityDelta: input.quantity,
          quantityBefore: returnedVariant.stockQuantity,
          quantityAfter: updated.stockQuantity,
          unitCost: line.unitCostSnapshot,
          referenceType: "return",
          referenceId: record.id,
          reason: input.reason,
          occurredAt: record.completedAt,
        };
        await db.variants.put(updated);
        movements.push(movement);
        events.push(makeOutbox(updated, "variant", updated));
      }
      if (replacement) {
        const updated = touch(
          { ...replacement, stockQuantity: replacement.stockQuantity - input.quantity },
          input.deviceId,
        );
        const movement: StockMovement = {
          ...createMeta(input.shopId, input.deviceId),
          variantId: replacement.id,
          movementType: "exchange_out",
          quantityDelta: -input.quantity,
          quantityBefore: replacement.stockQuantity,
          quantityAfter: updated.stockQuantity,
          unitCost: replacement.purchasePrice,
          referenceType: "return",
          referenceId: record.id,
          reason: input.reason,
          occurredAt: record.completedAt,
        };
        await db.variants.put(updated);
        movements.push(movement);
        events.push(makeOutbox(updated, "variant", updated));
      }
      await db.stockMovements.bulkAdd(movements);
      events.push(...movements.map((movement) => makeOutbox(movement, "stockMovement", movement)));
      const updatedLine = touch(
        { ...line, returnedQuantity: line.returnedQuantity + input.quantity },
        input.deviceId,
      );
      await db.saleLines.put(updatedLine);
      const allLines = await db.saleLines.where("saleId").equals(sale.id).toArray();
      const fullyReturned = allLines.every(
        (item) =>
          (item.id === line.id ? updatedLine.returnedQuantity : item.returnedQuantity) >=
          item.quantity,
      );
      const updatedSale: Sale = touch(
        { ...sale, status: fullyReturned ? "fully_returned" : "partially_returned" },
        input.deviceId,
      );
      await db.sales.put(updatedSale);
      events.push(
        makeOutbox(updatedLine, "saleLine", updatedLine),
        makeOutbox(updatedSale, "sale", updatedSale),
      );
      const paymentAmount = record.refundAmount || record.collectionAmount;
      if (paymentAmount > 0) {
        const payment: Payment = {
          ...createMeta(input.shopId, input.deviceId),
          direction: record.refundAmount > 0 ? "outgoing" : "incoming",
          referenceType: "return",
          referenceId: record.id,
          customerId: sale.customerId,
          amount: paymentAmount,
          paymentMethod: input.paymentMethod,
          paidAt: record.completedAt,
        };
        await db.payments.add(payment);
        events.push(makeOutbox(payment, "payment", payment));
      }
      await db.returnExchanges.add(record);
      await db.auditLogs.add(
        makeAudit(
          record,
          `${input.type}.completed`,
          "returnExchange",
          input.type === "return" ? "Đã hoàn tất trả áo" : "Đã hoàn tất đổi áo",
          record,
        ),
      );
      await db.outbox.bulkAdd(events);
      return record;
    },
  );
}

export async function addExpense(input: {
  shopId: string;
  deviceId: string;
  category: string;
  amount: number;
  note?: string;
  date?: string;
}) {
  const expense: Expense = {
    ...createMeta(input.shopId, input.deviceId),
    category: input.category,
    amount: input.amount,
    note: input.note,
    date: input.date ?? nowIso(),
    attachmentIds: [],
  };
  await db.transaction("rw", [db.expenses, db.outbox], async () => {
    await db.expenses.add(expense);
    await db.outbox.add(makeOutbox(expense, "expense", expense));
  });
  return expense;
}

export async function createCustomer(input: {
  shopId: string;
  deviceId: string;
  name: string;
  phone?: string;
  address?: string;
  note?: string;
}) {
  const customer: Customer = {
    ...createMeta(input.shopId, input.deviceId),
    name: input.name.trim(),
    phone: input.phone?.trim(),
    address: input.address?.trim(),
    note: input.note?.trim(),
    totalReceivable: 0,
    active: true,
  };
  await db.transaction("rw", [db.customers, db.outbox], async () => {
    await db.customers.add(customer);
    await db.outbox.add(makeOutbox(customer, "customer", customer));
  });
  return customer;
}

export async function createSupplier(input: {
  shopId: string;
  deviceId: string;
  name: string;
  phone?: string;
  address?: string;
  note?: string;
}) {
  const supplier: Supplier = {
    ...createMeta(input.shopId, input.deviceId),
    name: input.name.trim(),
    phone: input.phone?.trim(),
    address: input.address?.trim(),
    note: input.note?.trim(),
    totalPayable: 0,
    active: true,
  };
  await db.transaction("rw", [db.suppliers, db.outbox], async () => {
    await db.suppliers.add(supplier);
    await db.outbox.add(makeOutbox(supplier, "supplier", supplier));
  });
  return supplier;
}

export async function recordDebtPayment(input: {
  shopId: string;
  deviceId: string;
  partyType: "customer" | "supplier";
  partyId: string;
  amount: number;
  method: Payment["paymentMethod"];
}) {
  return db.transaction(
    "rw",
    [db.customers, db.suppliers, db.payments, db.outbox, db.auditLogs],
    async () => {
      const party =
        input.partyType === "customer"
          ? await db.customers.get(input.partyId)
          : await db.suppliers.get(input.partyId);
      if (!party)
        throw new PocketError(
          "PARTY_MISSING",
          "Không tìm thấy đối tác.",
          "Chọn lại khách hàng hoặc xưởng.",
        );
      const current = "totalReceivable" in party ? party.totalReceivable : party.totalPayable;
      const amount = Math.min(current, input.amount);
      const updated: Customer | Supplier =
        "totalReceivable" in party
          ? touch({ ...party, totalReceivable: current - amount }, input.deviceId)
          : touch({ ...party, totalPayable: current - amount }, input.deviceId);
      if ("totalReceivable" in updated) await db.customers.put(updated);
      else await db.suppliers.put(updated);
      const payment: Payment = {
        ...createMeta(input.shopId, input.deviceId),
        direction: input.partyType === "customer" ? "incoming" : "outgoing",
        referenceType: input.partyType === "customer" ? "customer_debt" : "supplier_debt",
        referenceId: party.id,
        customerId: input.partyType === "customer" ? party.id : undefined,
        supplierId: input.partyType === "supplier" ? party.id : undefined,
        amount,
        paymentMethod: input.method,
        paidAt: nowIso(),
      };
      await db.payments.add(payment);
      await db.outbox.bulkAdd([
        makeOutbox(updated, input.partyType, updated),
        makeOutbox(payment, "payment", payment),
      ]);
      await db.auditLogs.add(
        makeAudit(
          payment,
          "debt.payment",
          "payment",
          `Đã ghi nhận thanh toán ${amount.toLocaleString("vi-VN")}đ`,
        ),
      );
      return payment;
    },
  );
}

export async function getInventoryConsistency(shopId: string) {
  const variants = await db.variants.where("shopId").equals(shopId).toArray();
  return Promise.all(
    variants.map(async (variant) => {
      const movements = await db.stockMovements.where("variantId").equals(variant.id).toArray();
      const ledgerQuantity = movements.reduce((sum, movement) => sum + movement.quantityDelta, 0);
      return {
        variant,
        ledgerQuantity,
        difference: variant.stockQuantity - ledgerQuantity,
        consistent: variant.stockQuantity === ledgerQuantity,
      };
    }),
  );
}

export async function repairInventory(
  shopId: string,
  deviceId: string,
  variantId: string,
  reason: string,
) {
  const check = (await getInventoryConsistency(shopId)).find(
    (item) => item.variant.id === variantId,
  );
  if (!check || check.consistent) return check;
  return db.transaction(
    "rw",
    [db.variants, db.stockMovements, db.auditLogs, db.outbox],
    async () => {
      const variant = check.variant;
      const before = variant.stockQuantity;
      const updated = touch({ ...variant, stockQuantity: check.ledgerQuantity }, deviceId);
      await db.variants.put(updated);
      const audit = makeAudit(
        updated,
        "stock.cache_repaired",
        "variant",
        `Sửa tồn cache ${variant.sku}: ${before} → ${check.ledgerQuantity}`,
        { reason },
      );
      await db.auditLogs.add(audit);
      await db.outbox.add(makeOutbox(updated, "variant", updated));
      return { ...check, variant: updated, difference: 0, consistent: true };
    },
  );
}

export async function seedDemoData(shopId: string, deviceId: string) {
  const existing = await db.products.where("shopId").equals(shopId).count();
  if (existing > 0) return;
  const productInputs: Array<Omit<CreateProductInput, "shopId" | "deviceId">> = [
    {
      name: "Áo thun nữ basic",
      productCode: "ATB",
      material: "Cotton compact",
      salePrice: 189000,
      purchasePrice: 82000,
      openingStock: 8,
      lowStockThreshold: 3,
      attributes: [
        {
          name: "Màu",
          values: [
            { value: "Đen", colorHex: "#171717" },
            { value: "Trắng", colorHex: "#F8F8F8" },
            { value: "Be", colorHex: "#D5C0A5" },
          ],
        },
        { name: "Size", values: ["S", "M", "L", "XL"].map((value) => ({ value })) },
        { name: "Kiểu cổ", values: [{ value: "Cổ tròn" }] },
      ],
    },
    {
      name: "Áo polo nữ",
      productCode: "APN",
      material: "Cotton cá sấu",
      salePrice: 269000,
      purchasePrice: 118000,
      openingStock: 5,
      lowStockThreshold: 3,
      attributes: [
        {
          name: "Màu",
          values: [
            { value: "Đen", colorHex: "#171717" },
            { value: "Trắng", colorHex: "#F8F8F8" },
            { value: "Navy", colorHex: "#172033" },
          ],
        },
        { name: "Size", values: ["S", "M", "L", "XL"].map((value) => ({ value })) },
        { name: "Kiểu cổ", values: [{ value: "Cổ polo" }] },
      ],
    },
    {
      name: "Áo sơ mi nữ",
      productCode: "ASM",
      material: "Lụa nhăn",
      salePrice: 329000,
      purchasePrice: 145000,
      openingStock: 2,
      lowStockThreshold: 3,
      attributes: [
        {
          name: "Màu",
          values: [
            { value: "Trắng", colorHex: "#F8F8F8" },
            { value: "Xanh", colorHex: "#8FA9C4" },
          ],
        },
        { name: "Size", values: ["S", "M", "L"].map((value) => ({ value })) },
        { name: "Kiểu cổ", values: [{ value: "Cổ sơ mi" }] },
      ],
    },
  ];
  for (const product of productInputs)
    await createProductWithVariants({ ...product, shopId, deviceId });
  const customer: Customer = {
    ...createMeta(shopId, deviceId),
    name: "Nguyễn Thảo",
    phone: "090 123 4567",
    address: "Quận 3, TP.HCM",
    totalReceivable: 120000,
    active: true,
    note: "Khách Facebook",
  };
  const supplier: Supplier = {
    ...createMeta(shopId, deviceId),
    name: "Xưởng May Linh",
    phone: "091 888 2233",
    address: "Tân Bình, TP.HCM",
    totalPayable: 1850000,
    active: true,
  };
  await db.transaction("rw", [db.customers, db.suppliers, db.expenses, db.outbox], async () => {
    await db.customers.add(customer);
    await db.suppliers.add(supplier);
    const expense: Expense = {
      ...createMeta(shopId, deviceId),
      category: "Đóng gói",
      amount: 85000,
      date: nowIso(),
      note: "Túi zip giao hàng",
      attachmentIds: [],
    };
    await db.expenses.add(expense);
    await db.outbox.bulkAdd([
      makeOutbox(customer, "customer", customer),
      makeOutbox(supplier, "supplier", supplier),
      makeOutbox(expense, "expense", expense),
    ]);
  });
  const variants = await db.variants.where("shopId").equals(shopId).limit(3).toArray();
  if (variants.length) {
    await completeSale({
      shopId,
      deviceId,
      customerId: customer.id,
      sourceChannel: "facebook",
      paymentMethod: "bank_transfer",
      deliveryStatus: "shipping",
      lines: variants.slice(0, 2).map((variant) => ({
        variantId: variant.id,
        quantity: 1,
        unitPrice: variant.salePrice,
        discount: 0,
      })),
      discount: 20000,
      shippingFeeCharged: 30000,
      amountPaid: 280000,
      note: "Demo đơn Facebook",
    });
  }
  const shop = await db.shops.get(shopId);
  if (shop) await db.shops.put({ ...shop, onboardingComplete: true });
}

export async function resetShopData(shopId: string) {
  const tables = [
    db.products,
    db.attributes,
    db.attributeValues,
    db.variants,
    db.customers,
    db.suppliers,
    db.sales,
    db.saleLines,
    db.purchases,
    db.purchaseLines,
    db.stockMovements,
    db.returnExchanges,
    db.payments,
    db.expenses,
    db.outbox,
    db.snapshots,
    db.auditLogs,
    db.conflicts,
  ] as Array<Table<EntityMeta, string>>;
  await db.transaction("rw", tables, async () => {
    for (const table of tables) await table.where("shopId").equals(shopId).delete();
  });
}
