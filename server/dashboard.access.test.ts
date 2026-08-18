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
