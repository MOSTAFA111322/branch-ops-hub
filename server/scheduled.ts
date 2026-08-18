import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { sdk } from "./_core/sdk";
import { notifyOwner } from "./_core/notification";
import { auditLogs, branchFinancialSnapshots, branches } from "../drizzle/schema";

export async function monthlyFinancialReportHandler(req: Request, res: Response) {
  const context = { url: req.originalUrl, timestamp: new Date().toISOString() };
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
    const db = await getDb();
    if (!db) return res.status(503).json({ error: "database-unavailable", context });

    const previous = new Date();
    previous.setUTCDate(1);
    previous.setUTCMonth(previous.getUTCMonth() - 1);
    const year = previous.getUTCFullYear();
    const month = previous.getUTCMonth() + 1;
    const marker = `monthly-financial-report:${year}-${String(month).padStart(2, "0")}`;
    const auditRows = await db.select({ afterData: auditLogs.afterData }).from(auditLogs).where(eq(auditLogs.action, "scheduled_report"));
    if (auditRows.some(row => row.afterData?.includes(marker))) return res.json({ ok: true, skipped: "already-sent", marker });

    const rows = await db.select({ branchId: branchFinancialSnapshots.branchId, branchName: branches.name, revenue: branchFinancialSnapshots.revenue, netProfit: branchFinancialSnapshots.netProfit }).from(branchFinancialSnapshots).leftJoin(branches, eq(branches.id, branchFinancialSnapshots.branchId));
    const periodRows = rows.filter(row => row.revenue !== null);
    const totalRevenue = periodRows.reduce((sum, row) => sum + Number(row.revenue ?? 0), 0);
    const totalProfit = periodRows.reduce((sum, row) => sum + Number(row.netProfit ?? 0), 0);
    const content = `الفترة: ${year}-${String(month).padStart(2, "0")}\nعدد الفروع المسجلة: ${periodRows.length}\nإجمالي الإيرادات: ${totalRevenue.toFixed(2)}\nإجمالي صافي الربح: ${totalProfit.toFixed(2)}`;
    const delivered = await notifyOwner({ title: "التقرير المالي الشهري للفروع", content });
    await db.insert(auditLogs).values({ actorId: user.id, entityType: "scheduled_report", action: "scheduled_report", afterData: JSON.stringify({ marker, delivered, taskUid: user.taskUid }) });
    return res.json({ ok: true, delivered, marker });
  } catch (error) {
    return res.status(500).json({ error: String(error), stack: error instanceof Error ? error.stack : undefined, context });
  }
}

export const scheduledHandlers = { monthlyFinancialReportHandler };

void scheduledHandlers;

// The scheduled callback is mounted explicitly in server/_core/index.ts.
// Job creation must happen only after the site is deployed and the callback URL is reachable.
void branchFinancialSnapshots;
void branches;
