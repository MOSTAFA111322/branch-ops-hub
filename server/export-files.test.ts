import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";

describe("export audit file generation", () => {
  const rows = [
    { التاريخ: "٢٠٢٦/٠٨/٢٣", المستخدم: "مدير النظام", التقرير: "سجل عمليات التصدير", الصيغة: "Excel", النتيجة: "نجحت", "عدد الصفوف": 12 },
    { التاريخ: "٢٠٢٦/٠٨/٢٣", المستخدم: "مدير المنطقة", التقرير: "تحليل المخزون", الصيغة: "PDF", النتيجة: "فشلت", "عدد الصفوف": 0 },
  ];

  it("creates a readable XLSX workbook from filtered rows", () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "سجل التصدير");
    const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.byteLength).toBeGreaterThan(100);
    const parsed = XLSX.read(buffer, { type: "buffer" });
    const parsedRows = XLSX.utils.sheet_to_json(parsed.Sheets["سجل التصدير"]);
    expect(parsedRows).toHaveLength(2);
    expect(parsedRows[0]).toHaveProperty("النتيجة", "نجحت");
  });

  it("creates a non-empty PDF report for the filtered rows", () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    doc.setFontSize(16);
    doc.text("Export Operations Audit", 40, 42);
    rows.forEach((row, index) => doc.text(`${index + 1}. ${row.المستخدم} | ${row.الصيغة} | ${row.النتيجة} | ${row["عدد الصفوف"]}`, 40, 84 + index * 16));
    const output = doc.output("arraybuffer");
    expect(output.byteLength).toBeGreaterThan(500);
    expect(new TextDecoder().decode(new Uint8Array(output).slice(0, 5))).toContain("%PDF");
  });
});
