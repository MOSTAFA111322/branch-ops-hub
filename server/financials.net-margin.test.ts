import { describe, expect, it } from "vitest";
import { aggregateFinancialComparison, calculateNetMargin, filterSalesCenters } from "../shared/financials";

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

describe("filterSalesCenters", () => {
  it("excludes warehouses and representatives from sales rankings", () => {
    expect(filterSalesCenters([
      { id: 101, operationalType: "branch" },
      { id: 102, operationalType: "warehouse" },
      { id: 103, operationalType: "representative" },
      { id: 104 },
    ]).map((location) => location.id)).toEqual([101, 104]);
  });
});

describe("aggregateFinancialComparison", () => {
  it("compares current month with previous month by cost center type", () => {
    const rows = aggregateFinancialComparison(
      [{ id: 1, operationalType: "branch" }, { id: 2, operationalType: "warehouse" }, { id: 3, operationalType: "representative" }],
      [
        { branchId: 1, periodYear: 2026, periodMonth: 1, operatingExpenses: "120", netSales: "1000", netProfit: "300" },
        { branchId: 1, periodYear: 2025, periodMonth: 12, operatingExpenses: "100", netSales: "900", netProfit: "250" },
        { branchId: 2, periodYear: 2026, periodMonth: 1, operatingExpenses: "80", revenue: "0", netProfit: "-80" },
        { branchId: 2, periodYear: 2025, periodMonth: 12, operatingExpenses: "100", revenue: "0", netProfit: "-100" },
      ],
      { year: 2026, month: 1 },
      { year: 2025, month: 12 },
    );
    expect(rows[0]).toMatchObject({ type: "branch", locationCount: 1, expenseChange: 20, expenseChangePercent: 20 });
    expect(rows[1]).toMatchObject({ type: "warehouse", locationCount: 1, current: { expenses: 80, netProfit: -80 }, previous: { expenses: 100 } });
    expect(rows[2]).toMatchObject({ type: "representative", locationCount: 1, expenseChange: 0, expenseChangePercent: 0 });
  });
});
