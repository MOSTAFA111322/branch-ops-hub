import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("backup and historical import wiring", () => {
  const root = join(process.cwd());
  const component = readFileSync(join(root, "client/src/components/BackupRestoreManager.tsx"), "utf8");
  const home = readFileSync(join(root, "client/src/pages/Home.tsx"), "utf8");
  const accounts = readFileSync(join(root, "client/src/components/UserAccountManager.tsx"), "utf8");

  it("mounts an admin-only backup and restore screen", () => {
    expect(home).toContain("النسخ الاحتياطي والاستعادة");
    expect(home).toContain("<BackupRestoreManager />");
    expect(home).toContain('return role === "admin"');
  });

  it("requires preview and restores financial snapshots as drafts", () => {
    expect(component).toContain("branch-ops-financial-backup-v1");
    expect(component).toContain("تأكيد الاستعادة كمسودات");
    expect(component).toContain("تجاهل أعمدة التراكمي والفترة السابقة");
    expect(component).toContain("حفظ الكل كمسودات");
  });

  it("supports assigning a role and primary branch while creating a local account", () => {
    expect(accounts).toContain("newRole");
    expect(accounts).toContain("newBranchId");
    expect(accounts).toContain("تحديد كل الفروع");
  });
});
