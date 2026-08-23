import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const routerSource = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");

describe("operational branch authorization audit", () => {
  it("uses the shared branch guard for quality and maintenance mutations", () => {
    const qualityBlock = routerSource.slice(routerSource.indexOf("  quality: router({"), routerSource.indexOf("  maintenance: router({"));
    const maintenanceBlock = routerSource.slice(routerSource.indexOf("  maintenance: router({"), routerSource.indexOf("  assets: router({"));

    expect(qualityBlock).toContain("canAccessBranch(ctx.user, input.branchId)");
    expect(qualityBlock).toContain("canAccessBranch(ctx.user, current.branchId)");
    expect(maintenanceBlock).toContain("canAccessBranch(ctx.user, input.branchId)");
    expect(maintenanceBlock).toContain("canAccessBranch(ctx.user, ticket.branchId)");
    expect(maintenanceBlock).toContain("canAccessBranch(ctx.user, current.branchId)");
  });

  it("keeps explicit forbidden responses for out-of-scope branch access", () => {
    const operationalStart = routerSource.indexOf("  visits: router({");
    const assetsStart = routerSource.indexOf("  assets: router({");
    const operationalSource = routerSource.slice(operationalStart, assetsStart);

    expect(operationalSource).toContain('code: "FORBIDDEN"');
    expect(operationalSource).toContain("لا تملك صلاحية هذا الفرع");
  });
});
