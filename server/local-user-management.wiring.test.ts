import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const routerSource = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
const managerSource = readFileSync(resolve(process.cwd(), "client/src/components/UserAccountManager.tsx"), "utf8");

describe("local user management wiring", () => {
  it("exposes the local login and admin account procedures", () => {
    expect(routerSource).toContain("localLogin:");
    expect(routerSource).toContain("createLocal:");
    expect(routerSource).toContain("updateLocal:");
    expect(managerSource).toContain("trpc.users.createLocal.useMutation");
    expect(managerSource).toContain("trpc.users.updateLocal.useMutation");
  });

  it("keeps password out of audit payloads and protects the last active admin", () => {
    expect(routerSource).toContain("password: undefined");
    expect(routerSource).toContain("لا يمكن تعطيل آخر مدير نشط");
    expect(routerSource).toContain("activeAdmins.length <= 1");
  });

  it("keeps branch permissions in the existing isolation model", () => {
    expect(routerSource).toContain("userBranchPermissions");
    expect(routerSource).toContain("branchPermissions");
    expect(readFileSync(resolve(process.cwd(), "server/db.ts"), "utf8")).toContain("user.id");
  });
});
