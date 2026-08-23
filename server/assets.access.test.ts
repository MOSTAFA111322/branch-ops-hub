import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const dbMock = {
  select: () => ({
    from: () => ({
      where: () => ({
        limit: async () => [{ id: 1 }],
      }),
    }),
  }),
};

vi.mock("./db", async importOriginal => {
  const actual = await importOriginal<typeof import("./db")>();
  return { ...actual, getDb: vi.fn(async () => dbMock) };
});

const { appRouter } = await import("./routers");

const branchManagerContext: TrpcContext = {
  user: { id: 2, openId: "assets-access-manager", name: "مدير فرع", email: "assets@example.com", role: "branch_manager", branchId: 1 },
  req: {} as TrpcContext["req"],
  res: {} as TrpcContext["res"],
};

describe("assets branch authorization", () => {
  it("rejects reading another branch's assets", async () => {
    await expect(appRouter.createCaller(branchManagerContext).assets.list({ branchId: 2 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
