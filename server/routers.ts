import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, roleProcedure, router } from "./_core/trpc";
import { getBranchById, getDashboardSummary, getOperationsOverview, listBranches, getDb } from "./db";
import { branches, correctiveActions, tasks } from "../drizzle/schema";

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
    getById: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(({ input }) => getBranchById(input.id)),
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
  ops: router({
    overview: protectedProcedure.query(({ ctx }) => getOperationsOverview(ctx.user)),
  }),
  tasks: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(tasks).limit(20);
    }),
  }),
});

export type AppRouter = typeof appRouter;
