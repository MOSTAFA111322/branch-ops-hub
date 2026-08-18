import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { TrpcContext } from "./_core/context";

const branchRows: Array<Record<string, unknown>> = [];
const insert = vi.fn(async (input: Record<string, unknown>) => {
  const row = { id: 42, healthScore: 100, ...input };
  branchRows.push(row);
  return [{ insertId: 42 }];
});
const update = vi.fn(() => ({ where: async () => undefined }));
const db = {
  insert: () => ({ values: insert }),
  update: () => ({ set: (changes: Record<string, unknown>) => { const target = branchRows[0]; if (target) Object.assign(target, changes); return update(); } }),
  select: () => ({ from: () => ({ orderBy: async () => branchRows, where: () => ({ limit: async () => branchRows }) }) }),
};

vi.mock("./db", async importOriginal => {
  const actual = await importOriginal<typeof import("./db")>();
  return { ...actual, getDb: vi.fn(async () => db) };
});

const { appRouter } = await import("./routers");
const admin: TrpcContext = { user: { id: 1, openId: "branch-admin", name: "مدير", email: "admin@example.com", role: "admin" }, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] };
const viewer: TrpcContext = { user: { id: 2, openId: "branch-viewer", name: "مستخدم", email: "viewer@example.com", role: "user" }, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] };
const areaManager: TrpcContext = { user: { id: 3, openId: "area-manager", name: "مدير المنطقة", email: "area@example.com", role: "area_manager", regionId: 3 }, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] };

const branchInput = { code: "RYD-001", name: "فرع الرياض", regionId: 3, region: "الوسطى", city: "الرياض", managerName: "مدير الفرع" };

describe("branches.create", () => {
  it("creates a branch and returns the inserted id with its data", async () => {
    const result = await appRouter.createCaller(admin).branches.create(branchInput);
    expect(result).toEqual({ id: 42, ...branchInput });
    expect(insert).toHaveBeenCalledWith(branchInput);
  });

  it("stores the newly created branch for the directory refresh", () => {
    expect(branchRows).toEqual([expect.objectContaining({ id: 42, code: "RYD-001", name: "فرع الرياض" })]);
  });

  it("updates an existing branch and rejects unauthorized updates", async () => {
    const result = await appRouter.createCaller(admin).branches.update({ id: 42, name: "فرع الرياض المحدث", city: "الدرعية" });
    expect(result).toMatchObject({ id: 42, name: "فرع الرياض المحدث", city: "الدرعية" });
    expect(branchRows[0]).toMatchObject({ name: "فرع الرياض المحدث", city: "الدرعية" });
    await expect(appRouter.createCaller(viewer).branches.update({ id: 42, name: "غير مصرح" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(appRouter.createCaller(areaManager).branches.update({ id: 42, regionId: 99, region: "منطقة أخرى" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    branchRows.length = 0;
    await expect(appRouter.createCaller(admin).branches.update({ id: 999, name: "غير موجود" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("invalidates the branch directory after a successful create", () => {
    const homeSource = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
    expect(homeSource).toContain("void utils.branches.list.invalidate()");
    expect(homeSource).toContain("تمت إضافة الفرع بنجاح.");
    expect(homeSource).toContain("تم تحديث بيانات الفرع بنجاح.");
    expect(homeSource).toContain("readableBranchError");
  });

  it("rejects unauthorized users and invalid branch data", async () => {
    await expect(appRouter.createCaller(viewer).branches.create(branchInput)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(appRouter.createCaller(admin).branches.create({ ...branchInput, code: "" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
