import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { TrpcContext } from "./_core/context";
import { branches, regions } from "../drizzle/schema";

const branchRows: Array<Record<string, unknown>> = [];
const regionRows: Array<Record<string, unknown>> = [{ id: 3, name: "الوسطى" }];
const insert = vi.fn(async (table: unknown, input: Record<string, unknown>) => {
  if (table === regions) {
    const row = { id: regionRows.length + 1, ...input };
    regionRows.push(row);
    return [{ insertId: row.id }];
  }
  const row = { id: 42 + branchRows.length, healthScore: 100, ...input };
  branchRows.push(row);
  return [{ insertId: row.id }];
});
const update = vi.fn(() => ({ where: async () => undefined }));
const db = {
  insert: (table: unknown) => ({ values: (input: Record<string, unknown>) => insert(table, input) }),
  update: () => ({ set: (changes: Record<string, unknown>) => { const target = branchRows[0]; if (target) Object.assign(target, changes); return update(); } }),
  select: () => ({ from: (table: unknown) => ({
    orderBy: async () => table === regions ? regionRows : branchRows,
    where: () => ({ limit: async () => table === regions ? regionRows : branchRows }),
  }) }),
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
  beforeEach(() => {
    branchRows.length = 0;
    regionRows.length = 0;
    insert.mockClear();
  });

  it("creates a branch with an existing region and returns the inserted id with its data", async () => {
    regionRows.push({ id: 3, name: "الوسطى" });
    const result = await appRouter.createCaller(admin).branches.create(branchInput);
    expect(result).toEqual({ id: 42, ...branchInput, operationalType: "branch" });
    expect(branchRows).toEqual([expect.objectContaining(branchInput)]);
  });

  it("creates a missing region before creating the branch", async () => {
    const result = await appRouter.createCaller(admin).branches.create({ ...branchInput, code: "RYD-002", regionId: 1, region: "الرياض" });
    expect(result.regionId).toBe(1);
    expect(regionRows).toContainEqual({ id: 1, name: "الرياض" });
    expect(branchRows).toContainEqual(expect.objectContaining({ code: "RYD-002", regionId: 1, region: "الرياض" }));
  });

  it("updates an existing branch and rejects unauthorized updates", async () => {
    regionRows.push({ id: 3, name: "الوسطى" });
    await appRouter.createCaller(admin).branches.create(branchInput);
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

export { branchRows, regionRows };

