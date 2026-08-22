import type { Request, Response } from "express";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "./db";
import { sdk } from "./_core/sdk";
import { notifyOwner } from "./_core/notification";
import { auditLogs, branchFinancialSnapshots, branches, users, scheduledReportRecipients, scheduledReportDeliveries, notifications, tasks, qualityCases, maintenanceTickets, inventoryMovementSnapshots } from "../drizzle/schema";

export const MONTHLY_REPORT_RECIPIENT_ROLES = ["admin", "area_manager", "quality"] as const;

/** Daily idempotent inventory alert refresh for Heartbeat. */
export async function inventoryAlertsHandler(req: Request, res: Response) {
  const context = { url: req.originalUrl, timestamp: new Date().toISOString() };
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
    const db = await getDb();
    if (!db) return res.status(503).json({ error: "database-unavailable", context });
    const marker = `inventory-alerts:${new Date().toISOString().slice(0, 10)}`;
    const existingAudit = await db.select({ id: auditLogs.id }).from(auditLogs).where(eq(auditLogs.action, marker)).limit(1);
    if (existingAudit.length) return res.json({ ok: true, skipped: "already-refreshed", marker });
    const [rows, branchRows, recipients] = await Promise.all([
      db.select().from(inventoryMovementSnapshots),
      db.select({ id: branches.id, name: branches.name }).from(branches),
      db.select({ id: users.id }).from(users).where(inArray(users.role, ["admin", "area_manager"] as any)),
    ]);
    const branchNames = new Map(branchRows.map((branch) => [branch.id, branch.name]));
    const grouped = new Map<string, { itemName: string; branchId: number | null; available: number; sales: number }>();
    for (const row of rows) {
      const key = `${row.itemCode}|${row.costCenterCode}|${row.branchId ?? ""}`;
      const current = grouped.get(key) ?? { itemName: row.itemName, branchId: row.branchId, available: 0, sales: 0 };
      current.available += Number(row.availableQuantity ?? 0); current.sales += Number(row.salesQuantity ?? 0); grouped.set(key, current);
    }
    const alerts = Array.from(grouped.values()).filter((row) => (row.available > 0 && row.sales <= 0) || (row.available >= 0 && row.available <= 5 && row.sales > 0)).slice(0, 50);
    for (const row of alerts) {
      const stale = row.sales <= 0;
      const title = stale ? `صنف راكد: ${row.itemName}` : `مخزون منخفض: ${row.itemName}`;
      const content = `${row.branchId ? branchNames.get(row.branchId) ?? "فرع غير محدد" : "مركز غير محدد"} · المتاح ${row.available.toLocaleString("ar-SA")}${stale ? " · دون مبيعات" : ""}`;
      if (recipients.length) await db.insert(notifications).values(recipients.map((recipient) => ({ recipientId: recipient.id, kind: stale ? "inventory_stale" : "inventory_low", title, content, entityType: "inventory" })));
      await db.insert(tasks).values({ branchId: row.branchId, assigneeId: null, title: `متابعة ${title}`, priority: stale ? "medium" : "high", status: "todo" });
    }
    await db.insert(auditLogs).values({ actorId: user.id > 0 ? user.id : null, action: marker, entityType: "inventory_alert_refresh", afterData: JSON.stringify({ marker, alerts: alerts.length, taskUid: user.taskUid }) });
    return res.json({ ok: true, marker, alerts: alerts.length });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : String(error), context });
  }
}

async function resolveReportRecipients(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, taskUid: string, fallbackRoles: readonly string[]) {
  const configured = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role }).from(scheduledReportRecipients).innerJoin(users, eq(users.id, scheduledReportRecipients.recipientId)).where(eq(scheduledReportRecipients.taskUid, taskUid));
  const rows = configured.length ? configured : await db.select({ id: users.id, name: users.name, email: users.email, role: users.role }).from(users).where(inArray(users.role, fallbackRoles as any));
  return rows.map((recipient) => ({ id: recipient.id, name: recipient.name ?? recipient.email ?? `مستخدم ${recipient.id}`, email: recipient.email, role: recipient.role }));
}

async function notifyReportRecipients(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, taskUid: string, marker: string, recipients: Array<{ id: number }>, title: string, content: string) {
  let delivered = 0;
  let failed = 0;
  for (const recipient of recipients) {
    try {
      await db.insert(notifications).values({ recipientId: recipient.id, kind: "scheduled_report", title, content, entityType: "scheduled_report" });
      await db.insert(scheduledReportDeliveries).values({ taskUid, marker, recipientId: recipient.id, status: "delivered" });
      delivered += 1;
    } catch (error) {
      failed += 1;
      try {
        await db.insert(scheduledReportDeliveries).values({ taskUid, marker, recipientId: recipient.id, status: "failed", error: error instanceof Error ? error.message : String(error) });
      } catch (deliveryError) {
        console.error("[ScheduledReport] delivery audit failed", deliveryError);
      }
    }
  }
  return { delivered, failed };
}

export async function retryScheduledReportDelivery(input: { taskUid: string; marker: string; recipientId: number; actorId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const previousRows = await db.select().from(scheduledReportDeliveries).where(eq(scheduledReportDeliveries.taskUid, input.taskUid)).limit(500);
  const failed = previousRows.find((row) => row.marker === input.marker && row.recipientId === input.recipientId && row.status === "failed");
  if (!failed) throw new Error("لا يوجد تسليم فاشل مطابق لإعادة الإرسال");
  const recentRetry = previousRows.find((row) => row.recipientId === input.recipientId && row.marker.startsWith(`${input.marker}:retry:`) && Date.now() - new Date(row.deliveredAt).getTime() < 5 * 60 * 1000);
  if (recentRetry) return { ok: true, skipped: "recent-retry", deliveryId: recentRetry.id } as const;
  const recipient = (await db.select({ id: users.id, name: users.name, email: users.email, role: users.role }).from(users).where(eq(users.id, input.recipientId)).limit(1))[0];
  if (!recipient) throw new Error("المستلم غير موجود");
  const retryMarker = `${input.marker}:retry:${Date.now()}`.slice(0, 80);
  const title = "إعادة إرسال تقرير مجدول";
  const content = `إعادة إرسال يدوية من المسؤول\nالوظيفة: ${input.taskUid}\nالمرجع: ${input.marker}`;
  try {
    const notification = await db.insert(notifications).values({ recipientId: recipient.id, kind: "scheduled_report", title, content, entityType: "scheduled_report" });
    const inserted = await db.insert(scheduledReportDeliveries).values({ taskUid: input.taskUid, marker: retryMarker, recipientId: recipient.id, status: "delivered", notificationId: Number((notification as any).insertId ?? 0) || null });
    return { ok: true, deliveryId: Number((inserted as any).insertId ?? 0) || null, retryMarker } as const;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.insert(scheduledReportDeliveries).values({ taskUid: input.taskUid, marker: retryMarker, recipientId: recipient.id, status: "failed", error: message });
    throw error;
  }
}

export async function monthlyFinancialReportHandler(req: Request, res: Response) {
  const context = { url: req.originalUrl, timestamp: new Date().toISOString() };
  const startedAt = Date.now();
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

    const recipients = await resolveReportRecipients(db, user.taskUid, MONTHLY_REPORT_RECIPIENT_ROLES);
    const rows = await db.select({ branchId: branchFinancialSnapshots.branchId, branchName: branches.name, revenue: branchFinancialSnapshots.revenue, netProfit: branchFinancialSnapshots.netProfit }).from(branchFinancialSnapshots).leftJoin(branches, eq(branches.id, branchFinancialSnapshots.branchId));
    const periodRows = rows.filter(row => row.revenue !== null);
    const totalRevenue = periodRows.reduce((sum, row) => sum + Number(row.revenue ?? 0), 0);
    const totalProfit = periodRows.reduce((sum, row) => sum + Number(row.netProfit ?? 0), 0);
    const recipientLabel = recipients.length > 0 ? recipients.map((recipient) => `${recipient.name} (${recipient.role})`).join("، ") : "لا يوجد مسؤولون إداريون مسجلون";
    const content = `المستلمون الإداريون: ${recipientLabel}\nالفترة: ${year}-${String(month).padStart(2, "0")}\nعدد الفروع المسجلة: ${periodRows.length}\nإجمالي الإيرادات: ${totalRevenue.toFixed(2)}\nإجمالي صافي الربح: ${totalProfit.toFixed(2)}`;
    const delivered = await notifyOwner({ title: "التقرير المالي الشهري للفروع", content });
    const delivery = await notifyReportRecipients(db, user.taskUid, marker, recipients, "التقرير المالي الشهري للفروع", content);
    await db.insert(auditLogs).values({ actorId: user.id, entityType: "scheduled_report", action: "scheduled_report", afterData: JSON.stringify({ marker, delivered, taskUid: user.taskUid, latencyMs: Date.now() - startedAt, recipientIds: recipients.map((recipient) => recipient.id), recipientRoles: recipients.map((recipient) => recipient.role), delivery }) });
    return res.json({ ok: true, delivered, marker });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      await notifyOwner({ title: "فشل التقرير المالي الشهري", content: `تعذر تنفيذ التقرير المجدول ${marker}. السبب: ${message}` });
      if (db) await db.insert(auditLogs).values({ actorId, entityType: "scheduled_report", action: "scheduled_report_failed", afterData: JSON.stringify({ marker, delivered: false, error: message, latencyMs: Date.now() - startedAt, context }) });
    } catch (notificationError) {
      console.error("[ScheduledReport] failure notification failed", notificationError);
    }
    return res.status(500).json({ error: message, context });
  }
}

export async function commandUsageDigestHandler(req: Request, res: Response) {
  const context = { url: req.originalUrl, timestamp: new Date().toISOString() };
  const startedAt = Date.now();
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
    const recipients = await resolveReportRecipients(db, user.taskUid, ["admin", "area_manager"]);
    const delivered = await notifyOwner({ title: "ملخص استخدام أوامر مركز التشغيل", content });
    const delivery = await notifyReportRecipients(db, user.taskUid, marker, recipients, "ملخص استخدام أوامر مركز التشغيل", content);
    await db.insert(auditLogs).values({ actorId: user.id, entityType: "scheduled_report", action: "usage_digest", afterData: JSON.stringify({ marker, delivered, taskUid: user.taskUid, latencyMs: Date.now() - startedAt, recipientIds: recipients.map((recipient) => recipient.id), delivery, top }) });
    return res.json({ ok: true, delivered, marker, top });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try { await notifyOwner({ title: "فشل ملخص استخدام مركز التشغيل", content: `تعذر تنفيذ التقرير الدوري ${marker}. السبب: ${message}` }); if (db) await db.insert(auditLogs).values({ actorId, entityType: "scheduled_report", action: "usage_digest_failed", afterData: JSON.stringify({ marker, error: message, latencyMs: Date.now() - startedAt, context }) }); } catch (notificationError) { console.error("[UsageDigest] failure notification failed", notificationError); }
    return res.status(500).json({ error: message, context });
  }
}

export async function weeklyExecutiveDigestHandler(req: Request, res: Response) {
  const context = { url: req.originalUrl, timestamp: new Date().toISOString() };
  const startedAt = Date.now();
  let db: Awaited<ReturnType<typeof getDb>> = null;
  let actorId: number | undefined;
  let marker = "weekly-executive-digest:unknown";
  try {
    const user = await sdk.authenticateRequest(req);
    actorId = user.id;
    if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
    db = await getDb();
    if (!db) return res.status(503).json({ error: "database-unavailable", context });
    const now = new Date();
    const since = new Date(now.getTime() - 7 * 86400000);
    const previousSince = new Date(now.getTime() - 14 * 86400000);
    marker = `weekly-executive-digest:${now.toISOString().slice(0, 10)}`;
    const existing = await db.select({ afterData: auditLogs.afterData }).from(auditLogs).where(eq(auditLogs.action, "weekly_executive_digest"));
    if (existing.some((row) => row.afterData?.includes(marker))) return res.json({ ok: true, skipped: "already-sent", marker });
    const [taskRows, qualityRows, maintenanceRows] = await Promise.all([
      db.select({ branchId: tasks.branchId, branchName: branches.name, status: tasks.status, createdAt: tasks.createdAt }).from(tasks).leftJoin(branches, eq(branches.id, tasks.branchId)).limit(5000),
      db.select({ branchId: qualityCases.branchId, branchName: branches.name, status: qualityCases.status, createdAt: qualityCases.createdAt }).from(qualityCases).leftJoin(branches, eq(branches.id, qualityCases.branchId)).limit(5000),
      db.select({ branchId: maintenanceTickets.branchId, branchName: branches.name, status: maintenanceTickets.status, createdAt: maintenanceTickets.createdAt }).from(maintenanceTickets).leftJoin(branches, eq(branches.id, maintenanceTickets.branchId)).limit(5000),
    ]);
    const branchScores = new Map<number, { name: string; current: number; previous: number }>();
    const ensure = (branchId: number | null, branchName: string | null) => { if (branchId === null) return null; const row = branchScores.get(branchId) ?? { name: branchName ?? `فرع ${branchId}`, current: 0, previous: 0 }; branchScores.set(branchId, row); return row; };
    taskRows.forEach((row) => { const target = ensure(row.branchId, row.branchName); if (!target) return; const weight = row.status === "done" ? 2 : -1; if (row.createdAt >= since) target.current += weight; else if (row.createdAt >= previousSince) target.previous += weight; });
    qualityRows.forEach((row) => { const target = ensure(row.branchId, row.branchName); if (!target) return; const weight = row.status === "resolved" || row.status === "closed" ? 1 : -2; if (row.createdAt >= since) target.current += weight; else if (row.createdAt >= previousSince) target.previous += weight; });
    maintenanceRows.forEach((row) => { const target = ensure(row.branchId, row.branchName); if (!target) return; const weight = row.status === "resolved" || row.status === "closed" ? 1 : -2; if (row.createdAt >= since) target.current += weight; else if (row.createdAt >= previousSince) target.previous += weight; });
    const improved = Array.from(branchScores.values()).map((row) => ({ ...row, delta: row.current - row.previous })).filter((row) => row.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 5);
    const declined = Array.from(branchScores.values()).map((row) => ({ ...row, delta: row.current - row.previous })).filter((row) => row.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 5);
    const content = `الفترة: آخر 7 أيام مقارنة بالـ7 أيام السابقة\nالفروع المتحسنة: ${improved.map((row) => `${row.name} (${row.delta > 0 ? "+" : ""}${row.delta})`).join("، ") || "لا توجد بيانات كافية"}\nالفروع المتراجعة: ${declined.map((row) => `${row.name} (${row.delta})`).join("، ") || "لا توجد بيانات كافية"}`;
    const recipients = await resolveReportRecipients(db, user.taskUid, ["admin", "area_manager"]);
    const delivered = await notifyOwner({ title: "التقرير التنفيذي الأسبوعي للفروع", content });
    const delivery = await notifyReportRecipients(db, user.taskUid, marker, recipients, "التقرير التنفيذي الأسبوعي للفروع", content);
    await db.insert(auditLogs).values({ actorId, entityType: "scheduled_report", action: "weekly_executive_digest", afterData: JSON.stringify({ marker, taskUid: user.taskUid, delivered, delivery, improved, declined, latencyMs: Date.now() - startedAt }) });
    return res.json({ ok: true, marker, improved, declined, delivery });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try { await notifyOwner({ title: "فشل التقرير التنفيذي الأسبوعي", content: `تعذر تنفيذ التقرير الأسبوعي ${marker}. السبب: ${message}` }); if (db) await db.insert(auditLogs).values({ actorId, entityType: "scheduled_report", action: "weekly_executive_digest_failed", afterData: JSON.stringify({ marker, error: message, latencyMs: Date.now() - startedAt, context }) }); } catch (notificationError) { console.error("[WeeklyExecutiveDigest] failure notification failed", notificationError); }
    return res.status(500).json({ error: message, context });
  }
}

export async function retryCommandUsageDigest(actorId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const now = new Date();
  const marker = `command-usage-digest:${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const existing = await db.select({ afterData: auditLogs.afterData }).from(auditLogs).where(eq(auditLogs.action, "usage_digest"));
  if (existing.some((row) => row.afterData?.includes(marker))) return { ok: true, skipped: "already-sent", marker } as const;
  try {
    const since = new Date(now.getTime() - 30 * 86400000);
    const rows = await db.select().from(auditLogs).where(eq(auditLogs.entityType, "command_usage")).limit(2000);
    const counts = new Map<string, number>();
    rows.filter((row) => row.createdAt >= since).forEach((row) => { try { const command = JSON.parse(row.afterData ?? "{}").command ?? "غير محدد"; counts.set(command, (counts.get(command) ?? 0) + 1); } catch { counts.set("غير محدد", (counts.get("غير محدد") ?? 0) + 1); } });
    const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const content = `إعادة تشغيل يدوية من المسؤول\nالفترة: آخر 30 يومًا\nإجمالي الاستخدامات: ${rows.filter((row) => row.createdAt >= since).length}\nالأوامر الأكثر استعمالًا: ${top.map(([command, count]) => `${command} (${count})`).join("، ") || "لا توجد بيانات"}`;
    const delivered = await notifyOwner({ title: "إعادة تشغيل ملخص استخدام أوامر مركز التشغيل", content });
    await db.insert(auditLogs).values({ actorId, entityType: "scheduled_report", action: "usage_digest_retry", afterData: JSON.stringify({ marker, delivered, top }) });
    return { ok: true, marker, top } as const;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.insert(auditLogs).values({ actorId, entityType: "scheduled_report", action: "usage_digest_failed", afterData: JSON.stringify({ marker, error: message, source: "manual_retry" }) });
    await notifyOwner({ title: "فشل إعادة تشغيل ملخص الاستخدام", content: `تعذر تنفيذ إعادة المحاولة ${marker}. السبب: ${message}` });
    throw error;
  }
}

export const scheduledHandlers = { monthlyFinancialReportHandler, commandUsageDigestHandler, weeklyExecutiveDigestHandler };

void scheduledHandlers;

// The scheduled callback is mounted explicitly in server/_core/index.ts.
// Job creation must happen only after the site is deployed and the callback URL is reachable.
void branchFinancialSnapshots;
void branches;
