import { useMemo, useState } from "react";
import { ShieldCheck, Save, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

export function BranchPermissionManager() {
  const permissions = trpc.permissions.list.useQuery(undefined, { staleTime: 30_000 });
  const utils = trpc.useUtils();
  const upsert = trpc.permissions.upsert.useMutation({ onSuccess: () => utils.permissions.list.invalidate() });
  const remove = trpc.permissions.remove.useMutation({ onSuccess: () => utils.permissions.list.invalidate() });
  const [userId, setUserId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [canView, setCanView] = useState(true);
  const [canExport, setCanExport] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const current = useMemo(() => permissions.data?.permissions.find((item) => item.userId === Number(userId) && item.branchId === Number(branchId)), [permissions.data?.permissions, userId, branchId]);

  const selectScope = (nextUserId: string, nextBranchId: string) => {
    const found = permissions.data?.permissions.find((item) => item.userId === Number(nextUserId) && item.branchId === Number(nextBranchId));
    setUserId(nextUserId); setBranchId(nextBranchId); setCanView(found?.canView ?? true); setCanExport(found?.canExport ?? false); setCanShare(found?.canShare ?? false);
  };

  const save = () => {
    if (!Number(userId) || !Number(branchId)) return;
    upsert.mutate({ userId: Number(userId), branchId: Number(branchId), canView, canExport, canShare });
  };
  const deletePermission = () => {
    if (!Number(userId) || !Number(branchId)) return;
    remove.mutate({ userId: Number(userId), branchId: Number(branchId) });
  };

  if (permissions.isLoading) return <section className="rounded-2xl bg-white p-6 text-sm text-[#6c7b70]">جارٍ تحميل صلاحيات الفروع...</section>;
  if (permissions.error) return <section className="rounded-2xl border border-[#f1d6c5] bg-[#fff8f4] p-6 text-sm text-[#925e43]">تعذر تحميل الصلاحيات. هذه الشاشة متاحة لمدير النظام فقط.</section>;
  const users = permissions.data?.users ?? [];
  const branches = permissions.data?.branches ?? [];
  const rows = permissions.data?.permissions ?? [];

  return <section className="space-y-4 rounded-2xl border border-[#dfe9df] bg-white p-5 shadow-[0_5px_18px_rgba(39,70,48,0.04)]" dir="rtl" aria-labelledby="permissions-title">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold text-[#4d8068]">التحكم والوصول</p><h2 id="permissions-title" className="mt-1 text-xl font-bold text-[#173d31]">صلاحيات المستخدمين حسب الفرع</h2><p className="mt-1 text-xs text-[#89948b]">تتحكم الصلاحيات الفردية في العرض والتصدير والمشاركة، وتسبق نطاق الدور العام.</p></div><ShieldCheck className="h-6 w-6 text-[#4d8068]" /></div>
    <div className="grid gap-3 rounded-2xl bg-[#f8fbf8] p-4 md:grid-cols-2 lg:grid-cols-4"><label className="text-xs text-[#526359]">المستخدم<select value={userId} onChange={(event) => selectScope(event.target.value, branchId)} className="mt-1 h-9 w-full rounded-lg border border-[#dfe9df] bg-white px-2 text-xs"><option value="">اختر المستخدم</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name ?? user.email ?? `مستخدم ${user.id}`} · {user.role}</option>)}</select></label><label className="text-xs text-[#526359]">الفرع<select value={branchId} onChange={(event) => selectScope(userId, event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-[#dfe9df] bg-white px-2 text-xs"><option value="">اختر الفرع</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.code} · {branch.name}</option>)}</select></label><label className="flex items-center gap-2 pt-5 text-xs"><input type="checkbox" checked={canView} onChange={(event) => setCanView(event.target.checked)} className="accent-[#2d7d58]" /> عرض البيانات</label><label className="flex items-center gap-2 pt-5 text-xs"><input type="checkbox" checked={canExport} onChange={(event) => setCanExport(event.target.checked)} className="accent-[#2d7d58]" /> تصدير التقارير</label><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={canShare} onChange={(event) => setCanShare(event.target.checked)} className="accent-[#2d7d58]" /> مشاركة التقارير</label><div className="flex gap-2 md:col-span-2 lg:col-span-3"><Button size="sm" className="rounded-xl bg-[#17624b] text-xs hover:bg-[#12513e]" onClick={save} disabled={!userId || !branchId || upsert.isPending}><Save className="ml-1 h-3.5 w-3.5" /> {current ? "تحديث الصلاحية" : "حفظ الصلاحية"}</Button><Button variant="outline" size="sm" className="rounded-xl text-xs text-[#a14d45]" onClick={deletePermission} disabled={!current || remove.isPending}><Trash2 className="ml-1 h-3.5 w-3.5" /> إزالة الربط</Button></div></div>
    <div className="overflow-x-auto rounded-xl border border-[#e5eee6]"><table className="w-full min-w-[720px] text-right text-xs"><caption className="sr-only">صلاحيات المستخدمين حسب الفرع</caption><thead className="bg-[#f8fbf8] text-[#6c7b70]"><tr><th className="p-3">المستخدم</th><th className="p-3">الفرع</th><th className="p-3">العرض</th><th className="p-3">التصدير</th><th className="p-3">المشاركة</th></tr></thead><tbody>{rows.length ? rows.map((row) => <tr key={row.id} className="border-t border-[#edf1ed]"><td className="p-3">{users.find((user) => user.id === row.userId)?.name ?? `مستخدم ${row.userId}`}</td><td className="p-3">{branches.find((branch) => branch.id === row.branchId)?.name ?? `فرع ${row.branchId}`}</td><td className="p-3">{row.canView ? "مسموح" : "ممنوع"}</td><td className="p-3">{row.canExport ? "مسموح" : "ممنوع"}</td><td className="p-3">{row.canShare ? "مسموح" : "ممنوع"}</td></tr>) : <tr><td colSpan={5} className="p-8 text-center text-[#89948b]">لا توجد روابط فردية محفوظة بعد.</td></tr>}</tbody></table></div>
  </section>;
}
