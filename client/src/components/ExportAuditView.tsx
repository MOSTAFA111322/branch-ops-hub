import { useMemo, useState } from "react";
import { Download, Filter, RefreshCw, Search } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const formatLabels: Record<string, string> = { csv: "CSV", excel: "Excel", pdf: "PDF" };
const statusLabels: Record<string, string> = { started: "بدأت", success: "نجحت", failed: "فشلت" };

export function ExportAuditView() {
  const [format, setFormat] = useState("all");
  const [status, setStatus] = useState("all");
  const [actorQuery, setActorQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const query = trpc.exports.list.useQuery({ format: format as "csv" | "excel" | "pdf" | "all", status: status as "started" | "success" | "failed" | "all", from: from || undefined, to: to || undefined }, { staleTime: 15_000 });
  const rows = useMemo(() => (query.data?.rows ?? []).filter((row) => !actorQuery.trim() || row.actorName.toLocaleLowerCase("ar").includes(actorQuery.trim().toLocaleLowerCase("ar"))), [actorQuery, query.data?.rows]);

  return <div className="space-y-4" dir="rtl">
    <Card className="border-border bg-card shadow-sm"><CardHeader className="pb-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle className="flex items-center gap-2 text-lg"><Download className="h-5 w-5 text-emerald-600" /> سجل عمليات التصدير</CardTitle><p className="mt-1 text-xs text-muted-foreground">تتبع محاولات التصدير ونتائجها مع اسم المستخدم وعدد الصفوف والفلاتر المستخدمة.</p></div><Button variant="outline" className="rounded-xl" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw className={`ml-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} /> تحديث</Button></div></CardHeader><CardContent>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5"><label className="text-xs text-muted-foreground">الصيغة<select value={format} onChange={(e) => setFormat(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground"><option value="all">كل الصيغ</option><option value="csv">CSV</option><option value="excel">Excel</option><option value="pdf">PDF</option></select></label><label className="text-xs text-muted-foreground">النتيجة<select value={status} onChange={(e) => setStatus(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground"><option value="all">كل النتائج</option><option value="started">بدأت</option><option value="success">نجحت</option><option value="failed">فشلت</option></select></label><label className="text-xs text-muted-foreground">المستخدم<div className="relative mt-1"><Search className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-muted-foreground" /><Input value={actorQuery} onChange={(e) => setActorQuery(e.target.value)} placeholder="اسم أو بريد المستخدم" className="rounded-xl pr-9" /></div></label><label className="text-xs text-muted-foreground">من<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground" /></label><label className="text-xs text-muted-foreground">إلى<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground" /></label></div>
      <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><Filter className="h-4 w-4" /> عرض {rows.length} من أصل {query.data?.total ?? 0} عملية</div>
      <div className="mt-3 overflow-x-auto rounded-xl border border-border"><table className="w-full min-w-[760px] text-right text-xs"><thead className="bg-muted/60 text-muted-foreground"><tr><th className="p-3">التاريخ</th><th className="p-3">المستخدم</th><th className="p-3">التقرير</th><th className="p-3">الصيغة</th><th className="p-3">النتيجة</th><th className="p-3">الصفوف</th><th className="p-3">التفاصيل</th></tr></thead><tbody>{query.isLoading ? <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">جارٍ تحميل سجل التصديرات…</td></tr> : rows.length ? rows.map((row) => <tr key={row.id} className="border-t border-border"><td className="p-3 whitespace-nowrap">{new Date(row.createdAt).toLocaleString("ar-SA")}</td><td className="p-3">{row.actorName}</td><td className="p-3">{row.report}</td><td className="p-3"><Badge variant="outline" className="rounded-full">{formatLabels[row.format] ?? row.format}</Badge></td><td className="p-3"><Badge className={`rounded-full ${row.status === "success" ? "bg-emerald-600" : row.status === "failed" ? "bg-rose-600" : "bg-amber-600"}`}>{statusLabels[row.status] ?? row.status}</Badge></td><td className="p-3">{row.rowCount.toLocaleString("ar-SA")}</td><td className="max-w-[220px] truncate p-3 text-rose-700" title={row.error || undefined}>{row.error || "—"}</td></tr>) : <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">لا توجد عمليات تصدير مطابقة للفلاتر الحالية.</td></tr>}</tbody></table></div>
      {query.error && <p className="mt-3 text-xs text-rose-600">تعذر تحميل السجل: {query.error.message}</p>}
    </CardContent></Card>
  </div>;
}
