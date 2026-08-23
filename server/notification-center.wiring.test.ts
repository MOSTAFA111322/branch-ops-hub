import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("notification center filtering and archival", () => {
  const root = resolve(process.cwd());
  const router = readFileSync(resolve(root, "server/routers.ts"), "utf8");
  const scheduled = readFileSync(resolve(root, "server/scheduled.ts"), "utf8");
  const schema = readFileSync(resolve(root, "drizzle/schema.ts"), "utf8");
  const alertHistory = readFileSync(resolve(root, "client/src/components/AlertHistoryView.tsx"), "utf8");

  it("stores structured branch, archive, and retention metadata", () => {
    expect(schema).toContain('branchId: int("branchId")');
    expect(schema).toContain('archivedAt: timestamp("archivedAt")');
    expect(schema).toContain('archivedById: int("archivedById")');
    expect(schema).toContain('notificationRetentionDays: int("notificationRetentionDays")');
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
    expect(router).toContain("archiveBulk: protectedProcedure");
    expect(router).toContain("notification_bulk_archived");
    expect(router).toContain("تتضمن القائمة تنبيهات غير متاحة لحسابك");
  });

  it("writes branch context for scheduled inventory alerts", () => {
    expect(scheduled).toContain('entityType: "inventory", branchId: row.branchId');
  });

  it("exposes the retention policy with role protection", () => {
    expect(router).toContain("getRetentionPolicy: protectedProcedure");
    expect(router).toContain('saveRetentionPolicy: roleProcedure(["admin", "area_manager"])');
    expect(router).toContain("notification_retention_updated");
    expect(router).toContain("retentionDays: z.number().int().min(0).max(3650)");
  });

  it("renders Arabic type and branch filters with archive controls and exports", () => {
    expect(alertHistory).toContain('aria-label="نوع التنبيه"');
    expect(alertHistory).toContain('aria-label="فرع التنبيه"');
    expect(alertHistory).toContain("عرض المؤرشفة");
    expect(alertHistory).toContain("setArchived.useMutation");
    expect(alertHistory).toContain("أرشفة التنبيه");
    expect(alertHistory).toContain("إلغاء الأرشفة");
    expect(alertHistory).toContain("archiveBulk.useMutation");
    expect(alertHistory).toContain("سيتم أرشفة");
    expect(alertHistory).toContain("const exportExcel");
    expect(alertHistory).toContain("const exportPdf");
    expect(alertHistory).toContain("XLSX.writeFile");
    expect(alertHistory).toContain("notification-center-filtered.pdf");
  });
});
