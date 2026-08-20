import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Play, Pause, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ScheduledReportsView() {
  const utils = trpc.useUtils();
  const jobsQuery = trpc.heartbeat.jobs.useQuery(undefined, { refetchInterval: 30000 });
  const setEnabled = trpc.heartbeat.setEnabled.useMutation({
    onSuccess: () => utils.heartbeat.jobs.invalidate(),
  });
  const jobs = jobsQuery.data?.jobs ?? [];
  const logs = jobsQuery.data?.logs ?? [];
  const reportLogs = useMemo(() => logs.filter((log) => log.action === "usage_digest" || log.action === "usage_digest_failed" || log.action.startsWith("heartbeat_")), [logs]);

  return (
    <div className="space-y-4" dir="rtl">
      <Card className="border-[#dfe9df] bg-white shadow-[0_5px_18px_rgba(39,70,48,0.04)]">
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div><p className="text-xs font-semibold text-[#4d8068]">تشغيل آمن ومراقب</p><CardTitle className="mt-1 text-lg">إدارة التقارير الدورية</CardTitle><p className="mt-1 text-xs text-[#89948b]">إيقاف أو استئناف الوظيفة ومراجعة آخر النتائج دون الوصول إلى بيانات مستخدمين غير مصرح بها.</p></div>
          <Button variant="outline" size="sm" className="gap-1 rounded-xl" onClick={() => jobsQuery.refetch()} disabled={jobsQuery.isFetching}><RefreshCw className="h-3.5 w-3.5" />تحديث</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {jobsQuery.isLoading ? <div className="rounded-xl bg-[#f7faf7] p-5 text-center text-xs text-[#89948b]">جارٍ تحميل وظائف التقارير…</div> : jobs.length === 0 ? <div className="rounded-xl border border-dashed border-[#dfe9df] p-5 text-center text-xs text-[#89948b]">لا توجد وظيفة تقرير متاحة لهذا الحساب.</div> : jobs.map((job) => <div key={job.taskUid} className="flex flex-col gap-3 rounded-xl border border-[#edf1ed] bg-[#fbfdfb] p-4 md:flex-row md:items-center md:justify-between"><div className="flex items-start gap-3"><div className={`mt-0.5 rounded-lg p-2 ${job.isEnable ? "bg-[#e2f3e7] text-[#2c8a5f]" : "bg-[#fff0dc] text-[#c47629]"}`}>{job.isEnable ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}</div><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-bold text-[#1c2820]">{job.name}</p><Badge variant="outline" className="rounded-full text-[10px]">{job.isEnable ? "مفعلة" : "متوقفة"}</Badge></div><p className="mt-1 text-[11px] text-[#6b8172]">{job.description || "تقرير تشغيلي دوري"}</p><p className="mt-1 text-[10px] text-[#89948b]">الجدولة: {job.cronExpression} · التنفيذ القادم: {job.nextExecutionAt ? new Date(job.nextExecutionAt).toLocaleString("ar-SA") : "غير متاح"}</p></div></div><Button size="sm" variant={job.isEnable ? "outline" : "default"} className="rounded-xl" disabled={setEnabled.isPending} onClick={() => setEnabled.mutate({ taskUid: job.taskUid, enabled: !job.isEnable })}>{job.isEnable ? "إيقاف مؤقت" : "استئناف التقرير"}</Button></div>)}
        </CardContent>
      </Card>
      <Card className="border-[#dfe9df] bg-white shadow-[0_5px_18px_rgba(39,70,48,0.04)]">
        <CardHeader><CardTitle className="text-base">سجل التنفيذ والتنبيهات</CardTitle></CardHeader>
        <CardContent>{reportLogs.length === 0 ? <p className="rounded-xl bg-[#f7faf7] p-5 text-center text-xs text-[#89948b]">لا توجد نتائج تنفيذ مسجلة بعد.</p> : <div className="space-y-2">{reportLogs.slice(0, 12).map((log) => { const failed = log.action === "usage_digest_failed"; return <div key={log.id} className="flex items-start gap-3 rounded-xl border border-[#edf1ed] p-3"><div className={`mt-0.5 rounded-lg p-1.5 ${failed ? "bg-[#fff0ed] text-[#b96556]" : "bg-[#e2f3e7] text-[#2c8a5f]"}`}>{failed ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold">{failed ? "فشل تقرير الاستخدام" : log.action === "heartbeat_enabled" ? "تم استئناف الوظيفة" : log.action === "heartbeat_disabled" ? "تم إيقاف الوظيفة" : "تم تنفيذ تقرير الاستخدام"}</p><span className="inline-flex items-center gap-1 text-[10px] text-[#89948b]"><Clock3 className="h-3 w-3" />{log.createdAt ? new Date(log.createdAt).toLocaleString("ar-SA") : "—"}</span></div><p className="mt-1 truncate text-[10px] text-[#89948b]">{log.afterData ?? "سجل تنفيذ موثق"}</p></div></div>})}</div>}</CardContent>
      </Card>
    </div>
  );
}
