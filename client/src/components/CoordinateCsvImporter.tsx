import { useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Upload, CheckCircle2, AlertTriangle } from "lucide-react";

type CoordinateRow = { code: string; latitude: number; longitude: number; coordinateSource: string };
const aliases: Record<string, keyof CoordinateRow> = { code: "code", branchcode: "code", "رمز الفرع": "code", الرمز: "code", latitude: "latitude", lat: "latitude", "خط العرض": "latitude", longitude: "longitude", lng: "longitude", lon: "longitude", "خط الطول": "longitude", source: "coordinateSource", coordinatesource: "coordinateSource", المصدر: "coordinateSource" };

function parseCsv(text: string) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error("يجب أن يحتوي الملف على صف عناوين وصف واحد على الأقل.");
  const delimiter = lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(delimiter).map(value => value.trim().toLowerCase());
  const mapped = headers.map(header => aliases[header]);
  if (!mapped.includes("code") || !mapped.includes("latitude") || !mapped.includes("longitude")) throw new Error("الرؤوس المطلوبة: رمز الفرع، خط العرض، خط الطول.");
  const rows: CoordinateRow[] = [];
  const errors: string[] = [];
  lines.slice(1).forEach((line, index) => {
    const cells = line.split(delimiter).map(value => value.trim().replace(/^\"|\"$/g, ""));
    const record: Record<string, string | number | undefined> = {};
    mapped.forEach((key, cellIndex) => { if (key) record[key] = key === "code" || key === "coordinateSource" ? cells[cellIndex] : Number(cells[cellIndex]?.replace(",", ".")); });
    if (!record.code || !Number.isFinite(record.latitude) || !Number.isFinite(record.longitude) || Number(record.latitude) < -90 || Number(record.latitude) > 90 || Number(record.longitude) < -180 || Number(record.longitude) > 180) errors.push(`السطر ${index + 2}: بيانات غير صالحة`);
    else rows.push({ code: String(record.code), latitude: Number(record.latitude), longitude: Number(record.longitude), coordinateSource: String(record.coordinateSource || "CSV") });
  });
  return { rows, errors };
}

export function CoordinateCsvImporter() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<CoordinateRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const mutation = trpc.branches.importCoordinates.useMutation({ onSuccess: result => setMessage(`تم تحديث ${result.updated} فرع، ورفض ${result.rejected} صف.`), onError: error => setMessage(error.message) });
  const duplicateCodes = useMemo(() => rows.length - new Set(rows.map(row => row.code)).size, [rows]);
  const loadFile = (file: File) => { const reader = new FileReader(); reader.onload = event => { try { const parsed = parseCsv(String(event.target?.result || "")); setRows(parsed.rows); setErrors([...parsed.errors, ...(parsed.rows.length - new Set(parsed.rows.map(row => row.code)).size ? ["يوجد تكرار في رموز الفروع وسيتم إرسال آخر نسخة فقط."] : [])]); setMessage(""); } catch (error) { setRows([]); setErrors([error instanceof Error ? error.message : "تعذر قراءة الملف"]); } }; reader.readAsText(file, "UTF-8"); };
  const submit = () => { const unique = Array.from(new Map(rows.map(row => [row.code, row])).values()); mutation.mutate({ rows: unique }); };
  return <Card className="rounded-2xl border-[#dfe9df] bg-white"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Upload className="h-4 w-4 text-[#2d7d58]" /> استيراد إحداثيات الفروع من CSV</CardTitle><p className="text-xs text-[#89948b]">يتم التحقق من النطاق الجغرافي وتطبيق التحديث على الفروع المسموح بها فقط.</p></CardHeader><CardContent className="space-y-4"><input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={event => event.target.files?.[0] && loadFile(event.target.files[0])} /><Button variant="outline" className="rounded-xl" onClick={() => inputRef.current?.click()}>اختيار ملف CSV</Button>{rows.length > 0 && <div className="overflow-x-auto rounded-xl border border-[#e5eee6]"><table className="w-full text-right text-xs"><thead className="bg-[#f8fbf8]"><tr><th className="p-2">الرمز</th><th className="p-2">خط العرض</th><th className="p-2">خط الطول</th><th className="p-2">المصدر</th></tr></thead><tbody>{rows.slice(0, 8).map(row => <tr key={row.code} className="border-t border-[#edf1ed]"><td className="p-2">{row.code}</td><td className="p-2">{row.latitude}</td><td className="p-2">{row.longitude}</td><td className="p-2">{row.coordinateSource}</td></tr>)}</tbody></table></div>}{rows.length > 8 && <p className="text-[10px] text-[#89948b]">تظهر معاينة أول 8 صفوف من أصل {rows.length}.</p>}{duplicateCodes > 0 && <Badge variant="outline" className="border-[#ead8a8] text-[#ad7a27]">تكرارات: {duplicateCodes} — سيُستخدم آخر صف لكل رمز</Badge>}{errors.length > 0 && <div className="rounded-xl bg-[#fff8f4] p-3 text-xs text-[#925e43]"><AlertTriangle className="ml-1 inline h-3.5 w-3.5" />{errors.join("؛ ")}</div>}<div className="flex flex-wrap items-center gap-2"><Button className="rounded-xl bg-[#2d7d58] hover:bg-[#256648]" disabled={!rows.length || mutation.isPending} onClick={submit}>{mutation.isPending ? "جارٍ التحديث..." : "معاينة واعتماد الإحداثيات"}</Button>{message && <span className="text-xs text-[#2d7d58]"><CheckCircle2 className="ml-1 inline h-3.5 w-3.5" />{message}</span>}</div></CardContent></Card>;
}
