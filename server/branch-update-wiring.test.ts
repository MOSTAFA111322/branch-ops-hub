import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Home branch update wiring", () => {
  it("connects the row mutation lifecycle to the per-row state helpers", () => {
    const source = readFileSync(new URL("../client/src/pages/Home.tsx", import.meta.url), "utf8");
    expect(source).toContain("setBranchUpdateState(beginBranchUpdate(Number(row.id)))");
    expect(source).toContain("setBranchUpdateState(completeBranchUpdate(variables.id))");
    expect(source).toContain("setBranchUpdateState(failBranchUpdate(variables.id, readableBranchError(error)))");
    expect(source).toContain("<BranchUpdateStatus branchId={Number(row.id)} state={branchUpdateState} />");
  });
});
