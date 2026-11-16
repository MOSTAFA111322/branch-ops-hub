import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const home = readFileSync(resolve(root, "client/src/pages/Home.tsx"), "utf8");
const report = readFileSync(resolve(root, "client/src/components/FinalAcceptanceReportView.tsx"), "utf8");
const router = readFileSync(resolve(root, "server/routers.ts"), "utf8");

describe("final acceptance report wiring", () => {
  it("exposes the report only to admins in navigation", () => {
    expect(home).toContain("تقرير القبول النهائي");
    expect(home).toContain('return role === "admin";');
    expect(home).toContain("<FinalAcceptanceReportView />");
  });

  it("uses live protected procedures and provides print and PDF export", () => {
    expect(report).toContain("trpc.dashboard.summary.useQuery");
    expect(report).toContain("trpc.ops.overview.useQuery");
    expect(report).toContain("trpc.users.adminList.useQuery");
    expect(report).toContain("trpc.permissions.list.useQuery");
    expect(report).toContain("window.print()");
    expect(report).toContain("exportAcceptancePdf");
    expect(report).toContain("doc.save(");
    expect(report).not.toContain("passwordHash");
  });

  it("shows the financial manager pending-request panel and approval feedback", () => {
    expect(home).toContain("طلبات الصرف بانتظار الاعتماد");
    expect(home).toContain("pendingRequestRows");
    expect(home).toContain("تم اعتماد طلب الصرف بنجاح");
    expect(home).toContain("تم رفض طلب الصرف");
    expect(home).toContain("جارٍ تحديث الحالة");
    expect(home).toContain("animate-spin");
  });

  it("keeps financial manager role in the local account contract", () => {
    expect(router).toContain('"financial_manager"');
    expect(router).toContain("updateStatus:");
  });
});
