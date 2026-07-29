import {
  type AuditLog,
  assertIntegerMoney,
  type CompleteSaleInput,
  type ConflictRecord,
  type Customer,
  calculateSaleTotals,
  createId,
  createMeta,
  type DeliveryStatus,
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
  action?: OutboxEvent["action"],
): OutboxEvent {
  return {
    ...createMeta(meta.shopId, meta.updatedByDeviceId),
    deviceId: meta.updatedByDeviceId,
    entityType,
    entityId: meta.id,
    action: action ?? (meta.deletedAt ? "delete" : meta.revision === 1 ? "create" : "update"),
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
  id?: string;
  shopId: string;
  deviceId: string;
  name: string;
  productCode: string;
  material?: string;
  salePrice: number;
  purchasePrice: number;
  openingStock: number;
  lowStockThreshold: number;
  imageIds?: string[];
  attributes: Array<{ name: string; values: Array<{ value: string; colorHex?: string }> }>;
}

export async function createProductWithVariants(input: CreateProductInput) {
  if (!input.name.trim() || !input.productCode.trim())
    throw new PocketError(
      "PRODUCT_REQUIRED",
      "Tên và mã mẫu áo không được để trống.",
      "Nhập đủ tên và mã mẫu áo.",
    );
  for (const [field, value] of [
    ["salePrice", input.salePrice],
    ["purchasePrice", input.purchasePrice],
    ["openingStock", input.openingStock],
    ["lowStockThreshold", input.lowStockThreshold],
  ] as const)
    assertIntegerMoney(value, field);
  const productCode = input.productCode.trim().toUpperCase();
  const duplicate = await db.products
    .where("shopId")
    .equals(input.shopId)
    .filter((item) => item.productCode === productCode)
    .first();
  if (duplicate)
    throw new PocketError(
      "PRODUCT_CODE_EXISTS",
      `Mã mẫu ${productCode} đã tồn tại.`,
      "Dùng mã mẫu khác.",
    );
  const product: Product = {
    ...createMeta(input.shopId, input.deviceId, input.id),
    name: input.name.trim(),
    productCode,
    material: input.material?.trim() || undefined,
    imageIds: input.imageIds ?? [],
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

export interface UpdateProductInput {
  shopId: string;
  deviceId: string;
  productId: string;
  name: string;
  productCode: string;
  material?: string;
  description?: string;
  imageIds?: string[];
  variants: Array<{
    id: string;
    salePrice: number;
    purchasePrice: number;
    lowStockThreshold: number;
    active: boolean;
  }>;
}

export async function updateProduct(input: UpdateProductInput) {
  const name = input.name.trim();
  const productCode = input.productCode.trim().toUpperCase();
  if (!name || !productCode)
    throw new PocketError(
      "PRODUCT_REQUIRED",
      "Tên và mã mẫu áo không được để trống.",
      "Nhập đủ tên và mã mẫu áo.",
    );
  for (const variant of input.variants) {
    assertIntegerMoney(variant.salePrice, "salePrice");
    assertIntegerMoney(variant.purchasePrice, "purchasePrice");
    assertIntegerMoney(variant.lowStockThreshold, "lowStockThreshold");
  }
  return db.transaction("rw", [db.products, db.variants, db.auditLogs, db.outbox], async () => {
    const product = await db.products.get(input.productId);
    if (!product || product.shopId !== input.shopId)
      throw new PocketError(
        "PRODUCT_MISSING",
        "Không tìm thấy mẫu áo.",
        "Tải lại danh sách mẫu áo.",
      );
    const duplicate = await db.products
      .where("shopId")
      .equals(input.shopId)
      .filter((item) => item.id !== product.id && item.productCode === productCode)
      .first();
    if (duplicate)
      throw new PocketError(
        "PRODUCT_CODE_EXISTS",
        `Mã mẫu ${productCode} đã tồn tại.`,
        "Dùng mã mẫu khác.",
      );
    const currentVariants = await db.variants.where("productId").equals(product.id).toArray();
    const currentById = new Map(currentVariants.map((variant) => [variant.id, variant]));
    const updatedVariants = input.variants.map((change) => {
      const variant = currentById.get(change.id);
      if (!variant || variant.shopId !== input.shopId)
        throw new PocketError(
          "VARIANT_MISSING",
          "Một biến thể không còn tồn tại.",
          "Tải lại mẫu áo rồi thử lại.",
        );
      const deletedAt = change.active ? undefined : (variant.deletedAt ?? nowIso());
      return touch(
        {
          ...variant,
          salePrice: change.salePrice,
          purchasePrice: change.purchasePrice,
          lowStockThreshold: change.lowStockThreshold,
          active: change.active,
          deletedAt,
        },
        input.deviceId,
      );
    });
    const updated = touch(
      {
        ...product,
        name,
        productCode,
        material: input.material?.trim() || undefined,
        description: input.description?.trim() || undefined,
        imageIds: input.imageIds ?? product.imageIds,
      },
      input.deviceId,
    );
    await db.products.put(updated);
    if (updatedVariants.length) await db.variants.bulkPut(updatedVariants);
    await db.auditLogs.add(
      makeAudit(updated, "product.updated", "product", `Đã sửa mẫu áo ${updated.name}`, {
        variants: updatedVariants.length,
      }),
    );
    await db.outbox.bulkAdd([
      makeOutbox(updated, "product", updated),
      ...updatedVariants.map((variant) =>
        makeOutbox(variant, "variant", variant, variant.active ? "update" : "delete"),
      ),
    ]);
    return { product: updated, variants: updatedVariants };
  });
}

export async function setProductActive(
  shopId: string,
  deviceId: string,
  productId: string,
  active: boolean,
) {
  return db.transaction("rw", [db.products, db.auditLogs, db.outbox], async () => {
    const product = await db.products.get(productId);
    if (!product || product.shopId !== shopId)
      throw new PocketError(
        "PRODUCT_MISSING",
        "Không tìm thấy mẫu áo.",
        "Tải lại danh sách mẫu áo.",
      );
    const deletedAt = active ? undefined : (product.deletedAt ?? nowIso());
    const updated = touch({ ...product, active, deletedAt }, deviceId);
    await db.products.put(updated);
    await db.auditLogs.add(
      makeAudit(
        updated,
        active ? "product.restored" : "product.deactivated",
        "product",
        active ? `Đã bán lại ${updated.name}` : `Đã tạm ẩn ${updated.name}`,
      ),
    );
    await db.outbox.add(makeOutbox(updated, "product", updated, active ? "update" : "delete"));
    return updated;
  });
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
  const product = await db.products.get(variant.productId);
  if (!product?.active)
    throw new PocketError(
      "PRODUCT_INACTIVE",
      "Mẫu áo này đang tạm ẩn.",
      "Kích hoạt lại mẫu áo trước khi bán.",
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
        const product = products[index];
        if (!variant || variant.shopId !== input.shopId || !variant.active || !product?.active) {
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
      if (input.customerId) {
        const customer = await db.customers.get(input.customerId);
        if (!customer || customer.shopId !== input.shopId || !customer.active)
          throw new PocketError(
            "CUSTOMER_MISSING",
            "Khách hàng không còn khả dụng.",
            "Chọn lại khách hàng đang hoạt động.",
          );
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
  if (!input.lines.some((line) => line.quantity > 0))
    throw new PocketError(
      "EMPTY_PURCHASE",
      "Phiếu nhập chưa có số lượng.",
      "Nhập số lượng cho ít nhất một biến thể.",
    );
  assertIntegerMoney(input.amountPaid, "amountPaid");
  for (const line of input.lines) {
    assertIntegerMoney(line.quantity, "quantity");
    assertIntegerMoney(line.unitCost, "unitCost");
  }
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
      if (input.supplierId) {
        const supplier = await db.suppliers.get(input.supplierId);
        if (!supplier || supplier.shopId !== input.shopId || !supplier.active)
          throw new PocketError(
            "SUPPLIER_MISSING",
            "Xưởng không còn khả dụng.",
            "Chọn lại xưởng đang hoạt động.",
          );
      }
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

export async function updatePurchaseDetails(input: {
  shopId: string;
  deviceId: string;
  purchaseId: string;
  supplierId?: string;
  receivedAt: string;
  note?: string;
}) {
  return db.transaction(
    "rw",
    [db.purchases, db.suppliers, db.payments, db.auditLogs, db.outbox],
    async () => {
      const purchase = await db.purchases.get(input.purchaseId);
      if (!purchase || purchase.shopId !== input.shopId)
        throw new PocketError(
          "PURCHASE_MISSING",
          "Không tìm thấy phiếu nhập.",
          "Tải lại danh sách phiếu nhập.",
        );
      if (purchase.status === "cancelled")
        throw new PocketError(
          "PURCHASE_CANCELLED",
          "Phiếu nhập đã hủy không thể sửa.",
          "Tạo phiếu nhập mới nếu cần.",
        );
      if (!Number.isFinite(new Date(input.receivedAt).getTime()))
        throw new PocketError("INVALID_DATE", "Ngày nhập không hợp lệ.", "Chọn lại ngày nhập.");
      const events: OutboxEvent[] = [];
      if (purchase.supplierId !== input.supplierId && purchase.amountDue > 0) {
        if (purchase.supplierId) {
          const previous = await db.suppliers.get(purchase.supplierId);
          if (previous) {
            const updatedPrevious = touch(
              {
                ...previous,
                totalPayable: Math.max(0, previous.totalPayable - purchase.amountDue),
              },
              input.deviceId,
            );
            await db.suppliers.put(updatedPrevious);
            events.push(makeOutbox(updatedPrevious, "supplier", updatedPrevious));
          }
        }
        if (input.supplierId) {
          const next = await db.suppliers.get(input.supplierId);
          if (!next || next.shopId !== input.shopId || !next.active)
            throw new PocketError(
              "SUPPLIER_MISSING",
              "Không tìm thấy xưởng mới.",
              "Chọn lại xưởng.",
            );
          const updatedNext = touch(
            { ...next, totalPayable: next.totalPayable + purchase.amountDue },
            input.deviceId,
          );
          await db.suppliers.put(updatedNext);
          events.push(makeOutbox(updatedNext, "supplier", updatedNext));
        }
      }
      if (purchase.supplierId !== input.supplierId) {
        const payments = await db.payments.where("referenceId").equals(purchase.id).toArray();
        const updatedPayments = payments
          .filter((payment) => payment.referenceType === "purchase")
          .map((payment) => touch({ ...payment, supplierId: input.supplierId }, input.deviceId));
        if (updatedPayments.length) {
          await db.payments.bulkPut(updatedPayments);
          events.push(...updatedPayments.map((payment) => makeOutbox(payment, "payment", payment)));
        }
      }
      const updated = touch(
        {
          ...purchase,
          supplierId: input.supplierId,
          receivedAt: new Date(input.receivedAt).toISOString(),
          note: input.note?.trim() || undefined,
        },
        input.deviceId,
      );
      await db.purchases.put(updated);
      events.push(makeOutbox(updated, "purchase", updated));
      await db.auditLogs.add(
        makeAudit(
          updated,
          "purchase.updated",
          "purchase",
          `Đã sửa thông tin ${updated.receiptNumber}`,
        ),
      );
      await db.outbox.bulkAdd(events);
      return updated;
    },
  );
}

export async function cancelCompletedPurchase(
  shopId: string,
  deviceId: string,
  purchaseId: string,
) {
  return db.transaction(
    "rw",
    [
      db.shops,
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
      const [shop, purchase] = await Promise.all([
        db.shops.get(shopId),
        db.purchases.get(purchaseId),
      ]);
      if (!shop) throw new PocketError("SHOP_MISSING", "Không tìm thấy shop.", "Tải lại ứng dụng.");
      if (!purchase || purchase.shopId !== shopId)
        throw new PocketError(
          "PURCHASE_MISSING",
          "Không tìm thấy phiếu nhập.",
          "Tải lại danh sách phiếu nhập.",
        );
      if (purchase.status !== "completed")
        throw new PocketError(
          "PURCHASE_NOT_CANCELLABLE",
          "Chỉ có thể hủy phiếu nhập đang hoàn tất.",
          "Tải lại phiếu nhập.",
        );
      const lines = await db.purchaseLines.where("purchaseId").equals(purchase.id).toArray();
      const variants = await db.variants.bulkGet(lines.map((line) => line.variantId));
      for (const [index, line] of lines.entries()) {
        const variant = variants[index];
        if (!variant || variant.shopId !== shopId)
          throw new PocketError(
            "VARIANT_MISSING",
            "Thiếu biến thể để hoàn tác phiếu nhập.",
            "Đồng bộ dữ liệu rồi thử lại.",
          );
        if (!shop.allowNegativeStock && variant.stockQuantity < line.quantity)
          throw new PocketError(
            "PURCHASE_STOCK_USED",
            `${variant.sku} không còn đủ tồn để hủy phiếu nhập.`,
            "Hoàn trả/điều chỉnh các áo đã xuất trước khi hủy phiếu.",
          );
      }
      const events: OutboxEvent[] = [];
      const movements: StockMovement[] = [];
      for (const [index, line] of lines.entries()) {
        const variant = variants[index] as ProductVariant;
        const updatedVariant = touch(
          { ...variant, stockQuantity: variant.stockQuantity - line.quantity },
          deviceId,
        );
        const movement: StockMovement = {
          ...createMeta(shopId, deviceId),
          variantId: variant.id,
          movementType: "supplier_return",
          quantityDelta: -line.quantity,
          quantityBefore: variant.stockQuantity,
          quantityAfter: updatedVariant.stockQuantity,
          unitCost: line.unitCost,
          referenceType: "purchase",
          referenceId: purchase.id,
          reason: `Hủy ${purchase.receiptNumber}`,
          occurredAt: nowIso(),
        };
        await db.variants.put(updatedVariant);
        movements.push(movement);
        events.push(
          makeOutbox(updatedVariant, "variant", updatedVariant),
          makeOutbox(movement, "stockMovement", movement),
        );
      }
      if (movements.length) await db.stockMovements.bulkAdd(movements);
      if (purchase.amountDue > 0 && purchase.supplierId) {
        const supplier = await db.suppliers.get(purchase.supplierId);
        if (supplier) {
          const updatedSupplier = touch(
            {
              ...supplier,
              totalPayable: Math.max(0, supplier.totalPayable - purchase.amountDue),
            },
            deviceId,
          );
          await db.suppliers.put(updatedSupplier);
          events.push(makeOutbox(updatedSupplier, "supplier", updatedSupplier));
        }
      }
      if (purchase.amountPaid > 0) {
        const refund: Payment = {
          ...createMeta(shopId, deviceId),
          direction: "incoming",
          referenceType: "purchase",
          referenceId: purchase.id,
          supplierId: purchase.supplierId,
          amount: purchase.amountPaid,
          paymentMethod: "bank_transfer",
          paidAt: nowIso(),
          note: `Hoàn tiền khi hủy ${purchase.receiptNumber}`,
        };
        await db.payments.add(refund);
        events.push(makeOutbox(refund, "payment", refund));
      }
      const updatedPurchase = touch(
        { ...purchase, status: "cancelled" as const, deletedAt: nowIso() },
        deviceId,
      );
      await db.purchases.put(updatedPurchase);
      events.push(makeOutbox(updatedPurchase, "purchase", updatedPurchase, "delete"));
      await db.auditLogs.add(
        makeAudit(
          updatedPurchase,
          "purchase.cancelled",
          "purchase",
          `Đã hủy ${purchase.receiptNumber} và đảo phát sinh kho/công nợ`,
          { movements: movements.length },
        ),
      );
      await db.outbox.bulkAdd(events);
      return updatedPurchase;
    },
  );
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

export async function updateSaleDetails(input: {
  shopId: string;
  deviceId: string;
  saleId: string;
  deliveryStatus: DeliveryStatus;
  note?: string;
}) {
  return db.transaction("rw", [db.sales, db.auditLogs, db.outbox], async () => {
    const sale = await db.sales.get(input.saleId);
    if (!sale || sale.shopId !== input.shopId)
      throw new PocketError("SALE_MISSING", "Không tìm thấy đơn hàng.", "Tải lại danh sách đơn.");
    if (sale.status === "cancelled")
      throw new PocketError(
        "SALE_CANCELLED",
        "Đơn đã hủy không thể chỉnh sửa.",
        "Tạo đơn mới nếu cần.",
      );
    const updated = touch(
      {
        ...sale,
        deliveryStatus: input.deliveryStatus,
        note: input.note?.trim() || undefined,
      },
      input.deviceId,
    );
    await db.sales.put(updated);
    await db.auditLogs.add(
      makeAudit(updated, "sale.updated", "sale", `Đã sửa giao hàng/ghi chú ${sale.orderNumber}`),
    );
    await db.outbox.add(makeOutbox(updated, "sale", updated));
    return updated;
  });
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
  id?: string;
  shopId: string;
  deviceId: string;
  category: string;
  amount: number;
  note?: string;
  date?: string;
  attachmentIds?: string[];
}) {
  assertIntegerMoney(input.amount, "amount");
  if (input.amount <= 0)
    throw new PocketError(
      "INVALID_EXPENSE",
      "Số tiền chi phải lớn hơn 0.",
      "Nhập lại số tiền chi.",
    );
  if (!input.category.trim())
    throw new PocketError(
      "EXPENSE_CATEGORY_REQUIRED",
      "Nhóm chi không được để trống.",
      "Chọn nhóm chi.",
    );
  const date = input.date ?? nowIso();
  if (!Number.isFinite(new Date(date).getTime()))
    throw new PocketError("INVALID_DATE", "Ngày chi không hợp lệ.", "Chọn lại ngày chi.");
  const expense: Expense = {
    ...createMeta(input.shopId, input.deviceId, input.id),
    category: input.category.trim(),
    amount: input.amount,
    note: input.note?.trim() || undefined,
    date: new Date(date).toISOString(),
    attachmentIds: input.attachmentIds ?? [],
  };
  await db.transaction("rw", [db.expenses, db.auditLogs, db.outbox], async () => {
    await db.expenses.add(expense);
    await db.auditLogs.add(
      makeAudit(expense, "expense.created", "expense", `Đã thêm chi phí ${expense.category}`),
    );
    await db.outbox.add(makeOutbox(expense, "expense", expense));
  });
  return expense;
}

export async function updateExpense(input: {
  shopId: string;
  deviceId: string;
  expenseId: string;
  category: string;
  amount: number;
  note?: string;
  date: string;
  attachmentIds?: string[];
}) {
  assertIntegerMoney(input.amount, "amount");
  if (input.amount <= 0)
    throw new PocketError(
      "INVALID_EXPENSE",
      "Số tiền chi phải lớn hơn 0.",
      "Nhập lại số tiền chi.",
    );
  if (!input.category.trim() || !Number.isFinite(new Date(input.date).getTime()))
    throw new PocketError(
      "INVALID_EXPENSE",
      "Nhóm chi hoặc ngày chi không hợp lệ.",
      "Kiểm tra lại thông tin chi phí.",
    );
  return db.transaction("rw", [db.expenses, db.auditLogs, db.outbox], async () => {
    const expense = await db.expenses.get(input.expenseId);
    if (!expense || expense.shopId !== input.shopId)
      throw new PocketError(
        "EXPENSE_MISSING",
        "Không tìm thấy khoản chi.",
        "Tải lại danh sách chi phí.",
      );
    if (expense.deletedAt)
      throw new PocketError(
        "EXPENSE_VOIDED",
        "Khoản chi đã hủy không thể sửa.",
        "Khôi phục khoản chi trước khi sửa.",
      );
    const updated = touch(
      {
        ...expense,
        category: input.category.trim(),
        amount: input.amount,
        note: input.note?.trim() || undefined,
        date: new Date(input.date).toISOString(),
        attachmentIds: input.attachmentIds ?? expense.attachmentIds,
      },
      input.deviceId,
    );
    await db.expenses.put(updated);
    await db.auditLogs.add(
      makeAudit(updated, "expense.updated", "expense", `Đã sửa chi phí ${updated.category}`),
    );
    await db.outbox.add(makeOutbox(updated, "expense", updated));
    return updated;
  });
}

export async function setExpenseActive(
  shopId: string,
  deviceId: string,
  expenseId: string,
  active: boolean,
) {
  return db.transaction("rw", [db.expenses, db.auditLogs, db.outbox], async () => {
    const expense = await db.expenses.get(expenseId);
    if (!expense || expense.shopId !== shopId)
      throw new PocketError(
        "EXPENSE_MISSING",
        "Không tìm thấy khoản chi.",
        "Tải lại danh sách chi phí.",
      );
    const updated = touch(
      { ...expense, deletedAt: active ? undefined : (expense.deletedAt ?? nowIso()) },
      deviceId,
    );
    await db.expenses.put(updated);
    await db.auditLogs.add(
      makeAudit(
        updated,
        active ? "expense.restored" : "expense.voided",
        "expense",
        active ? `Đã khôi phục chi phí ${updated.category}` : `Đã hủy chi phí ${updated.category}`,
      ),
    );
    await db.outbox.add(makeOutbox(updated, "expense", updated, active ? "update" : "delete"));
    return updated;
  });
}

export async function createCustomer(input: {
  shopId: string;
  deviceId: string;
  name: string;
  phone?: string;
  address?: string;
  note?: string;
}) {
  if (!input.name.trim())
    throw new PocketError(
      "PARTY_NAME_REQUIRED",
      "Tên không được để trống.",
      "Nhập tên trước khi lưu.",
    );
  const customer: Customer = {
    ...createMeta(input.shopId, input.deviceId),
    name: input.name.trim(),
    phone: input.phone?.trim(),
    address: input.address?.trim(),
    note: input.note?.trim(),
    totalReceivable: 0,
    active: true,
  };
  await db.transaction("rw", [db.customers, db.auditLogs, db.outbox], async () => {
    await db.customers.add(customer);
    await db.auditLogs.add(
      makeAudit(customer, "customer.created", "customer", `Đã thêm khách ${customer.name}`),
    );
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
  if (!input.name.trim())
    throw new PocketError(
      "PARTY_NAME_REQUIRED",
      "Tên không được để trống.",
      "Nhập tên trước khi lưu.",
    );
  const supplier: Supplier = {
    ...createMeta(input.shopId, input.deviceId),
    name: input.name.trim(),
    phone: input.phone?.trim(),
    address: input.address?.trim(),
    note: input.note?.trim(),
    totalPayable: 0,
    active: true,
  };
  await db.transaction("rw", [db.suppliers, db.auditLogs, db.outbox], async () => {
    await db.suppliers.add(supplier);
    await db.auditLogs.add(
      makeAudit(supplier, "supplier.created", "supplier", `Đã thêm xưởng ${supplier.name}`),
    );
    await db.outbox.add(makeOutbox(supplier, "supplier", supplier));
  });
  return supplier;
}

export async function updateParty(input: {
  shopId: string;
  deviceId: string;
  partyType: "customer" | "supplier";
  partyId: string;
  name: string;
  phone?: string;
  address?: string;
  note?: string;
}) {
  if (!input.name.trim())
    throw new PocketError(
      "PARTY_NAME_REQUIRED",
      "Tên không được để trống.",
      "Nhập tên trước khi lưu.",
    );
  const table = input.partyType === "customer" ? db.customers : db.suppliers;
  return db.transaction("rw", [table, db.auditLogs, db.outbox], async () => {
    const party = await table.get(input.partyId);
    if (!party || party.shopId !== input.shopId)
      throw new PocketError(
        "PARTY_MISSING",
        "Không tìm thấy đối tác.",
        "Tải lại danh sách rồi thử lại.",
      );
    const updated = touch(
      {
        ...party,
        name: input.name.trim(),
        phone: input.phone?.trim() || undefined,
        address: input.address?.trim() || undefined,
        note: input.note?.trim() || undefined,
      },
      input.deviceId,
    );
    if (input.partyType === "customer") await db.customers.put(updated as Customer);
    else await db.suppliers.put(updated as Supplier);
    await db.auditLogs.add(
      makeAudit(
        updated,
        `${input.partyType}.updated`,
        input.partyType,
        `Đã sửa ${input.partyType === "customer" ? "khách" : "xưởng"} ${updated.name}`,
      ),
    );
    await db.outbox.add(makeOutbox(updated, input.partyType, updated));
    return updated;
  });
}

export async function setPartyActive(input: {
  shopId: string;
  deviceId: string;
  partyType: "customer" | "supplier";
  partyId: string;
  active: boolean;
}) {
  const table = input.partyType === "customer" ? db.customers : db.suppliers;
  return db.transaction("rw", [table, db.auditLogs, db.outbox], async () => {
    const party = await table.get(input.partyId);
    if (!party || party.shopId !== input.shopId)
      throw new PocketError(
        "PARTY_MISSING",
        "Không tìm thấy đối tác.",
        "Tải lại danh sách rồi thử lại.",
      );
    const updated = touch(
      {
        ...party,
        active: input.active,
        deletedAt: input.active ? undefined : (party.deletedAt ?? nowIso()),
      },
      input.deviceId,
    );
    if (input.partyType === "customer") await db.customers.put(updated as Customer);
    else await db.suppliers.put(updated as Supplier);
    await db.auditLogs.add(
      makeAudit(
        updated,
        `${input.partyType}.${input.active ? "restored" : "deactivated"}`,
        input.partyType,
        input.active ? `Đã kích hoạt lại ${updated.name}` : `Đã tạm ẩn ${updated.name}`,
      ),
    );
    await db.outbox.add(
      makeOutbox(updated, input.partyType, updated, input.active ? "update" : "delete"),
    );
    return updated;
  });
}

export async function recordDebtPayment(input: {
  shopId: string;
  deviceId: string;
  partyType: "customer" | "supplier";
  partyId: string;
  amount: number;
  method: Payment["paymentMethod"];
}) {
  assertIntegerMoney(input.amount, "amount");
  if (input.amount <= 0)
    throw new PocketError(
      "INVALID_PAYMENT",
      "Số tiền thanh toán phải lớn hơn 0.",
      "Nhập lại số tiền.",
    );
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
      if (current <= 0)
        throw new PocketError(
          "NO_DEBT",
          "Đối tác hiện không có công nợ cần thanh toán.",
          "Tải lại thông tin công nợ.",
        );
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

export async function adjustStock(input: {
  shopId: string;
  deviceId: string;
  variantId: string;
  quantityDelta: number;
  reason: string;
}) {
  if (!Number.isSafeInteger(input.quantityDelta) || input.quantityDelta === 0)
    throw new PocketError(
      "INVALID_ADJUSTMENT",
      "Số lượng điều chỉnh phải là số nguyên khác 0.",
      "Nhập số dương để tăng hoặc số âm để giảm.",
    );
  if (!input.reason.trim())
    throw new PocketError(
      "ADJUSTMENT_REASON_REQUIRED",
      "Cần ghi lý do điều chỉnh kho.",
      "Nhập lý do kiểm kê hoặc sai lệch.",
    );
  return db.transaction(
    "rw",
    [db.shops, db.variants, db.stockMovements, db.auditLogs, db.outbox],
    async () => {
      const [shop, variant] = await Promise.all([
        db.shops.get(input.shopId),
        db.variants.get(input.variantId),
      ]);
      if (!shop || !variant || variant.shopId !== input.shopId)
        throw new PocketError(
          "VARIANT_MISSING",
          "Không tìm thấy biến thể cần điều chỉnh.",
          "Tải lại kho rồi thử lại.",
        );
      const after = variant.stockQuantity + input.quantityDelta;
      if (!shop.allowNegativeStock && after < 0)
        throw new InsufficientStockError(
          variant.id,
          variant.stockQuantity,
          Math.abs(input.quantityDelta),
        );
      const updated = touch({ ...variant, stockQuantity: after }, input.deviceId);
      const movementMeta = createMeta(input.shopId, input.deviceId);
      const movement: StockMovement = {
        ...movementMeta,
        variantId: variant.id,
        movementType: input.quantityDelta > 0 ? "adjustment_in" : "adjustment_out",
        quantityDelta: input.quantityDelta,
        quantityBefore: variant.stockQuantity,
        quantityAfter: after,
        unitCost: variant.purchasePrice,
        referenceType: "adjustment",
        referenceId: movementMeta.id,
        reason: input.reason.trim(),
        occurredAt: nowIso(),
      };
      await db.variants.put(updated);
      await db.stockMovements.add(movement);
      await db.auditLogs.add(
        makeAudit(
          movement,
          "stock.adjusted",
          "stockMovement",
          `Điều chỉnh ${variant.sku}: ${input.quantityDelta > 0 ? "+" : ""}${input.quantityDelta}`,
          { reason: movement.reason },
        ),
      );
      await db.outbox.bulkAdd([
        makeOutbox(updated, "variant", updated),
        makeOutbox(movement, "stockMovement", movement),
      ]);
      return { variant: updated, movement };
    },
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
  if (existing > 0) {
    const shop = await db.shops.get(shopId);
    if (shop && !shop.onboardingComplete) await db.shops.put({ ...shop, onboardingComplete: true });
    return;
  }
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
