import { describe, expect, it } from "vitest";
import { MONTHLY_REPORT_RECIPIENT_ROLES } from "./scheduled";

describe("monthly financial report recipients", () => {
  it("targets administrative and quality roles explicitly", () => {
    expect(MONTHLY_REPORT_RECIPIENT_ROLES).toEqual(["admin", "area_manager", "quality"]);
  });
});
