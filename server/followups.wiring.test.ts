import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("admin follow-up features wiring", () => {
  const router = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
  const accounts = readFileSync(resolve(process.cwd(), "client/src/components/UserAccountManager.tsx"), "utf8");
  const demo = readFileSync(resolve(process.cwd(), "client/src/components/DemoDataControls.tsx"), "utf8");
  const coordinates = readFileSync(resolve(process.cwd(), "client/src/components/CoordinateCsvImporter.tsx"), "utf8");

  it("guards bulk TEST_DATA purge to admins and audits it", () => {
    expect(router).toContain("purgeDemoData:");
    expect(router).toContain('roleProcedure(["admin"])');
    expect(router).toContain('entityType: "financial_demo_data"');
    expect(demo).toContain("purgeDemoData");
    expect(demo).toContain("AlertDialog");
  });

  it("exports account status audit history to an xlsx workbook", () => {
    expect(accounts).toContain('import * as XLSX from "xlsx"');
    expect(accounts).toContain("exportStatusHistory");
    expect(accounts).toContain("سجل-حالة-الحسابات");
  });

  it("keeps CSV header differences non-blocking while preserving validation", () => {
    expect(coordinates).toContain("warnings");
    expect(coordinates).toContain("عناوين الأعمدة تختلف عن قالب CSV");
    expect(coordinates).toContain("mapped.includes(\"latitude\")");
    expect(coordinates).toContain('role="status"');
  });
});
