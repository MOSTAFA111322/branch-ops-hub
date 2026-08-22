import { useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Upload, CheckCircle2, AlertTriangle, Download, Loader2 } from "lucide-react";

type CoordinateRow = { code: string; latitude: number; longitude: number; coordinateSource: string };
const aliases: Record<string, keyof CoordinateRow> = { code: "code", branchcode: "code", "رمز الفرع": "code", الرمز: "code", latitude: "latitude", lat: "latitude", "خط العرض": "latitude", longitude: "longitude", lng: "longitude", lon: "longitude", "خط الطول": "longitude", source: "coordinateSource", coordinatesource: "coordinateSource", المصدر: "coordinateSource" };

type Parsed = { rows: CoordinateRow[]; errors: string[]; warnings: string[] };
const clean = (value: string) => value.trim().replace(/^"|"$/g, "");

async function parseCsv(text: string, onProgress: (value: number) => void): Promise<Parsed> {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error("الملف لا يحتوي على صفوف بيانات؛ يجب إضافة صف عناوين وصف واحد على الأقل.");
  const delimiter = lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(delimiter).map((value) => clean(value).toLowerCase());
  const mapped = headers.map((header) => aliases[header]);
  const warnings: string[] = [];
  const expectedHeaders = ["رمز الفرع", "خط العرض", "خط الطول", "المصدر"];
  const recognizedHeaders = mapped.filter(Boolean).length;
  if (recognizedHeaders !== headers.length || headers.length !== expectedHeaders.length || headers.some((header, index) => header !== expectedHeaders[index])) warnings.push("عناوين الأعمدة تختلف عن قالب CSV. تمت مطابقة الأعمدة المعروفة تلقائيًا، ويمكن متابعة المعاينة.");
  if (!mapped.includes("code")) throw new Error("العمود المفقود: رمز الفرع أو code.");
  if (!mapped.includes("latitude")) throw new Error("العمود المفقود: خط العرض أو latitude.");
  if (!mapped.includes("longitude")) throw new Error("العمود المفقود: خط الطول أو longitude.");
  const rows: CoordinateRow[] = [];
  const errors: string[] = [];
  for (let index = 0; index < lines.length - 1; index += 1) {
    const lineNumber = index + 2;
    const cells = lines[index + 1].split(delimiter).map(clean);
    const codeIndex = mapped.indexOf("code");
    const latitudeIndex = mapped.indexOf("latitude");
    const longitudeIndex = mapped.indexOf("longitude");
    const sourceIndex = mapped.indexOf("coordinateSource");
    const code = cells[codeIndex] ?? "";
    const latitudeText = cells[latitudeIndex] ?? "";
    const longitudeText = cells[longitudeIndex] ?? "";
    const latitude = Number(latitudeText.replace(",", "."));
    const longitude = Number(longitudeText.replace(",", "."));
    const source = sourceIndex >= 0 ? cells[sourceIndex] || "CSV" : "CSV";
    const reasons: string[] = [];
    if (!code) reasons.push("رمز الفرع فارغ");
    if (!latitudeText || !Number.isFinite(latitude)) reasons.push("خط العرض ليس رقمًا");
    else if (latitude < -90 || latitude > 90) reasons.push("خط العرض خارج النطاق -90 إلى 90");
    if (!longitudeText || !Number.isFinite(longitude)) reasons.push("خط الطول ليس رقمًا");
    else if (longitude < -180 || longitude > 180) reasons.push("خط الطول خارج النطاق -180 إلى 180");
    if (reasons.length) errors.push(`السطر ${lineNumber}: ${reasons.join("، ")}`);
    else rows.push({ code, latitude, longitude, coordinateSource: source });
    onProgress(Math.round(((index + 1) / (lines.length - 1)) * 100));
    if (index % 25 === 0) await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  }
  return { rows, errors, warnings };
}

const downloadCoordinateTemplate = () => { const csv = "رمز الفرع,خط العرض,خط الطول,المصدر\n101,24.7136,46.6753,Google Maps\n201,24.6308,46.7150,Google Maps\n"; const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "قالب-إحداثيات-الفروع.csv"; anchor.click(); URL.revokeObjectURL(url); };

export function CoordinateCsvImporter() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<CoordinateRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState(0);
  const [reading, setReading] = useState(false);
  const branchesQuery = trpc.branches.list.useQuery();
  const mutation = trpc.branches.importCoordinates.useMutation({ onSuccess: (result) => { setMessage(`تم تحديث ${result.updated} فرع، ورفض ${result.rejected} صف.`); branchesQuery.refetch(); void coordinateAudit.refetch(); }, onError: (error) => setMessage(error.message) });
  const verifyMutation = trpc.branches.verifyCoordinates.useMutation({ onSuccess: (result) => { setMessage(`تم توثيق ${result.verified} إحداثية جماعيًا، وتعذر توثيق ${result.rejected}.`); branchesQuery.refetch(); void coordinateAudit.refetch(); }, onError: (error) => setMessage(error.message) });
  const coordinateAudit = trpc.audit.list.useQuery({ entityType: "branch_coordinates", limit: 80 }, { staleTime: 30000 });
  const duplicateCodes = useMemo(() => rows.length - new Set(rows.map((row) => row.code)).size, [rows]);
  const loadFile = (file: File) => {
    setReading(true); setProgress(0); setRows([]); setErrors([]); setWarnings([]); setMessage("");
    const reader = new FileReader();
    reader.onerror = () => { setReading(false); setErrors(["تعذر قراءة الملف من الجهاز؛ تحقق من صلاحية الملف ثم حاول مرة أخرى."]); };
    reader.onload = (event) => { void parseCsv(String(event.target?.result || ""), setProgress).then((parsed) => { setRows(parsed.rows); setWarnings(parsed.warnings); setErrors([...parsed.errors, ...(parsed.rows.length - new Set(parsed.rows.map((row) => row.code)).size ? ["توجد رموز فروع مكررة؛ سيُستخدم آخر صف لكل رمز عند الاعتماد."] : [])]); }).catch((error) => setErrors([error instanceof Error ? error.message : "تعذر تحليل ملف CSV."])).finally(() => setReading(false)); };
    reader.readAsText(file, "UTF-8");
  };
  const submit = () => { const unique = Array.from(new Map(rows.map((row) => [row.code, row])).values()); mutation.mutate({ rows: unique }); };
  const verifyImported = () => { const codes = new Set(rows.map((row) => row.code)); const branchIds = (branchesQuery.data ?? []).filter((branch) => codes.has(String(branch.code)) && Number.isFinite(Number(branch.latitude)) && Number.isFinite(Number(branch.longitude))).map((branch) => branch.id); if (!branchIds.length) { setMessage("لا توجد فروع مطابقة بإحداثيات صالحة للتحقق الجماعي."); return; } verifyMutation.mutate({ branchIds }); };
  return <><Card className="rounded-2xl border-[#dfe9df] bg-white"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Upload className="h-4 w-4 text-[#2d7d58]" /> استيراد إحداثيات الفروع من CSV</CardTitle><p className="text-xs text-[#89948b]">تظهر نتيجة كل صف مرفوض برقم السطر وسبب الرفض قبل الاعتماد.</p></CardHeader><CardContent className="space-y-4"><input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => event.target.files?.[0] && loadFile(event.target.files[0])} /><div className="flex flex-wrap gap-2"><Button variant="outline" className="rounded-xl" disabled={reading || mutation.isPending} onClick={() => inputRef.current?.click()}>{reading ? <><Loader2 className="ml-1 h-3.5 w-3.5 animate-spin" />جارٍ تحليل الملف...</> : "اختيار ملف CSV"}</Button><Button variant="outline" className="rounded-xl" disabled={reading || mutation.isPending} onClick={downloadCoordinateTemplate}><Download className="ml-1 h-3.5 w-3.5" /> تنزيل قالب CSV</Button></div>{(reading || progress > 0) && <div className="space-y-1" aria-live="polite"><div className="flex justify-between text-[10px] text-[#6b8172]"><span>{reading ? "تحليل الصفوف والتحقق من الإحداثيات" : "اكتملت المعاينة"}</span><span>{progress}%</span></div><div className="h-2 overflow-hidden rounded-full bg-[#eaf1eb]"><div className="h-full rounded-full bg-[#2d7d58] transition-[width] duration-150" style={{ width: `${progress}%` }} /></div></div>}{rows.length > 0 && <div className="overflow-x-auto rounded-xl border border-[#e5eee6]"><table className="w-full text-right text-xs"><thead className="bg-[#f8fbf8]"><tr><th className="p-2">الرمز</th><th className="p-2">خط العرض</th><th className="p-2">خط الطول</th><th className="p-2">المصدر</th></tr></thead><tbody>{rows.slice(0, 8).map((row) => <tr key={row.code} className="border-t border-[#edf1ed]"><td className="p-2">{row.code}</td><td className="p-2">{row.latitude}</td><td className="p-2">{row.longitude}</td><td className="p-2">{row.coordinateSource}</td></tr>)}</tbody></table></div>}{rows.length > 8 && <p className="text-[10px] text-[#89948b]">تظهر معاينة أول 8 صفوف من أصل {rows.length}.</p>}{duplicateCodes > 0 && <Badge variant="outline" className="border-[#ead8a8] text-[#ad7a27]">تكرارات: {duplicateCodes} — سيُستخدم آخر صف لكل رمز</Badge>}{warnings.length > 0 && <div className="rounded-xl bg-[#fffaf0] p-3 text-xs text-[#9a7220]" role="status"><AlertTriangle className="ml-1 inline h-3.5 w-3.5" />{warnings.map((warning, index) => <p key={`${warning}-${index}`}>{warning}</p>)}</div>}{errors.length > 0 && <div className="max-h-40 overflow-auto rounded-xl bg-[#fff8f4] p-3 text-xs text-[#925e43]" role="alert"><AlertTriangle className="ml-1 inline h-3.5 w-3.5" /><div className="mt-1 space-y-1">{errors.map((error, index) => <p key={`${error}-${index}`}>{error}</p>)}</div></div>}<div className="flex flex-wrap items-center gap-2"><Button className="rounded-xl bg-[#2d7d58] hover:bg-[#256648]" disabled={!rows.length || reading || mutation.isPending || verifyMutation.isPending} onClick={submit}>{mutation.isPending ? "جارٍ التحديث..." : "اعتماد الإحداثيات الصالحة"}</Button><Button variant="outline" className="rounded-xl" disabled={!rows.length || reading || mutation.isPending || verifyMutation.isPending || !branchesQuery.data?.length} onClick={verifyImported}>{verifyMutation.isPending ? <><Loader2 className="ml-1 h-3.5 w-3.5 animate-spin" />جارٍ التحقق الجماعي...</> : "تحقق جماعي من الإحداثيات"}</Button>{message && <span className="text-xs text-[#2d7d58]"><CheckCircle2 className="ml-1 inline h-3.5 w-3.5" />{message}</span>}</div></CardContent></Card><Card className="rounded-2xl border-[#dfe9df] bg-white"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><CheckCircle2 className="h-4 w-4 text-[#2d7d58]" /> سجل تغييرات إحداثيات الفروع</CardTitle><p className="text-xs text-[#89948b]">يعرض من عدّل أو اعتمد الإحداثيات وتاريخ العملية والتفاصيل المسجلة.</p></CardHeader><CardContent>{coordinateAudit.isLoading ? <p className="text-xs text-[#89948b]">جارٍ تحميل سجل الإحداثيات...</p> : coordinateAudit.error ? <p className="text-xs text-[#a45b4e]">تعذر تحميل سجل الإحداثيات أو لا تملك الصلاحية.</p> : coordinateAudit.data?.length ? <div className="max-h-64 overflow-auto rounded-xl border border-[#e5eee6]"><table className="w-full min-w-[680px] text-right text-xs"><thead className="bg-[#f8fbf8]"><tr><th className="p-2">التاريخ</th><th className="p-2">المستخدم</th><th className="p-2">الفرع</th><th className="p-2">العملية</th><th className="p-2">التفاصيل</th></tr></thead><tbody>{coordinateAudit.data.map((entry) => <tr key={String(entry.id)} className="border-t border-[#edf1ed]"><td className="p-2 text-[#69776d]">{new Date(entry.createdAt).toLocaleString("ar-SA")}</td><td className="p-2 font-semibold">{entry.actor?.name ?? "النظام"}</td><td className="p-2">{entry.branch?.name ?? "عدة فروع"}</td><td className="p-2 text-[#2d7d58]">{entry.action === "bulk_verify" ? "اعتماد جماعي" : "تعديل"}</td><td className="max-w-[280px] truncate p-2 text-[#89948b]">{entry.afterData ?? entry.beforeData ?? "—"}</td></tr>)}</tbody></table></div> : <p className="text-xs text-[#89948b]">لا توجد تغييرات إحداثيات مسجلة حتى الآن.</p>}</CardContent></Card></>;
}
export default CoordinateCsvImporter;
