import { describe, expect, it } from "vitest";
import { calculateNetMargin, normalizeImportedAmount } from "@shared/financials";

describe("financial import sign normalization", () => {
  it("converts accounting-export negative revenue into a positive semantic amount", () => {
    expect(normalizeImportedAmount("-125,500.75")).toBe(125500.75);
    expect(normalizeImportedAmount("١٢٥٬٥٠٠٫٧٥")).toBe(125500.75);
  });

  it("does not allow a negative return or cost to reverse the net calculation", () => {
    const result = calculateNetMargin({
      grossSales: normalizeImportedAmount("-1000"),
      salesReturns: normalizeImportedAmount("-100"),
      grossCost: normalizeImportedAmount("-600"),
      costReturns: normalizeImportedAmount("-50"),
    });
    expect(result).toEqual({ netSales: 900, netCost: 550, netProfitMargin: 350 });
  });

  it("returns zero for blank or malformed spreadsheet cells", () => {
    expect(normalizeImportedAmount("")).toBe(0);
    expect(normalizeImportedAmount("غير متاح")).toBe(0);
  });
});
