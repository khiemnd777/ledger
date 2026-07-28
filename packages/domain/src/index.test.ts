import { describe, expect, it } from "vitest";
import {
  calculateReport,
  calculateSaleTotals,
  type Expense,
  movingAverageCost,
  type ReturnExchange,
  type Sale,
  type SaleLine,
} from "./index";

describe("money and inventory calculations", () => {
  it("calculates sale totals in integer VND", () => {
    expect(
      calculateSaleTotals(
        [{ quantity: 2, unitPrice: 185000, discount: 10000 }],
        20000,
        30000,
        200000,
      ),
    ).toEqual({
      subtotal: 360000,
      total: 370000,
      amountPaid: 200000,
      amountDue: 170000,
      change: 0,
    });
  });

  it("uses weighted moving average and safely handles zero", () => {
    expect(movingAverageCost(10, 80000, 5, 110000)).toBe(90000);
    expect(movingAverageCost(0, 0, 5, 110000)).toBe(110000);
    expect(movingAverageCost(8, 90000, 0, 0)).toBe(90000);
  });

  it("distinguishes net revenue, gross profit, and net profit", () => {
    const sale = { id: "sale", status: "completed", total: 400000 } as Sale;
    const line = {
      saleId: "sale",
      quantity: 2,
      returnedQuantity: 0,
      unitCostSnapshot: 80000,
    } as SaleLine;
    const expense = { amount: 50000 } as Expense;
    const returned = { refundAmount: 100000 } as ReturnExchange;
    expect(
      calculateReport({
        sales: [sale],
        saleLines: [line],
        expenses: [expense],
        returns: [returned],
      }),
    ).toMatchObject({
      netRevenue: 300000,
      costOfGoodsSold: 160000,
      grossProfit: 140000,
      netProfit: 90000,
    });
  });
});
