import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { Download, FileSpreadsheet, FileText, LoaderCircle, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/contexts/ThemeContext";

type TrendRow = { period: string; netSales?: number | string; revenue?: number | string; netCost?: number | string; expenses?: number | string; netProfit?: number | string };
type BranchRow = { id: number; name: string; operationalType?: string; currentRevenue?: number | string | null; currentProfit?: number | string | null; currentExpenses?: number | string; operatingExpenses?: number | string; profitChangePercent?: number | string | null };
export type ExecutiveDashboardData = { financialTrend?: TrendRow[]; financialByBranch?: BranchRow[]; financialCoverage?: { rate: number | null; centersWithData: number; expectedCenters: number; period: string } };
type Props = { data?: ExecutiveDashboardData; disabled?: boolean };
const n = (value: unknown) => Number(value ?? 0);
const money = (value: unknown) => n(value).toLocaleString("ar-SA", { maximumFractionDigits: 0 });

export default function ExecutiveDashboardExport({ data, disabled }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);
  const { theme, toggleTheme } = useTheme();
  const trend = data?.financialTrend ?? [];
  const branches = data?.financialByBranch ?? [];
  const latest = trend.at(-1);
  const exportExcel = () => {
    setExporting("excel");
    const workbook = XLSX.utils.book_new();
    const summary = [{ البيان: "الفترة الأخيرة", القيمة: latest?.period ?? "—" }, { البيان: "صافي المبيعات", القيمة: n(latest?.netSales ?? latest?.revenue) }, { البيان: "صافي التكلفة", القيمة: n(latest?.netCost) }, { البيان: "المصروفات", القيمة: n(latest?.expenses) }, { البيان: "صافي الربح", القيمة: n(latest?.netProfit) }, { البيان: "اكتمال البيانات %", القيمة: data?.financialCoverage?.rate ?? "—" }];
    const monthly = trend.map((row) => ({ الفترة: row.period, "صافي المبيعات": n(row.netSales ?? row.revenue), "صافي التكلفة": n(row.netCost), المصروفات: n(row.expenses), "صافي الربح": n(row.netProfit) }));
    const byBranch = branches.map((row) => ({ "معرف المركز": row.id, "اسم المركز": row.name, النوع: row.operationalType ?? "—", "المبيعات الحالية": n(row.currentRevenue), "صافي الربح الحالي": n(row.currentProfit), المصروفات: n(row.currentExpenses ?? row.operatingExpenses), "تغير الربح %": row.profitChangePercent ?? "—" }));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summary), "الملخص التنفيذي");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(monthly), "الاتجاه الشهري");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(byBranch), "حسب المركز");
    XLSX.writeFile(workbook, `لوحة-المدير-${new Date().toISOString().slice(0, 10)}.xlsx`);
    setExporting(null);
  };
  const exportPdf = async () => {
    setExporting("pdf");
    try {
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      pdf.setFontSize(16); pdf.text("Branch Operations Hub - Executive Dashboard", 14, 16);
      pdf.setFontSize(9); pdf.text(`Financial period: ${latest?.period ?? "—"}`, 14, 23);
      let y = 34; pdf.setFontSize(10); pdf.text("Metric", 14, y); pdf.text("Value", 75, y); y += 7;
      [["Net sales", money(latest?.netSales ?? latest?.revenue)], ["Net cost", money(latest?.netCost)], ["Expenses", money(latest?.expenses)], ["Net profit", money(latest?.netProfit)], ["Data completeness", `${data?.financialCoverage?.rate ?? "—"}%`]].forEach(([label, value]) => { pdf.text(label, 14, y); pdf.text(value, 75, y); y += 6; });
      if (chartRef.current) { const canvas = await html2canvas(chartRef.current, { backgroundColor: "#ffffff", scale: 1.5, logging: false }); pdf.addImage(canvas.toDataURL("image/png"), "PNG", 100, 30, 180, 92); }
      y = 138; pdf.setFontSize(10); pdf.text("Monthly trend", 14, y); y += 7; pdf.setFontSize(8); pdf.text("Period", 14, y); pdf.text("Sales", 55, y); pdf.text("Cost", 95, y); pdf.text("Profit", 135, y); y += 6;
      trend.slice(-10).forEach((row) => { if (y > 195) { pdf.addPage(); y = 20; } pdf.text(String(row.period), 14, y); pdf.text(money(row.netSales ?? row.revenue), 55, y); pdf.text(money(row.netCost), 95, y); pdf.text(money(row.netProfit), 135, y); y += 5; });
      pdf.save(`لوحة-المدير-${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally { setExporting(null); }
  };
  const max = Math.max(1, ...trend.map((row) => Math.abs(n(row.netSales ?? row.revenue))));
  return <div className="flex flex-wrap items-center gap-2" dir="rtl">
    <div ref={chartRef} className="fixed -left-[10000px] top-0 h-[420px] w-[900px] bg-white p-8 text-slate-800" aria-hidden="true"><h2 className="text-xl font-bold">Executive financial trend</h2><div className="mt-8 flex h-72 items-end gap-4 border-b border-slate-300">{trend.slice(-10).map((row) => <div key={row.period} className="flex flex-1 flex-col items-center gap-2"><div className="w-full rounded-t bg-emerald-600" style={{ height: `${Math.max(8, (Math.abs(n(row.netSales ?? row.revenue)) / max) * 230)}px` }} /><span className="text-xs">{row.period}</span></div>)}</div></div>
    <Button type="button" variant="outline" onClick={toggleTheme} className="rounded-xl text-xs" aria-label={theme === "dark" ? "تفعيل الوضع النهاري" : "تفعيل الوضع الليلي"}>{theme === "dark" ? <Sun className="ml-1 h-4 w-4" /> : <Moon className="ml-1 h-4 w-4" />}{theme === "dark" ? "الوضع النهاري" : "الوضع الليلي"}</Button>
    <Button type="button" variant="outline" onClick={exportExcel} disabled={disabled || exporting !== null || !trend.length} className="rounded-xl text-xs"><FileSpreadsheet className="ml-1 h-4 w-4" />{exporting === "excel" ? <><LoaderCircle className="ml-1 h-4 w-4 animate-spin" />جاري تجهيز Excel</> : "تصدير البيانات Excel"}</Button>
    <Button type="button" onClick={exportPdf} disabled={disabled || exporting !== null || !trend.length} className="rounded-xl bg-[#17624b] text-xs hover:bg-[#12513e]"><FileText className="ml-1 h-4 w-4" />{exporting === "pdf" ? <><LoaderCircle className="ml-1 h-4 w-4 animate-spin" />جاري تجهيز PDF</> : "تصدير اللوحة PDF"}</Button>
    <span className="text-[10px] text-muted-foreground">يشمل المؤشرات والاتجاه الشهري وترتيب المراكز</span>
  </div>;
}
