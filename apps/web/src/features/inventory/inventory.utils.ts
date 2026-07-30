export const QUICK_STOCK_ADJUSTMENT_REASON = "Điều chỉnh nhanh từ danh sách tồn kho";

export function getStockAdjustmentDelta(currentQuantity: number, nextQuantityValue: string) {
  if (!nextQuantityValue.trim()) throw new Error("Số tồn không được để trống.");
  const nextQuantity = Number(nextQuantityValue);
  if (!Number.isSafeInteger(nextQuantity)) throw new Error("Số tồn phải là số nguyên.");
  return nextQuantity - currentQuantity;
}
