import { useMemo, useState } from "react";
import { Download, FileText, PackageCheck, Printer, Search, TrendingUp, Warehouse } from "lucide-react";
import * as XLSX from "xlsx";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type ReportTab = "all" | "monthly" | "stale" | "top";

const formatNumber = (value: unknown, digits = 0) => Number(value ?? 0).toLocaleString("ar-SA", { maximumFractionDigits: digits });
const formatMoney = (value: unknown) => `${formatNumber(value, 2)} ر.س`;

export function InventoryAnalysisView() {
  const [itemQuery, setItemQuery] = useState("");
  const [costCenterCode, setCostCenterCode] = useState("");
  const [branchId, setBranchId] = useState("");
  const [from, setFrom] = useState("2026-01-01");
  const [to, setTo] = useState("2026-06-30");
  const [tab, setTab] = useState<ReportTab>("all");
  const branchesQuery = trpc.branches.list.useQuery();
  const input = useMemo(() => ({
    ...(itemQuery.trim() ? { itemQuery: itemQuery.trim() } : {}),
    ...(costCenterCode.trim() ? { costCenterCode: costCenterCode.trim() } : {}),
    ...(branchId ? { branchId: Number(branchId) } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  }), [itemQuery, costCenterCode, branchId, from, to]);
  const analysis = trpc.inventory.analyze.useQuery(input, { staleTime: 30000, retry: 1 });
  const rows = analysis.data?.rows ?? [];
  const visibleRows = tab === "monthly" ? (analysis.data?.monthlyReport ?? []) : tab === "stale" ? (analysis.data?.staleItems ?? []) : tab === "top" ? (analysis.data?.topSellingItems ?? []) : rows;
  const centerCodes = useMemo(() => Array.from(new Set(rows.map((row) => String(row.costCenterCode)))).sort(), [rows]);
  const branchNames = useMemo(() => new Map((branchesQuery.data ?? []).map((branch) => [branch.id, branch.name])), [branchesQuery.data]);

  const exportExcel = () => {
    const exportRows = visibleRows.map((row) => ({
      ...(tab === "monthly" ? { "الشهر": "period" in row ? row.period : "" } : {}),
      "رمز الصنف": row.itemCode,
      "اسم الصنف": row.itemName,
      "مركز التكلفة": row.costCenterCode,
      "الفرع": branchNames.get(Number(row.branchId)) ?? row.costCenterCode,
      "الكمية المباعة": row.salesQuantity,
      "صافي المبيعات": row.netSales,
      "صافي التكلفة": row.netCost,
      "الهامش الإجمالي": row.grossMargin,
      "نسبة الهامش %": row.marginRate,
      "المتاح": row.availableQuantity,
      "عمر المخزون بالأيام": row.stockAgeDays,
      "عدد اللقطات": row.rowCount,
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(exportRows), tab === "monthly" ? "التقرير الشهري" : tab === "stale" ? "الأصناف الراكدة" : tab === "top" ? "الأكثر مبيعاً" : "حركة الأصناف");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{ "من": from || "كل الفترة", "إلى": to || "كل الفترة", "الصنف": itemQuery || "كل الأصناف", "المركز": costCenterCode || "كل المراكز" }, { "إجمالي الكمية المباعة": analysis.data?.totals.salesQuantity ?? 0, "إجمالي صافي المبيعات": analysis.data?.totals.netSales ?? 0, "إجمالي صافي التكلفة": analysis.data?.totals.netCost ?? 0, "إجمالي المتاح": analysis.data?.totals.availableQuantity ?? 0 }]), "الملخص");
    XLSX.writeFile(workbook, `تقرير-حركة-الأصناف-${tab}.xlsx`);
  };

  return <section className="inventory-analysis printable-report space-y-5" dir="rtl" aria-labelledby="inventory-analysis-title">
    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
      <div><div className="mb-2 flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300"><PackageCheck className="h-4 w-4" /> تحليل تاريخي لحركة الأصناف</div><h2 id="inventory-analysis-title" className="text-2xl font-bold tracking-tight text-foreground">المبيعات والمخزون حسب الصنف والمركز</h2><p className="mt-2 max-w-3xl text-sm text-muted-foreground">قراءة مجمعة للقطات حركة الأصناف المستوردة من يناير إلى يونيو 2026، مع فصل الأصناف الراكدة عن الأكثر مبيعًا.</p></div>
      <div className="flex flex-wrap gap-2 print:hidden"><Button variant="outline" className="rounded-xl" onClick={() => window.print()}><Printer className="ml-2 h-4 w-4" /> حفظ PDF / طباعة</Button><Button className="rounded-xl bg-emerald-700 hover:bg-emerald-800" disabled={!visibleRows.length} onClick={exportExcel}><Download className="ml-2 h-4 w-4" /> تصدير Excel</Button></div>
    </div>

    <Card className="border-border bg-card shadow-sm print:hidden"><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Search className="h-4 w-4 text-emerald-600" /> فلاتر التحليل</CardTitle></CardHeader><CardContent><div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5"><Input value={itemQuery} onChange={(event) => setItemQuery(event.target.value)} placeholder="رمز أو اسم الصنف" aria-label="البحث عن صنف" className="rounded-xl" /><Input value={costCenterCode} onChange={(event) => setCostCenterCode(event.target.value)} list="inventory-centers" placeholder="رمز مركز التكلفة" aria-label="تصفية مركز التكلفة" className="rounded-xl" /><datalist id="inventory-centers">{centerCodes.map((code) => <option key={code} value={code} />)}</datalist><select value={branchId} onChange={(event) => setBranchId(event.target.value)} aria-label="تصفية الفرع" className="h-10 rounded-xl border border-input bg-background px-3 text-sm text-foreground"><option value="">كل الفروع والمراكز</option>{(branchesQuery.data ?? []).map((branch) => <option key={branch.id} value={String(branch.id)}>{branch.name}</option>)}</select><label className="flex items-center gap-2 text-xs text-muted-foreground">من <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="h-10 min-w-0 flex-1 rounded-xl border border-input bg-background px-2 text-foreground" /></label><label className="flex items-center gap-2 text-xs text-muted-foreground">إلى <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="h-10 min-w-0 flex-1 rounded-xl border border-input bg-background px-2 text-foreground" /></label></div><div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" size="sm" className="rounded-lg text-xs" onClick={() => { setFrom("2026-01-01"); setTo("2026-06-30"); }}>يناير–يونيو 2026</Button><Button variant="ghost" size="sm" className="rounded-lg text-xs" onClick={() => { setItemQuery(""); setCostCenterCode(""); setBranchId(""); setFrom(""); setTo(""); }}>مسح الفلاتر</Button><span className="mr-auto flex items-center gap-1 text-[11px] text-muted-foreground"><Warehouse className="h-3.5 w-3.5" /> مصدر تاريخي: 3,044 صفًا مستوردًا</span></div></CardContent></Card>

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="الكمية المباعة" value={formatNumber(analysis.data?.totals.salesQuantity)} icon={<TrendingUp className="h-4 w-4" />} /><Metric label="صافي المبيعات" value={formatMoney(analysis.data?.totals.netSales)} /><Metric label="صافي التكلفة" value={formatMoney(analysis.data?.totals.netCost)} /><Metric label="المتاح بالمخزون" value={formatNumber(analysis.data?.totals.availableQuantity)} icon={<Warehouse className="h-4 w-4" />} /></div>

    <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3"><TabButton active={tab === "all"} onClick={() => setTab("all")}>كل الحركة ({rows.length})</TabButton><TabButton active={tab === "monthly"} onClick={() => setTab("monthly")}><FileText className="ml-1 h-3.5 w-3.5" /> التقرير الشهري ({analysis.data?.monthlyReport.length ?? 0})</TabButton><TabButton active={tab === "top"} onClick={() => setTab("top")}><TrendingUp className="ml-1 h-3.5 w-3.5" /> الأكثر مبيعًا ({analysis.data?.topSellingItems.length ?? 0})</TabButton><TabButton active={tab === "stale"} onClick={() => setTab("stale")}><PackageCheck className="ml-1 h-3.5 w-3.5" /> الأصناف الراكدة ({analysis.data?.staleItems.length ?? 0})</TabButton><span className="mr-auto text-xs text-muted-foreground">{analysis.isFetching ? "جارٍ تحديث النتائج..." : `عرض ${visibleRows.length} صفًا`}</span></div>

    {analysis.error ? <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive">تعذر تحميل تحليل حركة الأصناف. تحقق من الصلاحيات أو الفترة المحددة ثم حاول مرة أخرى.</div> : visibleRows.length === 0 ? <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-12 text-center text-sm text-muted-foreground">لا توجد نتائج ضمن الفلاتر الحالية.</div> : <div className="overflow-x-auto rounded-2xl border border-border bg-card"><table className="w-full min-w-[980px] text-right text-xs"><thead className="bg-muted/60 text-muted-foreground"><tr>{tab === "monthly" && <th className="p-3">الشهر</th>}<th className="p-3">الصنف</th><th className="p-3">المركز / الفرع</th><th className="p-3">المبيعات</th><th className="p-3">صافي المبيعات</th><th className="p-3">الهامش</th><th className="p-3">المتاح</th><th className="p-3">عمر المخزون</th></tr></thead><tbody>{visibleRows.map((row) => <tr key={`${tab}-${"period" in row ? row.period : "all"}-${row.itemCode}-${row.costCenterCode}`} className="border-t border-border/70 transition-colors hover:bg-muted/40">{tab === "monthly" && <td className="p-3 font-medium text-foreground">{"period" in row ? row.period : "—"}</td>}<td className="p-3"><p className="font-semibold text-foreground">{row.itemName}</p><p className="mt-1 text-[10px] text-muted-foreground">{row.itemCode}</p></td><td className="p-3"><p className="font-medium text-foreground">{branchNames.get(Number(row.branchId)) ?? row.costCenterCode}</p><p className="mt-1 text-[10px] text-muted-foreground">مركز {row.costCenterCode}</p></td><td className="p-3 font-semibold text-foreground">{formatNumber(row.salesQuantity, 2)}</td><td className="p-3 font-semibold text-emerald-700 dark:text-emerald-300">{formatMoney(row.netSales)}</td><td className="p-3"><span className={Number(row.grossMargin) >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-red-600 dark:text-red-300"}>{formatMoney(row.grossMargin)}</span><p className="mt-1 text-[10px] text-muted-foreground">{row.marginRate === null ? "—" : `${formatNumber(row.marginRate, 1)}%`}</p></td><td className="p-3 text-foreground">{formatNumber(row.availableQuantity, 2)}</td><td className="p-3 text-muted-foreground">{formatNumber(row.stockAgeDays)} يوم</td></tr>)}</tbody></table></div>}

    <div className="hidden print:block"><p className="text-xs text-muted-foreground">نطاق التقرير: {from || "كل الفترة"} إلى {to || "كل الفترة"} · الصنف: {itemQuery || "كل الأصناف"} · المركز: {costCenterCode || "كل المراكز"}</p></div>
  </section>;
}

function Metric({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) { return <Card className="border-border bg-card shadow-sm"><CardContent className="p-4"><div className="flex items-center justify-between text-muted-foreground"><span className="text-xs">{label}</span>{icon}</div><p className="mt-2 text-xl font-bold text-foreground">{value}</p></CardContent></Card>; }
function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" onClick={onClick} className={`inline-flex items-center rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${active ? "bg-emerald-700 text-white shadow-sm" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>{children}</button>; }
