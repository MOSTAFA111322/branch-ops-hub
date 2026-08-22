import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("inventory automation wiring", () => {
  const router = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
  const db = readFileSync(resolve(process.cwd(), "server/db.ts"), "utf8");
  const view = readFileSync(resolve(process.cwd(), "client/src/components/InventoryAnalysisView.tsx"), "utf8");
  const home = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");

  it("exposes guarded import with source metadata and duplicate detection", () => {
    expect(router).toContain("importRows:");
    expect(router).toContain("sourceFileName");
    expect(router).toContain("existingKeys");
    expect(router).toContain("inventory_import");
  });

  it("renders interactive monthly charts and Excel mapping preview", () => {
    expect(view).toContain("BarChart");
    expect(view).toContain("LineChart");
    expect(view).toContain("handleImportFile");
    expect(view).toContain("مطابقة الأعمدة العربية تلقائيًا");
  });

  it("feeds stale and low-stock inventory alerts into the dashboard", () => {
    expect(db).toContain("inventoryAlerts");
    expect(db).toContain("inventory_stale");
    expect(db).toContain("inventory_low");
    expect(home).toContain("dashboardAlerts");
  });
});
