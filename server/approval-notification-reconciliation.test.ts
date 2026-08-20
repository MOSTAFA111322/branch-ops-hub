import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("إضافات الاعتماد والإشعارات", () => {
  const root = resolve(process.cwd());

  it("تحتوي عقود الخادم على مسارات الإشعارات واعتماد التقرير", () => {
    const source = readFileSync(resolve(root, "server/routers.ts"), "utf8");
    expect(source).toMatch(/notifications:\s*router\(\{/);
    expect(source).toMatch(/reportApprovals:\s*router\(\{/);
  });

  it("تحتوي الواجهة على رفع Excel واعتماد التقرير ومركز الإشعارات", () => {
    const home = readFileSync(resolve(root, "client/src/pages/Home.tsx"), "utf8");
    const reconciliation = readFileSync(resolve(root, "client/src/components/BranchDataReconciliation.tsx"), "utf8");
    const approval = readFileSync(resolve(root, "client/src/components/ReportApprovalView.tsx"), "utf8");
    const alerts = readFileSync(resolve(root, "client/src/components/AlertHistoryView.tsx"), "utf8");
    expect(home).toMatch(/BranchDataReconciliation/);
    expect(reconciliation).toMatch(/Excel|xlsx/i);
    expect(approval).toMatch(/approve|اعتماد/i);
    expect(alerts).toMatch(/markRead|مقروء/i);
  });
});
