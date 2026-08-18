import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpLeft,
  Bell,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  FileText,
  Filter,
  Gauge,
  LayoutDashboard,
  ListTodo,
  Inbox,
  MapPin,
  MoreHorizontal,
  PackageCheck,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";

const branches = [
  { name: "فرع العليا", area: "الرياض الوسطى", score: 94, status: "مستقر", color: "emerald", tasks: 3, risk: "منخفض" },
  { name: "فرع التحلية", area: "الرياض الوسطى", score: 88, status: "يحتاج متابعة", color: "amber", tasks: 7, risk: "متوسط" },
  { name: "فرع النخيل", area: "الرياض الشمال", score: 96, status: "ممتاز", color: "emerald", tasks: 2, risk: "منخفض" },
  { name: "فرع الملقا", area: "الرياض الشمال", score: 79, status: "إجراء مطلوب", color: "rose", tasks: 11, risk: "مرتفع" },
  { name: "فرع الروضة", area: "جدة", score: 91, status: "مستقر", color: "emerald", tasks: 4, risk: "منخفض" },
  { name: "فرع الشاطئ", area: "جدة", score: 84, status: "يحتاج متابعة", color: "amber", tasks: 8, risk: "متوسط" },
];

const navItems = [
  { label: "نظرة عامة", icon: LayoutDashboard },
  { label: "الفروع", icon: Building2 },
  { label: "الزيارات والفحص", icon: ClipboardCheck },
  { label: "الإجراءات والتحسين", icon: ShieldCheck },
  { label: "الوثائق والتراخيص", icon: FileText },
  { label: "الجودة والشكاوى", icon: CheckCircle2 },
  { label: "الصيانة والأصول", icon: Wrench },
  { label: "التقارير", icon: Gauge },
  { label: "المهام والطلبات", icon: ListTodo },
  { label: "الطلبات الداخلية", icon: ClipboardList },
];

function canAccessNav(label: string, role?: string) {
  if (!role || role === "admin" || role === "area_manager") return true;
  if (role === "branch_manager") return !["التقارير"].includes(label);
  if (role === "quality") return ["نظرة عامة", "الفروع", "الزيارات والفحص", "الإجراءات والتحسين", "الوثائق والتراخيص", "الجودة والشكاوى"].includes(label);
  if (role === "maintenance") return ["نظرة عامة", "الفروع", "الإجراءات والتحسين", "الصيانة والأصول"].includes(label);
  if (role === "warehouse" || role === "factory") return ["نظرة عامة", "الفروع", "الإجراءات والتحسين", "المهام والطلبات", "الطلبات الداخلية"].includes(label);
  return ["نظرة عامة", "الفروع"].includes(label);
}

function statusClasses(color: string) {
  return {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    rose: "bg-rose-50 text-rose-700 border-rose-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
  }[color] || "bg-slate-50 text-slate-700 border-slate-200";
}

function downloadExcel(section: string, rows: Array<Record<string, unknown>>) {
  const normalized = rows.map((row) => ({
    ID: row.id ?? "",
    Title: row.title ?? row.name ?? "Operational record",
    Branch: row.city ?? row.branchId ?? "",
    Status: row.riskLevel ?? row.status ?? row.priority ?? "",
    Score: row.healthScore ?? "",
    OpenActions: row.openActions ?? "",
    Date: row.createdAt ?? row.dueAt ?? row.expiresAt ?? "",
  }));
  const worksheet = XLSX.utils.json_to_sheet(normalized);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Report");
  XLSX.writeFile(workbook, `${section}-report.xlsx`);
}

function downloadPdf(section: string, rows: Array<Record<string, unknown>>) {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text("Branch Operations Report", 18, 18);
  doc.setFontSize(10);
  doc.text(`Section: ${section}`, 18, 27);
  rows.slice(0, 22).forEach((row, index) => {
    const y = 38 + index * 8;
    const line = `${index + 1}. ${String(row.name ?? row.title ?? "Operational record")} | ${String(row.city ?? row.branchId ?? "-")} | ${String(row.status ?? row.riskLevel ?? "-")}`;
    doc.text(line.slice(0, 115), 18, y);
  });
  doc.save(`${section}-report.pdf`);
}

function OperationsView({ section, user, onNavigate }: { section: string; user?: { role?: string } | null; onNavigate: (section: string) => void }) {
  const [reportPeriod, setReportPeriod] = useState<"day" | "week" | "month">("month");
  const { data, isLoading, error } = trpc.ops.overview.useQuery({ period: reportPeriod }, { enabled: Boolean(user) });
  const configs: Record<string, { title: string; subtitle: string; key: keyof NonNullable<typeof data>; columns: string[] }> = {
    "الفروع": { title: "دليل الفروع", subtitle: "ملف مركزي قابل للتصفية لكل فرع", key: "actions", columns: ["الفرع", "المدينة", "الصحة", "المخاطر", "الملف"] },
    "الزيارات والفحص": { title: "الزيارات والفحص", subtitle: "خطة الزيارات ومحاضر الفحص ودرجات الالتزام", key: "visits", columns: ["الحالة", "الفرع", "التاريخ", "الملاحظات"] },
    "الإجراءات والتحسين": { title: "الإجراءات وخطط التحسين", subtitle: "متابعة المسؤول والموعد ودليل الإغلاق", key: "actions", columns: ["العنوان", "الأولوية", "الحالة", "الاستحقاق"] },
    "الوثائق والتراخيص": { title: "الوثائق والتراخيص", subtitle: "سجل الإصدارات والتنبيهات المبكرة للانتهاء", key: "documents", columns: ["الوثيقة", "الفرع", "الحالة", "الانتهاء"] },
    "الجودة والشكاوى": { title: "الجودة والشكاوى", subtitle: "عدم المطابقة وتحليل الأسباب المتكررة", key: "qualityCases", columns: ["الحالة", "التصنيف", "الفرع", "الأولوية"] },
    "الصيانة والأصول": { title: "الصيانة والأصول", subtitle: "الأعطال والصيانة الوقائية والضمانات", key: "maintenanceTickets", columns: ["العطل", "الفرع", "الحالة", "الأولوية"] },
    "التقارير": { title: "التقارير الموحدة", subtitle: "مقارنة الفروع ومتابعة الاتجاهات التشغيلية", key: "comparison", columns: ["الفرع", "المدينة", "الصحة", "المخاطر"] },
    "المهام والطلبات": { title: "مركز المهام والطلبات", subtitle: "مهامك الشخصية والطلبات الداخلية المنظمة", key: "tasksAndRequests", columns: ["المهمة أو الطلب", "الجهة", "الحالة", "التاريخ"] },
    "الطلبات الداخلية": { title: "بوابة الطلبات الداخلية", subtitle: "إنشاء ومتابعة الطلبات ضمن نطاق المستخدم والدور", key: "requests", columns: ["الطلب", "الفرع", "الأولوية", "الحالة"] },
  };
  const config = configs[section] ?? configs["الفروع"];
  const [filterText, setFilterText] = useState("");
  const rows = data?.[config.key] ?? [];
  const filteredRows = useMemo(() => {
    const query = filterText.trim().toLowerCase();
    const now = Date.now();
    const periodMs = reportPeriod === "day" ? 86400000 : reportPeriod === "week" ? 604800000 : 2592000000;
    return (rows as Array<Record<string, unknown>>).filter((row) => {
      const matchesText = !query || Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(query));
      if (section !== "التقارير" || !row.createdAt) return matchesText;
      const timestamp = new Date(String(row.createdAt)).getTime();
      return matchesText && (!Number.isNaN(timestamp) ? now - timestamp <= periodMs : true);
    });
  }, [filterText, reportPeriod, rows, section]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [profileTab, setProfileTab] = useState("employees");
  const { data: profile, isLoading: profileLoading } = trpc.branches.profile.useQuery({ id: selectedId ?? 0 }, { enabled: section === "الفروع" && Boolean(selectedId) });
  const { data: branchOptions = [] } = trpc.branches.list.useQuery(undefined, { enabled: Boolean(user) });
  const utils = trpc.useUtils();
  const [createOpen, setCreateOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBranchId, setDraftBranchId] = useState("");
  const [documentType, setDocumentType] = useState("تشغيلي");
  const [documentVersion, setDocumentVersion] = useState("1.0");
  const [documentStatus, setDocumentStatus] = useState<"valid" | "expiring" | "expired" | "missing">("valid");
  const [documentExpiresAt, setDocumentExpiresAt] = useState("");
  const [documentFileUrl, setDocumentFileUrl] = useState("");
  const [recordKind, setRecordKind] = useState<"task" | "request">("task");
  const [createError, setCreateError] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const actionCreate = trpc.actions.create.useMutation();
  const visitCreate = trpc.visits.create.useMutation();
  const documentCreate = trpc.documents.create.useMutation();
  const qualityCreate = trpc.quality.create.useMutation();
  const maintenanceCreate = trpc.maintenance.create.useMutation();
  const requestCreate = trpc.requests.create.useMutation();
  const taskCreate = trpc.tasks.create.useMutation();
  const actionStatus = trpc.actions.updateStatus.useMutation();
  const actionUpdate = trpc.actions.update.useMutation();
  const documentUpdate = trpc.documents.update.useMutation();
  const visitStatus = trpc.visits.updateStatus.useMutation();
  const visitUpdate = trpc.visits.update.useMutation();
  const qualityStatus = trpc.quality.updateStatus.useMutation();
  const qualityUpdate = trpc.quality.update.useMutation();
  const maintenanceStatus = trpc.maintenance.updateStatus.useMutation();
  const maintenanceUpdate = trpc.maintenance.update.useMutation();
  const requestStatus = trpc.requests.updateStatus.useMutation();
  const taskStatus = trpc.tasks.updateStatus.useMutation();
  const taskUpdate = trpc.tasks.update.useMutation();
  const requestUpdate = trpc.requests.update.useMutation();
  const actionRemove = trpc.actions.remove.useMutation();
  const visitRemove = trpc.visits.remove.useMutation();
  const documentRemove = trpc.documents.remove.useMutation();
  const qualityRemove = trpc.quality.remove.useMutation();
  const maintenanceRemove = trpc.maintenance.remove.useMutation();
  const requestRemove = trpc.requests.remove.useMutation();
  const taskRemove = trpc.tasks.remove.useMutation();
  const removeRecord = async (id: number, row: Record<string, unknown>) => {
    if (!window.confirm("هل تريد حذف هذا السجل؟ لا يمكن التراجع عن العملية.")) return;
    try {
      if (section === "الإجراءات والتحسين") await actionRemove.mutateAsync({ id });
      else if (section === "الزيارات والفحص") await visitRemove.mutateAsync({ id });
      else if (section === "الوثائق والتراخيص") await documentRemove.mutateAsync({ id });
      else if (section === "الجودة والشكاوى") await qualityRemove.mutateAsync({ id });
      else if (section === "الصيانة والأصول") await maintenanceRemove.mutateAsync({ id });
      else if ((section === "المهام والطلبات" || section === "الطلبات الداخلية") && row.requestType) await requestRemove.mutateAsync({ id });
      else if (section === "المهام والطلبات") await taskRemove.mutateAsync({ id });
      await utils.ops.overview.invalidate();
    } catch (error) { setCreateError(error instanceof Error ? error.message : "تعذر حذف السجل."); }
  };
  const updateRecordStatus = async (id: number, status: string, extra?: { score?: number; notes?: string; reportTitle?: string; findings?: string; recommendations?: string; approvalStatus?: "draft" | "submitted" | "approved"; priority?: "low" | "medium" | "high" | "urgent"; dueAt?: Date; title?: string; version?: string; expiresAt?: Date; documentStatus?: "valid" | "expiring" | "expired" | "missing"; documentType?: string; fileUrl?: string; rootCause?: string; ticketType?: "breakdown" | "preventive" | "warranty"; warrantyUntil?: Date }) => {
    setSavingId(id); setSavedId(null); setRowError(null);
    try {
      if (section === "الإجراءات والتحسين") { if (extra && (extra.priority !== undefined || extra.dueAt !== undefined || extra.title !== undefined)) await actionUpdate.mutateAsync({ id, priority: extra.priority, dueAt: extra.dueAt, title: extra.title }); else await actionStatus.mutateAsync({ id, status: status as "open" | "in_progress" | "pending_review" | "closed" }); }
      else if (section === "الوثائق والتراخيص") await documentUpdate.mutateAsync({ id, documentType: extra?.documentType, version: extra?.version, expiresAt: extra?.expiresAt, status: extra?.documentStatus as "valid" | "expiring" | "expired" | "missing" | undefined, fileUrl: extra?.fileUrl });
      else if (section === "الزيارات والفحص") { if (extra && (extra.notes !== undefined || extra.reportTitle !== undefined || extra.findings !== undefined || extra.recommendations !== undefined)) await visitUpdate.mutateAsync({ id, notes: extra.notes, reportTitle: extra.reportTitle, findings: extra.findings, recommendations: extra.recommendations }); else await visitStatus.mutateAsync({ id, status: status as "scheduled" | "in_progress" | "completed" | "cancelled", score: extra?.score, approvalStatus: extra?.approvalStatus }); }
      else if (section === "الجودة والشكاوى") { if (extra?.rootCause !== undefined || extra?.title !== undefined) await qualityUpdate.mutateAsync({ id, rootCause: extra.rootCause, title: extra.title }); else await qualityStatus.mutateAsync({ id, status: status as "open" | "investigating" | "resolved" | "closed" }); }
      else if (section === "الصيانة والأصول") { if (extra && (extra.ticketType !== undefined || extra.priority !== undefined || extra.warrantyUntil !== undefined)) await maintenanceUpdate.mutateAsync({ id, ticketType: extra.ticketType, priority: extra.priority, warrantyUntil: extra.warrantyUntil }); else await maintenanceStatus.mutateAsync({ id, status: status as "open" | "assigned" | "in_progress" | "resolved" | "closed" }); }
      else if (section === "الطلبات الداخلية") { if (extra?.title || extra?.priority) await requestUpdate.mutateAsync({ id, title: extra.title, priority: extra.priority }); else await requestStatus.mutateAsync({ id, status: status as "new" | "assigned" | "in_progress" | "completed" | "rejected" }); }
      else if (section === "المهام والطلبات") {
        const current = (filteredRows as Array<Record<string, unknown>>).find((row) => Number(row.id) === id);
        if (current?.requestType) { if (extra?.title || extra?.priority) await requestUpdate.mutateAsync({ id, title: extra.title, priority: extra.priority }); else await requestStatus.mutateAsync({ id, status: status as "new" | "assigned" | "in_progress" | "completed" | "rejected" }); }
        else if (extra?.title || extra?.priority || extra?.dueAt) await taskUpdate.mutateAsync({ id, title: extra.title, priority: extra.priority, dueAt: extra.dueAt });
        else await taskStatus.mutateAsync({ id, status: status as "todo" | "in_progress" | "done" });
      }
      await utils.ops.overview.invalidate(); setSavedId(id);
    } catch (error) { setRowError(error instanceof Error ? error.message : "تعذر تحديث السجل."); } finally { setSavingId(null); }
  };
  const submitRecord = async () => {
    const title = draftTitle.trim();
    const branchId = Number(draftBranchId || branchOptions[0]?.id);
    if (!title || !branchId) { setCreateError("أدخل عنوان السجل واختر فرعًا."); return; }
    try {
      if (section === "الإجراءات والتحسين") await actionCreate.mutateAsync({ branchId, title, priority: "medium" });
      else if (section === "الزيارات والفحص") await visitCreate.mutateAsync({ branchId, notes: title });
      else if (section === "الوثائق والتراخيص") await documentCreate.mutateAsync({ branchId, title, documentType, version: documentVersion, status: documentStatus, expiresAt: documentExpiresAt ? new Date(documentExpiresAt) : undefined, fileUrl: documentFileUrl || undefined });
      else if (section === "الجودة والشكاوى") await qualityCreate.mutateAsync({ branchId, title, caseType: "observation", severity: "medium" });
      else if (section === "الصيانة والأصول") await maintenanceCreate.mutateAsync({ branchId, assetName: "غير محدد", title, ticketType: "breakdown", priority: "medium" });
      else if ((section === "المهام والطلبات" || section === "الطلبات الداخلية") && (section === "الطلبات الداخلية" || recordKind === "request")) await requestCreate.mutateAsync({ branchId, title, requestType: "تشغيل", priority: "medium" });
      else if (section === "المهام والطلبات") await taskCreate.mutateAsync({ branchId, title, priority: "medium" });
      else await requestCreate.mutateAsync({ branchId, title, requestType: "تشغيل", priority: "medium" });
      await utils.ops.overview.invalidate();
      setDraftTitle(""); setDraftBranchId(""); setRecordKind("task"); setDocumentType("تشغيلي"); setDocumentVersion("1.0"); setDocumentStatus("valid"); setDocumentExpiresAt(""); setDocumentFileUrl(""); setCreateError(""); setCreateOpen(false);
    } catch (error) { setCreateError(error instanceof Error ? error.message : "تعذر إنشاء السجل."); }
  };
  return <section className="mb-6 rounded-3xl border border-[#dfe9df] bg-white p-5 shadow-[0_8px_25px_rgba(39,70,48,0.05)] md:p-6">
    <div className="flex flex-col justify-between gap-4 border-b border-[#edf1ed] pb-5 md:flex-row md:items-center"><div><p className="text-xs font-semibold text-[#4d8068]">وحدة تشغيلية</p><h2 className="mt-1 text-xl font-bold">{config.title}</h2><p className="mt-1 text-xs text-[#89948b]">{config.subtitle}</p></div><div className="flex flex-wrap gap-2">{section === "التقارير" && <><Button variant={reportPeriod === "day" ? "default" : "outline"} className="rounded-xl text-xs" onClick={() => setReportPeriod("day")}>يومي</Button><Button variant={reportPeriod === "week" ? "default" : "outline"} className="rounded-xl text-xs" onClick={() => setReportPeriod("week")}>أسبوعي</Button><Button variant={reportPeriod === "month" ? "default" : "outline"} className="rounded-xl text-xs" onClick={() => setReportPeriod("month")}>شهري</Button></>}<Button variant="outline" className="rounded-xl text-xs" onClick={() => downloadExcel(section, filteredRows as Array<Record<string, unknown>>)}><FileText className="ml-2 h-3.5 w-3.5" /> Excel</Button><Button variant="outline" className="rounded-xl text-xs" onClick={() => downloadPdf(section, filteredRows as Array<Record<string, unknown>>)}><FileText className="ml-2 h-3.5 w-3.5" /> PDF</Button><div className="flex items-center gap-2 rounded-xl border border-[#dce9df] bg-white px-3"><Filter className="h-3.5 w-3.5 text-[#7b907f]" /><input value={filterText} onChange={(event) => setFilterText(event.target.value)} placeholder="تصفية السجلات" className="h-9 w-28 bg-transparent text-xs outline-none placeholder:text-[#a1ada4]" /></div>{section !== "الفروع" && section !== "التقارير" && <Button className="rounded-xl bg-[#174c3d] text-xs" onClick={() => setCreateOpen((value) => !value)}><Plus className="ml-2 h-3.5 w-3.5" /> إضافة سجل</Button>}</div></div>
    {createOpen && <div className="mt-5 rounded-2xl border border-[#dce9df] bg-[#f7fbf8] p-4"><div className="grid gap-3 md:grid-cols-[1fr_220px_auto]"><Input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} placeholder="عنوان السجل أو وصفه المختصر" className="rounded-xl border-[#dce9df] bg-white" />{section === "المهام والطلبات" && <select value={recordKind} onChange={(event) => setRecordKind(event.target.value as "task" | "request")} className="h-10 rounded-xl border border-[#dce9df] bg-white px-3 text-xs text-[#43544a]"><option value="task">مهمة داخلية</option><option value="request">طلب داخلي</option></select>}<select value={draftBranchId} onChange={(event) => setDraftBranchId(event.target.value)} className="h-10 rounded-xl border border-[#dce9df] bg-white px-3 text-xs text-[#43544a]"><option value="">اختر الفرع</option>{branchOptions.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>{section === "الوثائق والتراخيص" && <div className="grid gap-2 md:col-span-3 md:grid-cols-5"><Input value={documentType} onChange={(event) => setDocumentType(event.target.value)} placeholder="نوع الوثيقة" className="rounded-xl border-[#dce9df] bg-white" /><Input value={documentVersion} onChange={(event) => setDocumentVersion(event.target.value)} placeholder="الإصدار" className="rounded-xl border-[#dce9df] bg-white" /><select value={documentStatus} onChange={(event) => setDocumentStatus(event.target.value as typeof documentStatus)} className="h-10 rounded-xl border border-[#dce9df] bg-white px-3 text-xs"><option value="valid">سارية</option><option value="expiring">قريبة الانتهاء</option><option value="expired">منتهية</option><option value="missing">مفقودة</option></select><Input type="date" value={documentExpiresAt} onChange={(event) => setDocumentExpiresAt(event.target.value)} className="rounded-xl border-[#dce9df] bg-white" /><Input value={documentFileUrl} onChange={(event) => setDocumentFileUrl(event.target.value)} placeholder="رابط الملف (اختياري)" className="rounded-xl border-[#dce9df] bg-white" /></div>}<Button onClick={submitRecord} className="rounded-xl bg-[#24724e]">حفظ السجل</Button></div>{createError && <p className="mt-2 text-xs text-[#a25c3d]">{createError}</p>}</div>}
    {error ? <div className="flex min-h-32 flex-col items-center justify-center rounded-2xl bg-[#fff7f3] text-center"><AlertTriangle className="h-7 w-7 text-[#c77a4d]" /><p className="mt-2 text-sm font-semibold text-[#8a563b]">تعذر تحميل بيانات الوحدة</p><p className="mt-1 text-xs text-[#b17b61]">تحقق من الجلسة أو أعد المحاولة لاحقًا.</p></div> : isLoading ? <div className="flex h-28 items-center justify-center text-sm text-[#89948b]">جارٍ تحميل بيانات الوحدة...</div> : filteredRows.length === 0 ? <div className="flex min-h-32 flex-col items-center justify-center rounded-2xl bg-[#f8faf8] text-center"><FileText className="h-7 w-7 text-[#9bb4a1]" /><p className="mt-2 text-sm font-semibold text-[#526359]">لا توجد سجلات ضمن نطاقك حاليًا</p><p className="mt-1 text-xs text-[#94a198]">ستظهر البيانات هنا بعد تسجيل أول عنصر في هذه الوحدة.</p></div> : <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[680px] text-right text-xs"><thead><tr className="border-b border-[#edf1ed] text-[#94a198]">{config.columns.map((column) => <th key={column} className="pb-3 font-medium">{column}</th>)}</tr></thead><tbody>{(filteredRows as Array<Record<string, unknown>>).slice(0, 12).map((row, index) => <tr key={String(row.id ?? index)} className="border-b border-[#f0f3f0] last:border-0"><td className="py-3 font-semibold">{String(row.title ?? row.name ?? row.status ?? "سجل تشغيلي")}</td><td className="py-3 text-[#68766c]">{String(row.city ?? row.branchId ?? row.category ?? "—")}</td><td className="py-3">{["الإجراءات والتحسين", "الوثائق والتراخيص", "الزيارات والفحص", "الجودة والشكاوى", "الصيانة والأصول", "المهام والطلبات", "الطلبات الداخلية"].includes(section) ? <><select value={String(row.status ?? "")} onChange={(event) => updateRecordStatus(Number(row.id), event.target.value)} className="rounded-lg border border-[#dce9df] bg-white px-2 py-1 text-[10px] text-[#43544a]"><option value={String(row.status ?? "")}>{String(row.status ?? "قيد المتابعة")}</option>{section === "الوثائق والتراخيص" && <><option value="valid">سارية</option><option value="expiring">قريبة الانتهاء</option><option value="expired">منتهية</option><option value="missing">مفقودة</option></>}{section === "الإجراءات والتحسين" && <><option value="in_progress">قيد التنفيذ</option><option value="pending_review">بانتظار المراجعة</option><option value="closed">مغلق</option></>}{section === "الزيارات والفحص" && <><option value="in_progress">جارية</option><option value="completed">مكتملة</option><option value="cancelled">ملغاة</option></>}{section === "الجودة والشكاوى" && <><option value="investigating">قيد التحقيق</option><option value="resolved">محلولة</option><option value="closed">مغلقة</option></>}{section === "الصيانة والأصول" && <><option value="assigned">مسندة</option><option value="in_progress">قيد التنفيذ</option><option value="resolved">محلولة</option><option value="closed">مغلقة</option></>}{(section === "المهام والطلبات" || section === "الطلبات الداخلية") && (section === "الطلبات الداخلية" || row.requestType ? <><option value="assigned">مسندة</option><option value="in_progress">قيد التنفيذ</option><option value="completed">مكتملة</option><option value="rejected">مرفوضة</option></> : <><option value="in_progress">قيد التنفيذ</option><option value="done">مكتملة</option></>)}</select><span className="mr-1 text-[10px] text-[#5a8069]">{savingId === Number(row.id) ? "جارٍ الحفظ…" : savedId === Number(row.id) ? "تم الحفظ" : rowError && savedId !== Number(row.id) ? rowError : ""}</span>{section === "الإجراءات والتحسين" && <div className="mt-1 flex gap-1"><select aria-label="أولوية الإجراء" defaultValue={String(row.priority ?? "medium")} className="w-20 rounded border border-[#dce9df] px-1 py-0.5 text-[10px]" onChange={(event) => updateRecordStatus(Number(row.id), String(row.status ?? "open"), { priority: event.target.value as "low" | "medium" | "high" | "urgent" })}><option value="low">منخفضة</option><option value="medium">متوسطة</option><option value="high">عالية</option><option value="urgent">عاجلة</option></select><input aria-label="موعد استحقاق الإجراء" type="date" defaultValue={row.dueAt ? new Date(String(row.dueAt)).toISOString().slice(0, 10) : ""} className="w-28 rounded border border-[#dce9df] px-1 py-0.5 text-[10px]" onBlur={(event) => updateRecordStatus(Number(row.id), String(row.status ?? "open"), { dueAt: event.target.value ? new Date(event.target.value) : undefined })} /></div>}{section === "الوثائق والتراخيص" && <div className="mt-1 flex flex-wrap gap-1"><input aria-label="نوع الوثيقة" defaultValue={String(row.documentType ?? "")} placeholder="نوع الوثيقة" className="w-24 rounded border border-[#dce9df] px-1 py-0.5 text-[10px]" onBlur={(event) => updateRecordStatus(Number(row.id), String(row.status ?? "valid"), { documentType: event.target.value })} /><input aria-label="رابط الوثيقة" defaultValue={String(row.fileUrl ?? "")} placeholder="رابط الملف" className="w-28 rounded border border-[#dce9df] px-1 py-0.5 text-[10px]" onBlur={(event) => updateRecordStatus(Number(row.id), String(row.status ?? "valid"), { fileUrl: event.target.value || undefined })} /><input aria-label="إصدار الوثيقة" defaultValue={String(row.version ?? "1.0")} placeholder="الإصدار" className="w-16 rounded border border-[#dce9df] px-1 py-0.5 text-[10px]" onBlur={(event) => updateRecordStatus(Number(row.id), String(row.status ?? "valid"), { version: event.target.value })} /><input aria-label="انتهاء الوثيقة" type="date" defaultValue={row.expiresAt ? new Date(String(row.expiresAt)).toISOString().slice(0, 10) : ""} className="w-28 rounded border border-[#dce9df] px-1 py-0.5 text-[10px]" onBlur={(event) => updateRecordStatus(Number(row.id), String(row.status ?? "valid"), { expiresAt: event.target.value ? new Date(event.target.value) : undefined })} /></div>}{section === "الجودة والشكاوى" && <input aria-label="السبب الجذري" defaultValue={String(row.rootCause ?? "")} placeholder="السبب الجذري" className="mt-1 w-32 rounded border border-[#dce9df] px-1 py-0.5 text-[10px]" onBlur={(event) => updateRecordStatus(Number(row.id), String(row.status ?? "open"), { rootCause: event.target.value })} />}{section === "الصيانة والأصول" && <div className="mt-1 flex gap-1"><select aria-label="نوع الصيانة" defaultValue={String(row.ticketType ?? "breakdown")} className="w-24 rounded border border-[#dce9df] px-1 py-0.5 text-[10px]" onChange={(event) => updateRecordStatus(Number(row.id), String(row.status ?? "open"), { ticketType: event.target.value as "breakdown" | "preventive" | "warranty" })}><option value="breakdown">عطل</option><option value="preventive">وقائية</option><option value="warranty">ضمان</option></select><input aria-label="انتهاء الضمان" type="date" defaultValue={row.warrantyUntil ? new Date(String(row.warrantyUntil)).toISOString().slice(0, 10) : ""} className="w-28 rounded border border-[#dce9df] px-1 py-0.5 text-[10px]" onBlur={(event) => updateRecordStatus(Number(row.id), String(row.status ?? "open"), { warrantyUntil: event.target.value ? new Date(event.target.value) : undefined })} /></div>}{(section === "المهام والطلبات" || section === "الطلبات الداخلية") && <div className="mt-1 flex flex-wrap gap-1"><input aria-label="عنوان المهمة أو الطلب" defaultValue={String(row.title ?? "")} className="w-32 rounded border border-[#dce9df] px-1 py-0.5 text-[10px]" onBlur={(event) => updateRecordStatus(Number(row.id), String(row.status ?? "new"), { title: event.target.value })} /><select aria-label="أولوية المهمة أو الطلب" defaultValue={String(row.priority ?? "medium")} className="w-20 rounded border border-[#dce9df] px-1 py-0.5 text-[10px]" onChange={(event) => updateRecordStatus(Number(row.id), String(row.status ?? "new"), { priority: event.target.value as "low" | "medium" | "high" | "urgent" })}><option value="low">منخفضة</option><option value="medium">متوسطة</option><option value="high">عالية</option><option value="urgent">عاجلة</option></select>{!row.requestType && <input aria-label="موعد استحقاق المهمة" type="date" defaultValue={row.dueAt ? new Date(String(row.dueAt)).toISOString().slice(0, 10) : ""} className="w-28 rounded border border-[#dce9df] px-1 py-0.5 text-[10px]" onBlur={(event) => updateRecordStatus(Number(row.id), String(row.status ?? "todo"), { dueAt: event.target.value ? new Date(event.target.value) : undefined })} />}</div>}{section === "الزيارات والفحص" && <div className="mt-1 flex gap-1"><input aria-label="درجة الزيارة" defaultValue={String(row.score ?? "")} placeholder="درجة" type="number" min="0" max="100" className="w-14 rounded border border-[#dce9df] px-1 py-0.5 text-[10px]" onBlur={(event) => updateRecordStatus(Number(row.id), String(row.status ?? "scheduled"), { score: Number(event.target.value) || undefined, notes: String(row.notes ?? "") })} /><input aria-label="ملاحظات الزيارة" defaultValue={String(row.notes ?? "")} placeholder="ملاحظات" className="w-24 rounded border border-[#dce9df] px-1 py-0.5 text-[10px]" onBlur={(event) => updateRecordStatus(Number(row.id), String(row.status ?? "scheduled"), { score: Number(row.score) || undefined, notes: event.target.value })} /><input aria-label="عنوان محضر الزيارة" defaultValue={String(row.reportTitle ?? "")} placeholder="عنوان المحضر" className="w-24 rounded border border-[#dce9df] px-1 py-0.5 text-[10px]" onBlur={(event) => updateRecordStatus(Number(row.id), String(row.status ?? "scheduled"), { reportTitle: event.target.value })} /><input aria-label="نتائج الزيارة" defaultValue={String(row.findings ?? "")} placeholder="النتائج" className="w-24 rounded border border-[#dce9df] px-1 py-0.5 text-[10px]" onBlur={(event) => updateRecordStatus(Number(row.id), String(row.status ?? "scheduled"), { findings: event.target.value })} /><input aria-label="توصيات الزيارة" defaultValue={String(row.recommendations ?? "")} placeholder="التوصيات" className="w-24 rounded border border-[#dce9df] px-1 py-0.5 text-[10px]" onBlur={(event) => updateRecordStatus(Number(row.id), String(row.status ?? "scheduled"), { recommendations: event.target.value })} /><select aria-label="حالة اعتماد المحضر" defaultValue={String(row.approvalStatus ?? "draft")} className="w-20 rounded border border-[#dce9df] px-1 py-0.5 text-[10px]" onChange={(event) => updateRecordStatus(Number(row.id), String(row.status ?? "scheduled"), { approvalStatus: event.target.value as "draft" | "submitted" | "approved" })}><option value="draft">مسودة</option><option value="submitted">مرسل</option><option value="approved">معتمد</option></select></div>}</> : <Badge variant="outline" className="rounded-full text-[10px]">{String(row.riskLevel ?? row.status ?? row.priority ?? (row.healthScore ? `${row.healthScore}%` : "قيد المتابعة"))}</Badge>}</td><td className="py-3 text-[#7d8a80]">{String(row.openActions ?? row.dueAt ?? row.expiresAt ?? row.createdAt ?? "—")}</td>{section !== "الفروع" && section !== "التقارير" && <td className="py-3"><Button variant="ghost" size="sm" className="h-7 rounded-lg px-2 text-[11px] text-[#a45b4e] hover:bg-[#fff4f1]" onClick={() => removeRecord(Number(row.id), row)}>حذف</Button></td>}{section === "الفروع" && <td className="py-3"><Button variant="outline" size="sm" className="h-8 rounded-lg text-[11px]" onClick={() => setSelectedId(Number(row.id))}>فتح الملف</Button></td>}</tr>)}</tbody></table></div>}
    {section === "الفروع" && selectedId && <div className="mt-5 rounded-2xl border border-[#dfe9df] bg-[#f8fbf8] p-5">{profileLoading ? <p className="text-sm text-[#89948b]">جارٍ تحميل ملف الفرع...</p> : profile ? <><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><p className="text-xs font-semibold text-[#4d8068]">الملف المركزي للفرع</p><h3 className="mt-1 text-xl font-bold">{profile.branch.name}</h3><p className="mt-1 text-xs text-[#89948b]">{profile.branch.code} · {profile.branch.city} · {profile.branch.region}</p></div><Badge variant="outline" className="w-fit rounded-full">{profile.branch.status === "active" ? "نشط" : profile.branch.status}</Badge></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-xl bg-white p-3"><p className="text-[10px] text-[#89948b]">الصحة التشغيلية</p><p className="mt-1 text-xl font-bold text-[#24724e]">{profile.branch.healthScore}%</p></div><div className="rounded-xl bg-white p-3"><p className="text-[10px] text-[#89948b]">الإجراءات المفتوحة</p><p className="mt-1 text-xl font-bold">{profile.branch.openActions}</p></div><div className="rounded-xl bg-white p-3"><p className="text-[10px] text-[#89948b]">مستوى المخاطر</p><p className="mt-1 text-sm font-bold">{profile.branch.riskLevel}</p></div><div className="rounded-xl bg-white p-3"><p className="text-[10px] text-[#89948b]">بيانات التواصل</p><p className="mt-1 text-sm font-bold">{profile.branch.phone ?? "غير مسجل"}</p></div></div><div className="mt-4 grid gap-3 md:grid-cols-3"><div className="rounded-xl border border-[#e6eee7] bg-white p-3"><p className="text-xs font-semibold">التشغيل والحوكمة</p><p className="mt-1 text-xs text-[#89948b]">المدير: {profile.branch.managerName ?? "غير محدد"}</p><p className="mt-1 text-xs text-[#89948b]">الرمز: {profile.branch.code}</p></div><div className="rounded-xl border border-[#e6eee7] bg-white p-3"><p className="text-xs font-semibold">الموقع والوثائق</p><p className="mt-1 text-xs text-[#89948b]">{profile.branch.address ?? "العنوان غير مسجل"}</p><p className="mt-1 text-xs text-[#89948b]">الوثائق: {profile.documents.length} · الموظفون: {profile.employees.length} · الأصول: {profile.assets.length}</p></div><div className="rounded-xl border border-[#e6eee7] bg-white p-3"><p className="text-xs font-semibold">سجل الوحدات</p><p className="mt-1 text-xs text-[#89948b]">المخزون: {profile.inventory.length} · الأحداث: {profile.events.length} · الطلبات: {profile.requests.length}</p><Button variant="ghost" size="sm" className="mt-2 h-7 px-0 text-xs text-[#2d7d58]" onClick={() => onNavigate("الزيارات والفحص")}>فتح الوحدات المرتبطة <ArrowDownLeft className="mr-1 h-3 w-3" /></Button></div></div><div className="mt-5 rounded-2xl border border-[#e6eee7] bg-white p-4"><div className="flex flex-wrap gap-2 border-b border-[#edf1ed] pb-3">{[{key:"employees",label:"الموظفون"},{key:"contracts",label:"العقود"},{key:"assets",label:"الأصول"},{key:"inventory",label:"المخزون"},{key:"documents",label:"الوثائق"},{key:"qualityCases",label:"الجودة"},{key:"maintenanceTickets",label:"الصيانة"},{key:"visits",label:"الزيارات"},{key:"events",label:"السجل الزمني"},{key:"requests",label:"الطلبات"},{key:"tasks",label:"المهام"}].map((tab) => <button key={tab.key} onClick={() => setProfileTab(tab.key)} className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${profileTab === tab.key ? "bg-[#e4f1e9] text-[#174c3d]" : "text-[#758178] hover:bg-[#f5f8f5]"}`}>{tab.label}</button>)}</div><div className="mt-4">{(() => { const items = (profile as Record<string, unknown>)[profileTab]; const list = Array.isArray(items) ? items as Array<Record<string, unknown>> : []; return list.length ? <div className="grid gap-2 md:grid-cols-2">{list.slice(0, 8).map((item, index) => <div key={String(item.id ?? index)} className="rounded-xl border border-[#edf1ed] bg-[#fbfdfb] p-3"><div className="flex items-start justify-between gap-3"><p className="text-xs font-semibold text-[#34483b]">{String(item.title ?? item.name ?? item.documentType ?? item.assetName ?? item.productName ?? item.eventType ?? "سجل تشغيلي")}</p><Badge variant="outline" className="rounded-full text-[10px]">{String(item.status ?? item.priority ?? item.severity ?? item.ticketType ?? "مسجل")}</Badge></div><p className="mt-2 text-[11px] leading-5 text-[#89948b]">{String(item.description ?? item.notes ?? item.category ?? item.role ?? item.contractType ?? item.quantity ?? item.occurredAt ?? item.createdAt ?? "لا توجد ملاحظات إضافية")}</p></div>)}</div> : <div className="rounded-xl bg-[#f8faf8] p-6 text-center text-xs text-[#89948b]">لا توجد سجلات في هذا القسم ضمن نطاق الفرع.</div>; })()}</div></div></> : <p className="text-sm text-[#8a563b]">تعذر تحميل ملف الفرع.</p>}</div>}
  </section>;
}

export default function Home() {
  const [activeNav, setActiveNav] = useState("نظرة عامة");
  const [query, setQuery] = useState("");
  const [showQuickAction, setShowQuickAction] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showAllAlerts, setShowAllAlerts] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<((typeof branches)[number] & { id?: number }) | null>(null);
  const { user } = useAuth();
  const { data: liveSummary, error: summaryError } = trpc.dashboard.summary.useQuery(undefined, { enabled: Boolean(user) });
  const { data: liveBranches } = trpc.branches.list.useQuery(undefined, { enabled: Boolean(user) });
  const { data: selectedBranchDetail } = trpc.branches.getById.useQuery({ id: selectedBranch?.id ?? 0 }, { enabled: Boolean(user && selectedBranch?.id) });
  const displayBranches = useMemo(() => {
    const source = liveBranches?.length ? liveBranches : liveSummary?.branches;
    if (!source?.length) return [];
    return source.map((branch) => {
      const score = Number(branch.healthScore);
      return {
        id: branch.id,
        name: branch.name,
        area: `${branch.city} · ${branch.region}`,
        score,
        status: score >= 92 ? "ممتاز" : score >= 85 ? "مستقر" : "يحتاج متابعة",
        color: score >= 85 ? "emerald" : score >= 75 ? "amber" : "rose",
        tasks: branch.openActions,
        risk: branch.riskLevel === "high" ? "مرتفع" : branch.riskLevel === "medium" ? "متوسط" : "منخفض",
      };
    });
  }, [liveBranches, liveSummary]);
  const filteredBranches = useMemo(
    () => displayBranches.filter((branch) => `${branch.name} ${branch.area}`.includes(query.trim())),
    [displayBranches, query],
  );
  const networkHealth = displayBranches.length ? Math.round(displayBranches.reduce((sum, branch) => sum + branch.score, 0) / displayBranches.length) : 0;
  const dashboardAlerts = useMemo(() => (liveSummary?.alerts ?? []).map((alert) => ({ ...alert, icon: alert.kind === "document" ? FileText : alert.kind === "maintenance" ? Wrench : alert.kind === "visit" ? ClipboardCheck : AlertTriangle })), [liveSummary]);

  return (
    <div dir="rtl" className="min-h-screen bg-[#f6f7f4] text-[#17211b]">
      <aside className="fixed inset-y-0 right-0 z-30 hidden w-[258px] border-l border-[#dfe6df] bg-[#fbfcfa] lg:flex lg:flex-col">
        <div className="flex h-[78px] items-center gap-3 border-b border-[#e6ebe5] px-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#174c3d] text-white shadow-lg shadow-[#174c3d]/20">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[15px] font-bold tracking-tight">مرصد الفروع</p>
            <p className="text-[11px] text-[#758178]">Branch Operations Hub</p>
          </div>
        </div>
        <div className="px-4 pt-6">
          <p className="mb-3 px-3 text-[11px] font-semibold tracking-[0.16em] text-[#8a968d]">مساحة العمل</p>
          <nav className="space-y-1">
            {navItems.filter((item) => canAccessNav(item.label, user?.role)).map((item) => {
              const Icon = item.icon;
              const active = activeNav === item.label;
              return (
                <button
                  key={item.label}
                  onClick={() => setActiveNav(item.label)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-right text-[13px] transition-all ${active ? "bg-[#e4f1e9] font-bold text-[#174c3d] shadow-sm" : "text-[#637066] hover:bg-[#f0f4ef] hover:text-[#174c3d]"}`}
                >
                  <Icon className={`h-[17px] w-[17px] ${active ? "text-[#1f7555]" : "text-[#8a968d]"}`} />
                  <span>{item.label}</span>
                  {item.label === "الإجراءات والتحسين" && <span className="mr-auto rounded-full bg-[#ffe6c4] px-2 py-0.5 text-[10px] font-bold text-[#a65d1b]">24</span>}
                </button>
              );
            })}
          </nav>
        </div>
        <div className="mt-auto p-4">
          <div className="rounded-2xl bg-[#174c3d] p-4 text-white shadow-xl shadow-[#174c3d]/15">
            <div className="mb-3 flex items-center justify-between">
              <span className="rounded-full bg-white/15 px-2 py-1 text-[10px]">تحديث مباشر</span>
              <div className="h-2 w-2 rounded-full bg-[#a7e4a8] shadow-[0_0_0_4px_rgba(167,228,168,0.14)]" />
            </div>
            <p className="text-sm font-bold">كل شيء تحت السيطرة</p>
            <p className="mt-1 text-[11px] leading-5 text-white/65">آخر مزامنة للبيانات قبل 4 دقائق</p>
          </div>
        </div>
      </aside>

      <main className="lg:mr-[258px]">
        <header className="sticky top-0 z-20 border-b border-[#e1e7e1] bg-[#f6f7f4]/90 px-5 py-4 backdrop-blur-xl md:px-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="lg:hidden flex h-10 w-10 items-center justify-center rounded-xl bg-[#174c3d] text-white"><Sparkles className="h-5 w-5" /></div>
              <div>
                <p className="hidden text-xs font-medium text-[#7a857c] sm:block">الأحد، 18 أغسطس 2026</p>
                <h1 className="text-xl font-bold tracking-tight text-[#17211b] md:text-2xl">صباح الخير، فريق التشغيل</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative hidden md:block"><Search className="absolute right-3 top-2.5 h-4 w-4 text-[#98a39a]" /><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث عن فرع أو منطقة..." className="h-9 w-56 rounded-xl border-[#dce5dc] bg-white pr-9 text-xs shadow-none focus-visible:ring-[#6ea787]" /></div>
              <div className="relative"><Button variant="outline" size="icon" aria-label="فتح التنبيهات" className="h-9 w-9 rounded-xl border-[#dce5dc] bg-white text-[#66736a]" onClick={() => setShowNotifications((value) => !value)}><Bell className="h-4 w-4" />{dashboardAlerts.length > 0 && <span className="absolute mr-5 mt-[-15px] h-2 w-2 rounded-full bg-[#e48552]" />}</Button>{showNotifications && <div className="absolute left-0 top-11 z-40 w-80 rounded-2xl border border-[#dfe8df] bg-white p-3 text-right shadow-xl"><div className="mb-2 flex items-center justify-between"><p className="text-xs font-bold">التنبيهات الداخلية</p><span className="rounded-full bg-[#fff3df] px-2 py-1 text-[10px] text-[#a65d1b]">{dashboardAlerts.length} نشط</span></div>{dashboardAlerts.length ? <div className="space-y-2">{dashboardAlerts.slice(0, 5).map((alert) => <button key={alert.id} className="flex w-full items-start gap-2 rounded-xl p-2 text-right hover:bg-[#f7faf7]" onClick={() => { setShowNotifications(false); setActiveNav(alert.kind === "maintenance" ? "الصيانة والأصول" : alert.kind === "document" ? "الوثائق والتراخيص" : alert.kind === "visit" ? "الزيارات والفحص" : "الإجراءات والتحسين"); }}>{(() => { const AlertIcon = alert.icon; return <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-[#4d8068]" />; })()}<span><span className="block text-[11px] font-semibold">{alert.title}</span><span className="mt-0.5 block text-[10px] text-[#89948b]">{alert.detail}</span></span></button>)}</div> : <p className="py-5 text-center text-xs text-[#89948b]">لا توجد تنبيهات نشطة ضمن نطاقك.</p>}</div>}</div>
              <div className="hidden h-9 items-center gap-2 rounded-xl border border-[#dce5dc] bg-white px-2.5 sm:flex"><div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#dcefe3] text-[10px] font-bold text-[#1f7555]">م</div><span className="text-xs font-semibold">مدير التشغيل</span><ChevronLeft className="h-3 w-3 rotate-[-90deg] text-[#9aa49c]" /></div>
            </div>
          </div>
        </header>

        <div className="space-y-6 px-5 py-6 md:px-8 md:py-8">
          <section className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div><div className="mb-2 flex items-center gap-2 text-xs font-semibold text-[#4d8068]"><span className="h-2 w-2 rounded-full bg-[#5cab7c]" /> حالة الشبكة مستقرة</div><h2 className="text-2xl font-bold tracking-tight md:text-[30px]">نظرة عامة على الفروع</h2><p className="mt-2 text-sm text-[#7a857c]">متابعة تشغيلية موحدة لـ 9 فروع، مع التركيز على ما يحتاج قرارًا اليوم.</p></div>
            <div className="flex gap-2"><Button variant="outline" className="h-10 rounded-xl border-[#dce5dc] bg-white text-xs"><CalendarDays className="ml-2 h-4 w-4 text-[#5e806c]" /> هذا الشهر</Button><Button onClick={() => setShowQuickAction(!showQuickAction)} className="h-10 rounded-xl bg-[#174c3d] text-xs text-white shadow-lg shadow-[#174c3d]/15 hover:bg-[#23634f]"><Plus className="ml-2 h-4 w-4" /> إجراء سريع</Button></div>
          </section>

          {summaryError && <div className="rounded-2xl border border-[#f1d6c5] bg-[#fff8f4] p-3 text-xs text-[#925e43]">تعذر تحديث لوحة المؤشرات من الخادم. يتم عرض آخر حالة متاحة، ويمكن إعادة المحاولة بتحديث الصفحة.</div>}
          {showQuickAction && <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#cde1d3] bg-[#edf8f0] p-3 text-sm"><span className="ml-2 font-semibold text-[#174c3d]">إجراء سريع:</span><Button variant="outline" size="sm" className="rounded-lg border-[#bed8c5] bg-white text-xs" onClick={() => setActiveNav("الزيارات والفحص")}><ClipboardCheck className="ml-1 h-3.5 w-3.5" /> جدولة زيارة</Button><Button variant="outline" size="sm" className="rounded-lg border-[#bed8c5] bg-white text-xs" onClick={() => setActiveNav("الصيانة والأصول")}><Wrench className="ml-1 h-3.5 w-3.5" /> فتح بلاغ صيانة</Button><Button variant="outline" size="sm" className="rounded-lg border-[#bed8c5] bg-white text-xs" onClick={() => setActiveNav("الوثائق والتراخيص")}><FileText className="ml-1 h-3.5 w-3.5" /> رفع وثيقة</Button><button onClick={() => setShowQuickAction(false)} className="mr-auto rounded-lg p-1 text-[#6b8a75] hover:bg-white"><X className="h-4 w-4" /></button></div>}
          {activeNav !== "نظرة عامة" && <OperationsView section={activeNav} user={user} onNavigate={setActiveNav} />}

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "مؤشر صحة الفروع", value: `${networkHealth}%`, change: liveBranches?.length ? "بيانات مباشرة" : "بانتظار البيانات", hint: "متوسط الفروع الظاهرة ضمن نطاقك", icon: Gauge, tone: "green", progress: networkHealth },
              { label: "إجراءات مفتوحة", value: liveSummary ? String(liveSummary.openActions) : "—", change: liveSummary ? `${liveSummary.openMaintenance} صيانة` : "بانتظار البيانات", hint: "تحتاج متابعة اليوم", icon: ShieldCheck, tone: "orange", progress: liveSummary ? Math.min(100, liveSummary.openActions * 4) : 0 },
              { label: "الزيارات المجدولة", value: liveSummary ? String(liveSummary.upcomingVisits) : "—", change: liveSummary ? "قادمة" : "بانتظار البيانات", hint: "من خطة المتابعة", icon: ClipboardCheck, tone: "blue", progress: liveSummary ? Math.min(100, liveSummary.upcomingVisits * 10) : 0 },
              { label: "وثائق تحتاج انتباه", value: liveSummary ? String(liveSummary.expiringDocuments).padStart(2, "0") : "—", change: liveSummary ? "تنبيه مبكر" : "بانتظار البيانات", hint: "تراخيص وعقود", icon: FileText, tone: "purple", progress: liveSummary ? Math.min(100, liveSummary.expiringDocuments * 12) : 0 },
            ].map((item) => { const Icon = item.icon; return <Card key={item.label} onClick={() => setActiveNav(item.label === "مؤشر صحة الفروع" ? "الفروع" : item.label === "إجراءات مفتوحة" ? "الإجراءات والتحسين" : item.label === "الزيارات المجدولة" ? "الزيارات والفحص" : "الوثائق والتراخيص")} className="cursor-pointer border-[#e2e9e2] bg-white shadow-[0_5px_18px_rgba(39,70,48,0.04)] transition hover:-translate-y-0.5 hover:shadow-md"><CardContent className="p-5"><div className="flex items-start justify-between"><div className={`flex h-10 w-10 items-center justify-center rounded-xl ${item.tone === "green" ? "bg-[#e2f3e7] text-[#2c8a5f]" : item.tone === "orange" ? "bg-[#fff0dc] text-[#c47629]" : item.tone === "blue" ? "bg-[#e5f0fa] text-[#4d83b0]" : "bg-[#eee9fa] text-[#7658a9]"}`}><Icon className="h-5 w-5" /></div><button className="text-[#acb6ad] hover:text-[#637066]"><MoreHorizontal className="h-5 w-5" /></button></div><p className="mt-4 text-xs font-medium text-[#7b877d]">{item.label}</p><div className="mt-1 flex items-end justify-between gap-2"><p className="text-[25px] font-bold tracking-tight text-[#1c2820]">{item.value}</p><span className={`mb-1 text-[11px] font-bold ${item.tone === "orange" || item.tone === "purple" ? "text-[#c47629]" : "text-[#39865d]"}`}>{item.change}</span></div><Progress value={item.progress} className="mt-4 h-1.5 bg-[#eef2ee]" /><p className="mt-2 text-[11px] text-[#99a39a]">{item.hint}</p></CardContent></Card> })}
          </section>

          <section className="grid gap-5 xl:grid-cols-[1.45fr_0.9fr]">
            <Card className="border-[#e2e9e2] bg-white shadow-[0_5px_18px_rgba(39,70,48,0.04)]"><CardHeader className="flex flex-row items-center justify-between space-y-0 px-5 pb-3 pt-5"><div><CardTitle className="text-base">صحة الفروع</CardTitle><p className="mt-1 text-xs text-[#89948b]">ترتيب الفروع حسب المؤشر التشغيلي العام</p></div><Button variant="ghost" size="sm" className="rounded-lg text-xs text-[#4d8068]" onClick={() => setActiveNav("الفروع")}>عرض الكل <ArrowDownLeft className="mr-1 h-3.5 w-3.5" /></Button></CardHeader><CardContent className="px-5 pb-5"><div className="overflow-x-auto"><table className="w-full min-w-[640px] text-right"><thead><tr className="border-b border-[#edf1ed] text-[11px] text-[#97a198]"><th className="pb-3 font-medium">الفرع</th><th className="pb-3 font-medium">الحالة</th><th className="pb-3 font-medium">الصحة التشغيلية</th><th className="pb-3 font-medium">المخاطر</th><th className="pb-3 font-medium">إجراءات</th><th className="pb-3"></th></tr></thead><tbody>{filteredBranches.map((branch) => <tr key={branch.name} onClick={() => setSelectedBranch(branch)} className="group cursor-pointer border-b border-[#f0f3f0] last:border-0 hover:bg-[#fbfdfb]"><td className="py-3.5"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#edf3ed] text-[#588069]"><Building2 className="h-4 w-4" /></div><div><p className="text-[13px] font-semibold">{branch.name}</p><p className="mt-0.5 flex items-center gap-1 text-[10px] text-[#9aa49c]"><MapPin className="h-3 w-3" /> {branch.area}</p></div></div></td><td><Badge variant="outline" className={`rounded-full px-2 py-1 text-[10px] font-medium ${statusClasses(branch.color)}`}>{branch.status}</Badge></td><td><div className="flex items-center gap-2"><span className="w-8 text-[13px] font-bold">{branch.score}%</span><div className="w-20"><Progress value={branch.score} className="h-1.5 bg-[#edf2ed]" /></div></div></td><td><span className={`text-[11px] font-semibold ${branch.risk === "مرتفع" ? "text-[#c95f52]" : branch.risk === "متوسط" ? "text-[#c27d2f]" : "text-[#4f8c67]"}`}>{branch.risk}</span></td><td><span className="rounded-md bg-[#f3f5f3] px-2 py-1 text-[11px] text-[#67746a]">{branch.tasks} مفتوحة</span></td><td><button className="invisible rounded-md p-1 text-[#9ca89e] group-hover:visible hover:bg-[#f1f5f1]"><ChevronLeft className="h-4 w-4" /></button></td></tr>)}</tbody></table></div></CardContent></Card>

            <Card className="border-[#e2e9e2] bg-white shadow-[0_5px_18px_rgba(39,70,48,0.04)]"><CardHeader className="flex flex-row items-center justify-between space-y-0 px-5 pb-3 pt-5"><div><CardTitle className="text-base">الاستثناءات والتنبيهات</CardTitle><p className="mt-1 text-xs text-[#89948b]">ما يستحق الانتباه قبل نهاية اليوم</p></div><button onClick={() => setShowAllAlerts(!showAllAlerts)} className="text-xs font-semibold text-[#4d8068]">{showAllAlerts ? "إخفاء" : "عرض الكل"}</button></CardHeader><CardContent className="space-y-3 px-5 pb-5">{(showAllAlerts ? dashboardAlerts : dashboardAlerts.slice(0, 3)).map((alert) => { const Icon = alert.icon; return <div key={alert.id} onClick={() => { const branch = displayBranches.find((item) => item.id === alert.branchId); if (branch) setSelectedBranch(branch); setActiveNav(alert.kind === "maintenance" ? "الصيانة والأصول" : alert.kind === "document" ? "الوثائق والتراخيص" : alert.kind === "visit" ? "الزيارات والفحص" : "الإجراءات والتحسين"); }} className="flex cursor-pointer gap-3 rounded-xl border border-[#edf1ed] p-3 transition-colors hover:bg-[#fbfdfb]"><div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${alert.tone === "rose" ? "bg-[#fff0ed] text-[#cb6a5c]" : alert.tone === "amber" || alert.tone === "orange" ? "bg-[#fff3df] text-[#c47a2b]" : "bg-[#eaf3fb] text-[#5683aa]"}`}><Icon className="h-4 w-4" /></div><div className="min-w-0"><p className="text-[12px] font-semibold leading-5">{alert.title}</p><p className="mt-0.5 text-[11px] text-[#8d9990]">{alert.detail}</p></div><ChevronLeft className="mr-auto mt-2 h-3.5 w-3.5 shrink-0 text-[#aab3ac]" /></div> })}<Button variant="outline" className="mt-1 h-9 w-full rounded-xl border-[#dfe8df] text-xs text-[#63746a]" onClick={() => setActiveNav("الإجراءات والتحسين")}><ShieldCheck className="ml-2 h-4 w-4" /> فتح مركز الإجراءات</Button></CardContent></Card>
          </section>

          <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
            <Card className="border-[#e2e9e2] bg-white shadow-[0_5px_18px_rgba(39,70,48,0.04)]"><CardHeader className="flex flex-row items-center justify-between space-y-0 px-5 pb-2"><div><CardTitle className="text-base">اتجاه المؤشر التشغيلي</CardTitle><p className="mt-1 text-xs text-[#89948b]">متوسط الشبكة خلال آخر 6 أشهر</p></div><div className="flex items-center gap-1 rounded-lg bg-[#edf7ef] px-2 py-1 text-[10px] font-semibold text-[#43815d]"><ArrowUpLeft className="h-3 w-3" /> +6.8%</div></CardHeader><CardContent className="px-5 pb-5"><div className="flex h-44 items-end gap-3 border-b border-r border-[#edf1ed] px-3 pb-0 pt-6">{[{m:"مارس",v:64},{m:"أبريل",v:72},{m:"مايو",v:68},{m:"يونيو",v:79},{m:"يوليو",v:83},{m:"أغسطس",v:89}].map((item, i) => <div key={item.m} className="flex flex-1 flex-col items-center gap-2"><span className="text-[10px] font-bold text-[#5b7865]">{item.v}%</span><div className="relative w-full max-w-10 rounded-t-md bg-[#dceee1]" style={{height: `${item.v * 1.28}px`}}><div className={`absolute inset-x-0 bottom-0 rounded-t-md ${i === 5 ? "bg-[#2d7d58]" : "bg-[#84bd98]"}`} style={{height: `${item.v * 0.85}px`}} /></div><span className="text-[10px] text-[#9aa59c]">{item.m}</span></div>)}</div></CardContent></Card>
            <Card className="border-[#e2e9e2] bg-[#174c3d] text-white shadow-[0_5px_18px_rgba(39,70,48,0.12)]"><CardContent className="p-6"><div className="flex items-start justify-between"><div><p className="text-xs text-white/60">مركز المهام الشخصية</p><h3 className="mt-2 text-xl font-bold">لديك 7 مهام اليوم</h3></div><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10"><CheckCircle2 className="h-5 w-5 text-[#a8e0b7]" /></div></div><div className="mt-6 space-y-3"><div className="flex items-center gap-3 rounded-xl bg-white/10 p-3"><div className="h-2 w-2 rounded-full bg-[#f7c47a]" /><div className="flex-1"><p className="text-xs font-semibold">مراجعة محضر زيارة فرع الملقا</p><p className="mt-1 text-[10px] text-white/50">مستحق اليوم · أولوية عالية</p></div><ChevronLeft className="h-4 w-4 text-white/40" /></div><div className="flex items-center gap-3 rounded-xl bg-white/10 p-3"><div className="h-2 w-2 rounded-full bg-[#a8e0b7]" /><div className="flex-1"><p className="text-xs font-semibold">اعتماد خطة تحسين التحلية</p><p className="mt-1 text-[10px] text-white/50">مستحق غدًا · أولوية متوسطة</p></div><ChevronLeft className="h-4 w-4 text-white/40" /></div></div><Button variant="outline" className="mt-5 h-9 w-full rounded-xl border-white/20 bg-transparent text-xs text-white hover:bg-white/10" onClick={() => setActiveNav("الإجراءات والتحسين")}>فتح مركز المهام <ArrowDownLeft className="mr-2 h-3.5 w-3.5" /></Button></CardContent></Card>
          </section>

          {selectedBranch && <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#173126]/20 p-4 backdrop-blur-sm md:items-center" onClick={() => setSelectedBranch(null)}><div className="w-full max-w-xl rounded-3xl border border-[#dfe8df] bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between"><div><p className="text-xs font-semibold text-[#5d8a6d]">مصدر المؤشر · ملف الفرع</p><h3 className="mt-1 text-xl font-bold">{selectedBranchDetail?.branch.name ?? selectedBranch.name}</h3><p className="mt-1 text-xs text-[#89948b]">{selectedBranch.area}</p></div><button onClick={() => setSelectedBranch(null)} className="rounded-xl p-2 text-[#8e9a91] hover:bg-[#f1f5f1]"><X className="h-4 w-4" /></button></div><div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4"><div className="rounded-2xl bg-[#eef8f0] p-3"><p className="text-[10px] text-[#769080]">الصحة التشغيلية</p><p className="mt-1 text-xl font-bold text-[#2c8058]">{selectedBranch.score}%</p></div><div className="rounded-2xl bg-[#fff4e3] p-3"><p className="text-[10px] text-[#927858]">الحالة</p><p className="mt-1 text-sm font-bold text-[#a96827]">{selectedBranch.status}</p></div><div className="rounded-2xl bg-[#f3f5f3] p-3"><p className="text-[10px] text-[#7d8b80]">المخاطر</p><p className="mt-1 text-sm font-bold">{selectedBranch.risk}</p></div><div className="rounded-2xl bg-[#edf3fb] p-3"><p className="text-[10px] text-[#71869b]">إجراءات مفتوحة</p><p className="mt-1 text-xl font-bold text-[#4a759e]">{selectedBranch.tasks}</p></div></div><Separator className="my-5" /><div className="flex flex-wrap gap-2"><Button className="rounded-xl bg-[#174c3d] text-xs" onClick={() => setActiveNav("الفروع")}>فتح ملف الفرع الكامل <ArrowDownLeft className="mr-2 h-3.5 w-3.5" /></Button><Button variant="outline" className="rounded-xl text-xs" onClick={() => setActiveNav("الإجراءات والتحسين")}><ShieldCheck className="ml-2 h-3.5 w-3.5" /> عرض الإجراءات</Button><Button variant="outline" className="rounded-xl text-xs" onClick={() => setActiveNav("الزيارات والفحص")}><ClipboardCheck className="ml-2 h-3.5 w-3.5" /> سجل الزيارات</Button></div></div></div>}

          <footer className="flex flex-col items-center justify-between gap-2 border-t border-[#e3e9e3] pt-4 text-[11px] text-[#9aa49c] sm:flex-row"><span>مرصد الفروع · منصة المتابعة والتحسين التشغيلي</span><span className="flex items-center gap-2"><Clock3 className="h-3.5 w-3.5" /> آخر تحديث: اليوم، 10:42 ص</span></footer>
        </div>
      </main>
    </div>
  );
}
