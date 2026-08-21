import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, roleProcedure, router } from "./_core/trpc";
import { listHeartbeatJobs, updateHeartbeatJob } from "./_core/heartbeat";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getBranchById, getBranchProfile, getDashboardSummary, getOperationsOverview, listBranches, getDb } from "./db";
import { retryCommandUsageDigest, retryScheduledReportDelivery } from "./scheduled";
import { branches, regions, branchAssets, branchFinancialSnapshots, checklistItems, checklistTemplates, correctiveActions, dashboardPreferences, documentVersions, documents, internalRequests, maintenanceTickets, qualityCases, tasks, users, visitChecklistResults, visits, auditLogs, notifications, reportApprovals, scheduledReportRecipients, scheduledReportDeliveries, costCenterMappings } from "../drizzle/schema";

async function recordAudit(db: any, input: { actorId?: number; branchId?: number; entityType: string; entityId?: number; action: string; beforeData?: unknown; afterData?: unknown }) {
  await db.insert(auditLogs).values({
    actorId: input.actorId,
    branchId: input.branchId,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    beforeData: input.beforeData === undefined ? undefined : JSON.stringify(input.beforeData),
    afterData: input.afterData === undefined ? undefined : JSON.stringify(input.afterData),
  });
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  dashboard: router({
    summary: protectedProcedure.query(({ ctx }) => getDashboardSummary(ctx.user)),
  }),
  heartbeat: router({
    jobs: roleProcedure(["admin", "area_manager"]).query(async ({ ctx }) => {
      const result = await listHeartbeatJobs("");
      const db = await getDb();
      const logs = db ? await db.select().from(auditLogs).where(eq(auditLogs.entityType, "scheduled_report")).limit(200) : [];
      const orderedLogs = logs.reverse();
      const successLogs = orderedLogs.filter(log => log.action === "usage_digest" || log.action === "scheduled_report" || log.action === "weekly_executive_digest");
      const failureLogs = orderedLogs.filter(log => log.action === "usage_digest_failed" || log.action === "scheduled_report_failed" || log.action === "weekly_executive_digest_failed");
      const executionLogs = [...successLogs, ...failureLogs].sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());
      const latestLog = executionLogs[0];
      const latestTimestamp = latestLog?.createdAt ? new Date(latestLog.createdAt).getTime() : null;
      const hoursSinceLastRun = latestTimestamp ? Math.max(0, Math.round((Date.now() - latestTimestamp) / 3600000)) : null;
      const latencyValues = orderedLogs.map(log => { try { const value = JSON.parse(log.afterData ?? "{}").latencyMs; return typeof value === "number" && Number.isFinite(value) ? value : null; } catch { return null; } }).filter((value): value is number => value !== null);
      const totalRuns = successLogs.length + failureLogs.length;
      const successRate = totalRuns ? Math.round((successLogs.length / totalRuns) * 100) : null;
      const averageLatencyMs = latencyValues.length ? Math.round(latencyValues.reduce((sum, value) => sum + value, 0) / latencyValues.length) : null;
      const warningReasons = [
        successRate !== null && successRate < 75 ? "معدل النجاح أقل من 75%" : null,
        averageLatencyMs !== null && averageLatencyMs >= 30000 ? "متوسط زمن التنفيذ تجاوز 30 ثانية" : null,
        hoursSinceLastRun !== null && hoursSinceLastRun > 120 ? "مر أكثر من خمسة أيام على آخر تنفيذ" : null,
      ].filter((reason): reason is string => Boolean(reason));
      const status = latestLog && failureLogs.includes(latestLog) ? "failed" : hoursSinceLastRun !== null && hoursSinceLastRun > 192 ? "stale" : warningReasons.length ? "warning" : "healthy";
      const health = { status, warningReasons, hoursSinceLastRun, lastSuccessAt: [...successLogs].sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())[0]?.createdAt ?? null, lastFailureAt: [...failureLogs].sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())[0]?.createdAt ?? null, successCount: successLogs.length, failureCount: failureLogs.length, successRate, averageLatencyMs } as const;
      return { jobs: result.jobs, total: result.total, logs: orderedLogs, health };
    }),
    deliveryStatus: roleProcedure(["admin", "area_manager"]).input(z.object({ taskUid: z.string().min(1).max(120), marker: z.string().min(1).max(80) })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      return db.select().from(scheduledReportDeliveries).where(and(eq(scheduledReportDeliveries.taskUid, input.taskUid), eq(scheduledReportDeliveries.marker, input.marker))).limit(100);
    }),
    retryDelivery: roleProcedure(["admin", "area_manager"]).input(z.object({ taskUid: z.string().min(1).max(120), marker: z.string().min(1).max(80), recipientId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const result = await retryScheduledReportDelivery({ ...input, actorId: ctx.user.id });
      const db = await getDb();
      if (db) await recordAudit(db, { actorId: ctx.user.id, entityType: "scheduled_report", action: "delivery_manual_retry", afterData: { ...input, result } });
      return result;
    }),
    recipients: roleProcedure(["admin", "area_manager"]).query(async () => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const rows = await db.select().from(scheduledReportRecipients).limit(500);
      const recipientUsers = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role }).from(users).limit(200);
      return { rows, users: recipientUsers };
    }),
    saveRecipients: roleProcedure(["admin", "area_manager"]).input(z.object({ taskUid: z.string().min(1).max(120), recipientIds: z.array(z.number().int().positive()).max(50) })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const jobs = await listHeartbeatJobs("");
      if (!jobs.jobs.some((job) => job.taskUid === input.taskUid)) throw new TRPCError({ code: "NOT_FOUND", message: "وظيفة التقرير غير موجودة" });
      const validUsers = await db.select({ id: users.id }).from(users).where(inArray(users.id, input.recipientIds));
      const validIds = validUsers.map((user) => user.id);
      await db.delete(scheduledReportRecipients).where(eq(scheduledReportRecipients.taskUid, input.taskUid));
      if (validIds.length) await db.insert(scheduledReportRecipients).values(validIds.map((recipientId) => ({ taskUid: input.taskUid, recipientId, createdById: ctx.user.id })));
      await recordAudit(db, { actorId: ctx.user.id, entityType: "scheduled_report", action: "recipients_updated", afterData: { taskUid: input.taskUid, recipientIds: validIds } });
      return { success: true, count: validIds.length };
    }),
    setEnabled: roleProcedure(["admin"]).input(z.object({ taskUid: z.string().min(1).max(120), enabled: z.boolean() })).mutation(async ({ ctx, input }) => {
      const result = await updateHeartbeatJob(input.taskUid, { enable: input.enabled }, "");
      const db = await getDb();
      if (db) await recordAudit(db, { actorId: ctx.user.id, entityType: "scheduled_report", action: input.enabled ? "heartbeat_enabled" : "heartbeat_disabled", afterData: { taskUid: input.taskUid } });
      return { success: true, nextExecutionAt: result.nextExecutionAt ?? null };
    }),
    retryUsageDigest: roleProcedure(["admin"]).mutation(async ({ ctx }) => retryCommandUsageDigest(ctx.user.id)),
  }),
  users: router({
    assignees: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      return db.select({ id: users.id, name: users.name, role: users.role }).from(users).limit(200);
    }),
  }),
  notifications: router({
    list: protectedProcedure.query(async ({ ctx }) => { const db = await getDb(); if (!db) return []; return db.select().from(notifications).where(eq(notifications.recipientId, ctx.user.id)).orderBy(notifications.createdAt).limit(100); }),
    unreadCount: protectedProcedure.query(async ({ ctx }) => { const db = await getDb(); if (!db) return 0; const rows = await db.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.recipientId, ctx.user.id), isNull(notifications.readAt))); return rows.length; }),
    markRead: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => { const db = await getDb(); if (!db) throw new Error("Database unavailable"); await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, input.id), eq(notifications.recipientId, ctx.user.id))); return { success: true }; }),
    markReadBulk: protectedProcedure.input(z.object({ ids: z.array(z.number().int().positive()).min(1).max(100) })).mutation(async ({ ctx, input }) => { const db = await getDb(); if (!db) throw new Error("Database unavailable"); await db.update(notifications).set({ readAt: new Date() }).where(and(inArray(notifications.id, input.ids), eq(notifications.recipientId, ctx.user.id))); return { success: true, count: input.ids.length }; }),
  }),
  reportApprovals: router({
    list: roleProcedure(["admin", "area_manager", "quality"]).input(z.object({ periodYear: z.number().int().min(2020).max(2100), periodMonth: z.number().int().min(1).max(12) })).query(async ({ input }) => { const db = await getDb(); if (!db) return []; return db.select().from(reportApprovals).where(eq(reportApprovals.periodYear, input.periodYear)); }),
    approve: roleProcedure(["admin", "area_manager", "quality"]).input(z.object({ periodYear: z.number().int().min(2020).max(2100), periodMonth: z.number().int().min(1).max(12), status: z.enum(["approved", "rejected"]), signatureText: z.string().min(2).max(220), notes: z.string().max(1000).optional() })).mutation(async ({ ctx, input }) => { const db = await getDb(); if (!db) throw new Error("Database unavailable"); const [existing] = await db.select().from(reportApprovals).where(and(eq(reportApprovals.approverId, ctx.user.id), eq(reportApprovals.periodYear, input.periodYear), eq(reportApprovals.periodMonth, input.periodMonth))).limit(1); const payload = { periodYear: input.periodYear, periodMonth: input.periodMonth, approverId: ctx.user.id, status: input.status, signatureText: input.signatureText, notes: input.notes, signedAt: new Date() }; if (existing) await db.update(reportApprovals).set(payload).where(eq(reportApprovals.id, existing.id)); else await db.insert(reportApprovals).values(payload); await recordAudit(db, { actorId: ctx.user.id, entityType: "monthly_report", action: input.status === "approved" ? "report_approved" : "report_rejected", afterData: payload }); return { success: true }; }),
  }),
  audit: router({
    list: roleProcedure(["admin", "area_manager"]).input(z.object({ entityType: z.string().max(80).optional(), action: z.string().max(80).optional(), actorId: z.number().int().positive().optional(), branchId: z.number().int().positive().optional(), search: z.string().max(120).optional(), limit: z.number().int().min(1).max(200).default(100) }).optional()).query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const visibleBranchIds = ctx.user.role === "admin" ? null : (await listBranches(ctx.user)).map(branch => branch.id);
      const rows = await db.select().from(auditLogs).orderBy(auditLogs.createdAt).limit(input?.limit ?? 100);
      const actors = await db.select({ id: users.id, name: users.name, role: users.role }).from(users).limit(500);
      const branchesRows = await db.select({ id: branches.id, name: branches.name }).from(branches).limit(500);
      const actorMap = new Map(actors.map(actor => [actor.id, actor]));
      const branchMap = new Map(branchesRows.map(branch => [branch.id, branch]));
      return rows.filter(row => (!visibleBranchIds || !row.branchId || visibleBranchIds.includes(row.branchId)) && (!input?.entityType || row.entityType === input.entityType) && (!input?.action || row.action === input.action) && (!input?.actorId || row.actorId === input.actorId) && (!input?.branchId || row.branchId === input.branchId) && (!input?.search || `${row.entityType} ${row.action} ${row.beforeData ?? ""} ${row.afterData ?? ""}`.includes(input.search))).reverse().map(row => ({ ...row, actor: row.actorId ? actorMap.get(row.actorId) ?? null : null, branch: row.branchId ? branchMap.get(row.branchId) ?? null : null }));
    }),
  }),
  checklists: router({
    list: roleProcedure(["admin", "area_manager", "branch_manager", "quality"]).query(async () => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const templates = await db.select().from(checklistTemplates).limit(100);
      const items = await db.select().from(checklistItems).limit(500);
      return templates.map(template => ({ ...template, items: items.filter(item => item.templateId === template.id).sort((a, b) => a.orderIndex - b.orderIndex) }));
    }),
    create: roleProcedure(["admin", "area_manager", "quality"]).input(z.object({ name: z.string().min(2).max(180), category: z.string().min(2).max(100).default("تشغيلي"), items: z.array(z.object({ label: z.string().min(2).max(240), isRequired: z.boolean().default(true) })).min(1).max(50) })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const inserted = await db.insert(checklistTemplates).values({ name: input.name, category: input.category, createdBy: ctx.user.id });
      const templateId = Number(inserted[0].insertId);
      await db.insert(checklistItems).values(input.items.map((item, index) => ({ templateId, label: item.label, orderIndex: index, isRequired: item.isRequired })));
      await recordAudit(db, { actorId: ctx.user.id, entityType: "checklist_template", entityId: templateId, action: "create", afterData: input });
      return { id: templateId };
    }),
    update: roleProcedure(["admin", "area_manager", "quality"]).input(z.object({ id: z.number().int().positive(), name: z.string().min(2).max(180).optional(), category: z.string().min(2).max(100).optional(), isActive: z.boolean().optional() })).mutation(async ({ input, ctx }) => { const db = await getDb(); if (!db) throw new Error("Database unavailable"); const [current] = await db.select().from(checklistTemplates).where(eq(checklistTemplates.id, input.id)).limit(1); if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "قالب الفحص غير موجود" }); await db.update(checklistTemplates).set({ name: input.name, category: input.category, isActive: input.isActive }).where(eq(checklistTemplates.id, input.id)); await recordAudit(db, { actorId: ctx.user.id, entityType: "checklist_template", entityId: input.id, action: "update", beforeData: current, afterData: input }); return { success: true }; }),
    updateItem: roleProcedure(["admin", "area_manager", "quality"]).input(z.object({ id: z.number().int().positive(), label: z.string().min(2).max(240).optional(), isRequired: z.boolean().optional(), orderIndex: z.number().int().min(0).optional() })).mutation(async ({ input, ctx }) => { const db = await getDb(); if (!db) throw new Error("Database unavailable"); const [current] = await db.select().from(checklistItems).where(eq(checklistItems.id, input.id)).limit(1); if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "عنصر الفحص غير موجود" }); await db.update(checklistItems).set({ label: input.label, isRequired: input.isRequired, orderIndex: input.orderIndex }).where(eq(checklistItems.id, input.id)); await recordAudit(db, { actorId: ctx.user.id, entityType: "checklist_item", entityId: input.id, action: "update", beforeData: current, afterData: input }); return { success: true }; }),
    reorder: roleProcedure(["admin", "area_manager", "quality"]).input(z.object({ templateId: z.number().int().positive(), itemIds: z.array(z.number().int().positive()).min(1).max(100) })).mutation(async ({ input, ctx }) => { const db = await getDb(); if (!db) throw new Error("Database unavailable"); await Promise.all(input.itemIds.map((id, index) => db.update(checklistItems).set({ orderIndex: index }).where(eq(checklistItems.id, id)))); await recordAudit(db, { actorId: ctx.user.id, entityType: "checklist_template", entityId: input.templateId, action: "reorder_items", afterData: input.itemIds }); return { success: true }; }),
    report: roleProcedure(["admin", "area_manager", "branch_manager", "quality"]).input(z.object({ period: z.enum(["day", "week", "month"]).default("month"), branchId: z.number().int().positive().optional(), regionId: z.number().int().positive().optional(), templateId: z.number().int().positive().optional(), status: z.enum(["scheduled", "in_progress", "completed", "cancelled"]).optional() })).query(async ({ input, ctx }) => { const db = await getDb(); if (!db) throw new Error("Database unavailable"); const visibleBranches = (await listBranches(ctx.user)).filter(branch => (!input.branchId || branch.id === input.branchId) && (!input.regionId || branch.regionId === input.regionId)); const branchIds = visibleBranches.map(branch => branch.id); const since = new Date(Date.now() - (input.period === "day" ? 86400000 : input.period === "week" ? 604800000 : 2592000000)); const visitRows = await db.select().from(visits).where(inArray(visits.branchId, branchIds)); const resultRows = await db.select().from(visitChecklistResults); const templates = await db.select().from(checklistTemplates); const items = await db.select().from(checklistItems); const visibleVisits = visitRows.filter(visit => (!visit.createdAt || visit.createdAt >= since) && visit.checklistTemplateId && (!input.templateId || visit.checklistTemplateId === input.templateId) && (!input.status || visit.status === input.status)); const rows = visibleBranches.map(branch => { const branchVisits = visibleVisits.filter(visit => visit.branchId === branch.id); const visitIds = new Set(branchVisits.map(visit => visit.id)); const results = resultRows.filter(result => visitIds.has(result.visitId)); const itemMap = new Map(items.filter(item => branchVisits.some(visit => visit.checklistTemplateId === item.templateId)).map(item => [item.id, item])); const required = results.filter(result => itemMap.get(result.itemId)?.isRequired && result.result !== "na"); const passed = required.filter(result => result.result === "pass"); const failed = required.filter(result => result.result === "fail"); return { branchId: branch.id, branchName: branch.name, visits: branchVisits.length, checked: required.length, passed: passed.length, failed: failed.length, compliance: required.length ? Math.round((passed.length / required.length) * 100) : 0 }; }); return { period: input.period, rows, templates: templates.filter(template => template.isActive).length }; }),
    alerts: roleProcedure(["admin", "area_manager", "branch_manager", "quality"]).query(async ({ ctx }) => { const db = await getDb(); if (!db) throw new Error("Database unavailable"); const visibleBranches = await listBranches(ctx.user); const branchIds = visibleBranches.map(branch => branch.id); const branchNames = new Map(visibleBranches.map(branch => [branch.id, branch.name])); const visitRows = await db.select().from(visits).where(inArray(visits.branchId, branchIds)); const resultRows = await db.select().from(visitChecklistResults); const items = await db.select().from(checklistItems); const now = Date.now(); const alerts: Array<{ id: string; kind: "checklist" | "visit"; branchId: number; title: string; detail: string; tone: "amber" | "rose" }> = []; for (const visit of visitRows) { if (visit.scheduledAt && visit.status === "scheduled" && new Date(visit.scheduledAt).getTime() < now) alerts.push({ id: `visit-${visit.id}`, kind: "visit", branchId: visit.branchId, title: "زيارة متأخرة", detail: `${branchNames.get(visit.branchId) ?? "الفرع"} · الزيارة المجدولة تحتاج متابعة`, tone: "amber" }); const requiredFailures = resultRows.filter(result => result.visitId === visit.id && result.result === "fail" && items.some(item => item.id === result.itemId && item.isRequired)); if (requiredFailures.length) alerts.push({ id: `checklist-${visit.id}`, kind: "checklist", branchId: visit.branchId, title: "فشل عنصر إلزامي", detail: `${branchNames.get(visit.branchId) ?? "الفرع"} · ${requiredFailures.length} عناصر تحتاج إجراء تصحيحي`, tone: "rose" }); } return alerts.slice(0, 30); }),
    results: roleProcedure(["admin", "area_manager", "branch_manager", "quality"]).input(z.object({ visitIds: z.array(z.number().int().positive()).min(1).max(100) })).query(async ({ input, ctx }) => { const db = await getDb(); if (!db) throw new Error("Database unavailable"); const requestedVisits = await db.select({ id: visits.id, branchId: visits.branchId }).from(visits).where(inArray(visits.id, input.visitIds)); const allowedBranchIds = ctx.user.role === "admin" ? null : (await listBranches(ctx.user)).map(branch => branch.id); const allowedVisitIds = requestedVisits.filter(visit => allowedBranchIds === null || allowedBranchIds.includes(visit.branchId)).map(visit => visit.id); if (!allowedVisitIds.length) return []; return db.select().from(visitChecklistResults).where(inArray(visitChecklistResults.visitId, allowedVisitIds)); },),
    record: roleProcedure(["admin", "area_manager", "branch_manager", "quality"]).input(z.object({ visitId: z.number().int().positive(), results: z.array(z.object({ itemId: z.number().int().positive(), result: z.enum(["pass", "fail", "na"]), note: z.string().optional() })).min(1).max(100) })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.delete(visitChecklistResults).where(eq(visitChecklistResults.visitId, input.visitId));
      await db.insert(visitChecklistResults).values(input.results.map(result => ({ visitId: input.visitId, ...result })));
      const [visit] = await db.select({ branchId: visits.branchId }).from(visits).where(eq(visits.id, input.visitId)).limit(1);
      await recordAudit(db, { actorId: ctx.user.id, branchId: visit?.branchId, entityType: "visit_checklist", entityId: input.visitId, action: "record", afterData: input.results });
      return { success: true };
    }),
  }),
  branches: router({
    list: protectedProcedure.query(({ ctx }) => listBranches(ctx.user)),
    getById: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(({ input, ctx }) => getBranchById(input.id, ctx.user)),
    profile: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(({ input, ctx }) => getBranchProfile(input.id, ctx.user)),
    create: roleProcedure(["admin", "area_manager"]).input(z.object({
      code: z.string().min(1).max(32),
      name: z.string().min(1).max(160),
      regionId: z.number().int().positive(),
      operationalType: z.enum(["branch", "representative", "warehouse"]).default("branch"),
      region: z.string().min(1).max(120),
      city: z.string().min(1).max(120),
      managerName: z.string().max(160).optional(),
    })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      let resolvedRegionId: number | undefined;
      const [regionById] = await db.select({ id: regions.id, name: regions.name }).from(regions).where(eq(regions.id, input.regionId)).limit(1);
      if (regionById) {
        resolvedRegionId = regionById.id;
      } else {
        const [regionByName] = await db.select({ id: regions.id }).from(regions).where(eq(regions.name, input.region)).limit(1);
        if (regionByName) resolvedRegionId = regionByName.id;
        else {
          const createdRegion = await db.insert(regions).values({ name: input.region });
          resolvedRegionId = Number(createdRegion[0].insertId);
        }
      }
      const result = await db.insert(branches).values({ ...input, regionId: resolvedRegionId });
      return { id: result[0].insertId, ...input, regionId: resolvedRegionId };
    }),
    update: roleProcedure(["admin", "area_manager"]).input(z.object({
      id: z.number().int().positive(),
      code: z.string().min(1).max(32).optional(),
      name: z.string().min(1).max(160).optional(),
      regionId: z.number().int().positive().optional(),
      region: z.string().min(1).max(120).optional(),
      city: z.string().min(1).max(120).optional(),
      managerName: z.string().max(160).nullable().optional(),
      address: z.string().max(2000).nullable().optional(),
      phone: z.string().max(32).nullable().optional(),
      status: z.enum(["active", "paused", "closed"]).optional(),
      operationalType: z.enum(["branch", "representative", "warehouse"]).optional(),
    })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const existing = await db.select().from(branches).where(eq(branches.id, input.id)).limit(1);
      if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND", message: "الفرع غير موجود." });
      if (ctx.user.role === "area_manager" && existing[0].regionId !== ctx.user.regionId) throw new TRPCError({ code: "FORBIDDEN" });
      if (ctx.user.role === "area_manager" && (input.regionId !== undefined || input.region !== undefined)) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكن لمدير المنطقة تغيير نطاق الفرع." });
      const { id, ...changes } = input;
      await db.update(branches).set(changes).where(eq(branches.id, id));
      return { id, ...changes };
    }),
  }),
  costCenters: router({
    list: roleProcedure(["admin", "area_manager"]).query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      return db.select().from(costCenterMappings).where(eq(costCenterMappings.isActive, true));
    }),
    upsert: roleProcedure(["admin"]).input(z.object({
      id: z.number().int().positive().optional(), sourceCode: z.string().min(1).max(80), sourceName: z.string().min(1).max(180), branchId: z.number().int().positive().nullable().optional(), centerType: z.enum(["branch", "warehouse", "headquarters", "representative"]), isSalesCenter: z.boolean(), notes: z.string().max(2000).nullable().optional(),
    })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const values = { ...input, createdBy: ctx.user.id };
      if (input.id) { await db.update(costCenterMappings).set(values).where(eq(costCenterMappings.id, input.id)); return { id: input.id, updated: true }; }
      const inserted = await db.insert(costCenterMappings).values(values); return { id: Number(inserted[0].insertId), updated: false };
    }),
  }),
  financials: router({
    list: protectedProcedure.input(z.object({ branchId: z.number().int().positive().optional(), year: z.number().int().min(2000).max(2200).optional(), month: z.number().int().min(1).max(12).optional() }).optional()).query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const allowedBranches = await listBranches(ctx.user);
      const allowedIds = allowedBranches.map(branch => branch.id);
      if (!allowedIds.length) return [];
      const rows = await db.select().from(branchFinancialSnapshots).where(inArray(branchFinancialSnapshots.branchId, input?.branchId ? [input.branchId].filter(id => allowedIds.includes(id)) : allowedIds));
      return rows.filter(row => (input?.year === undefined || row.periodYear === input.year) && (input?.month === undefined || row.periodMonth === input.month));
    }),
    expenseSummary: roleProcedure(["admin", "area_manager", "branch_manager"]).input(z.object({ year: z.number().int().min(2000).max(2200), month: z.number().int().min(1).max(12) })).query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const visibleBranches = await listBranches(ctx.user);
      const rows = await db.select().from(branchFinancialSnapshots).where(inArray(branchFinancialSnapshots.branchId, visibleBranches.map(branch => branch.id)));
      return visibleBranches.map(branch => {
        const snapshot = rows.find(row => row.branchId === branch.id && row.periodYear === input.year && row.periodMonth === input.month);
        return { branchId: branch.id, branchName: branch.name, operationalType: branch.operationalType, salesCenter: branch.operationalType === "branch", netSales: Number(snapshot?.netSales ?? snapshot?.revenue ?? 0), netCost: Number(snapshot?.netCost ?? snapshot?.costOfGoods ?? 0), netProfitMargin: Number(snapshot?.netProfitMargin ?? 0), operatingExpenses: Number(snapshot?.operatingExpenses ?? 0), netProfit: Number(snapshot?.netProfit ?? 0) };
      });
    }),
    upsert: roleProcedure(["admin", "area_manager", "branch_manager"]).input(z.object({ branchId: z.number().int().positive(), year: z.number().int().min(2000).max(2200), month: z.number().int().min(1).max(12), revenue: z.number().min(0), salesReturns: z.number().min(0).default(0), costOfGoods: z.number().min(0), costReturns: z.number().min(0).default(0), operatingExpenses: z.number().min(0), notes: z.string().max(2000).optional() })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const allowedIds = (await listBranches(ctx.user)).map(branch => branch.id);
      if (!allowedIds.includes(input.branchId)) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية هذا الفرع" });
      const existing = await db.select().from(branchFinancialSnapshots).where(eq(branchFinancialSnapshots.branchId, input.branchId));
      const match = existing.find(row => row.periodYear === input.year && row.periodMonth === input.month);
      const netSales = input.revenue - input.salesReturns; const netCost = input.costOfGoods - input.costReturns; const netProfitMargin = netSales - netCost; const values = { branchId: input.branchId, periodYear: input.year, periodMonth: input.month, revenue: input.revenue.toFixed(2), salesReturns: input.salesReturns.toFixed(2), netSales: netSales.toFixed(2), costOfGoods: input.costOfGoods.toFixed(2), costReturns: input.costReturns.toFixed(2), netCost: netCost.toFixed(2), netProfitMargin: netProfitMargin.toFixed(2), operatingExpenses: input.operatingExpenses.toFixed(2), netProfit: (netProfitMargin - input.operatingExpenses).toFixed(2), notes: input.notes, source: "manual" as const, createdBy: ctx.user.id };
      if (match) {
        await db.update(branchFinancialSnapshots).set({ ...values, createdBy: match.createdBy ?? ctx.user.id }).where(eq(branchFinancialSnapshots.id, match.id));
        await recordAudit(db, { actorId: ctx.user.id, branchId: input.branchId, entityType: "financial_snapshot", entityId: match.id, action: "update", beforeData: match, afterData: values });
        return { id: match.id, updated: true };
      }
      const inserted = await db.insert(branchFinancialSnapshots).values(values);
      const id = Number(inserted[0].insertId);
      await recordAudit(db, { actorId: ctx.user.id, branchId: input.branchId, entityType: "financial_snapshot", entityId: id, action: "create", afterData: values });
      return { id, updated: false };
    }),
    remove: roleProcedure(["admin", "area_manager", "branch_manager"]).input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const rows = await db.select().from(branchFinancialSnapshots).where(eq(branchFinancialSnapshots.id, input.id));
      const row = rows[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "اللقطة المالية غير موجودة" });
      const allowedIds = (await listBranches(ctx.user)).map(branch => branch.id);
      if (!allowedIds.includes(row.branchId)) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية هذا الفرع" });
      await db.delete(branchFinancialSnapshots).where(eq(branchFinancialSnapshots.id, input.id));
      await recordAudit(db, { actorId: ctx.user.id, branchId: row.branchId, entityType: "financial_snapshot", entityId: row.id, action: "delete", beforeData: row });
      return { success: true };
    }),
  }),
  actions: router({
    remove: roleProcedure(["admin", "area_manager", "branch_manager", "quality"]).input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => { const db = await getDb(); if (!db) throw new Error("Database unavailable"); await db.delete(correctiveActions).where(eq(correctiveActions.id, input.id)); return { success: true }; }),
    updateStatus: roleProcedure(["admin", "area_manager", "branch_manager", "quality"]).input(z.object({ id: z.number().int().positive(), status: z.enum(["open", "in_progress", "pending_review", "closed"]), closureEvidenceUrl: z.string().url().optional(), priority: z.enum(["low", "medium", "high", "urgent"]).optional(), dueAt: z.date().optional() })).mutation(async ({ input }) => { const db = await getDb(); if (!db) throw new Error("Database unavailable"); await db.update(correctiveActions).set({ status: input.status, closureEvidenceUrl: input.closureEvidenceUrl, priority: input.priority, dueAt: input.dueAt }).where(eq(correctiveActions.id, input.id)); return { success: true }; }),
    create: roleProcedure(["admin", "area_manager", "branch_manager", "quality"]).input(z.object({
      branchId: z.number().int().positive(),
      title: z.string().min(1).max(220),
      description: z.string().optional(),
      priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
      dueAt: z.date().optional(),
    })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const result = await db.insert(correctiveActions).values({ ...input, ownerId: ctx.user.id });
      return { id: result[0].insertId };
    }),
    update: roleProcedure(["admin", "area_manager", "branch_manager", "quality"]).input(z.object({ id: z.number().int().positive(), title: z.string().min(1).max(220).optional(), description: z.string().optional(), ownerId: z.number().int().positive().nullable().optional(), priority: z.enum(["low", "medium", "high", "urgent"]).optional(), dueAt: z.date().optional(), closureEvidenceUrl: z.string().url().optional() })).mutation(async ({ input }) => { const db = await getDb(); if (!db) throw new Error("Database unavailable"); const [current] = await db.select({ id: correctiveActions.id }).from(correctiveActions).where(eq(correctiveActions.id, input.id)).limit(1); if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "الإجراء غير موجود" }); await db.update(correctiveActions).set({ title: input.title, description: input.description, ownerId: input.ownerId, priority: input.priority, dueAt: input.dueAt, closureEvidenceUrl: input.closureEvidenceUrl }).where(eq(correctiveActions.id, input.id)); return { success: true }; }),
  }),
  visits: router({
    remove: roleProcedure(["admin", "area_manager", "branch_manager", "quality"]).input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => { const db = await getDb(); if (!db) throw new Error("Database unavailable"); await db.delete(visits).where(eq(visits.id, input.id)); return { success: true }; }),
    updateStatus: roleProcedure(["admin", "area_manager", "branch_manager", "quality"]).input(z.object({ id: z.number().int().positive(), status: z.enum(["scheduled", "in_progress", "completed", "cancelled"]), score: z.number().min(0).max(100).optional(), notes: z.string().min(1).optional(), reportTitle: z.string().min(1).max(220).optional(), findings: z.string().optional(), recommendations: z.string().optional(), approvalStatus: z.enum(["draft", "submitted", "approved"]).optional() })).mutation(async ({ input }) => { const db = await getDb(); if (!db) throw new Error("Database unavailable"); const [visit] = await db.select().from(visits).where(eq(visits.id, input.id)).limit(1); if (!visit) throw new TRPCError({ code: "NOT_FOUND", message: "الزيارة غير موجودة" }); await db.update(visits).set({ status: input.status, score: input.score?.toString(), notes: input.notes, reportTitle: input.reportTitle, findings: input.findings, recommendations: input.recommendations, approvalStatus: input.approvalStatus, approvedAt: input.approvalStatus === "approved" ? new Date() : undefined, completedAt: input.status === "completed" ? new Date() : undefined }).where(eq(visits.id, input.id)); if (input.status === "completed" && input.score !== undefined) await db.update(branches).set({ healthScore: input.score.toString() }).where(eq(branches.id, visit.branchId)); return { success: true, branchId: visit.branchId, score: input.score ?? null, approvalStatus: input.approvalStatus ?? visit.approvalStatus }; }),
    update: roleProcedure(["admin", "area_manager", "branch_manager", "quality"]).input(z.object({ id: z.number().int().positive(), scheduledAt: z.date().optional(), notes: z.string().optional(), reportTitle: z.string().min(1).max(220).optional(), findings: z.string().optional(), recommendations: z.string().optional(), checklistTemplateId: z.number().int().positive().nullable().optional() })).mutation(async ({ input }) => { const db = await getDb(); if (!db) throw new Error("Database unavailable"); const [current] = await db.select({ id: visits.id }).from(visits).where(eq(visits.id, input.id)).limit(1); if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "الزيارة غير موجودة" }); await db.update(visits).set({ scheduledAt: input.scheduledAt, notes: input.notes, reportTitle: input.reportTitle, findings: input.findings, recommendations: input.recommendations, checklistTemplateId: input.checklistTemplateId }).where(eq(visits.id, input.id)); return { success: true }; }),
    create: roleProcedure(["admin", "area_manager", "branch_manager", "quality"]).input(z.object({ branchId: z.number().int().positive(), scheduledAt: z.date().optional(), notes: z.string().optional(), checklistTemplateId: z.number().int().positive().optional() })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const result = await db.insert(visits).values(input);
      return { id: result[0].insertId };
    }),
    bulkUpdate: roleProcedure(["admin", "area_manager", "branch_manager", "quality"]).input(z.object({ ids: z.array(z.number().int().positive()).min(1).max(100), status: z.enum(["scheduled", "in_progress", "completed", "cancelled"]), approvalStatus: z.enum(["draft", "submitted", "approved"]).optional() })).mutation(async ({ input, ctx }) => { const db = await getDb(); if (!db) throw new Error("Database unavailable"); const rows = await db.select().from(visits).where(inArray(visits.id, input.ids)); if (rows.length !== input.ids.length) throw new TRPCError({ code: "NOT_FOUND", message: "بعض الزيارات غير موجودة" }); const patch = { status: input.status, ...(input.approvalStatus ? { approvalStatus: input.approvalStatus } : {}), ...(input.status === "completed" ? { completedAt: new Date() } : {}) }; await db.update(visits).set(patch).where(inArray(visits.id, input.ids)); await Promise.all(rows.map(visit => recordAudit(db, { actorId: ctx.user.id, branchId: visit.branchId, entityType: "visit", entityId: visit.id, action: "bulk_update", beforeData: visit, afterData: patch }))); return { success: true, count: rows.length }; }),
  }),
  documents: router({
    remove: roleProcedure(["admin", "area_manager", "branch_manager", "quality"]).input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => { const db = await getDb(); if (!db) throw new Error("Database unavailable"); await db.delete(documents).where(eq(documents.id, input.id)); return { success: true }; }),
    update: roleProcedure(["admin", "area_manager", "branch_manager", "quality"]).input(z.object({ id: z.number().int().positive(), documentType: z.string().min(1).max(100).optional(), version: z.string().min(1).max(32).optional(), expiresAt: z.date().optional(), status: z.enum(["valid", "expiring", "expired", "missing"]).optional(), fileUrl: z.string().url().optional() })).mutation(async ({ input, ctx }) => { const db = await getDb(); if (!db) throw new Error("Database unavailable"); const [current] = await db.select().from(documents).where(eq(documents.id, input.id)).limit(1); if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "الوثيقة غير موجودة" }); const next = { documentType: input.documentType ?? current.documentType, version: input.version ?? current.version, expiresAt: input.expiresAt ?? current.expiresAt, status: input.status ?? current.status, fileUrl: input.fileUrl ?? current.fileUrl }; await db.update(documents).set(next).where(eq(documents.id, input.id)); await db.insert(documentVersions).values({ documentId: input.id, ...next, recordedBy: ctx.user.id }); return { success: true }; }),
    create: roleProcedure(["admin", "area_manager", "branch_manager", "quality"]).input(z.object({ branchId: z.number().int().positive(), title: z.string().min(1).max(220), documentType: z.string().min(1).max(100), version: z.string().min(1).max(32).default("1.0"), status: z.enum(["valid", "expiring", "expired", "missing"]).default("valid"), expiresAt: z.date().optional(), fileUrl: z.string().url().optional() })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const result = await db.insert(documents).values(input);
      const documentId = result[0].insertId;
      await db.insert(documentVersions).values({ documentId, version: input.version, documentType: input.documentType, status: input.status, expiresAt: input.expiresAt, fileUrl: input.fileUrl, recordedBy: ctx.user.id });
      return { id: documentId };
    }),
  }),
  quality: router({
    remove: roleProcedure(["admin", "area_manager", "branch_manager", "quality"]).input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => { const db = await getDb(); if (!db) throw new Error("Database unavailable"); await db.delete(qualityCases).where(eq(qualityCases.id, input.id)); return { success: true }; }),
    updateStatus: roleProcedure(["admin", "area_manager", "branch_manager", "quality"]).input(z.object({ id: z.number().int().positive(), status: z.enum(["open", "investigating", "resolved", "closed"]), rootCause: z.string().optional() })).mutation(async ({ input }) => { const db = await getDb(); if (!db) throw new Error("Database unavailable"); await db.update(qualityCases).set({ status: input.status, rootCause: input.rootCause }).where(eq(qualityCases.id, input.id)); return { success: true }; }),
    create: roleProcedure(["admin", "area_manager", "branch_manager", "quality"]).input(z.object({ branchId: z.number().int().positive(), title: z.string().min(1).max(220), caseType: z.enum(["non_conformity", "complaint", "observation"]), severity: z.enum(["low", "medium", "high", "critical"]).default("medium"), description: z.string().optional() })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const result = await db.insert(qualityCases).values(input);
      return { id: result[0].insertId };
    }),
    update: roleProcedure(["admin", "area_manager", "branch_manager", "quality"]).input(z.object({ id: z.number().int().positive(), title: z.string().min(1).max(220).optional(), description: z.string().optional(), caseType: z.enum(["non_conformity", "complaint", "observation"]).optional(), severity: z.enum(["low", "medium", "high", "critical"]).optional(), rootCause: z.string().optional() })).mutation(async ({ input }) => { const db = await getDb(); if (!db) throw new Error("Database unavailable"); const [current] = await db.select({ id: qualityCases.id }).from(qualityCases).where(eq(qualityCases.id, input.id)).limit(1); if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "حالة الجودة غير موجودة" }); await db.update(qualityCases).set({ title: input.title, description: input.description, caseType: input.caseType, severity: input.severity, rootCause: input.rootCause }).where(eq(qualityCases.id, input.id)); return { success: true }; }),
  }),
  maintenance: router({
    remove: roleProcedure(["admin", "area_manager", "branch_manager", "maintenance"]).input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => { const db = await getDb(); if (!db) throw new Error("Database unavailable"); await db.delete(maintenanceTickets).where(eq(maintenanceTickets.id, input.id)); return { success: true }; }),
    updateStatus: roleProcedure(["admin", "area_manager", "branch_manager", "maintenance"]).input(z.object({ id: z.number().int().positive(), status: z.enum(["open", "assigned", "in_progress", "resolved", "closed"]), ticketType: z.enum(["breakdown", "preventive", "warranty"]).optional(), priority: z.enum(["low", "medium", "high", "urgent"]).optional(), warrantyUntil: z.date().optional() })).mutation(async ({ input }) => { const db = await getDb(); if (!db) throw new Error("Database unavailable"); await db.update(maintenanceTickets).set({ status: input.status, ticketType: input.ticketType, priority: input.priority, warrantyUntil: input.warrantyUntil }).where(eq(maintenanceTickets.id, input.id)); return { success: true }; }),
    create: roleProcedure(["admin", "area_manager", "branch_manager", "maintenance"]).input(z.object({ branchId: z.number().int().positive(), assetName: z.string().min(1).max(160), title: z.string().min(1).max(220), ticketType: z.enum(["breakdown", "preventive", "warranty"]).default("breakdown"), priority: z.enum(["low", "medium", "high", "urgent"]).default("medium") })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const result = await db.insert(maintenanceTickets).values(input);
      return { id: result[0].insertId };
    }),
    update: roleProcedure(["admin", "area_manager", "branch_manager", "maintenance"]).input(z.object({ id: z.number().int().positive(), assetName: z.string().min(1).max(160).optional(), title: z.string().min(1).max(220).optional(), ticketType: z.enum(["breakdown", "preventive", "warranty"]).optional(), priority: z.enum(["low", "medium", "high", "urgent"]).optional(), warrantyUntil: z.date().optional() })).mutation(async ({ input }) => { const db = await getDb(); if (!db) throw new Error("Database unavailable"); const [current] = await db.select({ id: maintenanceTickets.id }).from(maintenanceTickets).where(eq(maintenanceTickets.id, input.id)).limit(1); if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "بلاغ الصيانة غير موجود" }); await db.update(maintenanceTickets).set({ assetName: input.assetName, title: input.title, ticketType: input.ticketType, priority: input.priority, warrantyUntil: input.warrantyUntil }).where(eq(maintenanceTickets.id, input.id)); return { success: true }; }),
  }),
  assets: router({
    list: protectedProcedure.input(z.object({ branchId: z.number().int().positive() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(branchAssets).where(eq(branchAssets.branchId, input.branchId)).limit(200);
    }),
    create: roleProcedure(["admin", "area_manager", "branch_manager", "maintenance"]).input(z.object({ branchId: z.number().int().positive(), name: z.string().min(1).max(180), assetType: z.string().min(1).max(100), serialNumber: z.string().max(120).optional(), status: z.enum(["active", "maintenance", "retired"]).default("active"), warrantyUntil: z.date().optional() })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const result = await db.insert(branchAssets).values(input);
      return { id: result[0].insertId };
    }),
    update: roleProcedure(["admin", "area_manager", "branch_manager", "maintenance"]).input(z.object({ id: z.number().int().positive(), name: z.string().min(1).max(180).optional(), assetType: z.string().min(1).max(100).optional(), serialNumber: z.string().max(120).optional(), status: z.enum(["active", "maintenance", "retired"]).optional(), warrantyUntil: z.date().optional() })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const [asset] = await db.select().from(branchAssets).where(eq(branchAssets.id, input.id)).limit(1);
      if (!asset) throw new TRPCError({ code: "NOT_FOUND", message: "الأصل غير موجود" });
      await db.update(branchAssets).set({ name: input.name ?? asset.name, assetType: input.assetType ?? asset.assetType, serialNumber: input.serialNumber ?? asset.serialNumber, status: input.status ?? asset.status, warrantyUntil: input.warrantyUntil ?? asset.warrantyUntil }).where(eq(branchAssets.id, input.id));
      return { success: true };
    }),
    remove: roleProcedure(["admin", "area_manager", "branch_manager", "maintenance"]).input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const [asset] = await db.select({ id: branchAssets.id }).from(branchAssets).where(eq(branchAssets.id, input.id)).limit(1);
      if (!asset) throw new TRPCError({ code: "NOT_FOUND", message: "الأصل غير موجود" });
      await db.delete(branchAssets).where(eq(branchAssets.id, input.id));
      return { success: true };
    }),
  }),
  requests: router({
    remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => { const db = await getDb(); if (!db) throw new Error("Database unavailable"); const [request] = await db.select().from(internalRequests).where(eq(internalRequests.id, input.id)).limit(1); if (!request) throw new TRPCError({ code: "NOT_FOUND" }); if (ctx.user.role !== "admin" && request.requesterId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" }); await db.delete(internalRequests).where(eq(internalRequests.id, input.id)); return { success: true }; }),
    updateStatus: protectedProcedure.input(z.object({ id: z.number().int().positive(), status: z.enum(["new", "assigned", "in_progress", "completed", "rejected"]) })).mutation(async ({ input, ctx }) => { const db = await getDb(); if (!db) throw new Error("Database unavailable"); const [request] = await db.select().from(internalRequests).where(eq(internalRequests.id, input.id)).limit(1); if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "الطلب غير موجود" }); if (ctx.user.role !== "admin" && request.requesterId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية تحديث هذا الطلب" }); await db.update(internalRequests).set({ status: input.status }).where(eq(internalRequests.id, input.id)); return { success: true, actorId: ctx.user.id }; }),
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db.select().from(internalRequests).where(eq(internalRequests.requesterId, ctx.user.id)).limit(50);
      return rows;
    }),
    create: protectedProcedure.input(z.object({ branchId: z.number().int().positive().optional(), title: z.string().min(1).max(220), requestType: z.string().min(1).max(80), priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"), description: z.string().optional() })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const result = await db.insert(internalRequests).values({ ...input, requesterId: ctx.user.id });
      return { id: result[0].insertId };
    }),
    update: protectedProcedure.input(z.object({ id: z.number().int().positive(), title: z.string().min(1).max(220).optional(), priority: z.enum(["low", "medium", "high", "urgent"]).optional(), description: z.string().optional() })).mutation(async ({ input, ctx }) => { const db = await getDb(); if (!db) throw new Error("Database unavailable"); const [request] = await db.select().from(internalRequests).where(eq(internalRequests.id, input.id)).limit(1); if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "الطلب غير موجود" }); if (ctx.user.role !== "admin" && request.requesterId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية تحرير هذا الطلب" }); await db.update(internalRequests).set({ title: input.title ?? request.title, priority: input.priority ?? request.priority, description: input.description ?? request.description }).where(eq(internalRequests.id, input.id)); return { success: true }; }),
    bulkUpdate: protectedProcedure.input(z.object({ ids: z.array(z.number().int().positive()).min(1).max(100), status: z.enum(["new", "assigned", "in_progress", "completed", "rejected"]) })).mutation(async ({ input, ctx }) => { const db = await getDb(); if (!db) throw new Error("Database unavailable"); const rows = await db.select().from(internalRequests).where(inArray(internalRequests.id, input.ids)); if (rows.length !== input.ids.length) throw new TRPCError({ code: "NOT_FOUND", message: "بعض الطلبات غير موجودة" }); const unauthorized = rows.some(request => ctx.user.role !== "admin" && request.requesterId !== ctx.user.id); if (unauthorized) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية تحديث أحد الطلبات المحددة" }); await db.update(internalRequests).set({ status: input.status }).where(inArray(internalRequests.id, input.ids)); await Promise.all(rows.map(request => recordAudit(db, { actorId: ctx.user.id, branchId: request.branchId ?? undefined, entityType: "internal_request", entityId: request.id, action: "bulk_update", beforeData: request, afterData: { status: input.status } }))); return { success: true, count: rows.length }; }),
  }),
  tasks: router({
    remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => { const db = await getDb(); if (!db) throw new Error("Database unavailable"); const [task] = await db.select().from(tasks).where(eq(tasks.id, input.id)).limit(1); if (!task) throw new TRPCError({ code: "NOT_FOUND" }); if (ctx.user.role !== "admin" && task.assigneeId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" }); await db.delete(tasks).where(eq(tasks.id, input.id)); return { success: true }; }),
    updateStatus: protectedProcedure.input(z.object({ id: z.number().int().positive(), status: z.enum(["todo", "in_progress", "done"]) })).mutation(async ({ input, ctx }) => { const db = await getDb(); if (!db) throw new Error("Database unavailable"); const [task] = await db.select().from(tasks).where(eq(tasks.id, input.id)).limit(1); if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "المهمة غير موجودة" }); if (ctx.user.role !== "admin" && task.assigneeId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية تحديث هذه المهمة" }); await db.update(tasks).set({ status: input.status }).where(eq(tasks.id, input.id)); return { success: true, actorId: ctx.user.id }; }),
    bulkUpdate: protectedProcedure.input(z.object({ ids: z.array(z.number().int().positive()).min(1).max(100), status: z.enum(["todo", "in_progress", "done"]).optional(), assigneeId: z.number().int().positive().nullable().optional() })).mutation(async ({ input, ctx }) => { const db = await getDb(); if (!db) throw new Error("Database unavailable"); const rows = await db.select().from(tasks).where(inArray(tasks.id, input.ids)); if (rows.length !== input.ids.length) throw new TRPCError({ code: "NOT_FOUND", message: "بعض المهام غير موجودة" }); const canAssign = ctx.user.role === "admin" || ctx.user.role === "area_manager"; if (input.assigneeId !== undefined && !canAssign) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية إعادة تعيين المهام" }); const unauthorized = rows.some(task => ctx.user.role !== "admin" && task.assigneeId !== ctx.user.id && !(canAssign && input.assigneeId !== undefined)); if (unauthorized) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية تحديث إحدى المهام المحددة" }); if (input.assigneeId) { const [assignee] = await db.select({ id: users.id }).from(users).where(eq(users.id, input.assigneeId)).limit(1); if (!assignee) throw new TRPCError({ code: "NOT_FOUND", message: "المسؤول المحدد غير موجود" }); } const patch = { ...(input.status ? { status: input.status } : {}), ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}) }; if (!Object.keys(patch).length) throw new TRPCError({ code: "BAD_REQUEST", message: "حدد الحالة أو المسؤول الجديد" }); await db.update(tasks).set(patch).where(inArray(tasks.id, input.ids)); await Promise.all(rows.map(task => recordAudit(db, { actorId: ctx.user.id, branchId: task.branchId ?? undefined, entityType: "task", entityId: task.id, action: "bulk_update", beforeData: task, afterData: patch }))); if (input.assigneeId && input.assigneeId !== ctx.user.id) await db.insert(notifications).values(rows.map(task => ({ recipientId: input.assigneeId!, kind: "task_reassigned", title: "تمت إعادة تعيين مهمة لك", content: task.title, entityType: "task", entityId: task.id }))); return { success: true, count: rows.length }; }),
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      if (ctx.user.role === "admin") return db.select().from(tasks).orderBy(tasks.createdAt).limit(100);
      return db.select().from(tasks).where(eq(tasks.assigneeId, ctx.user.id)).orderBy(tasks.createdAt).limit(50);
    }),
    create: protectedProcedure.input(z.object({ branchId: z.number().int().positive().optional(), title: z.string().min(1).max(220), priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"), dueAt: z.date().optional(), assigneeId: z.number().int().positive().optional() })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const canAssign = ctx.user.role === "admin" || ctx.user.role === "area_manager";
      if (input.assigneeId && !canAssign && input.assigneeId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية تعيين المهمة" });
      const assigneeId = input.assigneeId ?? ctx.user.id;
      const [assignee] = await db.select({ id: users.id }).from(users).where(eq(users.id, assigneeId)).limit(1);
      if (!assignee) throw new TRPCError({ code: "NOT_FOUND", message: "المسؤول المحدد غير موجود" });
      const result = await db.insert(tasks).values({ branchId: input.branchId, title: input.title, priority: input.priority, dueAt: input.dueAt, assigneeId });
      const taskId = Number(result[0].insertId);
      await recordAudit(db, { actorId: ctx.user.id, branchId: input.branchId, entityType: "task", entityId: taskId, action: "assign", afterData: { ...input, assigneeId } });
      if (assigneeId !== ctx.user.id) await db.insert(notifications).values({ recipientId: assigneeId, kind: "task_assigned", title: "تم تعيين مهمة جديدة", content: input.title, entityType: "task", entityId: taskId });
      return { id: taskId };
    }),
    update: protectedProcedure.input(z.object({ id: z.number().int().positive(), title: z.string().min(1).max(220).optional(), priority: z.enum(["low", "medium", "high", "urgent"]).optional(), dueAt: z.date().optional(), assigneeId: z.number().int().positive().nullable().optional() })).mutation(async ({ input, ctx }) => { const db = await getDb(); if (!db) throw new Error("Database unavailable"); const [task] = await db.select().from(tasks).where(eq(tasks.id, input.id)).limit(1); if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "المهمة غير موجودة" }); const canAssign = ctx.user.role === "admin" || ctx.user.role === "area_manager"; if (ctx.user.role !== "admin" && task.assigneeId !== ctx.user.id && !canAssign) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية تحرير هذه المهمة" }); if (input.assigneeId !== undefined && !canAssign) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية إعادة تعيين المهمة" }); if (input.assigneeId) { const [assignee] = await db.select({ id: users.id }).from(users).where(eq(users.id, input.assigneeId)).limit(1); if (!assignee) throw new TRPCError({ code: "NOT_FOUND", message: "المسؤول المحدد غير موجود" }); } await db.update(tasks).set({ title: input.title ?? task.title, priority: input.priority ?? task.priority, dueAt: input.dueAt ?? task.dueAt, assigneeId: input.assigneeId === undefined ? task.assigneeId : input.assigneeId }).where(eq(tasks.id, input.id)); await recordAudit(db, { actorId: ctx.user.id, branchId: task.branchId ?? undefined, entityType: "task", entityId: input.id, action: input.assigneeId !== undefined && input.assigneeId !== task.assigneeId ? "reassign" : "update", beforeData: task, afterData: input }); if (input.assigneeId && input.assigneeId !== task.assigneeId && input.assigneeId !== ctx.user.id) await db.insert(notifications).values({ recipientId: input.assigneeId, kind: "task_reassigned", title: "تمت إعادة تعيين مهمة لك", content: input.title ?? task.title, entityType: "task", entityId: input.id }); return { success: true }; }),
  }),
  usage: router({
    log: protectedProcedure.input(z.object({ command: z.string().min(1).max(120), surface: z.enum(["shortcut", "palette", "quick_action"]), branchId: z.number().int().positive().optional() })).mutation(async ({ ctx, input }) => { const db = await getDb(); if (!db) throw new Error("Database unavailable"); await recordAudit(db, { actorId: ctx.user.id, branchId: input.branchId, entityType: "command_usage", action: input.surface, afterData: { command: input.command, role: ctx.user.role, branchId: input.branchId } }); return { success: true }; }),
    list: roleProcedure(["admin", "area_manager"]).input(z.object({ from: z.date().optional(), to: z.date().optional(), branchId: z.number().int().positive().optional(), command: z.string().trim().max(120).optional(), surface: z.enum(["shortcut", "palette", "quick_action"]).optional(), actorId: z.number().int().positive().optional() }).optional()).query(async ({ input, ctx }) => { const db = await getDb(); if (!db) return { rows: [], summary: [], branchSummary: [], comparison: { current: 0, previous: 0, changePercent: 0 }, total: 0 }; const visibleBranchIds = ctx.user.role === "admin" ? null : (await listBranches(ctx.user)).map((branch) => branch.id); const rows = await db.select().from(auditLogs).where(eq(auditLogs.entityType, "command_usage")).limit(2000); const end = input?.to ?? new Date(); const start = input?.from ?? new Date(end.getTime() - 30 * 86400000); const previousStart = new Date(start.getTime() - (end.getTime() - start.getTime())); const matches = (row: typeof rows[number], from: Date, to: Date) => { let parsed: any = {}; try { parsed = JSON.parse(row.afterData ?? "{}"); } catch {} const branchId = parsed.branchId ?? row.branchId ?? undefined; return row.createdAt >= from && row.createdAt <= to && (!input?.branchId || branchId === input.branchId) && (!input?.command || String(parsed.command ?? "").toLocaleLowerCase("ar").includes(input.command.toLocaleLowerCase("ar"))) && (!input?.surface || parsed.surface === input.surface || row.action === input.surface) && (!input?.actorId || row.actorId === input.actorId) && (!visibleBranchIds || !branchId || visibleBranchIds.includes(branchId)); }; const filtered = rows.filter(row => matches(row, start, end)); const previous = rows.filter(row => matches(row, previousStart, start)).length; const grouped = new Map<string, { command: string; count: number; lastUsed: Date }>(); const branchGrouped = new Map<number, number>(); for (const row of filtered) { let command = "غير محدد"; let branchId: number | undefined; try { const parsed = JSON.parse(row.afterData ?? "{}"); command = parsed.command ?? command; branchId = parsed.branchId ?? row.branchId ?? undefined; } catch { branchId = row.branchId ?? undefined; } const existing = grouped.get(command); if (existing) { existing.count += 1; if (row.createdAt > existing.lastUsed) existing.lastUsed = row.createdAt; } else grouped.set(command, { command, count: 1, lastUsed: row.createdAt }); if (branchId) branchGrouped.set(branchId, (branchGrouped.get(branchId) ?? 0) + 1); } return { rows: filtered.reverse(), summary: Array.from(grouped.values()).sort((a, b) => b.count - a.count), branchSummary: Array.from(branchGrouped.entries()).map(([branchId, count]) => ({ branchId, count })).sort((a, b) => b.count - a.count), comparison: { current: filtered.length, previous, changePercent: previous ? Math.round(((filtered.length - previous) / previous) * 100) : filtered.length ? 100 : 0 }, total: filtered.length }; }),
  }),
  preferences: router({
    getDashboard: protectedProcedure.query(async ({ ctx }) => { const db = await getDb(); if (!db) return { visibleWidgets: null }; const [row] = await db.select().from(dashboardPreferences).where(eq(dashboardPreferences.userId, ctx.user.id)).limit(1); return { visibleWidgets: row ? JSON.parse(row.visibleWidgets) : null }; }),
    saveDashboard: protectedProcedure.input(z.object({ visibleWidgets: z.array(z.string().min(1).max(80)).min(1).max(20) })).mutation(async ({ ctx, input }) => { const db = await getDb(); if (!db) throw new Error("Database unavailable"); const serialized = JSON.stringify(input.visibleWidgets); const [current] = await db.select({ id: dashboardPreferences.id }).from(dashboardPreferences).where(eq(dashboardPreferences.userId, ctx.user.id)).limit(1); if (current) await db.update(dashboardPreferences).set({ visibleWidgets: serialized }).where(eq(dashboardPreferences.userId, ctx.user.id)); else await db.insert(dashboardPreferences).values({ userId: ctx.user.id, visibleWidgets: serialized }); await recordAudit(db, { actorId: ctx.user.id, entityType: "dashboard_preferences", action: "update", afterData: { visibleWidgets: input.visibleWidgets } }); const recipients = await db.select({ id: users.id }).from(users).where(inArray(users.role, ["admin", "area_manager"])); const targets = recipients.filter(recipient => recipient.id !== ctx.user.id); if (targets.length) await db.insert(notifications).values(targets.map(recipient => ({ recipientId: recipient.id, kind: "dashboard_preferences_changed", title: "تم تحديث مؤشرات لوحة التشغيل", content: `${ctx.user.name ?? "مستخدم"} حدّث تفضيلات المؤشرات`, entityType: "dashboard_preferences", entityId: ctx.user.id }))); return { success: true, visibleWidgets: input.visibleWidgets }; }),
  }),
  ops: router({
    overview: protectedProcedure.input(z.object({ period: z.enum(["day", "week", "month"]).default("month"), regionId: z.number().int().positive().optional() }).optional()).query(({ ctx, input }) => getOperationsOverview(ctx.user, input?.period ?? "month", input?.regionId)),
  }),
});

export type AppRouter = typeof appRouter;
