import { useState } from "react";
import { CheckCircle2, FileCheck2, PenLine, XCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function ReportApprovalView() {
  const now = new Date();
  const [periodYear, setPeriodYear] = useState(now.getFullYear());
  const [periodMonth, setPeriodMonth] = useState(now.getMonth() + 1);
  const [signatureText, setSignatureText] = useState("");
  const [notes, setNotes] = useState("");
  const utils = trpc.useUtils();
  const { data: approvals = [], isLoading } = trpc.reportApprovals.list.useQuery({ periodYear, periodMonth });
  const approve = trpc.reportApprovals.approve.useMutation({ onSuccess: () => utils.reportApprovals.list.invalidate({ periodYear, periodMonth }) });
  const submit = (status: "approved" | "rejected") => {
    if (signatureText.trim().length < 2) return;
    approve.mutate({ periodYear, periodMonth, status, signatureText: signatureText.trim(), notes: notes.trim() || undefined });
  };
  return <div className="space-y-4" dir="rtl">
    <Card className="rounded-3xl border-[#dfe9df] bg-white shadow-sm">
      <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><FileCheck2 className="h-5 w-5 text-[#4d8068]" /> اعتماد التقرير الشهري</CardTitle><p className="text-xs text-[#89948b]">يسجل الاعتماد باسم المستخدم وتاريخ التنفيذ داخل سجل التدقيق.</p></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-xs font-semibold">السنة<Input type="number" value={periodYear} onChange={(e) => setPeriodYear(Number(e.target.value))} /></label><label className="space-y-1 text-xs font-semibold">الشهر<Input type="number" min={1} max={12} value={periodMonth} onChange={(e) => setPeriodMonth(Number(e.target.value))} /></label></div>
        <label className="block space-y-1 text-xs font-semibold">التوقيع النصي المعتمد<Input value={signatureText} onChange={(e) => setSignatureText(e.target.value)} placeholder="اكتب الاسم المعتمد" /></label>
        <label className="block space-y-1 text-xs font-semibold">ملاحظات الاعتماد<Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ملاحظات اختيارية" /></label>
        <div className="flex flex-wrap gap-2"><Button className="rounded-xl bg-[#34765c]" disabled={approve.isPending || signatureText.trim().length < 2} onClick={() => submit("approved")}><CheckCircle2 className="ml-2 h-4 w-4" /> اعتماد التقرير</Button><Button variant="outline" className="rounded-xl" disabled={approve.isPending || signatureText.trim().length < 2} onClick={() => submit("rejected")}><XCircle className="ml-2 h-4 w-4" /> رفض مع تسجيل السبب</Button></div>
        {approve.isError && <p className="text-xs text-[#b45445]">تعذر حفظ الاعتماد. تحقق من الصلاحية وحاول مرة أخرى.</p>}
      </CardContent>
    </Card>
    <Card className="rounded-3xl border-[#dfe9df] bg-white shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><PenLine className="h-4 w-4 text-[#4d8068]" /> سجل اعتمادات الفترة</CardTitle></CardHeader><CardContent>{isLoading ? <p className="text-xs text-[#89948b]">جارٍ التحميل...</p> : approvals.length ? <div className="space-y-2">{approvals.map((item) => <div key={item.id} className="flex items-center justify-between rounded-2xl border border-[#edf1ed] p-3"><div><p className="text-xs font-semibold">{item.signatureText}</p><p className="mt-1 text-[11px] text-[#89948b]">{item.notes || "دون ملاحظات"}</p></div><Badge variant="outline" className="rounded-full">{item.status === "approved" ? "معتمد" : "مرفوض"}</Badge></div>)}</div> : <p className="text-xs text-[#89948b]">لا يوجد اعتماد مسجل لهذه الفترة.</p>}</CardContent></Card>
  </div>;
}
