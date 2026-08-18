import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

describe("branch operations access", () => {
  it("returns the authenticated user from auth.me", async () => {
    const user = {
      id: 7,
      openId: "ops-user",
      name: "مدير التشغيل",
      email: "ops@example.com",
      loginMethod: "manus",
      role: "admin" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    };
    const ctx: TrpcContext = {
      user,
      req: {} as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    };
    const result = await appRouter.createCaller(ctx).auth.me();
    expect(result?.openId).toBe("ops-user");
    expect(result?.role).toBe("admin");
  });

  it("rejects a branch action without an authenticated user", async () => {
    const ctx: TrpcContext = {
      user: null,
      req: {} as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    };
    await expect(appRouter.createCaller(ctx).actions.create({
      branchId: 1,
      title: "فحص تجريبي",
      priority: "medium",
    })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

  it("forbids a regular user from creating a branch", async () => {
    const ctx: TrpcContext = {
      user: {
        id: 8,
        openId: "regular-user",
        name: "مستخدم عادي",
        email: "user@example.com",
        loginMethod: "manus",
        role: "user",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
      req: {} as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    };
    await expect(appRouter.createCaller(ctx).branches.create({
      code: "BR-TEST",
      name: "فرع اختبار",
      regionId: 1,
      region: "الرياض",
      city: "الرياض",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });


describe("operational module access", () => {
  const anonymousContext: TrpcContext = { user: null, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] };

  it("rejects unauthenticated operational writes", async () => {
    const caller = appRouter.createCaller(anonymousContext);
    await expect(caller.visits.create({ branchId: 1 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.documents.create({ branchId: 1, title: "رخصة", documentType: "ترخيص" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.requests.create({ title: "طلب", requestType: "تشغيل" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.tasks.create({ title: "مهمة" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects invalid branch identifiers before database access", async () => {
    const user = { id: 9, openId: "quality-user", name: "الجودة", email: "quality@example.com", loginMethod: "manus", role: "quality" as const, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
    const ctx: TrpcContext = { user, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] };
    await expect(appRouter.createCaller(ctx).visits.create({ branchId: 0 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("branch profile access", () => {
  const anonymousContext: TrpcContext = { user: null, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] };

  it("rejects unauthenticated branch profile reads", async () => {
    const caller = appRouter.createCaller(anonymousContext);
    await expect(caller.branches.getById({ id: 1 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.branches.profile({ id: 1 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects invalid branch profile identifiers before database access", async () => {
    const user = { id: 10, openId: "profile-user", name: "مراجع", email: "reviewer@example.com", loginMethod: "manus", role: "admin" as const, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
    const ctx: TrpcContext = { user, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(ctx);
    await expect(caller.branches.getById({ id: 0 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.branches.profile({ id: 0 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("operational status transitions", () => {
  const anonymousContext: TrpcContext = { user: null, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] };

  it("rejects unauthenticated status transitions", async () => {
    const caller = appRouter.createCaller(anonymousContext);
    await expect(caller.actions.updateStatus({ id: 1, status: "closed" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.visits.updateStatus({ id: 1, status: "completed" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.maintenance.updateStatus({ id: 1, status: "closed" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.tasks.updateStatus({ id: 1, status: "done" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects an unauthorized role from maintenance status changes", async () => {
    const user = { id: 11, openId: "warehouse-user", name: "المستودع", email: "warehouse@example.com", loginMethod: "manus", role: "warehouse" as const, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
    const ctx: TrpcContext = { user, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] };
    await expect(appRouter.createCaller(ctx).maintenance.updateStatus({ id: 1, status: "closed" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("periodic reports and personal work center", () => {
  const anonymousContext: TrpcContext = { user: null, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] };

  it("rejects unauthenticated periodic report reads", async () => {
    await expect(appRouter.createCaller(anonymousContext).ops.overview({ period: "week" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects unauthenticated personal task reads", async () => {
    await expect(appRouter.createCaller(anonymousContext).tasks.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("operational input validation", () => {
  const adminContext: TrpcContext = { user: { id: 1, openId: "admin", name: "Admin", email: "admin@example.com", role: "admin" }, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] };

  it("rejects invalid visit scores before database access", async () => {
    await expect(appRouter.createCaller(adminContext).visits.updateStatus({ id: 1, status: "completed", score: 101 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects invalid request identifiers before database access", async () => {
    await expect(appRouter.createCaller(adminContext).requests.remove({ id: 0 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects invalid maintenance status values before database access", async () => {
    await expect(appRouter.createCaller(adminContext).maintenance.updateStatus({ id: 1, status: "unknown" as never })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("document editing access", () => {
  const anonymousContext: TrpcContext = { user: null, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] };
  const adminContext: TrpcContext = { user: { id: 1, openId: "admin-docs", name: "Admin", email: "admin@example.com", role: "admin" }, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] };

  it("rejects unauthenticated document edits", async () => {
    await expect(appRouter.createCaller(anonymousContext).documents.update({ id: 1, version: "2.0" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects invalid document update input before database access", async () => {
    await expect(appRouter.createCaller(adminContext).documents.update({ id: 0, version: "" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects malformed document URLs before database access", async () => {
    await expect(appRouter.createCaller(adminContext).documents.update({ id: 1, fileUrl: "not-a-url" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("independent operational updates", () => {
  const anonymousContext: TrpcContext = { user: null, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] };
  const adminContext: TrpcContext = { user: { id: 1, openId: "admin-updates", name: "Admin", email: "admin@example.com", role: "admin" }, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] };

  it("rejects unauthenticated independent updates", async () => {
    const caller = appRouter.createCaller(anonymousContext);
    await expect(caller.actions.update({ id: 1, title: "تحديث" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.visits.update({ id: 1, notes: "مراجعة" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.quality.update({ id: 1, rootCause: "سبب" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.maintenance.update({ id: 1, priority: "high" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects malformed independent update inputs before database access", async () => {
    const caller = appRouter.createCaller(adminContext);
    await expect(caller.actions.update({ id: 0, title: "غير صالح" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.visits.update({ id: 0, score: 101 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.quality.update({ id: 0, severity: "invalid" as never })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.maintenance.update({ id: 0, priority: "invalid" as never })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("independent update role boundaries", () => {
  const warehouseContext: TrpcContext = { user: { id: 12, openId: "warehouse-boundary", name: "المستودع", email: "warehouse@example.com", loginMethod: "manus", role: "warehouse" as const, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] };
  const qualityContext: TrpcContext = { user: { id: 13, openId: "quality-boundary", name: "الجودة", email: "quality@example.com", loginMethod: "manus", role: "quality" as const, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] };

  it("rejects warehouse users from non-maintenance updates", async () => {
    const caller = appRouter.createCaller(warehouseContext);
    await expect(caller.actions.update({ id: 1, title: "ممنوع" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.visits.update({ id: 1, notes: "ممنوع" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.quality.update({ id: 1, rootCause: "ممنوع" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects quality users from maintenance updates", async () => {
    await expect(appRouter.createCaller(qualityContext).maintenance.update({ id: 1, priority: "high" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
