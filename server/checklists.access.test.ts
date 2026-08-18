import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

let selectCount = 0;
const db = {
  select: () => { selectCount += 1; const rows = selectCount === 4 ? [{ id: 7, branchId: 1 }] : selectCount >= 5 ? [{ id: 11, visitId: 7, itemId: 1, result: "pass" }] : [{ id: 1, name: "قائمة افتتاح الفرع", role: "quality", templateId: 1, label: "نظافة الواجهة", orderIndex: 0 }]; Object.assign(rows, { limit: async () => rows }); const where = () => rows; return { from: () => ({ limit: async () => rows, where }) }; },
  insert: () => ({ values: async () => [{ insertId: 9 }] }),
  delete: () => ({ where: async () => undefined }),
  update: () => ({ set: () => ({ where: async () => undefined }) }),
};

vi.mock("./db", async importOriginal => {
  const actual = await importOriginal<typeof import("./db")>();
  return { ...actual, getDb: vi.fn(async () => db) };
});

const { appRouter } = await import("./routers");
const admin: TrpcContext = { user: { id: 1, openId: "checklist-admin", name: "مدير", email: "admin@example.com", role: "admin" }, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] };
const viewer: TrpcContext = { user: { id: 2, openId: "checklist-viewer", name: "مستخدم", email: "viewer@example.com", role: "user" }, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] };

describe("checklists and assignees access", () => {
  it("lists assignees and creates a checklist template", async () => {
    const caller = appRouter.createCaller(admin);
    expect(await caller.users.assignees()).toHaveLength(1);
    expect(await caller.checklists.create({ name: "قائمة افتتاح الفرع", category: "افتتاح", items: [{ label: "نظافة الواجهة", isRequired: true }] })).toEqual({ id: 9 });
  });

  it("lists templates, reads saved results, and records visit results", async () => {
    const caller = appRouter.createCaller(admin);
    const templates = await caller.checklists.list();
    expect(templates[0]).toMatchObject({ id: 1, name: "قائمة افتتاح الفرع" });
    expect(templates[0].items).toHaveLength(1);
    const savedResults = await caller.checklists.results({ visitIds: [7] });
    expect(savedResults.length).toBeGreaterThanOrEqual(1);
    expect(savedResults[0]).toMatchObject({ id: 11, visitId: 7, itemId: 1, result: "pass" });
    expect(await caller.checklists.record({ visitId: 7, results: [{ itemId: 1, result: "pass", note: "تم التحقق" }] })).toEqual({ success: true });
    expect(await caller.checklists.update({ id: 1, name: "قائمة افتتاح محدثة", isActive: true })).toEqual({ success: true });
    expect(await caller.checklists.updateItem({ id: 1, label: "نظافة المدخل", isRequired: false })).toEqual({ success: true });
    expect(await caller.checklists.reorder({ templateId: 1, itemIds: [1] })).toEqual({ success: true });
  });

  it("rejects unauthorized checklist creation and recording plus invalid input", async () => {
    const viewerCaller = appRouter.createCaller(viewer);
    await expect(viewerCaller.checklists.create({ name: "قائمة", category: "تشغيلي", items: [{ label: "عنصر", isRequired: true }] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(appRouter.createCaller(admin).checklists.create({ name: "قائمة", category: "تشغيلي", items: [] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(viewerCaller.checklists.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(viewerCaller.checklists.results({ visitIds: [7] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(viewerCaller.checklists.report({ period: "month" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(viewerCaller.checklists.alerts()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(viewerCaller.checklists.record({ visitId: 7, results: [{ itemId: 1, result: "pass" }] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(appRouter.createCaller(admin).checklists.record({ visitId: 7, results: [] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
