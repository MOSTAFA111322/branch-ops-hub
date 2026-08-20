import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type BranchRow = { id: number; code: string; name: string; city: string; region?: string | null; operationalType?: string | null };
type ImportedRow = { code: string; name: string; city: string };
type Difference = { imported: ImportedRow; current?: BranchRow; kind: "changed" | "new" | "unchanged" };

function value(row: Record<string, unknown>, keys: string[]) {
  const key = keys.find((candidate) => row[candidate] !== undefined && row[candidate] !== null);
  return key ? String(row[key]).trim() : "";
}

export function BranchDataReconciliation({ branches }: { branches: BranchRow[] }) {
  const [rows, setRows] = useState<ImportedRow[]>([]);
  const [message, setMessage] = useState("");
  const [fileName, setFileName] = useState("");
  const updateBranch = trpc.branches.update.useMutation();
  const utils = trpc.useUtils();
  const differences = useMemo<Difference[]>(() => rows.map((imported) => {
    const current = branches.find((branch) => branch.code === imported.code);
    if (!current) return { imported, kind: "new" };
    const changed = current.name !== imported.name || current.city !== imported.city;
    return { imported, current, kind: changed ? "changed" : "unchanged" };
  }), [branches, rows]);
  const changedRows = differences.filter((item) => item.kind === "changed");

  const readWorkbook = async (file: File) => {
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const source = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet ?? {});
      const parsed = source.map((row) => ({
        code: value(row, ["code", "Code", "رمز الفرع", "الرمز", "رقم الفرع"]),
        name: value(row, ["name", "Name", "اسم الفرع", "الاسم"]),
        city: value(row, ["city", "City", "المدينة"]),
      })).filter((row) => row.code && row.name && row.city);
      setRows(parsed);
      setFileName(file.name);
      setMessage(parsed.length ? `تمت قراءة ${parsed.length} سجلًا. راجع الفروقات قبل الاعتماد.` : "لم يتم العثور على صفوف صالحة. استخدم الأعمدة: رمز الفرع، اسم الفرع، المدينة.");
    } catch {
      setRows([]);
      setFileName(file.name);
      setMessage("تعذر قراءة الملف. تأكد من أنه Excel أو CSV ويحتوي على رمز الفرع واسم الفرع والمدينة.");
    }
  };

  const applyChanges = async () => {
    if (!changedRows.length) { setMessage("لا توجد تغييرات تحتاج إلى اعتماد."); return; }
    setMessage("جارٍ اعتماد الفروقات...");
    try {
      for (const item of changedRows) {
        if (item.current) await updateBranch.mutateAsync({ id: item.current.id, name: item.imported.name, city: item.imported.city });
      }
      await utils.branches.list.invalidate();
      setMessage(`تم تحديث ${changedRows.length} فرعًا بنجاح وتسجيل التغييرات في سجل التدقيق.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر اعتماد الفروقات.");
    }
  };

  return <Card className="mt-4 rounded-2xl border-[#dce9df] bg-[#fbfdfb] shadow-sm" dir="rtl">
    <CardHeader className="flex-row items-start justify-between gap-3"><div><CardTitle className="text-base">مراجعة بيانات الفروع من Excel</CardTitle><p className="mt-1 text-xs text-[#89948b]">ارفع الملف الرسمي لمعاينة اختلاف الاسم والمدينة قبل حفظ أي تعديل. لا تُضاف فروع جديدة تلقائيًا.</p></div><Badge variant="outline" className="rounded-full text-[10px]">مطابقة آمنة</Badge></CardHeader>
    <CardContent>
      <div className="flex flex-wrap items-center gap-2"><label className="inline-flex cursor-pointer items-center rounded-xl bg-[#174c3d] px-3 py-2 text-xs font-semibold text-white">اختيار ملف Excel<input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void readWorkbook(file); event.target.value = ""; }} /></label>{fileName && <span className="text-xs text-[#617167]">{fileName}</span>}<span className="text-xs text-[#89948b]">الأعمدة المطلوبة: رمز الفرع · اسم الفرع · المدينة</span></div>
      {message && <p className={`mt-3 text-xs ${message.includes("تم") ? "text-[#2d7d58]" : "text-[#a45b4e]"}`}>{message}</p>}
      {rows.length > 0 && <div className="mt-4 overflow-x-auto rounded-xl border border-[#e6eee7] bg-white"><table className="w-full min-w-[620px] text-right text-xs"><thead className="bg-[#f3f8f3] text-[#617167]"><tr><th className="p-2">الرمز</th><th className="p-2">الاسم الحالي</th><th className="p-2">الاسم في الملف</th><th className="p-2">المدينة الحالية</th><th className="p-2">المدينة في الملف</th><th className="p-2">الحالة</th></tr></thead><tbody>{differences.map((item) => <tr key={item.imported.code} className="border-t border-[#edf1ed]"><td className="p-2 font-semibold">{item.imported.code}</td><td className="p-2">{item.current?.name ?? "غير موجود"}</td><td className="p-2">{item.imported.name}</td><td className="p-2">{item.current?.city ?? "—"}</td><td className="p-2">{item.imported.city}</td><td className="p-2"><Badge variant="outline" className={`rounded-full text-[10px] ${item.kind === "changed" ? "border-amber-200 text-amber-700" : item.kind === "new" ? "border-slate-200 text-slate-500" : "border-emerald-200 text-emerald-700"}`}>{item.kind === "changed" ? "يحتاج اعتماد" : item.kind === "new" ? "رمز جديد — لا يُضاف تلقائيًا" : "مطابق"}</Badge></td></tr>)}</tbody></table></div>}
      {changedRows.length > 0 && <div className="mt-3 flex items-center justify-between gap-3"><p className="text-xs text-[#a16b2b]">سيتم تحديث الاسم والمدينة للفروع الموجودة فقط، ولن يتم إنشاء أو حذف أي فرع.</p><Button onClick={() => void applyChanges()} disabled={updateBranch.isPending} className="rounded-xl bg-[#174c3d] text-xs">{updateBranch.isPending ? "جارٍ الاعتماد..." : `اعتماد ${changedRows.length} تغيير`}</Button></div>}
    </CardContent>
  </Card>;
}
