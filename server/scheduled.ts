import type { Request, Response } from "express";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "./db";
import { sdk } from "./_core/sdk";
import { notifyOwner } from "./_core/notification";
import { auditLogs, branchFinancialSnapshots, branches, users } from "../drizzle/schema";

export const MONTHLY_REPORT_RECIPIENT_ROLES = ["admin", "area_manager", "quality"] as const;

export async function monthlyFinancialReportHandler(req: Request, res: Response) {
  const context = { url: req.originalUrl, timestamp: new Date().toISOString() };
  let db: Awaited<ReturnType<typeof getDb>> = null;
  let actorId: number | undefined;
  let marker = "monthly-financial-report:unknown";
  try {
    const user = await sdk.authenticateRequest(req);
    actorId = user.id;
    if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
    db = await getDb();
    if (!db) return res.status(503).json({ error: "database-unavailable", context });

    const previous = new Date();
    previous.setUTCDate(1);
    previous.setUTCMonth(previous.getUTCMonth() - 1);
    const year = previous.getUTCFullYear();
    const month = previous.getUTCMonth() + 1;
    marker = `monthly-financial-report:${year}-${String(month).padStart(2, "0")}`;
    const auditRows = await db.select({ afterData: auditLogs.afterData }).from(auditLogs).where(eq(auditLogs.action, "scheduled_report"));
    if (auditRows.some(row => row.afterData?.includes(marker))) return res.json({ ok: true, skipped: "already-sent", marker });

    const recipientRows = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role }).from(users).where(inArray(users.role, MONTHLY_REPORT_RECIPIENT_ROLES));
    const recipients = recipientRows.map((recipient) => ({ id: recipient.id, name: recipient.name ?? recipient.email ?? `مستخدم ${recipient.id}`, email: recipient.email, role: recipient.role }));
    const rows = await db.select({ branchId: branchFinancialSnapshots.branchId, branchName: branches.name, revenue: branchFinancialSnapshots.revenue, netProfit: branchFinancialSnapshots.netProfit }).from(branchFinancialSnapshots).leftJoin(branches, eq(branches.id, branchFinancialSnapshots.branchId));
    const periodRows = rows.filter(row => row.revenue !== null);
    const totalRevenue = periodRows.reduce((sum, row) => sum + Number(row.revenue ?? 0), 0);
    const totalProfit = periodRows.reduce((sum, row) => sum + Number(row.netProfit ?? 0), 0);
    const recipientLabel = recipients.length > 0 ? recipients.map((recipient) => `${recipient.name} (${recipient.role})`).join("، ") : "لا يوجد مسؤولون إداريون مسجلون";
    const content = `المستلمون الإداريون: ${recipientLabel}\nالفترة: ${year}-${String(month).padStart(2, "0")}\nعدد الفروع المسجلة: ${periodRows.length}\nإجمالي الإيرادات: ${totalRevenue.toFixed(2)}\nإجمالي صافي الربح: ${totalProfit.toFixed(2)}`;
    const delivered = await notifyOwner({ title: "التقرير المالي الشهري للفروع", content });
    await db.insert(auditLogs).values({ actorId: user.id, entityType: "scheduled_report", action: "scheduled_report", afterData: JSON.stringify({ marker, delivered, taskUid: user.taskUid, recipientIds: recipients.map((recipient) => recipient.id), recipientRoles: recipients.map((recipient) => recipient.role) }) });
    return res.json({ ok: true, delivered, marker });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      await notifyOwner({ title: "فشل التقرير المالي الشهري", content: `تعذر تنفيذ التقرير المجدول ${marker}. السبب: ${message}` });
      if (db) await db.insert(auditLogs).values({ actorId, entityType: "scheduled_report", action: "scheduled_report_failed", afterData: JSON.stringify({ marker, delivered: false, error: message, context }) });
    } catch (notificationError) {
      console.error("[ScheduledReport] failure notification failed", notificationError);
    }
    return res.status(500).json({ error: message, context });
  }
}

export async function commandUsageDigestHandler(req: Request, res: Response) {
  const context = { url: req.originalUrl, timestamp: new Date().toISOString() };
  let db: Awaited<ReturnType<typeof getDb>> = null;
  let actorId: number | undefined;
  let marker = "command-usage-digest:unknown";
  try {
    const user = await sdk.authenticateRequest(req);
    actorId = user.id;
    if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
    db = await getDb();
    if (!db) return res.status(503).json({ error: "database-unavailable", context });
    const now = new Date();
    marker = `command-usage-digest:${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const existing = await db.select({ afterData: auditLogs.afterData }).from(auditLogs).where(eq(auditLogs.action, "usage_digest"));
    if (existing.some(row => row.afterData?.includes(marker))) return res.json({ ok: true, skipped: "already-sent", marker });
    const since = new Date(now.getTime() - 30 * 86400000);
    const rows = await db.select().from(auditLogs).where(eq(auditLogs.entityType, "command_usage")).limit(2000);
    const counts = new Map<string, number>();
    rows.filter(row => row.createdAt >= since).forEach(row => { try { const command = JSON.parse(row.afterData ?? "{}").command ?? "غير محدد"; counts.set(command, (counts.get(command) ?? 0) + 1); } catch { counts.set("غير محدد", (counts.get("غير محدد") ?? 0) + 1); } });
    const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const content = `الفترة: آخر 30 يومًا\nإجمالي الاستخدامات: ${rows.filter(row => row.createdAt >= since).length}\nالأوامر الأكثر استعمالًا: ${top.map(([command, count]) => `${command} (${count})`).join("، ") || "لا توجد بيانات"}`;
    const delivered = await notifyOwner({ title: "ملخص استخدام أوامر مركز التشغيل", content });
    await db.insert(auditLogs).values({ actorId: user.id, entityType: "scheduled_report", action: "usage_digest", afterData: JSON.stringify({ marker, delivered, taskUid: user.taskUid, top }) });
    return res.json({ ok: true, delivered, marker, top });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try { await notifyOwner({ title: "فشل ملخص استخدام مركز التشغيل", content: `تعذر تنفيذ التقرير الدوري ${marker}. السبب: ${message}` }); if (db) await db.insert(auditLogs).values({ actorId, entityType: "scheduled_report", action: "usage_digest_failed", afterData: JSON.stringify({ marker, error: message, context }) }); } catch (notificationError) { console.error("[UsageDigest] failure notification failed", notificationError); }
    return res.status(500).json({ error: message, context });
  }
}

export const scheduledHandlers = { monthlyFinancialReportHandler, commandUsageDigestHandler };

void scheduledHandlers;

// The scheduled callback is mounted explicitly in server/_core/index.ts.
// Job creation must happen only after the site is deployed and the callback URL is reachable.
void branchFinancialSnapshots;
void branches;
