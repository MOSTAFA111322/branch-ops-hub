import { useMemo, useState } from "react";
import { Filter, Save, Search, UsersRound } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const roles = [
  ["user", "مستخدم"], ["admin", "مدير نظام"], ["area_manager", "مدير منطقة"],
  ["branch_manager", "مدير فرع"], ["quality", "الجودة"], ["maintenance", "الصيانة"],
  ["warehouse", "المستودعات"], ["factory", "المصنع"],
] as const;
type Role = (typeof roles)[number][0];

export function UserAccountManager() {
  const query = trpc.users.adminList.useQuery(undefined, { staleTime: 30_000 });
  const permissions = trpc.permissions.list.useQuery(undefined, { staleTime: 30_000 });
  const utils = trpc.useUtils();
  const update = trpc.users.updateAccess.useMutation({ onSuccess: () => utils.users.adminList.invalidate() });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("user");
  const [branchId, setBranchId] = useState("");
  const [regionId, setRegionId] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [branchFilter, setBranchFilter] = useState("all");
  const branches = permissions.data?.branches ?? [];
  const users = query.data ?? [];
  const filteredUsers = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("ar");
    return users.filter((item) => {
      const haystack = `${item.name ?? ""} ${item.email ?? ""} ${item.id}`.toLocaleLowerCase("ar");
      return (!term || haystack.includes(term)) && (roleFilter === "all" || item.role === roleFilter) && (branchFilter === "all" || String(item.branchId ?? "") === branchFilter);
    });
  }, [users, search, roleFilter, branchFilter]);
  const selected = users.find((item) => item.id === selectedId);
  const choose = (id: number) => { const item = users.find((row) => row.id === id); if (!item) return; setSelectedId(id); setName(item.name ?? ""); setRole(item.role as Role); setBranchId(item.branchId ? String(item.branchId) : ""); setRegionId(item.regionId ? String(item.regionId) : ""); };
  const save = () => { if (!selectedId) return; update.mutate({ userId: selectedId, name: name.trim() || undefined, role, branchId: branchId ? Number(branchId) : null, regionId: regionId ? Number(regionId) : null }); };
  if (query.isLoading || permissions.isLoading) return <section className="rounded-2xl bg-white p-6 text-sm text-[#6c7b70]">جارٍ تحميل حسابات المستخدمين...</section>;
  if (query.error || permissions.error) return <section className="rounded-2xl border border-[#f1d6c5] bg-[#fff8f4] p-6 text-sm text-[#925e43]">تعذر تحميل الحسابات. هذه الشاشة متاحة لمدير النظام فقط.</section>;
  return <section className="space-y-4 rounded-2xl border border-[#dfe9df] bg-white p-5 shadow-[0_5px_18px_rgba(39,70,48,0.04)]" dir="rtl" aria-labelledby="accounts-title">
    <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-[#4d8068]">إدارة الوصول</p><h2 id="accounts-title" className="mt-1 text-xl font-bold text-[#173d31]">حسابات المستخدمين</h2><p className="mt-1 text-xs text-[#89948b]">ابحث وفلتر الحسابات ثم عدّل الدور والفرع والنطاق التشغيلي.</p></div><UsersRound className="h-6 w-6 text-[#4d8068]" /></div>
    <div className="grid gap-2 rounded-2xl bg-[#f8fbf8] p-3 md:grid-cols-[1.5fr_1fr_1fr]"><label className="relative"><Search className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-[#89948b]" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث بالاسم أو البريد أو المعرّف" className="h-9 rounded-xl bg-white pr-9 text-xs" aria-label="بحث الحسابات" /></label><select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} className="h-9 rounded-xl border border-[#dfe9df] bg-white px-3 text-xs" aria-label="تصفية حسب الدور"><option value="all">كل الأدوار</option>{roles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)} className="h-9 rounded-xl border border-[#dfe9df] bg-white px-3 text-xs" aria-label="تصفية حسب الفرع"><option value="all">كل الفروع</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.code} · {branch.name}</option>)}</select></div>
    <div className="flex items-center gap-2 text-[10px] text-[#89948b]"><Filter className="h-3.5 w-3.5" /> عرض {filteredUsers.length} من {users.length} حساب</div>
    <div className="grid gap-4 lg:grid-cols-[1fr_1.5fr]"><div className="rounded-2xl bg-[#f8fbf8] p-3"><div className="space-y-2">{filteredUsers.map((item) => <button key={item.id} type="button" onClick={() => choose(item.id)} className={`w-full rounded-xl border p-3 text-right transition ${selectedId === item.id ? "border-[#4d9b70] bg-[#eaf6ed]" : "border-[#e5eee6] bg-white hover:border-[#b9d6c0]"}`}><p className="truncate text-xs font-semibold text-[#284c3b]">{item.name ?? item.email ?? `مستخدم ${item.id}`}</p><p className="mt-1 truncate text-[10px] text-[#89948b]">{item.email ?? "بلا بريد مسجل"} · {roles.find(([value]) => value === item.role)?.[1] ?? item.role}</p></button>)}{!filteredUsers.length && <p className="p-6 text-center text-xs text-[#89948b]">لا توجد حسابات مطابقة للفلاتر الحالية.</p>}</div></div>
      <div className="rounded-2xl border border-[#e5eee6] bg-[#fbfdfb] p-4">{selected ? <><div className="mb-3 flex items-center justify-between"><div><p className="text-xs text-[#89948b]">معرّف الحساب: {selected.id}</p><p className="text-sm font-bold text-[#174c3d]">تعديل بيانات الوصول</p></div><span className="rounded-full bg-[#eaf6ed] px-2 py-1 text-[10px] text-[#24724e]">تدقيق مفعل</span></div><div className="grid gap-3 md:grid-cols-2"><label className="text-xs text-[#526359]">اسم العرض<Input value={name} onChange={(event) => setName(event.target.value)} className="mt-1 h-9 rounded-lg bg-white text-xs" /></label><label className="text-xs text-[#526359]">الدور<select value={role} onChange={(event) => setRole(event.target.value as Role)} className="mt-1 h-9 w-full rounded-lg border border-[#dfe9df] bg-white px-2 text-xs">{roles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="text-xs text-[#526359]">الفرع الأساسي<select value={branchId} onChange={(event) => setBranchId(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-[#dfe9df] bg-white px-2 text-xs"><option value="">بدون فرع أساسي</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.code} · {branch.name}</option>)}</select></label><label className="text-xs text-[#526359]">معرّف المنطقة (اختياري)<Input type="number" min="1" value={regionId} onChange={(event) => setRegionId(event.target.value)} className="mt-1 h-9 rounded-lg bg-white text-xs" /></label></div><div className="mt-4 flex items-center justify-between gap-3"><p className="text-[10px] text-[#89948b]">المصادقة تتم عبر الحساب المؤسسي ولا تتغير من هذه الشاشة.</p><Button onClick={save} disabled={update.isPending} className="rounded-xl bg-[#17624b] text-xs hover:bg-[#12513e]"><Save className="ml-1 h-3.5 w-3.5" />{update.isPending ? "جارٍ الحفظ..." : "حفظ التعديلات"}</Button></div></> : <div className="flex min-h-48 items-center justify-center text-center text-xs text-[#89948b]">اختر حسابًا من القائمة لبدء التعديل.</div>}</div>
    </div>
  </section>;
}
export default UserAccountManager;
