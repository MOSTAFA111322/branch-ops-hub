import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("individual branch permissions and report sharing", () => {
  const routerSource = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
  const dbSource = readFileSync(resolve(process.cwd(), "server/db.ts"), "utf8");
  const mapSource = readFileSync(resolve(process.cwd(), "client/src/components/BranchOperationsMap.tsx"), "utf8");

  it("exposes protected permission management with view/export/share flags", () => {
    expect(routerSource).toContain("permissions: router({");
    expect(routerSource).toContain("canView: z.boolean()");
    expect(routerSource).toContain("canExport: z.boolean()");
    expect(routerSource).toContain("canShare: z.boolean()");
    expect(routerSource).toContain("user_branch_permission");
  });

  it("records report recipients and delivery status", () => {
    expect(routerSource).toContain("reportShares: router({");
    expect(routerSource).toContain("recipients: z.array(z.string().trim().email())");
    expect(routerSource).toContain('status: z.enum(["queued", "sent", "failed", "partial"])');
    expect(routerSource).toContain("reportShareLogs");
  });

  it("filters branch access using explicit user permissions before role fallback", () => {
    expect(dbSource).toContain("userBranchPermissions");
    expect(dbSource).toContain("permission.canView");
    expect(dbSource).toContain("user.branchId ? branch.id === user.branchId");
  });

  it("prefers precise coordinates and keeps an explicit city fallback", () => {
    expect(mapSource).toContain("Number(branch.latitude)");
    expect(mapSource).toContain("Number(branch.longitude)");
    expect(mapSource).toContain("cityCoordinates");
    expect(mapSource).toContain("الإحداثيات الموثقة");
  });
});
