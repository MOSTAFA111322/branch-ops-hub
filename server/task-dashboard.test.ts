import { describe, expect, it } from "vitest";

describe("dashboard task card contract", () => {
  it("uses live task data and an empty state instead of fabricated task copy", async () => {
    const source = await import("node:fs/promises").then((fs) => fs.readFile("client/src/pages/Home.tsx", "utf8"));
    expect(source).toContain("liveSummary?.tasks?.length ?? 0");
    expect(source).toContain("لا توجد مهام مفتوحة حاليًا");
    expect(source).not.toContain("لديك 7 مهام اليوم");
    expect(source).not.toContain("مراجعة محضر زيارة فرع الملقا");
    expect(source).not.toContain("اعتماد خطة تحسين التحلية");
  });
});
