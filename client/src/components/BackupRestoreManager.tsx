import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Archive, CheckCircle2, Download, FileSpreadsheet, ShieldAlert, Upload } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const header = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/[\s_\-]/g, "");
const aliases = {
  code: ["code", "branchcode", "costcentercode", "رمزالفرع", "رمزالمركز", "كود"],
  name: ["name", "branchname", "costcentername", "اسم الفرع", "اسم المركز", "الفرع", "المركز"],
  year: ["year", "periodyear", "السنة", "عام"],
  month: ["month", "periodmonth", "الشهر", "شهر"],
  revenue: ["revenue", "sales", "grosssales", "الإيرادات", "المبيعات", "صافيالمبيعات"],
  salesReturns: ["salesreturns", "returns", "مرتجعاتالمبيعات", "مرتجعات"],
  costOfGoods: ["costofgoods", "cost", "التكلفة", "تكلفةالمبيعات"],
  costReturns: ["costreturns", "مرتجعاتالتكلفة"],
  operatingExpenses: ["operatingexpenses", "expenses", "المصروفات", "المصاريف", "المصروفاتالتشغيلية"],
};
const findCell = (row: Record<string, unknown>, keys: string[]) => Object.keys(row).find((key) => keys.some((item) => header(item) === header(key))) ? row[Object.keys(row).find((key) => keys.some((item) => header(item) === header(key))) as string] : "";
const number = (value: unknown) => { const parsed = Number(String(value ?? "").replace(/[,،\s]/g, "")); return Number.isFinite(parsed) ? parsed : 0; };
const normalizeAmount = (value: unknown, kind: "income" | "return" | "expense") => { const amount = Math.abs(number(value)); return kind === "return" ? amount : amount; };

type BackupPackage = { format: string; createdAt: string; financialSnapshots: Array<Record<string, unknown>>; branches: Array<Record<string, unknown>> };
type ImportRow = { branchId: number; year: number; month: number; revenue: number; salesReturns: number; costOfGoods: number; costReturns: number; operatingExpenses: number; sourceRow: number; };

export function BackupRestoreManager() {
  const branchesQuery = trpc.branches.list.useQuery();
  const snapshotsQuery = trpc.financials.list.useQuery({});
  const upsert = trpc.financials.upsert.useMutation({ onSuccess: () => void snapshotsQuery.refetch() });
  const branches = branchesQuery.data ?? [];
  const snapshots = snapshotsQuery.data ?? [];
  const [restoreRows, setRestoreRows] = useState<BackupPackage | null>(null);
  const [restoreName, setRestoreName] = useState("");
  const [excelName, setExcelName] = useState("");
  const [excelRows, setExcelRows] = useState<ImportRow[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const branchByCode = useMemo(() => new Map(branches.map((branch) => [String(branch.code).trim().toLowerCase(), branch])), [branches]);
  const branchByName = useMemo(() => new Map(branches.map((branch) => [String(branch.name).trim(), branch])), [branches]);

  const downloadBackup = () => {
    const payload: BackupPackage = { format: "branch-ops-financial-backup-v1", createdAt: new Date().toISOString(), branches: branches.map(({ id, code, name, city, region, operationalType, status }) => ({ id, code, name, city, region, operationalType, status })), financialSnapshots: snapshots.map((row) => ({ ...row })) };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `نسخة-مالية-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url);
    setMessage("تم تنزيل نسخة اختبارية من دليل الفروع واللقطات المالية."); setError("");
  };

  const readRestore = async (file: File) => {
    setError(""); setMessage(""); setRestoreName(file.name);
    try { const parsed = JSON.parse(await file.text()) as BackupPackage; if (parsed.format !== "branch-ops-financial-backup-v1" || !Array.isArray(parsed.financialSnapshots)) throw new Error("صيغة النسخة غير مدعومة"); setRestoreRows(parsed); setMessage(`تمت معاينة النسخة: ${parsed.financialSnapshots.length} لقطة مالية.`); } catch (reason) { setRestoreRows(null); setError(reason instanceof Error ? reason.message : "تعذر قراءة النسخة"); }
  };

  const readExcel = async (file: File) => {
    setError(""); setMessage(""); setExcelName(file.name);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" }); const sheet = workbook.Sheets[workbook.SheetNames[0]]; const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      const parsed = raw.map((row, index) => {
        const code = String(findCell(row, aliases.code)).trim().toLowerCase(); const name = String(findCell(row, aliases.name)).trim(); const branch = branchByCode.get(code) ?? branchByName.get(name); const year = Math.trunc(number(findCell(row, aliases.year))); const month = Math.trunc(number(findCell(row, aliases.month)));
        if (!branch || year < 2000 || month < 1 || month > 12) return null;
        return { branchId: Number(branch.id), year, month, revenue: normalizeAmount(findCell(row, aliases.revenue), "income"), salesReturns: normalizeAmount(findCell(row, aliases.salesReturns), "return"), costOfGoods: normalizeAmount(findCell(row, aliases.costOfGoods), "expense"), costReturns: normalizeAmount(findCell(row, aliases.costReturns), "return"), operatingExpenses: normalizeAmount(findCell(row, aliases.operatingExpenses), "expense"), sourceRow: index + 2 };
      }).filter((row): row is ImportRow => Boolean(row));
      if (!parsed.length) throw new Error("لم يتم العثور على صفوف صالحة. تأكد من وجود رمز/اسم المركز والسنة والشهر وأعمدة الفترة الحالية.");
      setExcelRows(parsed); setMessage(`تمت معاينة ${parsed.length} صفًا صالحًا من ${raw.length} صف. الأرصدة التراكمية لا تُقرأ في هذا المسار.`);
    } catch (reason) { setExcelRows([]); setError(reason instanceof Error ? reason.message : "تعذر قراءة ملف Excel"); }
  };

  const applyRestore = () => {
    if (!restoreRows) return; setError(""); restoreRows.financialSnapshots.forEach((row) => { const branchId = Number(row.branchId); const year = Number(row.periodYear); const month = Number(row.periodMonth); if (branchId && year >= 2000 && month >= 1 && month <= 12) upsert.mutate({ branchId, year, month, revenue: number(row.revenue), salesReturns: number(row.salesReturns), costOfGoods: number(row.costOfGoods), costReturns: number(row.costReturns), operatingExpenses: number(row.operatingExpenses), notes: `استعادة اختبارية من ${restoreName}`, }); }); setMessage(`تم إرسال ${restoreRows.financialSnapshots.length} لقطة للاستعادة كمسودات. راجعها واعتمدها يدويًا.`); setRestoreRows(null);
  };
  const applyExcel = () => { excelRows.forEach((row) => upsert.mutate({ ...row, notes: `استيراد ملف فعلي: ${excelName}` })); setMessage(`تم إرسال ${excelRows.length} صفًا للحفظ كمسودات، دون اعتماد تلقائي.`); setExcelRows([]); };

  return <div dir="rtl" className="space-y-4">
    <Card className="rounded-2xl border-[#dfe9df] bg-white shadow-[0_5px_18px_rgba(39,70,48,0.04)]"><CardHeader><CardTitle className="flex items-center gap-2 text-base text-[#173d31]"><Archive className="h-5 w-5 text-[#2d7d58]" /> النسخ الاحتياطي والاستعادة</CardTitle><p className="text-xs leading-6 text-[#718078]">نسخة اختبارية قابلة للتنزيل من البيانات المالية ودليل الفروع. الاستعادة لا تعتمد الأرقام تلقائيًا؛ بل تعيدها كمسودات للمراجعة.</p></CardHeader><CardContent className="space-y-3"><div className="flex flex-wrap gap-2"><Button onClick={downloadBackup} disabled={branchesQuery.isLoading || snapshotsQuery.isLoading} className="rounded-xl bg-[#17624b] text-xs hover:bg-[#12513e]"><Download className="ml-1 h-4 w-4" /> تنزيل نسخة احتياطية</Button><label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[#cfe2d3] bg-[#f5fbf6] px-3 py-2 text-xs text-[#286c4b]"><Upload className="h-4 w-4" /> معاينة نسخة للاستعادة<input type="file" accept=".json,application/json" className="hidden" onChange={(event) => event.target.files?.[0] && void readRestore(event.target.files[0])} /></label></div>{restoreRows && <div className="rounded-xl border border-[#ead4a5] bg-[#fffaf0] p-3 text-xs"><p className="font-semibold text-[#805f21]">نسخة جاهزة للمراجعة: {restoreName}</p><p className="mt-1 text-[#806f4d]">{restoreRows.financialSnapshots.length} لقطة مالية، ولن يتم حذف أو استبدال اللقطات الحالية. الاستعادة ستنشئ/تحدّث مسودات فقط.</p><div className="mt-2 flex gap-2"><Button onClick={applyRestore} disabled={upsert.isPending} className="rounded-lg bg-[#9b6b22] text-xs hover:bg-[#815719]">تأكيد الاستعادة كمسودات</Button><Button variant="outline" onClick={() => setRestoreRows(null)} className="rounded-lg text-xs">إلغاء</Button></div></div>}<div className="flex items-start gap-2 rounded-xl border border-[#f0dec4] bg-[#fff9f2] p-3 text-[11px] leading-5 text-[#8b6744]"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /> هذه الوظيفة مخصصة لاختبار البيانات المالية داخل التطبيق، وليست بديلًا عن Task Data Backup الكامل للمشروع وقاعدة البيانات من صفحة النسخ الرسمية.</div></CardContent></Card>
    <Card className="rounded-2xl border-[#dfe9df] bg-white shadow-[0_5px_18px_rgba(39,70,48,0.04)]"><CardHeader><CardTitle className="flex items-center gap-2 text-base text-[#173d31]"><FileSpreadsheet className="h-5 w-5 text-[#2d7d58]" /> رفع قائمة دخل تاريخية</CardTitle><p className="text-xs leading-6 text-[#718078]">ارفع ملفات Excel الفعلية للأشهر السابقة. يجب أن يحتوي الصف على رمز/اسم المركز والسنة والشهر وأعمدة الفترة الحالية. يتم تجاهل أعمدة التراكمي والفترة السابقة.</p></CardHeader><CardContent className="space-y-3"><label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[#cfe2d3] bg-[#f5fbf6] px-3 py-2 text-xs text-[#286c4b]"><Upload className="h-4 w-4" /> اختيار ملف Excel<input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(event) => event.target.files?.[0] && void readExcel(event.target.files[0])} /></label>{excelRows.length > 0 && <div className="overflow-x-auto rounded-xl border border-[#e4ece4]"><table className="w-full min-w-[760px] text-right text-[11px]"><thead className="bg-[#f4f8f4] text-[#55705e]"><tr><th className="p-2">الصف</th><th className="p-2">المركز</th><th className="p-2">الفترة</th><th className="p-2">الإيراد</th><th className="p-2">المرتجعات</th><th className="p-2">التكلفة</th><th className="p-2">المصاريف</th></tr></thead><tbody>{excelRows.slice(0, 20).map((row) => <tr key={`${row.sourceRow}-${row.branchId}`} className="border-t border-[#edf2ed]"><td className="p-2">{row.sourceRow}</td><td className="p-2">{branches.find((branch) => Number(branch.id) === row.branchId)?.name ?? row.branchId}</td><td className="p-2">{row.year}/{row.month}</td><td className="p-2">{row.revenue.toLocaleString("ar-SA")}</td><td className="p-2">{row.salesReturns.toLocaleString("ar-SA")}</td><td className="p-2">{row.costOfGoods.toLocaleString("ar-SA")}</td><td className="p-2">{row.operatingExpenses.toLocaleString("ar-SA")}</td></tr>)}</tbody></table><div className="flex items-center justify-between gap-2 bg-[#fbfdfb] p-3 text-[10px] text-[#718078]"><span>المعاينة تعرض أول 20 صفًا من {excelRows.length}.</span><Button onClick={applyExcel} disabled={upsert.isPending} className="rounded-lg bg-[#17624b] text-xs hover:bg-[#12513e]">حفظ الكل كمسودات</Button></div></div>}{(message || error) && <p role="status" className={`flex items-center gap-1 text-xs ${error ? "text-[#a44d36]" : "text-[#2d7d58]"}`}>{error ? <ShieldAlert className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}{error || message}</p>}</CardContent></Card>
  </div>;
}
