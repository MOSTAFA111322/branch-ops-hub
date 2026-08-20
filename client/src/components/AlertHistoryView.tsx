import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bell, CheckCircle2, FileText, Wrench, ClipboardCheck, ListTodo } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type AlertItem = { id: string; kind: string; branchId?: number | null; title: string; detail: string; tone?: string };
const storageKey = "branch-ops-read-alerts";
const icons: Record<string, typeof Bell> = { document: FileText, maintenance: Wrench, visit: ClipboardCheck, checklist: ClipboardCheck, task: ListTodo, action: AlertTriangle };

export function AlertHistoryView() {
  const { data: summary, isLoading } = trpc.dashboard.summary.useQuery();
  const { data: checklistAlerts = [] } = trpc.checklists.alerts.useQuery();
  const { data: notificationRows = [] } = trpc.notifications.list.useQuery();
  const markNotificationRead = trpc.notifications.markRead.useMutation();
  const [readIds, setReadIds] = useState<string[]>([]);
  useEffect(() => { try { setReadIds(JSON.parse(localStorage.getItem(storageKey) ?? "[]") as string[]); } catch { setReadIds([]); } }, []);
  const alerts = useMemo(() => [...((summary?.alerts ?? []) as AlertItem[]), ...(checklistAlerts as AlertItem[]), ...notificationRows.map((item) => ({ id: `notification-${item.id}`, kind: item.kind, branchId: null, title: item.title, detail: item.content, tone: "amber" }))].map((item) => ({ ...item, id: String(item.id) })), [summary, checklistAlerts, notificationRows]);
  const markRead = (id: string) => { const next = Array.from(new Set([...readIds, id])); setReadIds(next); localStorage.setItem(storageKey, JSON.stringify(next)); if (id.startsWith("notification-")) markNotificationRead.mutate({ id: Number(id.replace("notification-", "")) }); };
  const markAllRead = () => { const next = alerts.map((item) => item.id); setReadIds(next); localStorage.setItem(storageKey, JSON.stringify(next)); notificationRows.forEach((item) => { if (!item.readAt) markNotificationRead.mutate({ id: item.id }); }); };
  return <div className="space-y-4" dir="rtl"><Card className="rounded-3xl border-[#dfe9df] bg-white shadow-sm"><CardHeader className="flex-row items-center justify-between gap-3"><div><CardTitle className="flex items-center gap-2 text-lg"><Bell className="h-5 w-5 text-[#4d8068]" /> مركز تاريخ التنبيهات</CardTitle><p className="mt-1 text-xs text-[#89948b]">سجل التنبيهات الفعلية ضمن نطاق صلاحيتك، مع حفظ حالة القراءة على هذا الجهاز.</p></div><Button variant="outline" size="sm" className="rounded-xl text-xs" onClick={markAllRead} disabled={!alerts.length}>تحديد الكل كمقروء</Button></CardHeader><CardContent>{isLoading ? <p className="py-8 text-center text-xs text-[#89948b]">جارٍ تحميل التنبيهات...</p> : alerts.length ? <div className="space-y-2">{alerts.map((alert) => { const Icon = icons[alert.kind] ?? AlertTriangle; const isRead = readIds.includes(alert.id); return <button key={alert.id} onClick={() => markRead(alert.id)} className={`flex w-full items-start gap-3 rounded-2xl border p-3 text-right transition-colors ${isRead ? "border-[#edf1ed] bg-white opacity-70" : "border-[#f0d7b4] bg-[#fffaf2]"}`}><Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#a86c2d]" /><span className="min-w-0 flex-1"><span className="flex items-center gap-2"><span className="truncate text-xs font-semibold text-[#34483b]">{alert.title}</span><Badge variant="outline" className="rounded-full text-[9px]">{isRead ? "مقروء" : "غير مقروء"}</Badge></span><span className="mt-1 block text-[11px] text-[#89948b]">{alert.detail}</span><span className="mt-1 block text-[10px] text-[#a86c2d]">المصدر: {alert.kind === "task" ? "مركز المهام" : alert.kind === "document" ? "الوثائق" : alert.kind === "maintenance" ? "الصيانة" : alert.kind === "visit" || alert.kind === "checklist" ? "الزيارات والفحص" : "الإجراءات"}</span></span>{isRead ? <CheckCircle2 className="h-4 w-4 shrink-0 text-[#4d8068]" /> : <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#e48552]" />}</button>; })}</div> : <p className="py-8 text-center text-xs text-[#89948b]">لا توجد تنبيهات ضمن نطاقك.</p>}</CardContent></Card></div>;
}
