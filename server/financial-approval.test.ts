import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("financial snapshot approval wiring", () => {
  const routers = readFileSync(join(process.cwd(), "server/routers.ts"), "utf8");
  const home = readFileSync(join(process.cwd(), "client/src/pages/Home.tsx"), "utf8");

  it("keeps approval branch-scoped and restricted to administration", () => {
    expect(routers).toContain("updateApproval: roleProcedure([\"admin\", \"area_manager\", \"branch_manager\"])");
    expect(routers).toContain("if (!(await canAccessBranch(ctx.user, row.branchId)))");
    expect(routers).toContain("اعتماد البيانات المالية متاح للإدارة فقط");
    expect(routers).toContain("action: \"approval_status\"");
  });

  it("exposes draft, submitted, and approved states in the Arabic financial table", () => {
    expect(home).toContain("const approvalLabel = (status?: string)");
    expect(home).toContain("تقديم للمراجعة");
    expect(home).toContain("اعتماد");
    expect(home).toContain("معتمد");
    expect(home).toContain("trpc.financials.updateApproval.useMutation");
  });
});
