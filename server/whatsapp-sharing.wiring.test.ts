import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());
const exportSource = fs.readFileSync(path.join(root, "client/src/components/ExecutiveDashboardExport.tsx"), "utf8");
const scheduledSource = fs.readFileSync(path.join(root, "client/src/components/ScheduledReportsView.tsx"), "utf8");
const homeSource = fs.readFileSync(path.join(root, "client/src/pages/Home.tsx"), "utf8");

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

  it("provides a unified message and PDF preview before opening WhatsApp", () => {
    expect(exportSource).toContain("sharePreviewOpen");
    expect(exportSource).toContain("معاينة رسالة التقرير وملف PDF");
    expect(exportSource).toContain("confirmWhatsAppShare");
    expect(exportSource).toContain("downloadSharePdf");
    expect(exportSource).toContain("اضغط إرسال يدويًا");
  });

  it("supports account-level WhatsApp preference and report sorting", () => {
    expect(homeSource).toContain("accountWhatsAppOpen");
    expect(homeSource).toContain("accountWhatsAppPhone");
    expect(homeSource).toContain("حفظ رقم واتساب الافتراضي لهذا الحساب.");
    expect(scheduledSource).toContain("readyReportSort");
    expect(scheduledSource).toContain("الأحدث أولًا");
    expect(scheduledSource).toContain("الأقدم أولًا");
    expect(scheduledSource).toContain("sortedReadyReports");
  });

  it("provides visible account feedback, a complete Arabic-safe CSV export, and time-based greeting", () => {
    expect(homeSource).toContain("sonnerToast.success");
    expect(homeSource).toContain("تم حفظ رقم واتساب الافتراضي");
    expect(scheduledSource).toContain("exportReadyReportsCsv");
    expect(scheduledSource).toContain("تصدير CSV كامل");
    expect(scheduledSource).toContain("text/csv;charset=utf-8");
    expect(scheduledSource).toContain("String.fromCharCode(0xfeff)");
    expect(exportSource).toContain("getArabicTimeGreeting");
    expect(exportSource).toContain("صباح الخير");
    expect(exportSource).toContain("مساء الخير");
    expect(exportSource).toContain("تحية طيبة");
  });

  it("does not reintroduce email delivery into the manual sharing path", () => {
    expect(exportSource).not.toContain("mailto:");
    expect(scheduledSource).not.toContain("mailto:");
  });
});
