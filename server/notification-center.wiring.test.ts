import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("notification center filtering and archival", () => {
  const root = resolve(process.cwd());
  const router = readFileSync(resolve(root, "server/routers.ts"), "utf8");
  const scheduled = readFileSync(resolve(root, "server/scheduled.ts"), "utf8");
  const schema = readFileSync(resolve(root, "drizzle/schema.ts"), "utf8");
  const alertHistory = readFileSync(resolve(root, "client/src/components/AlertHistoryView.tsx"), "utf8");

  it("stores structured branch and archive metadata on notifications", () => {
    expect(schema).toContain('branchId: int("branchId")');
    expect(schema).toContain('archivedAt: timestamp("archivedAt")');
    expect(schema).toContain('archivedById: int("archivedById")');
  });

  it("exposes protected type, branch, and archived filters", () => {
    expect(router).toContain("kind: z.string().trim().min(1).max(80).optional()");
    expect(router).toContain("branchId: z.number().int().positive().optional()");
    expect(router).toContain("includeArchived: z.boolean().default(false)");
    expect(router).toContain("isNull(notifications.archivedAt)");
    expect(router).toContain("لا تملك صلاحية عرض تنبيهات هذا الفرع");
  });

  it("archives only the recipient notification and records an audit event", () => {
    expect(router).toContain("setArchived: protectedProcedure");
    expect(router).toContain("eq(notifications.recipientId, ctx.user.id)");
    expect(router).toContain("notification_archived");
    expect(router).toContain("notification_unarchived");
    expect(router).toContain('entityType: "notification"');
    expect(router).toContain("archivedById");
  });

  it("writes branch context for scheduled inventory alerts", () => {
    expect(scheduled).toContain('entityType: "inventory", branchId: row.branchId');
  });

  it("renders Arabic type and branch filters with archive controls", () => {
    expect(alertHistory).toContain('aria-label="نوع التنبيه"');
    expect(alertHistory).toContain('aria-label="فرع التنبيه"');
    expect(alertHistory).toContain("عرض المؤرشفة");
    expect(alertHistory).toContain("setArchived.useMutation");
    expect(alertHistory).toContain("أرشفة التنبيه");
    expect(alertHistory).toContain("إلغاء الأرشفة");
  });
});
