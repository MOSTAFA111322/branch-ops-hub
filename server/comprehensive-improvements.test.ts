import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd(), "client", "src");

describe("حزمة التحسينات الشاملة", () => {
  it("تربط مطابقة بيانات الفروع ومركز التنبيهات بالواجهة", () => {
    const home = readFileSync(join(root, "pages/Home.tsx"), "utf8");
    expect(readFileSync(join(root, "components/BranchDataReconciliation.tsx"), "utf8")).toContain("مراجعة بيانات الفروع من Excel");
    expect(readFileSync(join(root, "components/AlertHistoryView.tsx"), "utf8")).toContain("غير مقروء");
    expect(home).toContain("سجل التنبيهات");
    expect(home).toContain("BranchDataReconciliation");
  });

  it("يحافظ على قالب التقرير الرسمي عند الطباعة", () => {
    const css = readFileSync(join(root, "index.css"), "utf8");
    expect(css).toContain("مركز متابعة وتحسين الفروع — التقرير الشهري للإدارة");
    expect(css).toContain(".printable-report::after");
  });
});
