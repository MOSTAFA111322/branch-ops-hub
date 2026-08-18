import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, roleProcedure, router } from "./_core/trpc";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getBranchById, getBranchProfile, getDashboardSummary, getOperationsOverview, listBranches, getDb } from "./db";
import { branches, correctiveActions, documentVersions, documents, internalRequests, maintenanceTickets, qualityCases, tasks, visits } from "../drizzle/schema";

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
    update: roleProcedure(["admin", "area_manager", "branch_manager", "quality"]).input(z.object({ id: z.number().int().positive(), title: z.string().min(1).max(220).optional(), description: z.string().optional(), priority: z.enum(["low", "medium", "high", "urgent"]).optional(), dueAt: z.date().optional(), closureEvidenceUrl: z.string().url().optional() })).mutation(async ({ input }) => { const db = await getDb(); if (!db) throw new Error("Database unavailable"); const [current] = await db.select({ id: correctiveActions.id }).from(correctiveActions).where(eq(correctiveActions.id, input.id)).limit(1); if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "الإجراء غير موجود" }); await db.update(correctiveActions).set({ title: input.title, description: input.description, priority: input.priority, dueAt: input.dueAt, closureEvidenceUrl: input.closureEvidenceUrl }).where(eq(correctiveActions.id, input.id)); return { success: true }; }),
  }),
  visits: router({
    remove: roleProcedure(["admin", "area_manager", "branch_manager", "quality"]).input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => { const db = await getDb(); if (!db) throw new Error("Database unavailable"); await db.delete(visits).where(eq(visits.id, input.id)); return { success: true }; }),
    updateStatus: roleProcedure(["admin", "area_manager", "branch_manager", "quality"]).input(z.object({ id: z.number().int().positive(), status: z.enum(["scheduled", "in_progress", "completed", "cancelled"]), score: z.number().min(0).max(100).optional(), notes: z.string().min(1).optional(), reportTitle: z.string().min(1).max(220).optional(), findings: z.string().optional(), recommendations: z.string().optional(), approvalStatus: z.enum(["draft", "submitted", "approved"]).optional() })).mutation(async ({ input }) => { const db = await getDb(); if (!db) throw new Error("Database unavailable"); const [visit] = await db.select().from(visits).where(eq(visits.id, input.id)).limit(1); if (!visit) throw new TRPCError({ code: "NOT_FOUND", message: "الزيارة غير موجودة" }); await db.update(visits).set({ status: input.status, score: input.score?.toString(), notes: input.notes, reportTitle: input.reportTitle, findings: input.findings, recommendations: input.recommendations, approvalStatus: input.approvalStatus, approvedAt: input.approvalStatus === "approved" ? new Date() : undefined, completedAt: input.status === "completed" ? new Date() : undefined }).where(eq(visits.id, input.id)); if (input.status === "completed" && input.score !== undefined) await db.update(branches).set({ healthScore: input.score.toString() }).where(eq(branches.id, visit.branchId)); return { success: true, branchId: visit.branchId, score: input.score ?? null, approvalStatus: input.approvalStatus ?? visit.approvalStatus }; }),
    update: roleProcedure(["admin", "area_manager", "branch_manager", "quality"]).input(z.object({ id: z.number().int().positive(), scheduledAt: z.date().optional(), notes: z.string().optional(), reportTitle: z.string().min(1).max(220).optional(), findings: z.string().optional(), recommendations: z.string().optional() })).mutation(async ({ input }) => { const db = await getDb(); if (!db) throw new Error("Database unavailable"); const [current] = await db.select({ id: visits.id }).from(visits).where(eq(visits.id, input.id)).limit(1); if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "الزيارة غير موجودة" }); await db.update(visits).set({ scheduledAt: input.scheduledAt, notes: input.notes, reportTitle: input.reportTitle, findings: input.findings, recommendations: input.recommendations }).where(eq(visits.id, input.id)); return { success: true }; }),
    create: roleProcedure(["admin", "area_manager", "branch_manager", "quality"]).input(z.object({ branchId: z.number().int().positive(), scheduledAt: z.date().optional(), notes: z.string().optional() })).mutation(async ({ input }) => {
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
