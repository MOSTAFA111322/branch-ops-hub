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
const db = {
  insert: () => ({ values: insert }),
  select: () => ({ from: () => ({ orderBy: async () => branchRows }) }),
};

vi.mock("./db", async importOriginal => {
  const actual = await importOriginal<typeof import("./db")>();
  return { ...actual, getDb: vi.fn(async () => db) };
});

const { appRouter } = await import("./routers");
const admin: TrpcContext = { user: { id: 1, openId: "branch-admin", name: "مدير", email: "admin@example.com", role: "admin" }, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] };
const viewer: TrpcContext = { user: { id: 2, openId: "branch-viewer", name: "مستخدم", email: "viewer@example.com", role: "user" }, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] };

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

  it("invalidates the branch directory after a successful create", () => {
    const homeSource = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
    expect(homeSource).toContain("void utils.branches.list.invalidate()");
    expect(homeSource).toContain("تمت إضافة الفرع بنجاح.");
  });

  it("rejects unauthorized users and invalid branch data", async () => {
    await expect(appRouter.createCaller(viewer).branches.create(branchInput)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(appRouter.createCaller(admin).branches.create({ ...branchInput, code: "" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
