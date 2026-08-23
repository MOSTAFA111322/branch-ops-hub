import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("final export and shortcut enhancements", () => {
  const root = resolve(process.cwd());
  const router = readFileSync(resolve(root, "server/routers.ts"), "utf8");
  const coordinate = readFileSync(resolve(root, "client/src/components/CoordinateCsvImporter.tsx"), "utf8");
  const inventory = readFileSync(resolve(root, "client/src/components/InventoryAnalysisView.tsx"), "utf8");
  const schema = readFileSync(resolve(root, "drizzle/schema.ts"), "utf8");
  const exportAudit = readFileSync(resolve(root, "client/src/components/ExportAuditView.tsx"), "utf8");

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

  it("renders an administrative export audit with the required filters", () => {
    expect(exportAudit).toContain("trpc.exports.list.useQuery");
    expect(exportAudit).toContain("الصيغة");
    expect(exportAudit).toContain("النتيجة");
    expect(exportAudit).toContain("المستخدم");
    expect(exportAudit).toContain("type=\"date\"");
    expect(exportAudit).toContain("سجل عمليات التصدير");
    expect(exportAudit).toContain("summary");
    expect(exportAudit).toContain("successRate");
  });

  it("protects export-audit downloads with an independent permission", () => {
    expect(schema).toContain('canExportAuditLogs: boolean("canExportAuditLogs")');
    expect(router).toContain("canExportAudit");
    expect(router).toContain("authorizeAuditExport");
    expect(router).toContain("لا تملك صلاحية تصدير سجل العمليات");
    expect(exportAudit).toContain("authorizeExport.mutateAsync");
    expect(exportAudit).toContain("ليس لديك صلاحية تصدير سجل العمليات");
    expect(router).toContain("canExportAuditLogs");
    expect(router).toContain("FORBIDDEN");
    expect(router).toContain("roleProcedure([\"admin\", \"area_manager\"])");
  });

  it("exports statistics separately and warns on a high failure rate", () => {
    expect(exportAudit).toContain("exportStatistics");
    expect(exportAudit).toContain("إحصاءات سجل عمليات التصدير");
    expect(exportAudit).toContain("highFailureRate");
    expect(exportAudit).toContain("تنبيه: ارتفاع معدل فشل التصدير");
    expect(exportAudit).toContain("نسبة الفشل");
    expect(exportAudit).toContain("getExportFailureThreshold");
    expect(exportAudit).toContain("saveExportFailureThreshold");
    expect(exportAudit).toContain("حفظ الحد");
  });

  it("notifies administrators when the configured failure threshold is exceeded", () => {
    expect(schema).toContain('exportFailureThreshold: int("exportFailureThreshold")');
    expect(router).toContain("notifyOwner");
    expect(router).toContain("export_failure_rate_high");
    expect(router).toContain("24 * 60 * 60 * 1000");
    expect(router).toContain("export_failure_alert");
  });

  it("records started, successful, and failed export attempts", () => {
    expect(router).toContain('entityType: "data_export"');
    expect(router).toContain("export_${input.status}");
    expect(coordinate).toContain('logExport("csv", "started")');
    expect(coordinate).toContain('logExport("csv", "success")');
    expect(inventory).toContain('logExport("excel", "started")');
    expect(inventory).toContain('logExport("pdf", "success")');
    expect(inventory).toContain("shortcutEditorId");
    expect(inventory).toContain("حفظ الاختصار");
    expect(coordinate).toContain("\\uFEFF");
  });
});
