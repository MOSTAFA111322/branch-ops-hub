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
    expect(source).toContain("importRows:");
    expect(source).toContain("costCenterCode");
    expect(source).toContain("input.from > input.to");
    expect(source).toContain("sourceFileName");
  });

  it("renders the inventory analysis navigation, filters, and specialized reports", () => {
    const home = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
    const component = readFileSync(resolve(process.cwd(), "client/src/components/InventoryAnalysisView.tsx"), "utf8");
    const coordinateImporter = readFileSync(resolve(process.cwd(), "client/src/components/CoordinateCsvImporter.tsx"), "utf8");
    expect(home).toContain('label: "تحليل حركة الأصناف"');
    expect(home).toContain("<InventoryAnalysisView initialFrom={customFrom} initialTo={customTo} />");
    expect(home).toContain('aria-label="بداية النطاق المخصص"');
    expect(home).toContain("(summaryFetching || executiveFetching)");
    expect(home).toContain("تحديد صنف للمساعد");
    expect(component).toContain("trpc.inventory.analyze.useQuery");
    expect(component).toContain("initialFrom");
    expect(component).toContain("analysis.isFetching");
    expect(component).toContain("التقرير الشهري");
    expect(component).toContain("الأصناف الراكدة");
    expect(component).toContain("الأكثر مبيعًا");
    expect(component).toContain("XLSX.writeFile");
    expect(component).toContain("exportCsv");
    expect(component).toContain("exportPdf");
    expect(component).toContain("favoritePeriods");
    expect(component).toContain("حفظ النطاق المفضل");
    expect(coordinateImporter).toContain("سجل تغييرات إحداثيات الفروع");
    expect(coordinateImporter).toContain("coordinateAudit");
    expect(component).toContain("window.print()");
  });
});
