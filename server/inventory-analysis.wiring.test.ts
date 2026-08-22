import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("inventory analysis wiring", () => {
  it("exposes a protected inventory.analyze procedure with scoped filters", () => {
    const source = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
    expect(source).toContain('inventory: router({');
    expect(source).toContain('analyze: roleProcedure(["admin", "area_manager", "branch_manager", "warehouse"])');
    expect(source).toContain("getInventoryMovementAnalysis(ctx.user");
    expect(source).toContain("itemQuery: input.itemQuery");
    expect(source).toContain("itemQuery: input.itemQuery ?? null");
    expect(source).toContain("costCenterCode");
    expect(source).toContain("input.from > input.to");
    expect(source).toContain("monthlyReport");
  });

  it("renders the inventory analysis navigation, filters, and specialized reports", () => {
    const home = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
    const component = readFileSync(resolve(process.cwd(), "client/src/components/InventoryAnalysisView.tsx"), "utf8");
    expect(home).toContain('label: "تحليل حركة الأصناف"');
    expect(home).toContain("<InventoryAnalysisView />");
    expect(home).toContain("تحديد صنف للمساعد");
    expect(component).toContain("trpc.inventory.analyze.useQuery");
    expect(component).toContain("التقرير الشهري");
    expect(component).toContain("الأصناف الراكدة");
    expect(component).toContain("الأكثر مبيعًا");
    expect(component).toContain("XLSX.writeFile");
    expect(component).toContain("window.print()");
  });
});
