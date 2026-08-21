import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

let storedRows: any[] = [{ id: 10, branchId: 1, periodYear: 2026, periodMonth: 8, revenue: "10000.00", costOfGoods: "4000.00", operatingExpenses: "2000.00", netProfit: "4000.00" }];
const db = {
  select: () => ({ from: () => ({ where: async () => storedRows }) }),
  insert: () => ({ values: async (values: any) => { storedRows.push({ id: 11, ...values }); return [{ insertId: 11 }]; } }),
  update: () => ({ set: (values: any) => ({ where: async () => { storedRows = storedRows.map(row => row.id === 10 ? { ...row, ...values } : row); } }) }),
  delete: () => ({ where: async () => { storedRows = storedRows.filter(row => row.id !== 10); } }),
};

vi.mock("./db", async importOriginal => {
  const actual = await importOriginal<typeof import("./db")>();
  return { ...actual, getDb: vi.fn(async () => db), listBranches: vi.fn(async () => [{ id: 1, name: "الفرع الرئيسي", operationalType: "branch" }]) };
});

const { appRouter } = await import("./routers");
const admin: TrpcContext = { user: { id: 1, openId: "financial-admin", name: "مدير", email: "admin@example.com", role: "admin" }, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] };
const viewer: TrpcContext = { user: { id: 2, openId: "financial-viewer", name: "مستخدم", email: "viewer@example.com", role: "user" }, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] };

describe("monthly financial snapshots", () => {
  it("lists and upserts a branch snapshot while calculating net profit", async () => {
    const caller = appRouter.createCaller(admin);
    expect((await caller.financials.list({ year: 2026, month: 8 }))[0]).toMatchObject({ branchId: 1, netProfit: "4000.00" });
    expect(await caller.financials.upsert({ branchId: 1, year: 2026, month: 9, revenue: 12000, costOfGoods: 5000, operatingExpenses: 2500 })).toEqual({ id: 11, updated: false });
    expect(storedRows.find(row => row.netProfit === "4500.00")).toMatchObject({ netProfit: "4500.00", source: "manual" });
  });

  it("returns the cost-center expense summary with sales-center classification", async () => {
    const summary = await appRouter.createCaller(admin).financials.expenseSummary({ year: 2026, month: 8 });
    expect(summary[0]).toMatchObject({ branchId: 1, branchName: "الفرع الرئيسي", salesCenter: true, operatingExpenses: 2000, netProfit: 4000 });
    await expect(appRouter.createCaller(viewer).financials.expenseSummary({ year: 2026, month: 8 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("enforces read scope, rejects unauthorized mutations, and validates periods", async () => {
    const viewerCaller = appRouter.createCaller(viewer);
    expect(await viewerCaller.financials.list({ year: 2026, month: 8 })).toEqual(expect.arrayContaining([expect.objectContaining({ branchId: 1, periodMonth: 8 })]));
    await expect(viewerCaller.financials.upsert({ branchId: 1, year: 2026, month: 8, revenue: 1, costOfGoods: 0, operatingExpenses: 0 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(viewerCaller.financials.remove({ id: 10 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(appRouter.createCaller(admin).financials.upsert({ branchId: 1, year: 2026, month: 13, revenue: 1, costOfGoods: 0, operatingExpenses: 0 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("removes a snapshot in the allowed branch scope", async () => {
    await expect(appRouter.createCaller(admin).financials.remove({ id: 10 })).resolves.toEqual({ success: true });
  });

  it("returns NOT_FOUND when the snapshot store has no matching rows", async () => {
    storedRows = [];
    await expect(appRouter.createCaller(admin).financials.remove({ id: 999 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
