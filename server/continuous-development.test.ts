import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const routers = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const scheduled = readFileSync(new URL("./scheduled.ts", import.meta.url), "utf8");
const home = readFileSync(new URL("../client/src/pages/Home.tsx", import.meta.url), "utf8");
const scheduledView = readFileSync(new URL("../client/src/components/ScheduledReportsView.tsx", import.meta.url), "utf8");

describe("continuous development pack wiring", () => {
  it("exposes scheduled health metrics from audited execution records", () => {
    expect(routers).toContain("successRate");
    expect(routers).toContain("averageLatencyMs");
    expect(routers).toContain("successCount");
    expect(routers).toContain("failureCount");
    expect(routers).toContain("warningReasons");
    expect(routers).toContain("متوسط زمن التنفيذ تجاوز 30 ثانية");
    expect(readFileSync(new URL("./db.ts", import.meta.url), "utf8")).toContain("operationalSummary");
  });

  it("records execution latency for both scheduled handlers", () => {
    expect(scheduled).toContain("const startedAt = Date.now()");
    expect(scheduled.match(/latencyMs: Date\.now\(\) - startedAt/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("keeps the usage comparison export tied to the visible filters and report", () => {
    expect(home).toContain("downloadUsageComparisonExcel");
    expect(home).toContain("ملخص المقارنة");
    expect(home).toContain("usageReport?.comparison?.previous");
    expect(home).toContain("usageSurface");
  });

  it("keeps operational Excel export tied to the selected period and region", () => {
    expect(home).toContain("downloadOperationalComparisonExcel");
    expect(home).toContain("تقرير-المقارنة-التشغيلية.xlsx");
    expect(home).toContain("executiveRegionId");
    expect(home).toContain("الاتجاه المالي");
  });

  it("exposes temporal operational comparison for quality and maintenance", () => {
    const db = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
    expect(db).toContain("previousOperationalSummary");
    expect(db).toContain("operationalComparison");
    expect(db).toContain("qualityOpen");
    expect(db).toContain("maintenanceOpen");
    expect(home).toContain("التغير مقابل الفترة السابقة");
    expect(home).toContain("الحالي");
    expect(home).toContain("السابق");
  });

  it("renders accessible health and operational empty/loading states", () => {
    expect(scheduledView).toContain('aria-labelledby="scheduled-health-title"');
    expect(scheduledView).toContain("تنبيه مبكر للمراجعة");
    expect(scheduledView).toContain('role="alert"');
    expect(scheduledView).toContain('role="status"');
    expect(home).toContain('aria-live="polite"');
    expect(home).toContain('aria-live="assertive"');
    expect(home).toContain("مقارنة تشغيلية");
    expect(home).toContain("الجودة والصيانة خلال الفترة");
  });

  it("exposes admin monitoring controls for warning sensitivity and refresh cadence", () => {
    expect(scheduledView).toContain("إعدادات المراقبة الإدارية");
    expect(scheduledView).toContain("warningFailureRate");
    expect(scheduledView).toContain("warningLatencyMs");
    expect(scheduledView).toContain("healthRefreshSeconds");
    expect(scheduledView).toContain("scheduled-report-settings");
  });

  it("wires scheduled report recipients to protected admin contracts", () => {
    expect(routers).toContain("scheduledReportRecipients");
    expect(routers).toContain("saveRecipients");
    expect(routers).toContain("recipients_updated");
    expect(scheduled).toContain("resolveReportRecipients");
    expect(scheduled).toContain("notifyReportRecipients");
    expect(scheduled).toContain('kind: "scheduled_report"');
    expect(scheduledView).toContain("مستلمو التقارير المجدولة");
    expect(scheduledView).toContain("حفظ المستلمين");
  });
});
