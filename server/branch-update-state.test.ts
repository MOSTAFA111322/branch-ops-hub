import { describe, expect, it } from "vitest";
import { beginBranchUpdate, completeBranchUpdate, failBranchUpdate } from "../client/src/lib/branchUpdateState";

describe("branch update row state", () => {
  it("replaces a previous success with a later error for the same row", () => {
    const success = completeBranchUpdate(42);
    expect(success).toMatchObject({ id: 42, status: "success" });

    const pending = beginBranchUpdate(42);
    expect(pending).toMatchObject({ id: 42, status: "pending" });

    const failure = failBranchUpdate(42, "تعذر حفظ بيانات الفرع.");
    expect(failure).toEqual({ id: 42, status: "error", message: "تعذر حفظ بيانات الفرع." });
    expect(failure.status).not.toBe(success.status);
  });
});
