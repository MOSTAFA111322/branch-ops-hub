import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const updatedTables: string[] = [];
const db = {
  select: () => ({
    from: () => ({
      where: () => ({
        limit: async () => [{ id: 1, branchId: 2, approvalStatus: "draft" }],
      }),
    }),
  }),
  update: () => ({
    set: () => ({
      where: async () => {
        updatedTables.push("updated");
      },
    }),
  }),
};

vi.mock("./db", async importOriginal => {
  const actual = await importOriginal<typeof import("./db")>();
  return { ...actual, getDb: vi.fn(async () => db) };
});

const { appRouter } = await import("./routers");
const context: TrpcContext = { user: { id: 1, openId: "ops-success", name: "مشغل", email: "ops@example.com", role: "admin" }, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] };

describe("operational update success paths", () => {
  it("updates visit, quality, and maintenance records", async () => {
    updatedTables.length = 0;
    const caller = appRouter.createCaller(context);
    expect(await caller.visits.update({ id: 1, notes: "تمت المراجعة", reportTitle: "محضر الزيارة" })).toEqual({ success: true });
    expect(await caller.quality.update({ id: 1, rootCause: "إجراء غير موحد", severity: "high" })).toEqual({ success: true });
    expect(await caller.maintenance.update({ id: 1, priority: "high", warrantyUntil: new Date("2027-01-01") })).toEqual({ success: true });
    expect(updatedTables).toHaveLength(3);
  });
});
