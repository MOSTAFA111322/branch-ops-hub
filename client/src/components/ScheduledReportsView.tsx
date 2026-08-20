import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { AlertTriangle, CheckCircle2, Clock3, Play, Pause, RefreshCw, Download, RotateCcw } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ScheduledReportsView({ canRetry = false }: { canRetry?: boolean }) {
  const utils = trpc.useUtils();
  const jobsQuery = trpc.heartbeat.jobs.useQuery(undefined, { refetchInterval: 30000 });
  const setEnabled = trpc.heartbeat.setEnabled.useMutation({
    onSuccess: () => utils.heartbeat.jobs.invalidate(),
  });
  const retryDigest = trpc.heartbeat.retryUsageDigest.useMutation({
    onSuccess: () => utils.heartbeat.jobs.invalidate(),
  });
  const jobs = jobsQuery.data?.jobs ?? [];
  const logs = jobsQuery.data?.logs ?? [];
  const [logFilter, setLogFilter] = useState<"all" | "success" | "failed" | "control">("all");
  const [logUserFilter, setLogUserFilter] = useState("");
  const reportLogs = useMemo(() => logs.filter((log) => log.action === "usage_digest" || log.action === "usage_digest_failed" || log.action.startsWith("heartbeat_")), [logs]);
  const filteredLogs = useMemo(() => reportLogs.filter((log) => {
    const matchesType = logFilter === "all" || (logFilter === "failed" ? log.action === "usage_digest_failed" : logFilter === "success" ? log.action === "usage_digest" : log.action.startsWith("heartbeat_"));
    const haystack = `${log.actorId ?? ""} ${log.afterData ?? ""}`.toLocaleLowerCase("ar");
    return matchesType && (!logUserFilter.trim() || haystack.includes(logUserFilter.trim().toLocaleLowerCase("ar")));
  }), [logFilter, logUserFilter, reportLogs]);
  const exportLogs = () => {
    const rows = filteredLogs.map((log) => ({
      التاريخ: log.createdAt ? new Date(log.createdAt).toLocaleString("ar-SA") : "",
      الإجراء: log.action,
      المستخدم: log.actorId ?? "",
      التفاصيل: log.afterData ?? "",
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "سجل التنفيذ");
    XLSX.writeFile(workbook, `سجل-التقارير-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-4" dir="rtl">
      <Card className="border-[#dfe9df] bg-white shadow-[0_5px_18px_rgba(39,70,48,0.04)]">
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div><p className="text-xs font-semibold text-[#4d8068]">تشغيل آمن ومراقب</p><CardTitle className="mt-1 text-lg">إدارة التقارير الدورية</CardTitle><p className="mt-1 text-xs text-[#89948b]">إيقاف أو استئناف الوظيفة ومراجعة آخر النتائج دون الوصول إلى بيانات مستخدمين غير مصرح بها.</p></div>
          <Button aria-label="تحديث وظائف التقارير" variant="outline" size="sm" className="gap-1 rounded-xl" onClick={() => jobsQuery.refetch()} disabled={jobsQuery.isFetching}><RefreshCw className="h-3.5 w-3.5" />تحديث</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {jobsQuery.isLoading ? <div role="status" aria-live="polite" className="rounded-xl bg-[#f7faf7] p-5 text-center text-xs text-[#89948b]">جارٍ تحميل وظائف التقارير…</div> : jobs.length === 0 ? <div role="status" className="rounded-xl border border-dashed border-[#dfe9df] p-5 text-center text-xs text-[#89948b]">لا توجد وظيفة تقرير متاحة لهذا الحساب.</div> : jobs.map((job) => <div key={job.taskUid} className="flex flex-col gap-3 rounded-xl border border-[#edf1ed] bg-[#fbfdfb] p-4 md:flex-row md:items-center md:justify-between"><div className="flex items-start gap-3"><div className={`mt-0.5 rounded-lg p-2 ${job.isEnable ? "bg-[#e2f3e7] text-[#2c8a5f]" : "bg-[#fff0dc] text-[#c47629]"}`}>{job.isEnable ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}</div><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-bold text-[#1c2820]">{job.name}</p><Badge variant="outline" className="rounded-full text-[10px]">{job.isEnable ? "مفعلة" : "متوقفة"}</Badge></div><p className="mt-1 text-[11px] text-[#6b8172]">{job.description || "تقرير تشغيلي دوري"}</p><p className="mt-1 text-[10px] text-[#89948b]">الجدولة: {job.cronExpression} · التنفيذ القادم: {job.nextExecutionAt ? new Date(job.nextExecutionAt).toLocaleString("ar-SA") : "غير متاح"}</p></div></div><Button size="sm" variant={job.isEnable ? "outline" : "default"} className="rounded-xl" disabled={setEnabled.isPending} aria-label={job.isEnable ? `إيقاف ${job.name}` : `استئناف ${job.name}`} onClick={() => setEnabled.mutate({ taskUid: job.taskUid, enabled: !job.isEnable })}>{job.isEnable ? "إيقاف مؤقت" : "استئناف التقرير"}</Button></div>)}
        </CardContent>
      </Card>
      <Card className="border-[#dfe9df] bg-white shadow-[0_5px_18px_rgba(39,70,48,0.04)]">
        <CardHeader className="gap-3"><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle className="text-base">سجل التنفيذ والتنبيهات</CardTitle><div className="flex flex-wrap gap-2">{canRetry && reportLogs.some((log) => log.action === "usage_digest_failed") && <Button aria-label="إعادة محاولة تقرير الاستخدام" size="sm" variant="outline" className="gap-1 rounded-xl" onClick={() => retryDigest.mutate()} disabled={retryDigest.isPending}><RotateCcw className={`h-3.5 w-3.5 ${retryDigest.isPending ? "animate-spin" : ""}`} />إعادة المحاولة</Button>}<Button size="sm" variant="outline" className="gap-1 rounded-xl" onClick={exportLogs} disabled={filteredLogs.length === 0}><Download className="h-3.5 w-3.5" />تصدير Excel</Button></div></div><div className="flex flex-wrap gap-2"><select aria-label="نوع سجل التنفيذ" value={logFilter} onChange={(event) => setLogFilter(event.target.value as typeof logFilter)} className="h-8 rounded-lg border border-[#dfe9df] bg-white px-2 text-[11px] text-[#476054]"><option value="all">كل السجلات</option><option value="success">نجاح التقارير</option><option value="failed">الإخفاقات</option><option value="control">إيقاف واستئناف</option></select><input aria-label="بحث في مستخدم أو تفاصيل السجل" value={logUserFilter} onChange={(event) => setLogUserFilter(event.target.value)} placeholder="بحث في المستخدم أو التفاصيل" className="h-8 min-w-48 rounded-lg border border-[#dfe9df] px-2 text-[11px] outline-none focus:ring-2 focus:ring-[#9bc7ad]" /></div></CardHeader>
        <CardContent>{filteredLogs.length === 0 ? <p role="status" className="rounded-xl bg-[#f7faf7] p-5 text-center text-xs text-[#89948b]">لا توجد نتائج مطابقة للفلاتر الحالية.</p> : <div className="space-y-2">{filteredLogs.slice(0, 12).map((log) => { const failed = log.action === "usage_digest_failed"; return <div key={log.id} className="flex items-start gap-3 rounded-xl border border-[#edf1ed] p-3"><div className={`mt-0.5 rounded-lg p-1.5 ${failed ? "bg-[#fff0ed] text-[#b96556]" : "bg-[#e2f3e7] text-[#2c8a5f]"}`}>{failed ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold">{failed ? "فشل تقرير الاستخدام" : log.action === "heartbeat_enabled" ? "تم استئناف الوظيفة" : log.action === "heartbeat_disabled" ? "تم إيقاف الوظيفة" : "تم تنفيذ تقرير الاستخدام"}</p><span className="inline-flex items-center gap-1 text-[10px] text-[#89948b]"><Clock3 className="h-3 w-3" />{log.createdAt ? new Date(log.createdAt).toLocaleString("ar-SA") : "—"}</span></div><p className="mt-1 truncate text-[10px] text-[#89948b]">{log.afterData ?? "سجل تنفيذ موثق"}</p></div></div>})}</div>}</CardContent>
      </Card>
    </div>
  );
}
