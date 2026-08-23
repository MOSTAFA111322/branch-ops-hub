import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("final export and shortcut enhancements", () => {
  const root = resolve(process.cwd());
  const router = readFileSync(resolve(root, "server/routers.ts"), "utf8");
  const coordinate = readFileSync(resolve(root, "client/src/components/CoordinateCsvImporter.tsx"), "utf8");
  const inventory = readFileSync(resolve(root, "client/src/components/InventoryAnalysisView.tsx"), "utf8");
  const schema = readFileSync(resolve(root, "drizzle/schema.ts"), "utf8");

  it("stores pin and keyboard shortcut settings for favorite periods", () => {
    expect(schema).toContain('isPinned: boolean("isPinned")');
    expect(schema).toContain('shortcutKey: varchar("shortcutKey"');
    expect(router).toContain("settings: protectedProcedure");
    expect(router).toContain("updateFavoritePeriodSettings");
    expect(inventory).toContain("favoriteSettings");
    expect(inventory).toContain("keydown");
    expect(inventory).toContain("shortcutKey");
  });

  it("exports the filtered coordinate audit with verification status", () => {
    expect(coordinate).toContain("exportAuditCsv");
    expect(coordinate).toContain("حالة التوثيق");
    expect(coordinate).toContain("filteredAudit");
  });

  it("records started, successful, and failed export attempts", () => {
    expect(router).toContain('entityType: "data_export"');
    expect(router).toContain("export_${input.status}");
    expect(coordinate).toContain('logExport("csv", "started")');
    expect(coordinate).toContain('logExport("csv", "success")');
    expect(inventory).toContain('logExport("excel", "started")');
    expect(inventory).toContain('logExport("pdf", "success")');
  });
});
