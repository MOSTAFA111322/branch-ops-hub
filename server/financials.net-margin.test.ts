import { describe, expect, it } from "vitest";
import { calculateNetMargin } from "../shared/financials";

describe("calculateNetMargin", () => {
  it("subtracts sales and cost returns before calculating the net margin", () => {
    expect(calculateNetMargin({ grossSales: 1000, salesReturns: 100, grossCost: 600, costReturns: 50 })).toEqual({
      netSales: 900,
      netCost: 550,
      netProfitMargin: 350,
    });
  });

  it("allows a negative net margin when net cost exceeds net sales", () => {
    expect(calculateNetMargin({ grossSales: 500, salesReturns: 0, grossCost: 700, costReturns: 0 }).netProfitMargin).toBe(-200);
  });

  it("defaults missing returns to zero and prevents negative net bases", () => {
    expect(calculateNetMargin({ grossSales: 100, grossCost: 40 })).toEqual({
      netSales: 100,
      netCost: 40,
      netProfitMargin: 60,
    });
    expect(calculateNetMargin({ grossSales: 100, salesReturns: 120, grossCost: 40, costReturns: 50 })).toEqual({
      netSales: 0,
      netCost: 0,
      netProfitMargin: 0,
    });
  });
});
