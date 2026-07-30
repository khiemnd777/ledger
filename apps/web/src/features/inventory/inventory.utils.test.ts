import { describe, expect, it } from "vitest";
import { getStockAdjustmentDelta } from "./inventory.utils";

describe("getStockAdjustmentDelta", () => {
  it("converts a new absolute stock quantity into an increase delta", () => {
    expect(getStockAdjustmentDelta(55, "70")).toBe(15);
  });

  it("converts a new absolute stock quantity into a decrease delta", () => {
    expect(getStockAdjustmentDelta(55, "20")).toBe(-35);
  });

  it("returns zero when the stock quantity did not change", () => {
    expect(getStockAdjustmentDelta(55, "55")).toBe(0);
  });

  it.each(["", " ", "1.5", "not-a-number"])("rejects invalid stock value %j", (value) => {
    expect(() => getStockAdjustmentDelta(55, value)).toThrow();
  });
});
