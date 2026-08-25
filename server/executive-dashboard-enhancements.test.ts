import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd());

describe("executive dashboard enhancements", () => {
  it("provides direct Excel and PDF export controls with chart capture", () => {
    const source = readFileSync(resolve(root, "client/src/components/ExecutiveDashboardExport.tsx"), "utf8");
    expect(source).toContain("XLSX.writeFile");
    expect(source).toContain("html2canvas");
    expect(source).toContain("pdf.save");
    expect(source).toContain("الاتجاه الشهري");
  });

  it("provides a persisted theme toggle through the existing theme provider", () => {
    const source = readFileSync(resolve(root, "client/src/components/ExecutiveDashboardExport.tsx"), "utf8");
    expect(source).toContain("useTheme");
    expect(source).toContain("toggleTheme");
    expect(source).toContain("الوضع الليلي");
  });

  it("reports Excel parsing progress and detailed column matching failures", () => {
    const source = readFileSync(resolve(root, "client/src/components/BackupRestoreManager.tsx"), "utf8");
    expect(source).toContain("excelProgress");
    expect(source).toContain("الأعمدة غير المطابقة");
    expect(source).toContain("جاري تحليل ملف Excel ومطابقة الأعمدة");
    expect(source).toContain("التراكمي وأرصدة الفترات السابقة");
  });
});
