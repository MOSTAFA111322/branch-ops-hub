import { useMemo } from "react";
import { CheckCircle2, FileText, LockKeyhole, Printer, ShieldCheck, UsersRound } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

const roleLabels: Record<string, string> = {
  admin: "مدير النظام / المدير العام",
  area_manager: "مدير منطقة",
  branch_manager: "مدير فرع",
  financial_manager: "المدير المالي",
  quality: "الجودة",
  maintenance: "الصيانة",
  warehouse: "المستودعات",
  factory: "المصنع",
  user: "مستخدم",
};

function formatNumber(value: number | string | null | undefined) {
  return Number(value ?? 0).toLocaleString("ar-SA", { maximumFractionDigits: 2 });
}

export function FinalAcceptanceReportView() {
  const now = new Date();
  const summary = trpc.dashboard.summary.useQuery({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const operations = trpc.ops.overview.useQuery({ period: "month", year: now.getFullYear(), month: now.getMonth() + 1 });
  const users = trpc.users.adminList.useQuery(undefined, { staleTime: 30_000 });
  const permissions = trpc.permissions.list.useQuery(undefined, { staleTime: 30_000 });

  const financialTotals = useMemo(() => {
    const rows = operations.data?.financialTrend ?? [];
    const latest = rows.at(-1);
    return {
      periods: rows.length,
      latestPeriod: latest?.period ?? "لا توجد فترة مالية متاحة",
      revenue: latest?.revenue ?? 0,
      netProfit: latest?.netProfit ?? 0,
      branches: latest?.branches ?? 0,
    };
  }, [operations.data]);

  const roleSummary = useMemo(() => {
    const rows = users.data ?? [];
    const counts = new Map<string, number>();
    rows.forEach((row) => counts.set(row.role, (counts.get(row.role) ?? 0) + 1));
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [users.data]);

  const activeUsers = (users.data ?? []).filter((row) => row.isActive !== false).length;
  const financialManagers = (users.data ?? []).filter((row) => row.role === "financial_manager");
  const visiblePermissions = (permissions.data?.permissions ?? []).filter((row) => row.canView).length;
  const activeBranches = summary.data?.activeBranchesCount ?? 0;
  const totalBranches = summary.data?.branches?.length ?? 0;
  const isLoading = summary.isLoading || operations.isLoading || users.isLoading || permissions.isLoading;
  const hasError = summary.error || operations.error || users.error || permissions.error;

  return (
    <section className="final-acceptance-report space-y-5 rounded-2xl border border-[#dfe9df] bg-white p-5 shadow-[0_5px_18px_rgba(39,70,48,0.04)]" dir="rtl" aria-labelledby="final-acceptance-title">
      <div className="hidden items-start justify-between border-b border-[#cfe2d2] pb-4 print:flex">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#174c3d] text-white"><ShieldCheck className="h-6 w-6" /></div>
          <div><p className="text-sm font-bold text-[#174c3d]">مركز متابعة وتحسين الفروع</p><p className="text-xs text-[#6b8172]">تقرير القبول النهائي للمدير العام</p></div>
        </div>
        <p className="text-left text-[10px] text-[#6b8172]">تاريخ الإصدار<br />{now.toLocaleDateString("ar-SA")}</p>
      </div>

      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start print:hidden">
        <div><p className="text-xs font-semibold text-[#4d8068]">بوابة ما قبل الإطلاق</p><h2 id="final-acceptance-title" className="mt-1 text-xl font-bold text-[#173d31]">تقرير القبول النهائي</h2><p className="mt-1 max-w-3xl text-xs leading-6 text-[#89948b]">ملخص قابل للمراجعة والتوقيع يوضح حالة الحسابات والصلاحيات والأرقام الفعلية قبل الاعتماد الرسمي.</p></div>
        <Button type="button" variant="outline" className="rounded-xl text-xs" onClick={() => window.print()}><Printer className="ml-2 h-4 w-4" /> تصدير للطباعة</Button>
      </div>

      {isLoading && <div className="rounded-xl border border-[#cde1d3] bg-[#edf8f0] p-4 text-xs text-[#276b48]" role="status">جارٍ تحميل بيانات القبول من النظام...</div>}
      {hasError && <div className="rounded-xl border border-[#f1d6c5] bg-[#fff8f4] p-4 text-xs text-[#925e43]" role="alert">تعذر تحميل أحد مصادر التقرير. أعد المحاولة قبل اعتماد التقرير.</div>}

      {!isLoading && !hasError && <>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-[#dce9dd] bg-[#f7fbf8] p-4"><p className="text-[10px] text-[#6f8175]">الفروع النشطة</p><p className="mt-2 text-2xl font-bold text-[#174c3d]">{formatNumber(activeBranches)}</p><p className="mt-1 text-[10px] text-[#89948b]">من أصل {formatNumber(totalBranches)} ضمن نطاق المدير العام</p></div>
          <div className="rounded-xl border border-[#dce9dd] bg-[#f7fbf8] p-4"><p className="text-[10px] text-[#6f8175]">الحسابات النشطة</p><p className="mt-2 text-2xl font-bold text-[#174c3d]">{formatNumber(activeUsers)}</p><p className="mt-1 text-[10px] text-[#89948b]">إجمالي الحسابات المسجلة: {formatNumber(users.data?.length)}</p></div>
          <div className="rounded-xl border border-[#dce9dd] bg-[#f7fbf8] p-4"><p className="text-[10px] text-[#6f8175]">صلاحيات عرض الفروع</p><p className="mt-2 text-2xl font-bold text-[#174c3d]">{formatNumber(visiblePermissions)}</p><p className="mt-1 text-[10px] text-[#89948b]">سجلات صلاحية فعالة</p></div>
          <div className="rounded-xl border border-[#dce9dd] bg-[#f7fbf8] p-4"><p className="text-[10px] text-[#6f8175]">الفترة المالية الأخيرة</p><p className="mt-2 text-lg font-bold text-[#174c3d]">{financialTotals.latestPeriod}</p><p className="mt-1 text-[10px] text-[#89948b]">{formatNumber(financialTotals.periods)} فترة متاحة للتحليل</p></div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-[#e5eee6] bg-[#fbfdfb] p-4">
            <div className="mb-3 flex items-center gap-2"><LockKeyhole className="h-4 w-4 text-[#4d8068]" /><h3 className="text-sm font-bold text-[#174c3d]">مراجعة الصلاحيات</h3></div>
            <div className="space-y-2 text-xs text-[#526359]">
              <div className="flex items-center justify-between rounded-lg bg-white p-2"><span>حسابات المدير العام / النظام</span><strong>{formatNumber((users.data ?? []).filter((row) => row.role === "admin").length)}</strong></div>
              <div className="flex items-center justify-between rounded-lg bg-white p-2"><span>حسابات المدير المالي</span><strong>{formatNumber(financialManagers.length)}</strong></div>
              <div className="flex items-center justify-between rounded-lg bg-white p-2"><span>المدير المالي مرتبط بفروع</span><strong>{formatNumber((permissions.data?.permissions ?? []).filter((row) => financialManagers.some((manager) => manager.id === row.userId) && row.canView).length)}</strong></div>
              <div className="flex items-center justify-between rounded-lg bg-white p-2"><span>الحسابات غير النشطة</span><strong>{formatNumber((users.data ?? []).filter((row) => row.isActive === false).length)}</strong></div>
            </div>
            <p className="mt-3 text-[10px] leading-5 text-[#89948b]">لا تعرض هذه الشاشة كلمات المرور أو تجزئاتها. يعتمد الاعتماد المالي على نطاق الفروع المسجل لكل حساب.</p>
          </div>
          <div className="rounded-xl border border-[#e5eee6] bg-[#fbfdfb] p-4">
            <div className="mb-3 flex items-center gap-2"><FileText className="h-4 w-4 text-[#4d8068]" /><h3 className="text-sm font-bold text-[#174c3d]">مراجعة الأرقام الفعلية</h3></div>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-lg bg-white p-3"><p className="text-[10px] text-[#89948b]">الإيرادات</p><p className="mt-1 text-lg font-bold text-[#174c3d]">{formatNumber(financialTotals.revenue)} ر.س</p></div>
              <div className="rounded-lg bg-white p-3"><p className="text-[10px] text-[#89948b]">صافي الربح</p><p className="mt-1 text-lg font-bold text-[#174c3d]">{formatNumber(financialTotals.netProfit)} ر.س</p></div>
              <div className="rounded-lg bg-white p-3"><p className="text-[10px] text-[#89948b]">المراكز ذات البيانات</p><p className="mt-1 text-lg font-bold text-[#174c3d]">{formatNumber(financialTotals.branches)}</p></div>
            </div>
            <p className="mt-3 text-[10px] leading-5 text-[#89948b]">الأرقام مأخوذة من اللقطات المالية المعتمدة المتاحة في النظام، وتظهر الفترة الأخيرة المتاحة بدل افتراض شهر غير موجود.</p>
          </div>
        </div>

        <div className="rounded-xl border border-[#e5eee6] bg-white p-4">
          <div className="mb-3 flex items-center gap-2"><UsersRound className="h-4 w-4 text-[#4d8068]" /><h3 className="text-sm font-bold text-[#174c3d]">توزيع الحسابات حسب الدور</h3></div>
          <div className="flex flex-wrap gap-2">{roleSummary.map(([role, count]) => <span key={role} className="rounded-full border border-[#dce9dd] bg-[#f7fbf8] px-3 py-1.5 text-[11px] text-[#315542]">{roleLabels[role] ?? role}: {count}</span>)}</div>
        </div>

        <div className="rounded-xl border border-[#cfe2d2] bg-[#f4fbf5] p-4 print:mt-5">
          <div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#2d7d58]" /><div><h3 className="text-sm font-bold text-[#174c3d]">إقرار المراجعة</h3><p className="mt-1 text-xs leading-6 text-[#526359]">أقرّ بمراجعة نطاق الصلاحيات ومؤشرات البيانات الظاهرة في هذا التقرير، وأوافق على اعتماد النسخة الحالية أو تسجيل الملاحظات قبل الإطلاق الرسمي.</p></div></div>
          <div className="mt-8 grid gap-6 sm:grid-cols-2"><div className="border-t border-[#9dbfa5] pt-2 text-xs text-[#6f8175]">اسم المدير العام وتوقيعه</div><div className="border-t border-[#9dbfa5] pt-2 text-xs text-[#6f8175]">تاريخ الاعتماد</div></div>
        </div>
      </>}
    </section>
  );
}

export default FinalAcceptanceReportView;
