import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { Copy, Download, FileSpreadsheet, FileText, LoaderCircle, Moon, Save, Send, Sun, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTheme } from "@/contexts/ThemeContext";

type TrendRow = { period: string; netSales?: number | string; revenue?: number | string; netCost?: number | string; expenses?: number | string; netProfit?: number | string };
type BranchRow = { id: number; name: string; operationalType?: string; currentRevenue?: number | string | null; currentProfit?: number | string | null; currentExpenses?: number | string; operatingExpenses?: number | string; profitChangePercent?: number | string | null };
export type ExecutiveDashboardData = { financialTrend?: TrendRow[]; financialByBranch?: BranchRow[]; financialCoverage?: { rate: number | null; centersWithData: number; expectedCenters: number; period: string } };
type Props = { data?: ExecutiveDashboardData; disabled?: boolean; userKey?: string | number | null };
type Favorite = { id: string; name: string; title: string; from: string; to: string; costCenter: string };
type ExcelPreviewRow = Record<string, string | number>;

const n = (value: unknown) => Number(value ?? 0);
const money = (value: unknown) => n(value).toLocaleString("ar-SA", { maximumFractionDigits: 0 });
const logoUrl = import.meta.env.VITE_APP_LOGO as string | undefined;
const FAVORITES_KEY = "branch-ops-executive-export-favorites";
const WHATSAPP_KEY = "branch-ops-whatsapp-default";
const READY_REPORTS_KEY = "branch-ops-ready-reports";

export default function ExecutiveDashboardExport({ data, disabled, userKey }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);
  const [title, setTitle] = useState("التقرير التنفيذي المالي");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [costCenter, setCostCenter] = useState("all");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [excelPreview, setExcelPreview] = useState<ExcelPreviewRow[]>([]);
  const [whatsAppPhone, setWhatsAppPhone] = useState("");
  const [shareStatus, setShareStatus] = useState("");
  const [sharePreviewUrl, setSharePreviewUrl] = useState<string | null>(null);
  const [sharePreviewOpen, setSharePreviewOpen] = useState(false);
  const [favorites, setFavorites] = useState<Favorite[]>(() => {
    try { return JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? "[]") as Favorite[]; } catch { return []; }
  });
  const { theme, toggleTheme } = useTheme();
  const whatsappPreferenceKey = `${WHATSAPP_KEY}:${userKey ?? "anonymous"}`;
  const trend = data?.financialTrend ?? [];
  const branches = data?.financialByBranch ?? [];
  const centers = useMemo(() => Array.from(new Set(branches.map((row) => row.name))).sort((a, b) => a.localeCompare(b, "ar")), [branches]);
  const inRange = (period: string) => (!from || period >= from) && (!to || period <= to);
  const visibleTrend = trend.filter((row) => inRange(row.period));
  const visibleBranches = branches.filter((row) => costCenter === "all" || row.name === costCenter);
  const latest = visibleTrend.at(-1) ?? trend.at(-1);
  const exportLabel = `${from || "كل"}-${to || "الفترة"}`;

  useEffect(() => {
    try { setWhatsAppPhone(localStorage.getItem(whatsappPreferenceKey) ?? ""); } catch { setWhatsAppPhone(""); }
  }, [whatsappPreferenceKey]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);
  useEffect(() => () => {
    if (sharePreviewUrl) URL.revokeObjectURL(sharePreviewUrl);
  }, [sharePreviewUrl]);

  const persistFavorites = (next: Favorite[]) => {
    setFavorites(next);
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(next)); } catch { /* local preference is optional */ }
  };
  const saveFavorite = () => {
    const name = window.prompt("اسم ملف تعريف التصدير");
    if (!name?.trim()) return;
    persistFavorites([...favorites, { id: crypto.randomUUID(), name: name.trim(), title, from, to, costCenter }]);
  };
  const applyFavorite = (favorite: Favorite) => {
    setTitle(favorite.title); setFrom(favorite.from); setTo(favorite.to); setCostCenter(favorite.costCenter);
  };
  const loadLogo = () => new Promise<string | null>((resolve) => {
    if (!logoUrl) return resolve(null);
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image.src);
    image.onerror = () => resolve(null);
    image.src = logoUrl;
  });
  const summaryRows = () => [
    { البيان: "عنوان التقرير", القيمة: title },
    { البيان: "من", القيمة: from || "كل الفترة" },
    { البيان: "إلى", القيمة: to || "كل الفترة" },
    { البيان: "مركز التكلفة", القيمة: costCenter === "all" ? "كل المراكز" : costCenter },
    { البيان: "الفترة الأخيرة", القيمة: latest?.period ?? "—" },
    { البيان: "صافي المبيعات", القيمة: n(latest?.netSales ?? latest?.revenue) },
    { البيان: "صافي التكلفة", القيمة: n(latest?.netCost) },
    { البيان: "المصروفات", القيمة: n(latest?.expenses) },
    { البيان: "صافي الربح", القيمة: n(latest?.netProfit) },
  ];
  const monthlyRows = () => visibleTrend.map((row) => ({ الفترة: row.period, "صافي المبيعات": n(row.netSales ?? row.revenue), "صافي التكلفة": n(row.netCost), المصروفات: n(row.expenses), "صافي الربح": n(row.netProfit) }));
  const branchRows = () => visibleBranches.map((row) => ({ "معرف المركز": row.id, "اسم المركز": row.name, النوع: row.operationalType ?? "—", "المبيعات الحالية": n(row.currentRevenue), "صافي الربح الحالي": n(row.currentProfit), المصروفات: n(row.currentExpenses ?? row.operatingExpenses), "تغير الربح %": row.profitChangePercent ?? "—" }));

  const exportExcel = () => {
    setExporting("excel");
    try {
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows()), "بيانات التقرير");
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(monthlyRows()), "الاتجاه حسب الفترة");
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(branchRows()), "كل الفروع");
      XLSX.writeFile(workbook, `تقرير-المدير-${exportLabel}.xlsx`);
    } finally { setExporting(null); }
  };
  const previewExcel = () => setExcelPreview([...monthlyRows(), ...branchRows()].slice(0, 8) as unknown as ExcelPreviewRow[]);

  const buildPdf = async () => {
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const logo = await loadLogo();
    if (logo) pdf.addImage(logo, "PNG", 250, 8, 35, 16);
    pdf.setFontSize(17); pdf.text(title || "التقرير التنفيذي المالي", 14, 16);
    pdf.setFontSize(9); pdf.text(`Period: ${from || "All"} - ${to || "All"} | Cost center: ${costCenter === "all" ? "All" : costCenter}`, 14, 23);
    pdf.setDrawColor(45, 125, 88); pdf.line(14, 27, 283, 27);
    let y = 37;
    pdf.setFontSize(10); pdf.text("Metric", 14, y); pdf.text("Value", 75, y); y += 7;
    summaryRows().slice(4).forEach((row) => { pdf.text(String(row.البيان), 14, y); pdf.text(String(row.القيمة), 75, y); y += 6; });
    if (chartRef.current) {
      const canvas = await html2canvas(chartRef.current, { backgroundColor: "#ffffff", scale: 1.5, logging: false });
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 100, 32, 180, 92);
    }
    pdf.addPage(); pdf.setFontSize(14); pdf.text("Branch detail report", 14, 16); pdf.setFontSize(8);
    const headers = ["ID", "Branch / cost center", "Type", "Revenue", "Net profit", "Expenses", "Profit change %"];
    const x = [14, 30, 100, 140, 178, 216, 255];
    headers.forEach((header, index) => pdf.text(header, x[index], 28));
    y = 36;
    branchRows().forEach((row) => {
      if (y > 190) {
        pdf.addPage(); pdf.setFontSize(14); pdf.text("Branch detail report (continued)", 14, 16); pdf.setFontSize(8);
        headers.forEach((header, index) => pdf.text(header, x[index], 28)); y = 36;
      }
      const values = [row["معرف المركز"], row["اسم المركز"], row["النوع"], money(row["المبيعات الحالية"]), money(row["صافي الربح الحالي"]), money(row["المصروفات"]), row["تغير الربح %"]];
      values.forEach((value, index) => pdf.text(String(value ?? "—").slice(0, 24), x[index], y)); y += 6;
    });
    return pdf.output("blob");
  };
  const previewPdf = async () => {
    setExporting("pdf");
    try {
      const blob = await buildPdf();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(blob));
    } finally { setExporting(null); }
  };
  const downloadPdf = async () => {
    setExporting("pdf");
    try {
      const blob = await buildPdf();
      const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `تقرير-المدير-${exportLabel}.pdf`; link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    } finally { setExporting(null); }
  };

  const shareMessage = `تقرير: ${title || "التقرير التنفيذي المالي"}\nالفترة: ${from || "كل الفترة"} إلى ${to || "كل الفترة"}\nمركز التكلفة: ${costCenter === "all" ? "كل المراكز" : costCenter}\nتم تجهيز التقرير للمراجعة والمشاركة اليدوية عبر واتساب.`;
  const saveWhatsAppPhone = (value: string) => {
    setWhatsAppPhone(value);
    try { localStorage.setItem(whatsappPreferenceKey, value); } catch { /* local preference is optional */ }
  };
  const copyShareMessage = async () => {
    try { await navigator.clipboard.writeText(shareMessage); setShareStatus("تم نسخ نص التقرير الجاهز."); }
    catch { setShareStatus("تعذر النسخ التلقائي؛ حدّد النص وانسخه يدويًا."); }
  };
  const openSharePreview = async () => {
    const cleanPhone = whatsAppPhone.replace(/[^\d]/g, "");
    if (cleanPhone.length < 8 || cleanPhone.length > 15) {
      setShareStatus("أدخل رقم واتساب بصيغة دولية من 8 إلى 15 رقمًا، مثل 9665XXXXXXXX.");
      return;
    }
    setShareStatus(""); setExporting("pdf");
    try {
      const blob = await buildPdf();
      if (sharePreviewUrl) URL.revokeObjectURL(sharePreviewUrl);
      setSharePreviewUrl(URL.createObjectURL(blob));
      setSharePreviewOpen(true);
    } catch { setShareStatus("تعذر تجهيز المعاينة؛ حاول مرة أخرى."); }
    finally { setExporting(null); }
  };
  // Keep the previous action name as a stable integration point; it now opens the unified preview first.
  const shareViaWhatsApp = openSharePreview;
  const closeSharePreview = () => {
    setSharePreviewOpen(false);
    if (sharePreviewUrl) { URL.revokeObjectURL(sharePreviewUrl); setSharePreviewUrl(null); }
  };
  const confirmWhatsAppShare = () => {
    const cleanPhone = whatsAppPhone.replace(/[^\d]/g, "");
    if (!sharePreviewUrl || cleanPhone.length < 8 || cleanPhone.length > 15) return;
    const record = { id: crypto.randomUUID(), title, period: `${from || "كل الفترة"} – ${to || "كل الفترة"}`, costCenter, phone: cleanPhone, createdAt: new Date().toISOString(), status: "جاهز للمشاركة اليدوية" };
    try {
      const records = JSON.parse(localStorage.getItem(READY_REPORTS_KEY) ?? "[]") as unknown[];
      localStorage.setItem(READY_REPORTS_KEY, JSON.stringify([record, ...records].slice(0, 30)));
    } catch { /* the sharing action can continue if local history is unavailable */ }
    window.dispatchEvent(new Event("branch-ops-ready-reports-updated"));
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(shareMessage)}`, "_blank", "noopener,noreferrer");
    setShareStatus("تم فتح محادثة واتساب. أرسل الرسالة يدويًا وأرفق ملف PDF الذي تمت معاينته.");
    closeSharePreview();
  };
  const downloadSharePdf = () => {
    if (!sharePreviewUrl) return;
    const link = document.createElement("a"); link.href = sharePreviewUrl; link.download = `تقرير-المدير-${exportLabel}.pdf`; link.click();
  };
  const max = Math.max(1, ...visibleTrend.map((row) => Math.abs(n(row.netSales ?? row.revenue))));

  return <div className="flex flex-wrap items-center gap-2" dir="rtl">
    <div ref={chartRef} className="fixed -left-[10000px] top-0 h-[420px] w-[900px] bg-white p-8 text-slate-800" aria-hidden="true"><h2 className="text-xl font-bold">{title}</h2><div className="mt-8 flex h-72 items-end gap-4 border-b border-slate-300">{visibleTrend.map((row) => <div key={row.period} className="flex flex-1 flex-col items-center gap-2"><div className="w-full rounded-t bg-emerald-600" style={{ height: `${Math.max(8, (Math.abs(n(row.netSales ?? row.revenue)) / max) * 230)}px` }} /><span className="text-xs">{row.period}</span></div>)}</div></div>
    <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="عنوان التقرير" className="h-9 w-44 rounded-xl text-xs" aria-label="عنوان التقرير" />
    <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="h-9 w-36 rounded-xl text-xs" aria-label="من تاريخ" />
    <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="h-9 w-36 rounded-xl text-xs" aria-label="إلى تاريخ" />
    <Input value={whatsAppPhone} onChange={(event) => saveWhatsAppPhone(event.target.value)} placeholder="رقم واتساب دولي" className="h-9 w-40 rounded-xl text-xs" aria-label="رقم واتساب للمشاركة" />
    <select value={costCenter} onChange={(event) => setCostCenter(event.target.value)} className="h-9 rounded-xl border border-input bg-background px-2 text-xs" aria-label="مركز التكلفة"><option value="all">كل مراكز التكلفة</option>{centers.map((center) => <option key={center} value={center}>{center}</option>)}</select>
    <Button type="button" variant="outline" onClick={saveFavorite} className="rounded-xl text-xs"><Save className="ml-1 h-4 w-4" />حفظ ملف تعريف</Button>
    <Button type="button" variant="outline" onClick={toggleTheme} className="rounded-xl text-xs" aria-label="تبديل الوضع الليلي">{theme === "dark" ? <Sun className="ml-1 h-4 w-4" /> : <Moon className="ml-1 h-4 w-4" />}{theme === "dark" ? "نهاري" : "ليلي"}</Button>
    <Button type="button" variant="outline" onClick={copyShareMessage} disabled={!visibleTrend.length} className="rounded-xl text-xs"><Copy className="ml-1 h-4 w-4" />نسخ نص التقرير</Button>
    <Button type="button" variant="outline" onClick={downloadPdf} disabled={disabled || exporting !== null || !visibleTrend.length} className="rounded-xl text-xs"><Download className="ml-1 h-4 w-4" />تحميل PDF</Button>
    <Button type="button" variant="outline" onClick={shareViaWhatsApp} disabled={disabled || exporting !== null || !visibleTrend.length} className="rounded-xl text-xs"><Send className="ml-1 h-4 w-4" />معاينة ومشاركة واتساب</Button>
    <Button type="button" variant="outline" onClick={previewExcel} disabled={disabled || !visibleTrend.length} className="rounded-xl text-xs"><FileSpreadsheet className="ml-1 h-4 w-4" />معاينة Excel</Button>
    <Button type="button" variant="outline" onClick={exportExcel} disabled={disabled || exporting !== null || !visibleTrend.length} className="rounded-xl text-xs"><FileSpreadsheet className="ml-1 h-4 w-4" />{exporting === "excel" ? "جاري تجهيز Excel" : "تصدير Excel"}</Button>
    <Button type="button" onClick={previewPdf} disabled={disabled || exporting !== null || !visibleTrend.length} className="rounded-xl bg-[#17624b] text-xs hover:bg-[#12513e]"><FileText className="ml-1 h-4 w-4" />{exporting === "pdf" ? <><LoaderCircle className="ml-1 h-4 w-4 animate-spin" />جاري تجهيز PDF</> : "معاينة PDF"}</Button>
    {shareStatus && <p role="status" className="w-full text-[11px] text-[#4d8068]">{shareStatus}</p>}
    {favorites.length > 0 && <div className="flex max-w-full flex-wrap items-center gap-1 rounded-xl bg-muted/50 p-1">{favorites.map((favorite) => <span key={favorite.id} className="inline-flex items-center gap-1"><Button type="button" variant="ghost" onClick={() => applyFavorite(favorite)} className="h-7 px-2 text-[10px]">{favorite.name}</Button><button type="button" onClick={() => persistFavorites(favorites.filter((item) => item.id !== favorite.id))} className="rounded p-1 text-muted-foreground hover:text-destructive" aria-label={`حذف ${favorite.name}`}><Trash2 className="h-3 w-3" /></button></span>)}</div>}
    <Dialog open={excelPreview.length > 0} onOpenChange={(open) => { if (!open) setExcelPreview([]); }}><DialogContent className="max-w-4xl" dir="rtl"><DialogHeader><DialogTitle>معاينة بيانات Excel المفلترة</DialogTitle></DialogHeader><p className="text-xs text-muted-foreground">هذه أول 8 صفوف من البيانات التي ستصدر وفق الفترة ومركز التكلفة المحددين.</p><div className="max-h-[55vh] overflow-auto rounded-lg border"><table className="w-full text-right text-xs"><thead className="bg-muted"><tr>{Object.keys(excelPreview[0] ?? {}).map((key) => <th key={key} className="whitespace-nowrap p-2">{key}</th>)}</tr></thead><tbody>{excelPreview.map((row, index) => <tr key={index} className="border-t">{Object.keys(excelPreview[0] ?? {}).map((key) => <td key={key} className="whitespace-nowrap p-2">{String(row[key] ?? "—")}</td>)}</tr>)}</tbody></table></div><Button type="button" onClick={() => { setExcelPreview([]); exportExcel(); }} className="self-start rounded-xl bg-[#17624b] text-xs">تأكيد وتنزيل Excel</Button></DialogContent></Dialog>
    <Dialog open={Boolean(previewUrl)} onOpenChange={(open) => { if (!open && previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); } }}><DialogContent className="h-[90vh] max-w-5xl" dir="rtl"><DialogHeader><DialogTitle>معاينة التقرير متعدد الصفحات قبل التنزيل</DialogTitle></DialogHeader><div className="flex min-h-0 flex-1 flex-col gap-3"><p className="text-xs text-muted-foreground">راجع الترويسة والرسم وجدول الفروع الكامل، ثم نزّل التقرير عند التأكد من صحة المحتوى.</p>{previewUrl && <iframe title="معاينة PDF متعدد الصفحات" src={previewUrl} className="min-h-0 flex-1 rounded-lg border" />}<Button type="button" onClick={downloadPdf} disabled={exporting !== null} className="self-start rounded-xl bg-[#17624b] text-xs"><FileText className="ml-1 h-4 w-4" />تنزيل PDF بعد المراجعة</Button></div></DialogContent></Dialog>
    <Dialog open={sharePreviewOpen} onOpenChange={(open) => { if (!open) closeSharePreview(); }}><DialogContent className="h-[90vh] max-w-6xl" dir="rtl"><DialogHeader><DialogTitle>معاينة رسالة التقرير وملف PDF</DialogTitle></DialogHeader><div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(260px,0.8fr)_minmax(420px,1.4fr)]"><section className="flex min-h-0 flex-col rounded-2xl border border-[#dfe9df] bg-[#f8fbf8] p-4" aria-labelledby="whatsapp-message-preview-title"><h3 id="whatsapp-message-preview-title" className="text-sm font-bold text-[#174c3d]">نص الرسالة الجاهزة</h3><pre className="mt-3 min-h-40 flex-1 whitespace-pre-wrap rounded-xl border border-[#e5eee6] bg-white p-3 text-xs leading-6 text-[#405246]">{shareMessage}</pre><Button type="button" variant="outline" onClick={copyShareMessage} className="mt-3 rounded-xl text-xs"><Copy className="ml-1 h-4 w-4" />نسخ الرسالة</Button></section><section className="flex min-h-0 flex-col rounded-2xl border border-[#dfe9df] bg-[#f8fbf8] p-3" aria-labelledby="whatsapp-pdf-preview-title"><div className="flex items-center justify-between gap-2"><h3 id="whatsapp-pdf-preview-title" className="text-sm font-bold text-[#174c3d]">ملف PDF متعدد الصفحات</h3><Button type="button" variant="ghost" onClick={downloadSharePdf} className="h-8 rounded-lg px-2 text-xs"><Download className="ml-1 h-3.5 w-3.5" />تنزيل</Button></div>{sharePreviewUrl && <iframe title="معاينة PDF قبل مشاركة واتساب" src={sharePreviewUrl} className="mt-3 min-h-0 flex-1 rounded-xl border bg-white" />}</section></div><div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#edf1ed] pt-3"><p className="text-[11px] text-[#89948b]">لن يتم الإرسال تلقائيًا. سيفتح الزر محادثة واتساب لتراجع الرسالة ثم اضغط إرسال يدويًا وأرفق ملف PDF عند الحاجة.</p><div className="flex gap-2"><Button type="button" variant="outline" onClick={closeSharePreview} className="rounded-xl text-xs">إلغاء</Button><Button type="button" onClick={confirmWhatsAppShare} className="rounded-xl bg-[#17624b] text-xs hover:bg-[#12513e]"><Send className="ml-1 h-4 w-4" />فتح واتساب للمشاركة اليدوية</Button></div></div></DialogContent></Dialog>
  </div>;
}
