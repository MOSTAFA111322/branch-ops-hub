import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("usage digest expansion wiring", () => {
  const root = resolve(process.cwd());
  it("exposes time-filtered usage analytics and centralized preference notifications", () => {
    const router = readFileSync(resolve(root, "server/routers.ts"), "utf8");
    expect(router).toContain("dashboard_preferences_changed");
    expect(router).toContain("from: z.date().optional()");
    expect(router).toContain("summary: Array.from(grouped.values())");
  });

  it("mounts the idempotent scheduled usage digest endpoint", () => {
    const index = readFileSync(resolve(root, "server/_core/index.ts"), "utf8");
    const scheduled = readFileSync(resolve(root, "server/scheduled.ts"), "utf8");
    expect(index).toContain('/api/scheduled/command-usage-digest');
    expect(scheduled).toContain("command-usage-digest:");
    expect(scheduled).toContain('action: "usage_digest"');
  });
});

it("keeps usage analytics restricted to management roles", () => {
  const router = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
  expect(router).toContain('list: roleProcedure(["admin", "area_manager"])');
});
