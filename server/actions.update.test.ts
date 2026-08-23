import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const updatePayloads: Array<Record<string, unknown>> = [];
const successDb = {
  select: () => ({
    from: () => ({
      where: () => ({
        limit: async () => [{ id: 1 }],
      }),
    }),
  }),
  insert: () => ({
    values: async () => undefined,
  }),
  update: () => ({
    set: (payload: Record<string, unknown>) => ({
      where: async () => {
        updatePayloads.push(payload);
      },
    }),
  }),
};

vi.mock("./db", async importOriginal => {
  const actual = await importOriginal<typeof import("./db")>();
  return { ...actual, getDb: vi.fn(async () => successDb) };
});

const { appRouter } = await import("./routers");

const adminContext: TrpcContext = {
  user: { id: 1, openId: "actions-update-admin", name: "مدير التشغيل", email: "admin@example.com", role: "admin" },
  req: {} as TrpcContext["req"],
  res: {} as TrpcContext["res"],
};

describe("actions.update owner and closure evidence", () => {
  it("persists the assignee and closure evidence URL", async () => {
    updatePayloads.length = 0;
    const result = await appRouter.createCaller(adminContext).actions.update({
      id: 1,
      ownerId: 7,
      closureEvidenceUrl: "https://example.com/evidence/action-1.pdf",
    });
    expect(result).toEqual({ success: true });
    expect(updatePayloads[0]).toMatchObject({
      ownerId: 7,
      closureEvidenceUrl: "https://example.com/evidence/action-1.pdf",
    });
  });

  it("rejects malformed owner and evidence inputs before database access", async () => {
    const caller = appRouter.createCaller(adminContext);
    await expect(caller.actions.update({ id: 1, ownerId: 0 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.actions.update({ id: 1, closureEvidenceUrl: "not-a-url" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

const branchManagerContext: TrpcContext = {
  user: { id: 2, openId: "actions-update-manager", name: "مدير فرع", email: "manager@example.com", role: "branch_manager", branchId: 1 },
  req: {} as TrpcContext["req"],
  res: {} as TrpcContext["res"],
};

describe("actions branch authorization", () => {
  it("rejects creating an action for a branch outside the user's scope", async () => {
    await expect(appRouter.createCaller(branchManagerContext).actions.create({
      branchId: 2,
      title: "محاولة خارج النطاق",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
