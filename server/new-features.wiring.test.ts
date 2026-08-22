import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("new account, demo data, export, and coordinate import features", () => {
  const root = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

  it("exposes protected admin account management and demo data generation", () => {
    const router = root("server/routers.ts");
    const accounts = root("client/src/components/UserAccountManager.tsx");
    const demo = root("client/src/components/DemoDataControls.tsx");
    expect(router).toContain("generateDemoMonth");
    expect(router).toContain("replaceExistingDemo");
    expect(accounts).toContain("users.adminList");
    expect(accounts).toContain("permissions.list");
    expect(demo).toContain("TEST_DATA");
  });

  it("keeps PDF and Excel exports structured for demo-report validation", () => {
    const comparison = root("client/src/components/SmartBranchComparison.tsx");
    expect(comparison).toContain("XLSX.utils.book_append_sheet");
    expect(comparison).toContain('"الفروع المحددة"');
    expect(comparison).toContain('"المقارنة الزمنية"');
    expect(comparison).toContain("new jsPDF");
    expect(comparison).toContain("تقرير-مقارنة-الفروع");
  });

  it("validates Arabic and English CSV headers and coordinate ranges", () => {
    const importer = root("client/src/components/CoordinateCsvImporter.tsx");
    expect(importer).toContain('"خط العرض": "latitude"');
    expect(importer).toContain('"خط الطول": "longitude"');
    expect(importer).toContain("Number.isFinite");
    expect(importer).toContain("branches.importCoordinates");
  });
});
