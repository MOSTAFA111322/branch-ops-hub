import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { FileSpreadsheet, FileText, LoaderCircle, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/contexts/ThemeContext";

type TrendRow = { period: string; netSales?: number | string; revenue?: number | string; netCost?: number | string; expenses?: number | string; netProfit?: number | string };
type BranchRow = { id: number; name: string; operationalType?: string; currentRevenue?: number | string | null; currentProfit?: number | string | null; currentExpenses?: number | string; operatingExpenses?: number | string; profitChangePercent?: number | string | null };
export type ExecutiveDashboardData = { financialTrend?: TrendRow[]; financialByBranch?: BranchRow[]; financialCoverage?: { rate: number | null; centersWithData: number; expectedCenters: number; period: string } };
type Props = { data?: ExecutiveDashboardData; disabled?: boolean };
const n = (value: unknown) => Number(value ?? 0);
const money = (value: unknown) => n(value).toLocaleString("ar-SA", { maximumFractionDigits: 0 });
const logoUrl = import.meta.env.VITE_APP_LOGO as string | undefined;

export default function ExecutiveDashboardExport({ data, disabled }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);
  const [title, setTitle] = useState("التقرير التنفيذي المالي");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [costCenter, setCostCenter] = useState("all");
  const { theme, toggleTheme } = useTheme();
  const trend = data?.financialTrend ?? [];
  const branches = data?.financialByBranch ?? [];
  const centers = useMemo(() => Array.from(new Set(branches.map((row) => row.name))).sort((a, b) => a.localeCompare(b, "ar")), [branches]);
  const inRange = (period: string) => (!from || period >= from) && (!to || period <= to);
  const visibleTrend = trend.filter((row) => inRange(row.period));
  const visibleBranches = branches.filter((row) => costCenter === "all" || row.name === costCenter);
  const latest = visibleTrend.at(-1) ?? trend.at(-1);
  const exportLabel = `${from || "كل"}-${to || "الفترة"}`;
  const loadLogo = () => new Promise<string | null>((resolve) => { if (!logoUrl) return resolve(null); const image = new Image(); image.crossOrigin = "anonymous"; image.onload = () => resolve(image.src); image.onerror = () => resolve(null); image.src = logoUrl; });
  const exportExcel = () => {
    setExporting("excel");
    try {
      const workbook = XLSX.utils.book_new();
      const summary = [{ البيان: "عنوان التقرير", القيمة: title }, { البيان: "من", القيمة: from || "كل الفترة" }, { البيان: "إلى", القيمة: to || "كل الفترة" }, { البيان: "مركز التكلفة", القيمة: costCenter === "all" ? "كل المراكز" : costCenter }, { البيان: "الفترة الأخيرة", القيمة: latest?.period ?? "—" }, { البيان: "صافي المبيعات", القيمة: n(latest?.netSales ?? latest?.revenue) }, { البيان: "صافي التكلفة", القيمة: n(latest?.netCost) }, { البيان: "المصروفات", القيمة: n(latest?.expenses) }, { البيان: "صافي الربح", القيمة: n(latest?.netProfit) }, { البيان: "اكتمال البيانات %", القيمة: data?.financialCoverage?.rate ?? "—" }];
      const monthly = visibleTrend.map((row) => ({ الفترة: row.period, "صافي المبيعات": n(row.netSales ?? row.revenue), "صافي التكلفة": n(row.netCost), المصروفات: n(row.expenses), "صافي الربح": n(row.netProfit) }));
      const byBranch = visibleBranches.map((row) => ({ "معرف المركز": row.id, "اسم المركز": row.name, النوع: row.operationalType ?? "—", "المبيعات الحالية": n(row.currentRevenue), "صافي الربح الحالي": n(row.currentProfit), المصروفات: n(row.currentExpenses ?? row.operatingExpenses), "تغير الربح %": row.profitChangePercent ?? "—" }));
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summary), "بيانات التقرير"); XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(monthly), "الاتجاه الشهري"); XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(byBranch), "حسب المركز");
      XLSX.writeFile(workbook, `تقرير-المدير-${exportLabel}.xlsx`);
    } finally { setExporting(null); }
  };
  const exportPdf = async () => {
    setExporting("pdf");
    try {
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const logo = await loadLogo(); if (logo) pdf.addImage(logo, "PNG", 250, 8, 35, 16);
      pdf.setFontSize(17); pdf.text(title || "التقرير التنفيذي المالي", 14, 16); pdf.setFontSize(9); pdf.text(`Period: ${from || "All"} - ${to || "All"} | Cost center: ${costCenter === "all" ? "All" : costCenter}`, 14, 23); pdf.setDrawColor(45, 125, 88); pdf.line(14, 27, 283, 27);
      let y = 37; pdf.setFontSize(10); pdf.text("Metric", 14, y); pdf.text("Value", 75, y); y += 7;
      [["Net sales", money(latest?.netSales ?? latest?.revenue)], ["Net cost", money(latest?.netCost)], ["Expenses", money(latest?.expenses)], ["Net profit", money(latest?.netProfit)], ["Data completeness", `${data?.financialCoverage?.rate ?? "—"}%`]].forEach(([label, value]) => { pdf.text(label, 14, y); pdf.text(value, 75, y); y += 6; });
      if (chartRef.current) { const canvas = await html2canvas(chartRef.current, { backgroundColor: "#ffffff", scale: 1.5, logging: false }); pdf.addImage(canvas.toDataURL("image/png"), "PNG", 100, 32, 180, 92); }
      y = 138; pdf.setFontSize(10); pdf.text("Monthly trend", 14, y); y += 7; pdf.setFontSize(8); pdf.text("Period", 14, y); pdf.text("Sales", 55, y); pdf.text("Cost", 95, y); pdf.text("Profit", 135, y); y += 6;
      visibleTrend.slice(-12).forEach((row) => { if (y > 195) { pdf.addPage(); y = 20; } pdf.text(String(row.period), 14, y); pdf.text(money(row.netSales ?? row.revenue), 55, y); pdf.text(money(row.netCost), 95, y); pdf.text(money(row.netProfit), 135, y); y += 5; });
      pdf.save(`تقرير-المدير-${exportLabel}.pdf`);
    } finally { setExporting(null); }
  };
  const max = Math.max(1, ...visibleTrend.map((row) => Math.abs(n(row.netSales ?? row.revenue))));
  return <div className="flex flex-wrap items-center gap-2" dir="rtl">
    <div ref={chartRef} className="fixed -left-[10000px] top-0 h-[420px] w-[900px] bg-white p-8 text-slate-800" aria-hidden="true"><h2 className="text-xl font-bold">{title}</h2><div className="mt-8 flex h-72 items-end gap-4 border-b border-slate-300">{visibleTrend.slice(-12).map((row) => <div key={row.period} className="flex flex-1 flex-col items-center gap-2"><div className="w-full rounded-t bg-emerald-600" style={{ height: `${Math.max(8, (Math.abs(n(row.netSales ?? row.revenue)) / max) * 230)}px` }} /><span className="text-xs">{row.period}</span></div>)}</div></div>
    <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="عنوان التقرير" className="h-9 w-44 rounded-xl text-xs" aria-label="عنوان التقرير" />
    <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="h-9 w-36 rounded-xl text-xs" aria-label="من تاريخ" /><Input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="h-9 w-36 rounded-xl text-xs" aria-label="إلى تاريخ" />
    <select value={costCenter} onChange={(event) => setCostCenter(event.target.value)} className="h-9 rounded-xl border border-input bg-background px-2 text-xs" aria-label="مركز التكلفة"><option value="all">كل مراكز التكلفة</option>{centers.map((center) => <option key={center} value={center}>{center}</option>)}</select>
    <Button type="button" variant="outline" onClick={toggleTheme} className="rounded-xl text-xs" aria-label={theme === "dark" ? "تفعيل الوضع النهاري" : "تفعيل الوضع الليلي"}>{theme === "dark" ? <Sun className="ml-1 h-4 w-4" /> : <Moon className="ml-1 h-4 w-4" />}{theme === "dark" ? "الوضع النهاري" : "الوضع الليلي"}</Button>
    <Button type="button" variant="outline" onClick={exportExcel} disabled={disabled || exporting !== null || !visibleTrend.length} className="rounded-xl text-xs"><FileSpreadsheet className="ml-1 h-4 w-4" />{exporting === "excel" ? <><LoaderCircle className="ml-1 h-4 w-4 animate-spin" />جاري تجهيز Excel</> : "تصدير Excel"}</Button>
    <Button type="button" onClick={exportPdf} disabled={disabled || exporting !== null || !visibleTrend.length} className="rounded-xl bg-[#17624b] text-xs hover:bg-[#12513e]"><FileText className="ml-1 h-4 w-4" />{exporting === "pdf" ? <><LoaderCircle className="ml-1 h-4 w-4 animate-spin" />جاري تجهيز PDF</> : "تصدير PDF"}</Button>
    <span className="text-[10px] text-muted-foreground">التصدير يطبق الفترة ومركز التكلفة المحددين</span>
  </div>;
}
