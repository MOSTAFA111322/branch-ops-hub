import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("لوحة الأوامر والاختصارات", () => {
  const root = resolve(process.cwd());
  const home = readFileSync(resolve(root, "client/src/pages/Home.tsx"), "utf8");
  const palette = readFileSync(resolve(root, "client/src/components/GlobalCommandPalette.tsx"), "utf8");

  it("تظهر لوحة الأوامر وتستقبل اختصار Command+K", () => {
    expect(home).toContain("<GlobalCommandPalette");
    expect(home).toContain("setCommandOpen(true)");
    expect(home).toContain("event.key.toLowerCase() === \"k\"");
  });

  it("تجمع الفروع والمهام والتنبيهات ضمن مجموعات بحث عربية", () => {
    expect(palette).toContain("الفروع");
    expect(palette).toContain("المهام والطلبات");
    expect(palette).toContain("التنبيهات");
    expect(palette).toContain("CommandEmpty");
  });

  it("تحتوي اختصارات التنقل والإجراء السريع", () => {
    expect(home).toContain('event.key.toLowerCase() === "n"');
    expect(home).toContain('setActiveNav("التقارير")');
    expect(home).toContain('id: "quick-task"');
  });
});
