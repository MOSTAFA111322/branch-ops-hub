import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BranchUpdateStatus } from "../client/src/components/BranchUpdateStatus";
import { beginBranchUpdate, completeBranchUpdate, failBranchUpdate } from "../client/src/lib/branchUpdateState";

describe("BranchUpdateStatus", () => {
  it("renders the actual row lifecycle states", () => {
    expect(renderToStaticMarkup(<BranchUpdateStatus branchId={7} state={beginBranchUpdate(7)} />)).toContain("جارٍ الحفظ");
    expect(renderToStaticMarkup(<BranchUpdateStatus branchId={7} state={completeBranchUpdate(7)} />)).toContain("تم الحفظ");
    expect(renderToStaticMarkup(<BranchUpdateStatus branchId={7} state={failBranchUpdate(7, "تعذر الحفظ")} />)).toContain("تعذر الحفظ");
    expect(renderToStaticMarkup(<BranchUpdateStatus branchId={8} state={failBranchUpdate(7, "تعذر الحفظ")} />)).toBe("");
  });
});
