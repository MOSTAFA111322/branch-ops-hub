import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { AlertTriangle, CheckCircle2, Clock3, FileText, Play, Pause, RefreshCw, Download, RotateCcw, Search, Send, Trash2, ArrowDownAZ, ArrowUpAZ } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ReadyReport = { id: string; title: string; period: string; costCenter: string; phone: string; createdAt: string; status: string };

export function ScheduledReportsView({ canRetry = false }: { canRetry?: boolean }) {
  const utils = trpc.useUtils();
  const [readyReports, setReadyReports] = useState<ReadyReport[]>([]);
  const [readyReportSearch, setReadyReportSearch] = useState("");
  const [readyReportType, setReadyReportType] = useState("all");
  const [readyReportDateFrom, setReadyReportDateFrom] = useState("");
  const [readyReportDateTo, setReadyReportDateTo] = useState("");
  const [readyReportSort, setReadyReportSort] = useState<"newest" | "oldest">("newest");
  useEffect(() => {
    const loadReadyReports = () => { try { setReadyReports(JSON.parse(localStorage.getItem("branch-ops-ready-reports") ?? "[]") as ReadyReport[]); } catch { setReadyReports([]); } };
    loadReadyReports();
    window.addEventListener("storage", loadReadyReports);
    window.addEventListener("branch-ops-ready-reports-updated", loadReadyReports);
    return () => { window.removeEventListener("storage", loadReadyReports); window.removeEventListener("branch-ops-ready-reports-updated", loadReadyReports); };
  }, []);
  const filteredReadyReports = useMemo(() => readyReports.filter((report) => {
    const search = readyReportSearch.trim().toLocaleLowerCase("ar");
    const createdAt = new Date(report.createdAt);
    const matchesSearch = !search || `${report.title} ${report.period} ${report.costCenter} ${report.phone}`.toLocaleLowerCase("ar").includes(search);
    const matchesType = readyReportType === "all" || report.title === readyReportType;
    const matchesFrom = !readyReportDateFrom || createdAt >= new Date(`${readyReportDateFrom}T00:00:00`);
    const matchesTo = !readyReportDateTo || createdAt <= new Date(`${readyReportDateTo}T23:59:59`);
    return matchesSearch && matchesType && matchesFrom && matchesTo;
  }), [readyReports, readyReportSearch, readyReportType, readyReportDateFrom, readyReportDateTo]);
  const sortedReadyReports = useMemo(() => [...filteredReadyReports].sort((a, b) => {
    const dateDifference = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (dateDifference !== 0) return readyReportSort === "newest" ? -dateDifference : dateDifference;
    return readyReportSort === "newest" ? b.title.localeCompare(a.title, "ar") : a.title.localeCompare(b.title, "ar");
  }), [filteredReadyReports, readyReportSort]);
  const readyReportTypes = useMemo(() => Array.from(new Set(readyReports.map((report) => report.title || "تقرير تنفيذي مالي"))), [readyReports]);
  const [warningFailureRate, setWarningFailureRate] = useState(20);
  const [warningLatencyMs, setWarningLatencyMs] = useState(30000);
  const [healthRefreshSeconds, setHealthRefreshSeconds] = useState(30);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("scheduled-report-settings") ?? "null") as Partial<{ warningFailureRate: number; warningLatencyMs: number; healthRefreshSeconds: number }> | null;
      if (saved) {
        if (Number.isFinite(saved.warningFailureRate)) setWarningFailureRate(Math.min(100, Math.max(1, Number(saved.warningFailureRate))));
        if (Number.isFinite(saved.warningLatencyMs)) setWarningLatencyMs(Math.min(300000, Math.max(1000, Number(saved.warningLatencyMs))));
        if (Number.isFinite(saved.healthRefreshSeconds)) setHealthRefreshSeconds(Math.min(300, Math.max(10, Number(saved.healthRefreshSeconds))));
      }
    } catch { /* ignore malformed local preferences */ }
  }, []);
  useEffect(() => {
    if (!canRetry) return;
    localStorage.setItem("scheduled-report-settings", JSON.stringify({ warningFailureRate, warningLatencyMs, healthRefreshSeconds }));
  }, [canRetry, warningFailureRate, warningLatencyMs, healthRefreshSeconds]);
  const jobsQuery = trpc.heartbeat.jobs.useQuery(undefined, { refetchInterval: healthRefreshSeconds * 1000 });
  const jobs = jobsQuery.data?.jobs ?? [];
  const recipientsQuery = trpc.heartbeat.recipients.useQuery(undefined, { enabled: canRetry });
  const [recipientTaskUid, setRecipientTaskUid] = useState("");
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<number[]>([]);
  useEffect(() => {
    const firstTaskUid = jobs[0]?.taskUid ?? "";
    if (!recipientTaskUid && firstTaskUid) setRecipientTaskUid(firstTaskUid);
  }, [jobs, recipientTaskUid]);
  useEffect(() => {
    if (!recipientTaskUid || !recipientsQuery.data) return;
    setSelectedRecipientIds(recipientsQuery.data.rows.filter((row) => row.taskUid === recipientTaskUid).map((row) => row.recipientId));
  }, [recipientTaskUid, recipientsQuery.data]);
  const setEnabled = trpc.heartbeat.setEnabled.useMutation({
    onSuccess: () => utils.heartbeat.jobs.invalidate(),
  });
  const saveRecipients = trpc.heartbeat.saveRecipients.useMutation({ onSuccess: () => recipientsQuery.refetch() });
  const retryDigest = trpc.heartbeat.retryUsageDigest.useMutation({
    onSuccess: () => utils.heartbeat.jobs.invalidate(),
  });
  const logs = jobsQuery.data?.logs ?? [];
  const deliveryMarker = useMemo(() => {
    const matching = logs.filter((log) => {
      try { return JSON.parse(log.afterData ?? "{}").taskUid === recipientTaskUid; } catch { return false; }
    });
    for (const log of matching) {
      try {
        const marker = JSON.parse(log.afterData ?? "{}").marker;
        if (typeof marker === "string") return marker;
      } catch { /* ignore malformed audit rows */ }
    }
    return "";
  }, [logs, recipientTaskUid]);
  const deliveryQuery = trpc.heartbeat.deliveryStatus.useQuery({ taskUid: recipientTaskUid, marker: deliveryMarker }, { enabled: canRetry && Boolean(recipientTaskUid && deliveryMarker), refetchInterval: healthRefreshSeconds * 1000 });
  const retryDelivery = trpc.heartbeat.retryDelivery.useMutation({ onSuccess: () => deliveryQuery.refetch() });
  const health = jobsQuery.data?.health;
  const configuredWarningReasons = useMemo(() => {
    if (!health) return [] as string[];
    const reasons: string[] = [];
    const failureRate = health.successRate === null ? null : Math.max(0, 100 - health.successRate);
    if (failureRate !== null && failureRate >= warningFailureRate) reasons.push(`معدل الفشل ${failureRate}% تجاوز حد ${warningFailureRate}%`);
    if (health.averageLatencyMs !== null && health.averageLatencyMs >= warningLatencyMs) reasons.push(`متوسط التنفيذ ${health.averageLatencyMs} مللي ثانية تجاوز حد ${warningLatencyMs}`);
    return reasons;
  }, [health, warningFailureRate, warningLatencyMs]);
  const [logFilter, setLogFilter] = useState<"all" | "success" | "failed" | "control">("all");
  const [logUserFilter, setLogUserFilter] = useState("");
  const [logJobFilter, setLogJobFilter] = useState("all");
  const [logStatusFilter, setLogStatusFilter] = useState<"all" | "success" | "failed">("all");
  const [logDateFrom, setLogDateFrom] = useState("");
  const [logDateTo, setLogDateTo] = useState("");
  const reportLogs = useMemo(() => logs.filter((log) => ["usage_digest", "usage_digest_failed", "scheduled_report", "scheduled_report_failed", "weekly_executive_digest", "weekly_executive_digest_failed"].includes(log.action) || log.action.startsWith("heartbeat_")), [logs]);
  const filteredLogs = useMemo(() => reportLogs.filter((log) => {
    const matchesType = logFilter === "all" || (logFilter === "failed" ? log.action.endsWith("_failed") : logFilter === "success" ? !log.action.endsWith("_failed") && !log.action.startsWith("heartbeat_") : log.action.startsWith("heartbeat_"));
    const haystack = `${log.actorId ?? ""} ${log.afterData ?? ""}`.toLocaleLowerCase("ar");
    let details: Record<string, unknown> = {};
    try { details = JSON.parse(log.afterData ?? "{}"); } catch { /* keep searchable text fallback */ }
    const createdAt = log.createdAt ? new Date(log.createdAt) : null;
    const matchesJob = logJobFilter === "all" || details.taskUid === logJobFilter;
    const matchesStatus = logStatusFilter === "all" || (logStatusFilter === "failed" ? log.action.endsWith("failed") : logStatusFilter === "success" ? !log.action.endsWith("failed") : true);
    const matchesFrom = !logDateFrom || Boolean(createdAt && createdAt >= new Date(`${logDateFrom}T00:00:00`));
    const matchesTo = !logDateTo || Boolean(createdAt && createdAt <= new Date(`${logDateTo}T23:59:59`));
    return matchesType && matchesJob && matchesStatus && matchesFrom && matchesTo && (!logUserFilter.trim() || haystack.includes(logUserFilter.trim().toLocaleLowerCase("ar")));
  }), [logFilter, logUserFilter, logJobFilter, logStatusFilter, logDateFrom, logDateTo, reportLogs]);
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
      <Card className="border-[#dfe9df] bg-white shadow-[0_5px_18px_rgba(39,70,48,0.04)]" aria-labelledby="ready-reports-title">
        <CardHeader><div className="flex items-center justify-between gap-2"><div><CardTitle id="ready-reports-title" className="flex items-center gap-2 text-base"><FileText className="h-4 w-4 text-[#4d8068]" /> التقارير الجاهزة للمشاركة</CardTitle><p className="mt-1 text-xs text-[#89948b]">تُنشأ الجدولة التقرير وتحفظه هنا. المشاركة عبر واتساب العادي يدوية: يفتح النظام المحادثة والرسالة، ثم يضغط المستخدم إرسال ويرفق PDF عند الحاجة.</p></div><Badge variant="outline" className="rounded-full text-[10px]">{readyReports.length} تقرير</Badge></div></CardHeader>
        <CardContent>
          {readyReports.length === 0 ? <p className="rounded-xl bg-[#f7faf7] p-4 text-center text-xs text-[#89948b]">لا توجد تقارير جاهزة للمشاركة بعد.</p> : <>
            <div className="mb-3 grid gap-2 rounded-xl bg-[#f7faf7] p-3 sm:grid-cols-2 lg:grid-cols-4"><label className="relative sm:col-span-2"><Search className="absolute right-3 top-2.5 h-4 w-4 text-[#89948b]" /><Input value={readyReportSearch} onChange={(event) => setReadyReportSearch(event.target.value)} placeholder="بحث في العنوان والفترة والمركز" className="h-9 rounded-lg pr-9 text-xs" aria-label="بحث في التقارير الجاهزة" /></label><select value={readyReportType} onChange={(event) => setReadyReportType(event.target.value)} className="h-9 rounded-lg border border-input bg-background px-2 text-xs" aria-label="نوع التقرير"><option value="all">كل أنواع التقارير</option>{readyReportTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select><label className="flex items-center gap-1 rounded-lg border border-input bg-background px-2"><span className="sr-only">ترتيب سجل التقارير</span>{readyReportSort === "newest" ? <ArrowDownAZ className="h-3.5 w-3.5 text-[#4d8068]" /> : <ArrowUpAZ className="h-3.5 w-3.5 text-[#4d8068]" />}<select value={readyReportSort} onChange={(event) => setReadyReportSort(event.target.value as typeof readyReportSort)} className="h-8 bg-transparent text-xs outline-none" aria-label="ترتيب سجل التقارير"><option value="newest">الأحدث أولًا</option><option value="oldest">الأقدم أولًا</option></select></label><div className="flex gap-2">
<Input type="date" value={readyReportDateFrom} onChange={(event) => setReadyReportDateFrom(event.target.value)} className="h-9 min-w-0 rounded-lg text-xs" aria-label="من تاريخ سجل التقارير" /><Input type="date" value={readyReportDateTo} onChange={(event) => setReadyReportDateTo(event.target.value)} className="h-9 min-w-0 rounded-lg text-xs" aria-label="إلى تاريخ سجل التقارير" /></div></div>
            <div className="space-y-2">
              {sortedReadyReports.slice(0, 8).map((report) => (
                <div key={report.id} className="flex flex-col gap-2 rounded-xl border border-[#edf1ed] bg-[#fbfdfb] p-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0"><p className="truncate text-xs font-semibold text-[#1c2820]">{report.title || "تقرير تنفيذي مالي"}</p><p className="mt-1 text-[10px] text-[#89948b]">الفترة: {report.period} · المركز: {report.costCenter === "all" ? "كل المراكز" : report.costCenter} · الرقم: {report.phone}</p><p className="mt-1 text-[10px] text-[#4d8068]">{report.status} · {new Date(report.createdAt).toLocaleString("ar-SA")}</p></div>
                  <Button size="sm" variant="outline" className="gap-1 rounded-xl text-[11px]" onClick={() => window.open("https://wa.me/" + report.phone + "?text=" + encodeURIComponent("تقرير: " + (report.title || "التقرير التنفيذي المالي") + "\nالفترة: " + report.period + "\nالتقرير جاهز للمراجعة والمشاركة اليدوية."), "_blank", "noopener,noreferrer")}><Send className="h-3.5 w-3.5" />فتح واتساب</Button>
                </div>
              ))}
            </div>
            {filteredReadyReports.length === 0 && <p className="rounded-xl border border-dashed border-[#dfe9df] p-4 text-center text-xs text-[#89948b]">لا توجد نتائج مطابقة للفلاتر الحالية.</p>}
          </>}
          {readyReports.length > 0 && <Button variant="ghost" size="sm" className="mt-2 gap-1 text-[11px] text-[#89948b]" onClick={() => { localStorage.removeItem("branch-ops-ready-reports"); setReadyReports([]); }}><Trash2 className="h-3.5 w-3.5" />مسح السجل المحلي</Button>}
        </CardContent>
      </Card>
      <Card className="border-[#dfe9df] bg-white shadow-[0_5px_18px_rgba(39,70,48,0.04)]" aria-labelledby="scheduled-health-title">
        <CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold text-[#4d8068]">مراقبة الاستمرارية</p><CardTitle id="scheduled-health-title" className="mt-1 text-base">صحة وظائف التقارير</CardTitle><p className="mt-1 text-xs text-[#89948b]">ملخص مبني على سجلات التنفيذ الفعلية، ويُحدّث تلقائيًا كل {healthRefreshSeconds} ثانية.</p></div><Badge variant="outline" className={`rounded-full text-[10px] ${health?.status === "failed" ? "border-[#efc8bf] text-[#a45b4e]" : health?.status === "stale" || health?.status === "warning" ? "border-[#ead8a8] text-[#ad7a27]" : "border-[#c9e1cf] text-[#2d7d58]"}`}>{health?.status === "failed" ? "تحتاج تدخلًا" : health?.status === "stale" ? "متأخرة" : health?.status === "warning" ? "تحذير مبكر" : "تعمل بصورة طبيعية"}</Badge></div></CardHeader>
        <CardContent>{!health ? <p role="status" className="rounded-xl bg-[#f7faf7] p-4 text-center text-xs text-[#89948b]">لا تتوفر بيانات صحة كافية بعد.</p> : <div className="space-y-3">{[...(health.warningReasons ?? []), ...configuredWarningReasons.filter((reason) => !(health.warningReasons ?? []).includes(reason))].length ? <div role="alert" className="flex items-start gap-2 rounded-xl border border-[#ead8a8] bg-[#fffaf0] p-3 text-xs text-[#8b6a2d]"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div><p className="font-semibold">تنبيه مبكر للمراجعة</p><p className="mt-1">{[...(health.warningReasons ?? []), ...configuredWarningReasons.filter((reason) => !(health.warningReasons ?? []).includes(reason))].join(" · ")}</p></div></div> : null}<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-xl border border-[#edf1ed] bg-[#fbfdfb] p-3"><p className="text-[10px] text-[#89948b]">معدل النجاح</p><p className="mt-1 text-xl font-bold text-[#174c3d]">{health.successRate === null ? "—" : `${health.successRate}%`}</p><p className="mt-1 text-[10px] text-[#6b8172]">{health.successCount} نجاح · {health.failureCount} فشل</p></div><div className="rounded-xl border border-[#edf1ed] bg-[#fbfdfb] p-3"><p className="text-[10px] text-[#89948b]">متوسط زمن التنفيذ</p><p className="mt-1 text-xl font-bold text-[#174c3d]">{health.averageLatencyMs === null ? "—" : `${health.averageLatencyMs} مللي ثانية`}</p><p className="mt-1 text-[10px] text-[#6b8172]">من السجلات المتاحة</p></div><div className="rounded-xl border border-[#edf1ed] bg-[#fbfdfb] p-3"><p className="text-[10px] text-[#89948b]">آخر نجاح</p><p className="mt-1 text-sm font-bold text-[#174c3d]">{health.lastSuccessAt ? new Date(health.lastSuccessAt).toLocaleString("ar-SA") : "لا يوجد"}</p></div><div className="rounded-xl border border-[#edf1ed] bg-[#fbfdfb] p-3"><p className="text-[10px] text-[#89948b]">آخر تنفيذ</p><p className="mt-1 text-sm font-bold text-[#174c3d]">{health.hoursSinceLastRun === null ? "لا يوجد" : health.hoursSinceLastRun === 0 ? "خلال الساعة الحالية" : `منذ ${health.hoursSinceLastRun} ساعة`}</p><p className="mt-1 text-[10px] text-[#6b8172]">آخر فشل: {health.lastFailureAt ? new Date(health.lastFailureAt).toLocaleString("ar-SA") : "لا يوجد"}</p></div></div></div>}</CardContent>
      </Card>
      {canRetry && <Card className="border-[#dfe9df] bg-white shadow-[0_5px_18px_rgba(39,70,48,0.04)]" aria-labelledby="scheduled-settings-title"><CardHeader><CardTitle id="scheduled-settings-title" className="text-base">إعدادات المراقبة الإدارية</CardTitle><p className="mt-1 text-xs text-[#89948b]">تتحكم هذه القيم في حساسية التحذير وتواتر تحديث لوحة الصحة لهذا المتصفح.</p></CardHeader><CardContent><div className="grid gap-3 md:grid-cols-3"><label className="space-y-1 text-[11px] text-[#53695a]">حد معدل الفشل (%)<input type="number" min={1} max={100} value={warningFailureRate} onChange={(event) => setWarningFailureRate(Math.min(100, Math.max(1, Number(event.target.value) || 1)))} className="mt-1 h-9 w-full rounded-lg border border-[#dfe9df] bg-white px-2 text-xs" /></label><label className="space-y-1 text-[11px] text-[#53695a]">حد زمن التنفيذ (مللي ثانية)<input type="number" min={1000} max={300000} step={1000} value={warningLatencyMs} onChange={(event) => setWarningLatencyMs(Math.min(300000, Math.max(1000, Number(event.target.value) || 1000)))} className="mt-1 h-9 w-full rounded-lg border border-[#dfe9df] bg-white px-2 text-xs" /></label><label className="space-y-1 text-[11px] text-[#53695a]">تواتر تحديث الصحة<input type="number" min={10} max={300} value={healthRefreshSeconds} onChange={(event) => setHealthRefreshSeconds(Math.min(300, Math.max(10, Number(event.target.value) || 10)))} className="mt-1 h-9 w-full rounded-lg border border-[#dfe9df] bg-white px-2 text-xs" /><span className="mt-1 block text-[10px] text-[#89948b]">ثانية · محفوظة محليًا للمسؤول</span></label></div></CardContent></Card>}
      {canRetry && <Card className="border-[#dfe9df] bg-white shadow-[0_5px_18px_rgba(39,70,48,0.04)]" aria-labelledby="scheduled-recipients-title"><CardHeader><CardTitle id="scheduled-recipients-title" className="text-base">مستلمو التقارير المجدولة</CardTitle><p className="mt-1 text-xs text-[#89948b]">حدد المستخدمين المصرح لهم باستلام ملخص التقرير عند تشغيل الوظيفة.</p></CardHeader><CardContent className="space-y-3"><label className="block text-[11px] text-[#53695a]">وظيفة التقرير<select aria-label="وظيفة التقرير للمستلمين" value={recipientTaskUid} onChange={(event) => setRecipientTaskUid(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-[#dfe9df] bg-white px-2 text-xs">{jobs.map((job) => <option key={job.taskUid} value={job.taskUid}>{job.name}</option>)}</select></label><div className="grid gap-2 sm:grid-cols-2">{(recipientsQuery.data?.users ?? []).map((user) => <label key={user.id} className="flex items-center gap-2 rounded-lg border border-[#edf1ed] p-2 text-xs"><input type="checkbox" checked={selectedRecipientIds.includes(user.id)} onChange={(event) => setSelectedRecipientIds((current) => event.target.checked ? [...current, user.id] : current.filter((id) => id !== user.id))} />{user.name || user.email || `مستخدم ${user.id}`}<span className="text-[10px] text-[#89948b]">{user.role}</span></label>)}</div><Button size="sm" className="rounded-xl" disabled={!recipientTaskUid || saveRecipients.isPending} onClick={() => saveRecipients.mutate({ taskUid: recipientTaskUid, recipientIds: selectedRecipientIds })}>حفظ المستلمين</Button>{deliveryMarker && <div className="rounded-xl border border-[#edf1ed] bg-[#fbfdfb] p-3"><div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold text-[#355b49]">حالة تسليم آخر تشغيل</p><span className="text-[10px] text-[#89948b]">{deliveryQuery.isFetching ? "جارٍ التحديث…" : deliveryMarker}</span></div>{deliveryQuery.data?.length ? <div className="mt-2 grid gap-2 sm:grid-cols-2">{deliveryQuery.data.map((delivery) => <div key={delivery.id} className="flex items-center justify-between rounded-lg border border-[#edf1ed] bg-white px-2 py-1.5 text-[11px]"><span>مستخدم {delivery.recipientId}</span><div className="flex items-center gap-2"><Badge variant="outline" className={delivery.status === "delivered" ? "border-[#c9e1cf] text-[#2d7d58]" : "border-[#efc8bf] text-[#a45b4e]"}>{delivery.status === "delivered" ? "تم التسليم" : "فشل التسليم"}</Badge>{delivery.status === "failed" && <Button size="sm" variant="outline" className="h-7 rounded-lg px-2 text-[10px]" disabled={retryDelivery.isPending} onClick={() => retryDelivery.mutate({ taskUid: recipientTaskUid, marker: deliveryMarker, recipientId: delivery.recipientId })}>إعادة إرسال</Button>}</div></div>)}</div> : <p role="status" className="mt-2 text-[11px] text-[#89948b]">لا يوجد سجل تسليم لهذا التشغيل حتى الآن.</p>}</div>}</CardContent></Card>}
      <Card className="border-[#dfe9df] bg-white shadow-[0_5px_18px_rgba(39,70,48,0.04)]">
        <CardHeader className="gap-3"><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle className="text-base">سجل التنفيذ والتنبيهات</CardTitle><div className="flex flex-wrap gap-2">{canRetry && reportLogs.some((log) => log.action === "usage_digest_failed") && <Button aria-label="إعادة محاولة تقرير الاستخدام" size="sm" variant="outline" className="gap-1 rounded-xl" onClick={() => retryDigest.mutate()} disabled={retryDigest.isPending}><RotateCcw className={`h-3.5 w-3.5 ${retryDigest.isPending ? "animate-spin" : ""}`} />إعادة المحاولة</Button>}<Button size="sm" variant="outline" className="gap-1 rounded-xl" onClick={exportLogs} disabled={filteredLogs.length === 0}><Download className="h-3.5 w-3.5" />تصدير Excel</Button></div></div><div className="flex flex-wrap gap-2"><select aria-label="نوع سجل التنفيذ" value={logFilter} onChange={(event) => setLogFilter(event.target.value as typeof logFilter)} className="h-8 rounded-lg border border-[#dfe9df] bg-white px-2 text-[11px] text-[#476054]"><option value="all">كل السجلات</option><option value="success">نجاح التقارير</option><option value="failed">الإخفاقات</option><option value="control">إيقاف واستئناف</option></select><select aria-label="وظيفة سجل التنفيذ" value={logJobFilter} onChange={(event) => setLogJobFilter(event.target.value)} className="h-8 rounded-lg border border-[#dfe9df] bg-white px-2 text-[11px] text-[#476054]"><option value="all">كل الوظائف</option>{jobs.map((job) => <option key={job.taskUid} value={job.taskUid}>{job.name}</option>)}</select><select aria-label="حالة سجل التسليم" value={logStatusFilter} onChange={(event) => setLogStatusFilter(event.target.value as typeof logStatusFilter)} className="h-8 rounded-lg border border-[#dfe9df] bg-white px-2 text-[11px] text-[#476054]"><option value="all">كل الحالات</option><option value="success">نجاح</option><option value="failed">فشل</option></select><input type="date" aria-label="من تاريخ سجل التنفيذ" value={logDateFrom} onChange={(event) => setLogDateFrom(event.target.value)} className="h-8 rounded-lg border border-[#dfe9df] px-2 text-[11px]" /><input type="date" aria-label="إلى تاريخ سجل التنفيذ" value={logDateTo} onChange={(event) => setLogDateTo(event.target.value)} className="h-8 rounded-lg border border-[#dfe9df] px-2 text-[11px]" /><input aria-label="بحث في مستخدم أو تفاصيل السجل" value={logUserFilter} onChange={(event) => setLogUserFilter(event.target.value)} placeholder="بحث في المستلم أو التفاصيل" className="h-8 min-w-48 rounded-lg border border-[#dfe9df] px-2 text-[11px] outline-none focus:ring-2 focus:ring-[#9bc7ad]" /></div></CardHeader>
        <CardContent>{filteredLogs.length === 0 ? <p role="status" className="rounded-xl bg-[#f7faf7] p-5 text-center text-xs text-[#89948b]">لا توجد نتائج مطابقة للفلاتر الحالية.</p> : <div className="space-y-2">{filteredLogs.slice(0, 12).map((log) => { const failed = log.action.endsWith("_failed"); return <div key={log.id} className="flex items-start gap-3 rounded-xl border border-[#edf1ed] p-3"><div className={`mt-0.5 rounded-lg p-1.5 ${failed ? "bg-[#fff0ed] text-[#b96556]" : "bg-[#e2f3e7] text-[#2c8a5f]"}`}>{failed ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold">{failed ? (log.action === "weekly_executive_digest_failed" ? "فشل التقرير التنفيذي الأسبوعي" : log.action === "scheduled_report_failed" ? "فشل التقرير المالي الشهري" : "فشل تقرير الاستخدام") : log.action === "heartbeat_enabled" ? "تم استئناف الوظيفة" : log.action === "heartbeat_disabled" ? "تم إيقاف الوظيفة" : log.action === "weekly_executive_digest" ? "تم تنفيذ التقرير التنفيذي الأسبوعي" : log.action === "scheduled_report" ? "تم تنفيذ التقرير المالي الشهري" : "تم تنفيذ تقرير الاستخدام"}</p><span className="inline-flex items-center gap-1 text-[10px] text-[#89948b]"><Clock3 className="h-3 w-3" />{log.createdAt ? new Date(log.createdAt).toLocaleString("ar-SA") : "—"}</span></div><p className="mt-1 truncate text-[10px] text-[#89948b]">{log.afterData ?? "سجل تنفيذ موثق"}</p></div></div>})}</div>}</CardContent>
      </Card>
    </div>
  );
}
