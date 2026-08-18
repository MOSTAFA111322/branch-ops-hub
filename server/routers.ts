import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, roleProcedure, router } from "./_core/trpc";
import { eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getBranchById, getBranchProfile, getDashboardSummary, getOperationsOverview, listBranches, getDb } from "./db";
import { branches, branchAssets, branchFinancialSnapshots, checklistItems, checklistTemplates, correctiveActions, documentVersions, documents, internalRequests, maintenanceTickets, qualityCases, tasks, users, visitChecklistResults, visits, auditLogs } from "../drizzle/schema";

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
  users: router({
    assignees: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      return db.select({ id: users.id, name: users.name, role: users.role }).from(users).limit(200);
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
    report: roleProcedure(["admin", "area_manager", "branch_manager", "quality"]).input(z.object({ period: z.enum(["day", "week", "month"]).default("month"), branchId: z.number().int().positive().optional(), templateId: z.number().int().positive().optional(), status: z.enum(["scheduled", "in_progress", "completed", "cancelled"]).optional() })).query(async ({ input, ctx }) => { const db = await getDb(); if (!db) throw new Error("Database unavailable"); const visibleBranches = (await listBranches(ctx.user)).filter(branch => !input.branchId || branch.id === input.branchId); const branchIds = visibleBranches.map(branch => branch.id); const since = new Date(Date.now() - (input.period === "day" ? 86400000 : input.period === "week" ? 604800000 : 2592000000)); const visitRows = await db.select().from(visits).where(inArray(visits.branchId, branchIds)); const resultRows = await db.select().from(visitChecklistResults); const templates = await db.select().from(checklistTemplates); const items = await db.select().from(checklistItems); const visibleVisits = visitRows.filter(visit => (!visit.createdAt || visit.createdAt >= since) && visit.checklistTemplateId && (!input.templateId || visit.checklistTemplateId === input.templateId) && (!input.status || visit.status === input.status)); const rows = visibleBranches.map(branch => { const branchVisits = visibleVisits.filter(visit => visit.branchId === branch.id); const visitIds = new Set(branchVisits.map(visit => visit.id)); const results = resultRows.filter(result => visitIds.has(result.visitId)); const itemMap = new Map(items.filter(item => branchVisits.some(visit => visit.checklistTemplateId === item.templateId)).map(item => [item.id, item])); const required = results.filter(result => itemMap.get(result.itemId)?.isRequired && result.result !== "na"); const passed = required.filter(result => result.result === "pass"); const failed = required.filter(result => result.result === "fail"); return { branchId: branch.id, branchName: branch.name, visits: branchVisits.length, checked: required.length, passed: passed.length, failed: failed.length, compliance: required.length ? Math.round((passed.length / required.length) * 100) : 0 }; }); return { period: input.period, rows, templates: templates.filter(template => template.isActive).length }; }),
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
      managerId: z.number().int().positive().optional(),
      region: z.string().min(1).max(120),
      city: z.string().min(1).max(120),
      managerName: z.string().max(160).optional(),
    })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const result = await db.insert(branches).values(input);
      return { id: result[0].insertId, ...input };
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
    upsert: roleProcedure(["admin", "area_manager", "branch_manager"]).input(z.object({ branchId: z.number().int().positive(), year: z.number().int().min(2000).max(2200), month: z.number().int().min(1).max(12), revenue: z.number().min(0), costOfGoods: z.number().min(0), operatingExpenses: z.number().min(0), notes: z.string().max(2000).optional() })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const allowedIds = (await listBranches(ctx.user)).map(branch => branch.id);
      if (!allowedIds.includes(input.branchId)) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية هذا الفرع" });
      const existing = await db.select().from(branchFinancialSnapshots).where(eq(branchFinancialSnapshots.branchId, input.branchId));
      const match = existing.find(row => row.periodYear === input.year && row.periodMonth === input.month);
      const values = { branchId: input.branchId, periodYear: input.year, periodMonth: input.month, revenue: input.revenue.toFixed(2), costOfGoods: input.costOfGoods.toFixed(2), operatingExpenses: input.operatingExpenses.toFixed(2), netProfit: (input.revenue - input.costOfGoods - input.operatingExpenses).toFixed(2), notes: input.notes, source: "manual" as const, createdBy: ctx.user.id };
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
  }),
  tasks: router({
    remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => { const db = await getDb(); if (!db) throw new Error("Database unavailable"); const [task] = await db.select().from(tasks).where(eq(tasks.id, input.id)).limit(1); if (!task) throw new TRPCError({ code: "NOT_FOUND" }); if (ctx.user.role !== "admin" && task.assigneeId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" }); await db.delete(tasks).where(eq(tasks.id, input.id)); return { success: true }; }),
    updateStatus: protectedProcedure.input(z.object({ id: z.number().int().positive(), status: z.enum(["todo", "in_progress", "done"]) })).mutation(async ({ input, ctx }) => { const db = await getDb(); if (!db) throw new Error("Database unavailable"); const [task] = await db.select().from(tasks).where(eq(tasks.id, input.id)).limit(1); if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "المهمة غير موجودة" }); if (ctx.user.role !== "admin" && task.assigneeId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية تحديث هذه المهمة" }); await db.update(tasks).set({ status: input.status }).where(eq(tasks.id, input.id)); return { success: true, actorId: ctx.user.id }; }),
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(tasks).where(eq(tasks.assigneeId, ctx.user.id)).limit(20);
    }),
    create: protectedProcedure.input(z.object({ branchId: z.number().int().positive().optional(), title: z.string().min(1).max(220), priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"), dueAt: z.date().optional() })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const result = await db.insert(tasks).values({ ...input, assigneeId: ctx.user.id });
      return { id: result[0].insertId };
    }),
    update: protectedProcedure.input(z.object({ id: z.number().int().positive(), title: z.string().min(1).max(220).optional(), priority: z.enum(["low", "medium", "high", "urgent"]).optional(), dueAt: z.date().optional() })).mutation(async ({ input, ctx }) => { const db = await getDb(); if (!db) throw new Error("Database unavailable"); const [task] = await db.select().from(tasks).where(eq(tasks.id, input.id)).limit(1); if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "المهمة غير موجودة" }); if (ctx.user.role !== "admin" && task.assigneeId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية تحرير هذه المهمة" }); await db.update(tasks).set({ title: input.title ?? task.title, priority: input.priority ?? task.priority, dueAt: input.dueAt ?? task.dueAt }).where(eq(tasks.id, input.id)); return { success: true }; }),
  }),
  ops: router({
    overview: protectedProcedure.input(z.object({ period: z.enum(["day", "week", "month"]).default("month") }).optional()).query(({ ctx, input }) => getOperationsOverview(ctx.user, input?.period ?? "month")),
  }),
});

export type AppRouter = typeof appRouter;
