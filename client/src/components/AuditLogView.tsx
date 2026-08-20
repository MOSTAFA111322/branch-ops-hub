import { useMemo, useState } from "react";
import { Search, RefreshCw, ShieldCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function AuditLogView() {
  const [search, setSearch] = useState("");
  const [entityType, setEntityType] = useState("");
  const [action, setAction] = useState("");
  const query = trpc.audit.list.useQuery({ search: search.trim() || undefined, entityType: entityType || undefined, action: action || undefined, limit: 150 });
  const rows = query.data ?? [];
  const entityTypes = useMemo(() => Array.from(new Set(rows.map((row) => row.entityType))), [rows]);
  const actions = useMemo(() => Array.from(new Set(rows.map((row) => row.action))), [rows]);
  return <div className="space-y-4" dir="rtl">
    <Card className="rounded-2xl border-[#e1e9e1] shadow-sm">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-[#2d7d58]" /> سجل التدقيق الإداري</CardTitle><p className="mt-1 text-xs text-[#89948b]">تتبع تغييرات البيانات المالية وقوائم الفحص والعمليات التشغيلية.</p></div>
        <Button variant="outline" size="sm" className="rounded-xl text-xs" onClick={() => void query.refetch()} disabled={query.isFetching}><RefreshCw className={`ml-1 h-3.5 w-3.5 ${query.isFetching ? "animate-spin" : ""}`} /> تحديث</Button>
      </CardHeader>
      <CardContent><div className="grid gap-2 md:grid-cols-3"><div className="relative"><Search className="absolute right-3 top-2.5 h-4 w-4 text-[#9aa79d]" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث في تفاصيل التغيير" className="pr-9 text-xs" /></div><select aria-label="نوع الوحدة" value={entityType} onChange={(event) => setEntityType(event.target.value)} className="h-9 rounded-xl border border-[#dce5dc] bg-white px-3 text-xs"><option value="">كل الوحدات</option>{entityTypes.map((item) => <option key={item} value={item}>{item}</option>)}</select><select aria-label="نوع العملية" value={action} onChange={(event) => setAction(event.target.value)} className="h-9 rounded-xl border border-[#dce5dc] bg-white px-3 text-xs"><option value="">كل العمليات</option>{actions.map((item) => <option key={item} value={item}>{item}</option>)}</select></div></CardContent>
    </Card>
    <Card className="rounded-2xl border-[#e1e9e1] shadow-sm"><CardContent className="p-0">{query.isLoading ? <p className="p-8 text-center text-xs text-[#89948b]">جارٍ تحميل سجل التدقيق...</p> : query.error ? <p className="p-8 text-center text-xs text-[#a45b4e]">تعذر تحميل سجل التدقيق أو لا تملك الصلاحية.</p> : rows.length === 0 ? <p className="p-8 text-center text-xs text-[#89948b]">لا توجد تغييرات مطابقة للفلاتر الحالية.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-right text-xs"><thead><tr className="border-b border-[#edf1ed] text-[#89948b]"><th className="px-5 py-3">التاريخ</th><th className="py-3">المستخدم</th><th className="py-3">الفرع</th><th className="py-3">الوحدة</th><th className="py-3">العملية</th><th className="px-5 py-3">التفاصيل</th></tr></thead><tbody>{rows.map((row) => <tr key={String(row.id)} className="border-b border-[#f0f3f0] last:border-0"><td className="px-5 py-3 text-[#69776d]">{new Date(row.createdAt).toLocaleString("ar-SA")}</td><td className="py-3 font-semibold">{row.actor?.name ?? "النظام"}<span className="mr-1 text-[10px] text-[#89948b]">{row.actor?.role ?? ""}</span></td><td className="py-3">{row.branch?.name ?? "عام"}</td><td className="py-3"><Badge variant="outline" className="rounded-full text-[10px]">{row.entityType}</Badge></td><td className="py-3 text-[#2d7d58]">{row.action}</td><td className="max-w-[260px] truncate px-5 py-3 text-[#89948b]">{row.afterData ?? row.beforeData ?? "—"}</td></tr>)}</tbody></table></div>}</CardContent></Card>
  </div>;
}
