import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("executive improvements wiring", () => {
  it("supports assigning tasks and recording reassignment audits", () => {
    const source = readFileSync(join(process.cwd(), "server/routers.ts"), "utf8");
    expect(source).toContain('assigneeId: z.number().int().positive().optional()');
    expect(source).toContain('const canAssign = ctx.user.role === "admin" || ctx.user.role === "area_manager"');
    expect(source).toContain('action: input.assigneeId !== undefined && input.assigneeId !== task.assigneeId ? "reassign" : "update"');
  });

  it("renders monthly executive trends and scheduled failure notification wiring", () => {
    const client = readFileSync(join(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
    const scheduled = readFileSync(join(process.cwd(), "server/scheduled.ts"), "utf8");
    expect(client).toContain("اتجاه الإدارة العليا");
    expect(client).toContain("financialTrend");
    expect(scheduled).toContain("scheduled_report_failed");
    expect(scheduled).toContain("فشل التقرير المالي الشهري");
  });
});
