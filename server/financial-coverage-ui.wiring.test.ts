import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("financial coverage dashboard wiring", () => {
  const root = resolve(import.meta.dirname, "..");
  const home = readFileSync(resolve(root, "client/src/pages/Home.tsx"), "utf8");
  const db = readFileSync(resolve(root, "server/db.ts"), "utf8");

  it("renders the live monthly coverage and missing centers without fallback data", () => {
    expect(db).toContain("financialCoverage");
    expect(db).toContain("missingCenters");
    expect(home).toContain('"financialCoverage" in executiveOps');
    expect(home).toContain("اكتمال البيانات المالية");
    expect(home).toContain("centersWithData");
    expect(home).toContain("missingCenters.slice(0, 8)");
  });

  it("keeps missing-center actions connected to the selected branch", () => {
    expect(home).toContain("displayBranches.find((item) => item.id === center.id)");
    expect(home).toContain("setSelectedBranch(branch)");
  });

  it("keeps dashboard period wiring dynamic", () => {
    expect(home).toContain("year: financialYear");
    expect(home).toContain("month: financialMonth");
    expect(home).toContain("initialYear={financialYear}");
    expect(home).toContain("initialMonth={financialMonth}");
    expect(home).not.toContain("يناير وفبراير");
    expect(home).not.toContain("2026-01");
  });
});
