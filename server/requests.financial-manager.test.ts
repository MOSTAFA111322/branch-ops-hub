import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

let storedRequests = [
  { id: 7, branchId: 1, requesterId: 40, title: "طلب شراء مواد تشغيلية", requestType: "expense", priority: "high", status: "assigned", description: "مواد للفرع", createdAt: new Date() },
  { id: 8, branchId: 2, requesterId: 41, title: "طلب صيانة", requestType: "expense", priority: "medium", status: "new", description: "خارج النطاق", createdAt: new Date() },
  { id: 9, branchId: null, requesterId: 42, title: "طلب عام", requestType: "expense", priority: "low", status: "new", description: null, createdAt: new Date() },
];
const auditRows: unknown[] = [];
let selectedRequestId = 7;

const db = {
  select: () => ({
    from: () => ({
      where: () => ({ limit: async () => { const row = storedRequests.find((item) => item.id === selectedRequestId); return row ? [row] : []; } }),
      limit: async () => storedRequests.slice(),
    }),
  }),
  update: () => ({
    set: (patch: Record<string, unknown>) => ({
      where: async () => {
        storedRequests = storedRequests.map((row) => row.id === 7 ? { ...row, ...patch } : row);
      },
    }),
  }),
  insert: () => ({ values: async (value: unknown) => { auditRows.push(value); return [{ insertId: auditRows.length }]; } }),
};

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getDb: vi.fn(async () => db),
    listBranches: vi.fn(async (user: { role: string }) => user.role === "financial_manager" ? [{ id: 1, name: "الفرع الأول" }] : [{ id: 1 }, { id: 2 }]),
    canAccessBranch: vi.fn(async (user: { role: string }, branchId: number) => user.role === "financial_manager" ? branchId === 1 : true),
  };
});

const { appRouter } = await import("./routers");

const context = (id: number, role: "financial_manager" | "user"): TrpcContext => ({
  user: { id, openId: `${role}-${id}`, name: role === "financial_manager" ? "المدير المالي" : "مستخدم", email: `${role}${id}@example.com`, role },
  req: {} as TrpcContext["req"],
  res: {} as TrpcContext["res"],
});

describe("financial manager internal request approvals", () => {
  it("allows the financial manager to advance an in-scope expense request and audits it", async () => {
    selectedRequestId = 7;
    const result = await appRouter.createCaller(context(90, "financial_manager")).requests.updateStatus({ id: 7, status: "completed" });
    expect(result).toMatchObject({ success: true, actorId: 90 });
    expect(storedRequests.find((row) => row.id === 7)?.status).toBe("completed");
    expect(auditRows).toEqual(expect.arrayContaining([expect.objectContaining({ entityType: "internal_request", entityId: 7, action: "status_update" })]));
  });

  it("rejects a request belonging to a branch outside the financial manager scope", async () => {
    selectedRequestId = 8;
    await expect(appRouter.createCaller(context(90, "financial_manager")).requests.updateStatus({ id: 8, status: "completed" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("keeps regular users from changing another user's request", async () => {
    selectedRequestId = 7;
    await expect(appRouter.createCaller(context(91, "user")).requests.updateStatus({ id: 7, status: "in_progress" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
