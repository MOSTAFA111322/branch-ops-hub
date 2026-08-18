import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, roleProcedure, router } from "./_core/trpc";
import { eq } from "drizzle-orm";
import { getBranchById, getBranchProfile, getDashboardSummary, getOperationsOverview, listBranches, getDb } from "./db";
import { branches, correctiveActions, documents, internalRequests, maintenanceTickets, qualityCases, tasks, visits } from "../drizzle/schema";

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
    updateStatus: roleProcedure(["admin", "area_manager", "branch_manager", "quality"]).input(z.object({ id: z.number().int().positive(), status: z.enum(["open", "in_progress", "pending_review", "closed"]), closureEvidenceUrl: z.string().url().optional() })).mutation(async ({ input }) => { const db = await getDb(); if (!db) throw new Error("Database unavailable"); await db.update(correctiveActions).set({ status: input.status, closureEvidenceUrl: input.closureEvidenceUrl }).where(eq(correctiveActions.id, input.id)); return { success: true }; }),
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
  }),
  visits: router({
    updateStatus: roleProcedure(["admin", "area_manager", "branch_manager", "quality"]).input(z.object({ id: z.number().int().positive(), status: z.enum(["scheduled", "in_progress", "completed", "cancelled"]), score: z.number().min(0).max(100).optional(), notes: z.string().optional() })).mutation(async ({ input }) => { const db = await getDb(); if (!db) throw new Error("Database unavailable"); await db.update(visits).set({ status: input.status, score: input.score?.toString(), notes: input.notes, completedAt: input.status === "completed" ? new Date() : undefined }).where(eq(visits.id, input.id)); return { success: true }; }),
    create: roleProcedure(["admin", "area_manager", "branch_manager", "quality"]).input(z.object({ branchId: z.number().int().positive(), scheduledAt: z.date().optional(), notes: z.string().optional() })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const result = await db.insert(visits).values(input);
      return { id: result[0].insertId };
    }),
  }),
  documents: router({
    create: roleProcedure(["admin", "area_manager", "branch_manager", "quality"]).input(z.object({ branchId: z.number().int().positive(), title: z.string().min(1).max(220), documentType: z.string().min(1).max(100), expiresAt: z.date().optional(), fileUrl: z.string().url().optional() })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const result = await db.insert(documents).values(input);
      return { id: result[0].insertId };
    }),
  }),
  quality: router({
    updateStatus: roleProcedure(["admin", "area_manager", "branch_manager", "quality"]).input(z.object({ id: z.number().int().positive(), status: z.enum(["open", "investigating", "resolved", "closed"]), rootCause: z.string().optional() })).mutation(async ({ input }) => { const db = await getDb(); if (!db) throw new Error("Database unavailable"); await db.update(qualityCases).set({ status: input.status, rootCause: input.rootCause }).where(eq(qualityCases.id, input.id)); return { success: true }; }),
    create: roleProcedure(["admin", "area_manager", "branch_manager", "quality"]).input(z.object({ branchId: z.number().int().positive(), title: z.string().min(1).max(220), caseType: z.enum(["non_conformity", "complaint", "observation"]), severity: z.enum(["low", "medium", "high", "critical"]).default("medium"), description: z.string().optional() })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const result = await db.insert(qualityCases).values(input);
      return { id: result[0].insertId };
    }),
  }),
  maintenance: router({
    updateStatus: roleProcedure(["admin", "area_manager", "branch_manager", "maintenance"]).input(z.object({ id: z.number().int().positive(), status: z.enum(["open", "assigned", "in_progress", "resolved", "closed"]) })).mutation(async ({ input }) => { const db = await getDb(); if (!db) throw new Error("Database unavailable"); await db.update(maintenanceTickets).set({ status: input.status }).where(eq(maintenanceTickets.id, input.id)); return { success: true }; }),
    create: roleProcedure(["admin", "area_manager", "branch_manager", "maintenance"]).input(z.object({ branchId: z.number().int().positive(), assetName: z.string().min(1).max(160), title: z.string().min(1).max(220), ticketType: z.enum(["breakdown", "preventive", "warranty"]).default("breakdown"), priority: z.enum(["low", "medium", "high", "urgent"]).default("medium") })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const result = await db.insert(maintenanceTickets).values(input);
      return { id: result[0].insertId };
    }),
  }),
  requests: router({
    updateStatus: protectedProcedure.input(z.object({ id: z.number().int().positive(), status: z.enum(["new", "assigned", "in_progress", "completed", "rejected"]) })).mutation(async ({ input, ctx }) => { const db = await getDb(); if (!db) throw new Error("Database unavailable"); await db.update(internalRequests).set({ status: input.status }).where(eq(internalRequests.id, input.id)); return { success: true, actorId: ctx.user.id }; }),
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
  }),
  tasks: router({
    updateStatus: protectedProcedure.input(z.object({ id: z.number().int().positive(), status: z.enum(["todo", "in_progress", "done"]) })).mutation(async ({ input, ctx }) => { const db = await getDb(); if (!db) throw new Error("Database unavailable"); await db.update(tasks).set({ status: input.status }).where(eq(tasks.id, input.id)); return { success: true, actorId: ctx.user.id }; }),
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
  }),
  ops: router({
    overview: protectedProcedure.query(({ ctx }) => getOperationsOverview(ctx.user)),
  }),
});

export type AppRouter = typeof appRouter;
