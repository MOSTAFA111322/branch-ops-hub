import { describe, expect, it } from "vitest";
import { getAlertNavigationTarget, isBranchScopedAlert } from "@shared/alertNavigation";

describe("alert navigation", () => {
  it("routes visit and checklist alerts to visits and inspection", () => {
    expect(getAlertNavigationTarget("visit")).toBe("الزيارات والفحص");
    expect(getAlertNavigationTarget("checklist")).toBe("الزيارات والفحص");
    expect(isBranchScopedAlert("visit")).toBe(true);
    expect(isBranchScopedAlert("checklist")).toBe(true);
  });

  it("keeps operational alert routes distinct", () => {
    expect(getAlertNavigationTarget("maintenance")).toBe("الصيانة والأصول");
    expect(getAlertNavigationTarget("document")).toBe("الوثائق والتراخيص");
    expect(getAlertNavigationTarget("action")).toBe("الإجراءات والتحسين");
    expect(isBranchScopedAlert("document")).toBe(false);
  });
});
