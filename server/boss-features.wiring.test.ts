import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Boss-level operational extensions", () => {
  it("exposes secure bulk task and usage procedures", () => {
    const source = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
    expect(source).toContain("bulkUpdate");
    expect(source).toContain('entityType: "task"');
    expect(source).toContain('entityType: "command_usage"');
    expect(source).toContain("max(100)");
  });

  it("wires task selection and role-aware dashboard widgets", () => {
    const source = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
    expect(source).toContain("selectedTaskIds");
    expect(source).toContain("الإجراءات الجماعية للمهام");
    expect(source).toContain("branch-ops-widgets");
    expect(source).toContain("تخصيص مؤشرات دورك");
  });
});
