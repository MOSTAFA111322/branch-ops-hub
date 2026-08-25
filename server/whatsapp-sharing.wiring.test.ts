import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());
const exportSource = fs.readFileSync(path.join(root, "client/src/components/ExecutiveDashboardExport.tsx"), "utf8");
const scheduledSource = fs.readFileSync(path.join(root, "client/src/components/ScheduledReportsView.tsx"), "utf8");

describe("manual WhatsApp report sharing", () => {
  it("provides an explicit manual WhatsApp action and international phone validation", () => {
    expect(exportSource).toContain("shareViaWhatsApp");
    expect(exportSource).toContain("رقم واتساب دولي");
    expect(exportSource).toContain("https://wa.me/");
    expect(exportSource).toContain("اضغط إرسال يدويًا");
  });

  it("persists ready-to-share reports and exposes their log", () => {
    expect(exportSource).toContain("branch-ops-ready-reports");
    expect(scheduledSource).toContain("التقارير الجاهزة للمشاركة");
    expect(scheduledSource).toContain("فتح واتساب");
    expect(scheduledSource).toContain("مسح السجل المحلي");
  });

  it("does not reintroduce email delivery into the manual sharing path", () => {
    expect(exportSource).not.toContain("mailto:");
    expect(scheduledSource).not.toContain("mailto:");
  });
});
