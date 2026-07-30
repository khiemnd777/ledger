import Decimal from "decimal.js";

export type Id = string;
export type SyncStatus = "local" | "pending" | "syncing" | "synced" | "failed" | "conflicted";
export type EntityType =
  | "shop"
  | "product"
  | "attribute"
  | "attributeValue"
  | "variant"
  | "customer"
  | "supplier"
  | "sale"
  | "saleLine"
  | "purchase"
  | "purchaseLine"
  | "stockMovement"
  | "returnExchange"
  | "payment"
  | "expense";

export interface EntityMeta {
  id: Id;
  shopId: Id;
  createdAt: string;
  createdByDeviceId: Id;
  updatedAt: string;
  updatedByDeviceId: Id;
  revision: number;
  deletedAt?: string;
  syncStatus: SyncStatus;
}

export interface Shop extends Omit<EntityMeta, "shopId"> {
  ownerUid: string;
  name: string;
  logo?: string;
  currency: "VND";
  timezone: string;
  defaultLowStockThreshold: number;
  allowNegativeStock: boolean;
  onboardingComplete: boolean;
}

export interface Product extends EntityMeta {
  name: string;
  productCode: string;
  categoryId?: Id;
  brand?: string;
  description?: string;
  material?: string;
  gender?: "female" | "male" | "unisex" | "children";
  fit?: string;
  imageIds: string[];
  trackInventory: boolean;
  hasVariants: boolean;
  active: boolean;
}

export interface ProductAttribute extends EntityMeta {
  productId: Id;
  name: string;
  position: number;
}

export interface ProductAttributeValue extends EntityMeta {
  attributeId: Id;
  value: string;
  displayValue: string;
  position: number;
  colorHex?: string;
}

export interface ProductVariant extends EntityMeta {
  productId: Id;
  sku: string;
  qrValue: string;
  barcode?: string;
  note?: string;
  attributeValueIds: Id[];
  attributeSummary: string;
  purchasePrice: number;
  salePrice: number;
  wholesalePrice?: number;
  stockQuantity: number;
  reservedQuantity: number;
  lowStockThreshold: number;
  active: boolean;
  imageId?: string;
}

export interface Customer extends EntityMeta {
  name: string;
  phone?: string;
  address?: string;
  note?: string;
  totalReceivable: number;
  active: boolean;
}

export interface Supplier extends EntityMeta {
  name: string;
  phone?: string;
  address?: string;
  note?: string;
  totalPayable: number;
  active: boolean;
}

export type SaleStatus =
  | "draft"
  | "pending"
  | "completed"
  | "cancelled"
  | "partially_returned"
  | "fully_returned";
export type DeliveryStatus =
  | "not_required"
  | "pending_confirmation"
  | "packing"
  | "shipping"
  | "delivered"
  | "failed"
  | "returned";
export type SalesChannel = "direct" | "facebook" | "tiktok" | "zalo" | "shopee" | "other";
export type PaymentMethod = "cash" | "bank_transfer" | "cod" | "card" | "other";

export interface Sale extends EntityMeta {
  orderNumber: string;
  customerId?: Id;
  sourceChannel: SalesChannel;
  status: SaleStatus;
  subtotal: number;
  discount: number;
  shippingFeeCharged: number;
  total: number;
  amountPaid: number;
  amountDue: number;
  paymentMethod: PaymentMethod;
  deliveryStatus: DeliveryStatus;
  note?: string;
  completedAt?: string;
  cancelledAt?: string;
}

export interface SaleLine extends EntityMeta {
  saleId: Id;
  productId: Id;
  variantId: Id;
  productNameSnapshot: string;
  variantNameSnapshot: string;
  skuSnapshot: string;
  quantity: number;
  unitPrice: number;
  unitCostSnapshot: number;
  discount: number;
  lineTotal: number;
  returnedQuantity: number;
}

export interface Purchase extends EntityMeta {
  receiptNumber: string;
  supplierId?: Id;
  total: number;
  amountPaid: number;
  amountDue: number;
  receivedAt: string;
  note?: string;
  status: "draft" | "completed" | "cancelled";
}

export interface PurchaseLine extends EntityMeta {
  purchaseId: Id;
  productId: Id;
  variantId: Id;
  quantity: number;
  unitCost: number;
  lineTotal: number;
}

export type StockMovementType =
  | "opening_stock"
  | "purchase"
  | "sale"
  | "sale_cancelled"
  | "customer_return"
  | "supplier_return"
  | "exchange_in"
  | "exchange_out"
  | "adjustment_in"
  | "adjustment_out"
  | "stock_count_correction";

export interface StockMovement extends EntityMeta {
  variantId: Id;
  movementType: StockMovementType;
  quantityDelta: number;
  quantityBefore: number;
  quantityAfter: number;
  unitCost: number;
  referenceType: "sale" | "purchase" | "return" | "adjustment" | "opening";
  referenceId: Id;
  reason?: string;
  occurredAt: string;
}

export interface ReturnExchange extends EntityMeta {
  saleId: Id;
  saleLineId: Id;
  type: "return" | "exchange";
  reason: "defective" | "wrong_size" | "wrong_color" | "changed_mind" | "wrong_item" | "other";
  quantity: number;
  restock: boolean;
  replacementVariantId?: Id;
  priceDifference: number;
  refundAmount: number;
  collectionAmount: number;
  completedAt: string;
}

export interface Payment extends EntityMeta {
  direction: "incoming" | "outgoing";
  referenceType: "sale" | "purchase" | "return" | "customer_debt" | "supplier_debt";
  referenceId: Id;
  customerId?: Id;
  supplierId?: Id;
  amount: number;
  paymentMethod: PaymentMethod;
  paidAt: string;
  note?: string;
}

export interface Expense extends EntityMeta {
  category: string;
  amount: number;
  date: string;
  note?: string;
  attachmentIds: string[];
}

export interface OutboxEvent extends EntityMeta {
  deviceId: Id;
  entityType: EntityType;
  entityId: Id;
  action: "create" | "update" | "delete" | "resolve";
  entityRevision: number;
  payload: unknown;
  occurredAt: string;
  retryCount: number;
  lastError?: string;
}

export interface SnapshotRecord extends EntityMeta {
  snapshotId: Id;
  deviceId: Id;
  schemaVersion: number;
  latestChangeSetId?: Id;
  checksum: string;
  cloudPath?: string;
  byteSize: number;
}

export interface AuditLog extends EntityMeta {
  action: string;
  entityType: EntityType;
  entityId: Id;
  summary: string;
  details?: unknown;
}

export interface ConflictRecord extends EntityMeta {
  entityType: EntityType;
  entityId: Id;
  localRevision: number;
  remoteRevision: number;
  localValue: unknown;
  remoteValue: unknown;
  status: "open" | "resolved_local" | "resolved_remote" | "resolved_manual";
  resolvedAt?: string;
}

export interface CartLine {
  variantId: Id;
  quantity: number;
  unitPrice: number;
  discount: number;
}

export interface CompleteSaleInput {
  id?: Id;
  shopId: Id;
  deviceId: Id;
  customerId?: Id;
  sourceChannel: SalesChannel;
  paymentMethod: PaymentMethod;
  deliveryStatus: DeliveryStatus;
  lines: CartLine[];
  discount: number;
  shippingFeeCharged: number;
  amountPaid: number;
  note?: string;
}

export class PocketError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly recovery: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "PocketError";
  }
}

export class InsufficientStockError extends PocketError {
  constructor(
    public readonly variantId: Id,
    public readonly available: number,
    public readonly requested: number,
  ) {
    super(
      "INSUFFICIENT_STOCK",
      `Biến thể chỉ còn ${available} sản phẩm, không đủ để bán ${requested}.`,
      "Giảm số lượng hoặc nhập thêm áo.",
      { variantId, available, requested },
    );
  }
}

export const nowIso = () => new Date().toISOString();
export const createId = (): Id => crypto.randomUUID();

export function createMeta(shopId: Id, deviceId: Id, id: Id = createId()): EntityMeta {
  const now = nowIso();
  return {
    id,
    shopId,
    createdAt: now,
    createdByDeviceId: deviceId,
    updatedAt: now,
    updatedByDeviceId: deviceId,
    revision: 1,
    syncStatus: "pending",
  };
}

export function touch<T extends EntityMeta>(entity: T, deviceId: Id): T {
  return {
    ...entity,
    updatedAt: nowIso(),
    updatedByDeviceId: deviceId,
    revision: entity.revision + 1,
    syncStatus: "pending",
  };
}

export function assertIntegerMoney(value: number, field = "amount"): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new PocketError(
      "INVALID_MONEY",
      "Số tiền không hợp lệ.",
      "Nhập số tiền nguyên, không âm.",
      { field, value },
    );
  }
}

export function calculateSaleTotals(
  lines: Pick<CartLine, "quantity" | "unitPrice" | "discount">[],
  orderDiscount: number,
  shippingFeeCharged: number,
  amountPaid: number,
) {
  for (const value of [orderDiscount, shippingFeeCharged, amountPaid]) assertIntegerMoney(value);
  const subtotal = lines.reduce((sum, line) => {
    assertIntegerMoney(line.unitPrice, "unitPrice");
    assertIntegerMoney(line.discount, "lineDiscount");
    if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) {
      throw new PocketError(
        "INVALID_QUANTITY",
        "Số lượng phải lớn hơn 0.",
        "Kiểm tra lại giỏ hàng.",
      );
    }
    return sum + line.quantity * line.unitPrice - line.discount;
  }, 0);
  const total = Math.max(0, subtotal - orderDiscount + shippingFeeCharged);
  const paid = Math.min(amountPaid, total);
  return {
    subtotal,
    total,
    amountPaid: paid,
    amountDue: total - paid,
    change: Math.max(0, amountPaid - total),
  };
}

export function movingAverageCost(
  previousQuantity: number,
  previousUnitCost: number,
  receivedQuantity: number,
  receivedUnitCost: number,
): number {
  if (receivedQuantity <= 0) return previousUnitCost;
  const finalQuantity = previousQuantity + receivedQuantity;
  if (finalQuantity <= 0) return receivedUnitCost;
  const value = new Decimal(Math.max(0, previousQuantity))
    .mul(previousUnitCost)
    .plus(new Decimal(receivedQuantity).mul(receivedUnitCost))
    .div(finalQuantity)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  return value.toNumber();
}

export interface ReportInput {
  sales: Sale[];
  saleLines: SaleLine[];
  expenses: Expense[];
  returns: ReturnExchange[];
}

export function calculateReport({ sales, saleLines, expenses, returns }: ReportInput) {
  const completedIds = new Set(
    sales
      .filter((sale) => ["completed", "partially_returned", "fully_returned"].includes(sale.status))
      .map((sale) => sale.id),
  );
  const completedLines = saleLines.filter((line) => completedIds.has(line.saleId));
  const returnValue = returns.reduce((sum, item) => sum + item.refundAmount, 0);
  const netRevenue = Math.max(
    0,
    sales.filter((sale) => completedIds.has(sale.id)).reduce((sum, sale) => sum + sale.total, 0) -
      returnValue,
  );
  const costOfGoodsSold = completedLines.reduce(
    (sum, line) => sum + (line.quantity - line.returnedQuantity) * line.unitCostSnapshot,
    0,
  );
  const grossProfit = netRevenue - costOfGoodsSold;
  const expenseTotal = expenses
    .filter((expense) => !expense.deletedAt)
    .reduce((sum, expense) => sum + expense.amount, 0);
  return {
    netRevenue,
    costOfGoodsSold,
    grossProfit,
    netProfit: grossProfit - expenseTotal,
    unitsSold: completedLines.reduce((sum, line) => sum + line.quantity - line.returnedQuantity, 0),
    expenseTotal,
  };
}

export function nextDocumentNumber(prefix: string, sequence: number, date = new Date()): string {
  const day = date.toISOString().slice(0, 10).replaceAll("-", "");
  return `${prefix}-${day}-${String(sequence).padStart(4, "0")}`;
}

export const DEFAULT_EXPENSE_CATEGORIES = [
  "Vận chuyển",
  "Đóng gói",
  "Quảng cáo",
  "Thuê shop",
  "Điện",
  "Internet",
  "Lương",
  "Khác",
] as const;
