import { useMemo, useState } from "react";
import { ArrowDownLeft, Download, FileImage, FileText, TrendingDown, TrendingUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import { Button } from "@/components/ui/button";

type Branch = { id: number; code?: string | number | null; name: string; area?: string | null; revenue?: number | null; netProfit?: number | null; sales?: number | null };
type Summary = { currentPeriod?: string | null; previousPeriod?: string | null; currentSales?: number; previousSales?: number; salesChangePercent?: number | null; staleCount?: number; lowStockCount?: number };

type Props = { branches: Branch[]; summary?: Summary | null; onOpenInventory: () => void; onOpenBranches: () => void };

const money = (value: number) => `${value.toLocaleString("ar-SA", { maximumFractionDigits: 0 })} ر.س`;
const pct = (current: number, previous: number) => previous ? ((current - previous) / Math.abs(previous)) * 100 : null;

export function SmartBranchComparison({ branches, summary, onOpenInventory, onOpenBranches }: Props) {
  const [selectedIds, setSelectedIds] = useState<number[]>(() => branches.slice(0, 5).map((branch) => branch.id));
  const selected = useMemo(() => branches.filter((branch) => selectedIds.includes(branch.id)), [branches, selectedIds]);
  const currentSales = Number(summary?.currentSales ?? 0);
  const previousSales = Number(summary?.previousSales ?? 0);
  const change = summary?.salesChangePercent ?? pct(currentSales, previousSales);
  const chartData = [
    { period: summary?.previousPeriod ?? "السابق", sales: previousSales, selected: "الفترة السابقة" },
    { period: summary?.currentPeriod ?? "الحالي", sales: currentSales, selected: "الفترة الحالية" },
  ];
  const toggle = (id: number) => setSelectedIds((ids) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]);
  const exportWorkbook = () => {
    const rows = selected.map((branch) => ({ الفرع: branch.name, الرمز: branch.code ?? "—", المنطقة: branch.area ?? "—", المبيعات: Number(branch.revenue ?? branch.sales ?? 0), صافي_الربح: Number(branch.netProfit ?? 0) }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "الفروع المحددة");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(chartData.map((item) => ({ الفترة: item.period, المبيعات: item.sales }))), "المقارنة الزمنية");
    XLSX.writeFile(workbook, `تقرير-مقارنة-الفروع-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };
  const exportPdf = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.text("Branch comparison report", 280, 18, { align: "right" });
    doc.setFontSize(11); doc.text(`Selected branches: ${selected.length}`, 280, 28, { align: "right" });
    selected.forEach((branch, index) => doc.text(`${index + 1}. ${branch.name} | Sales: ${Number(branch.revenue ?? branch.sales ?? 0).toLocaleString()} | Profit: ${Number(branch.netProfit ?? 0).toLocaleString()}`, 280, 42 + index * 9, { align: "right" }));
    doc.text(`Period change: ${change === null ? "N/A" : `${change.toFixed(1)}%`}`, 280, 52 + selected.length * 9, { align: "right" });
    doc.save(`تقرير-مقارنة-الفروع-${new Date().toISOString().slice(0, 10)}.pdf`);
  };
  return <section className="mt-5 rounded-3xl border border-[#dfe9df] bg-white p-5 shadow-[0_5px_18px_rgba(39,70,48,0.04)]" aria-label="المقارنة الزمنية وتقرير الفروع الموحد">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold text-[#4d8068]">مقارنة زمنية موحدة</p><h3 className="mt-1 text-lg font-bold">الحالي مقابل الشهر السابق</h3><p className="mt-1 text-xs text-[#89948b]">اختر عدة فروع لإنشاء تقرير مشترك قابل للتنزيل.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" className="rounded-xl text-xs" onClick={exportWorkbook} disabled={!selected.length}><Download className="ml-1 h-3.5 w-3.5" /> Excel</Button><Button variant="outline" size="sm" className="rounded-xl text-xs" onClick={exportPdf} disabled={!selected.length}><FileText className="ml-1 h-3.5 w-3.5" /> PDF</Button><Button variant="outline" size="sm" className="rounded-xl text-xs" onClick={onOpenInventory}><FileImage className="ml-1 h-3.5 w-3.5" /> الرسوم التفصيلية</Button></div></div>
    <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_300px]"><div className="h-56"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}><CartesianGrid strokeDasharray="3 3" stroke="#e8efe8" /><XAxis dataKey="period" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 10 }} tickFormatter={(value) => `${Number(value).toLocaleString("ar-SA")}`} /><Tooltip formatter={(value) => [money(Number(value)), "صافي المبيعات"]} /><Legend /><Bar dataKey="sales" name="صافي المبيعات" fill="#4d9b70" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div><div className="rounded-2xl bg-[#f1f8f2] p-4"><p className="text-[10px] text-[#89948b]">نسبة التغير</p><div className="mt-2 flex items-center gap-2">{change !== null && (change >= 0 ? <TrendingUp className="h-5 w-5 text-[#2d7d58]" /> : <TrendingDown className="h-5 w-5 text-[#b95e55]" />)}<p className={`text-2xl font-bold ${change === null || change >= 0 ? "text-[#2d7d58]" : "text-[#b95e55]"}`}>{change === null ? "—" : `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`}</p></div><p className="mt-2 text-[10px] text-[#6b8172]">{money(currentSales)} حاليًا · {money(previousSales)} سابقًا</p><button type="button" className="mt-4 inline-flex items-center text-[11px] font-semibold text-[#315542]" onClick={onOpenInventory}>افتح التحليل التفصيلي <ArrowDownLeft className="mr-1 h-3.5 w-3.5" /></button></div></div>
    <div className="mt-4 rounded-2xl border border-[#edf1ed] bg-[#fbfdfb] p-3"><div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold text-[#315542]">الفروع المشمولة في التقرير الموحد</p><button type="button" className="text-[10px] font-semibold text-[#4d8068]" onClick={() => setSelectedIds(branches.map((branch) => branch.id))}>تحديد الكل</button></div><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{branches.map((branch) => <label key={branch.id} className={`flex cursor-pointer items-center gap-2 rounded-xl border p-2 text-xs transition-colors ${selectedIds.includes(branch.id) ? "border-[#9bc6a8] bg-[#eef8f0]" : "border-[#edf1ed] bg-white"}`}><input type="checkbox" checked={selectedIds.includes(branch.id)} onChange={() => toggle(branch.id)} className="accent-[#4d8068]" /><span className="truncate">{branch.name}</span></label>)}</div><button type="button" className="mt-3 inline-flex items-center text-[11px] font-semibold text-[#315542]" onClick={onOpenBranches}>إدارة قائمة الفروع <ArrowDownLeft className="mr-1 h-3.5 w-3.5" /></button></div>
  </section>;
}
