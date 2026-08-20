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

  it("renders accessible health and operational empty/loading states", () => {
    expect(scheduledView).toContain('aria-labelledby="scheduled-health-title"');
    expect(scheduledView).toContain('role="status"');
    expect(home).toContain('aria-live="polite"');
    expect(home).toContain('aria-live="assertive"');
  });
});
