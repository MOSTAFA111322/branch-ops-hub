import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("inventory alert automation wiring", () => {
  it("exposes an idempotent scheduled inventory alert handler", () => {
    const scheduled = readFileSync(resolve(process.cwd(), "server/scheduled.ts"), "utf8");
    expect(scheduled).toContain("inventoryAlertsHandler");
    expect(scheduled).toContain("inventory-alerts:");
    expect(scheduled).toContain("already-refreshed");
    expect(scheduled).toContain("inventory_stale");
    expect(scheduled).toContain("inventory_low");
  });

  it("mounts the scheduled callback before tRPC", () => {
    const index = readFileSync(resolve(process.cwd(), "server/_core/index.ts"), "utf8");
    expect(index).toContain("/api/scheduled/inventory-alerts");
    expect(index.indexOf("/api/scheduled/inventory-alerts")).toBeLessThan(index.indexOf("/api/trpc"));
  });

  it("creates actionable tasks for generated inventory alerts", () => {
    const scheduled = readFileSync(resolve(process.cwd(), "server/scheduled.ts"), "utf8");
    expect(scheduled).toContain("db.insert(tasks).values");
    expect(scheduled).toContain("متابعة ${title}");
  });
});
