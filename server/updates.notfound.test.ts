import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const emptyDb = {
  select: () => ({
    from: () => ({
      where: () => ({
        limit: async () => [],
      }),
    }),
  }),
};

vi.mock("./db", async importOriginal => {
  const actual = await importOriginal<typeof import("./db")>();
  return { ...actual, getDb: vi.fn(async () => emptyDb) };
});

const { appRouter } = await import("./routers");

const adminContext: TrpcContext = {
  user: {
    id: 1,
    openId: "not-found-admin",
    name: "Admin",
    email: "admin@example.com",
    role: "admin",
  },
  req: {} as TrpcContext["req"],
  res: {} as TrpcContext["res"],
};

describe("independent update not-found handling", () => {
  it("returns NOT_FOUND before issuing updates for all operational records", async () => {
    const caller = appRouter.createCaller(adminContext);
    await expect(caller.actions.update({ id: 404, title: "غير موجود" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(caller.visits.update({ id: 404, notes: "غير موجود" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(caller.quality.update({ id: 404, rootCause: "غير موجود" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(caller.maintenance.update({ id: 404, priority: "high" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
