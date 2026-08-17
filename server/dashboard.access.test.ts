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
