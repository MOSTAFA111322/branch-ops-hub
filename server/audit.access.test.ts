import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("audit administration wiring", () => {
  it("exposes a filtered audit list for admin and area manager roles", () => {
    const source = readFileSync(join(process.cwd(), "server/routers.ts"), "utf8");
    expect(source).toContain('audit: router({');
    expect(source).toContain('list: roleProcedure(["admin", "area_manager"])');
    expect(source).toContain("entityType");
    expect(source).toContain("actorId");
    expect(source).toContain("branchId");
  });

  it("renders the Arabic audit navigation and financial trend surface", () => {
    const source = readFileSync(join(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
    expect(source).toContain("سجل التدقيق");
    expect(source).toContain("اتجاه الأداء المالي");
  });
});
