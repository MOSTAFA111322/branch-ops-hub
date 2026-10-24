import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { loading, user, refresh } = useAuth();
  const localLogin = trpc.auth.localLogin.useMutation({ onSuccess: () => refresh() });
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  if (loading) return <DashboardLayoutSkeleton />;
  if (user) return <>{children}</>;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f8f4] p-4" dir="rtl">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-3xl border border-[#dfe9df] bg-white shadow-[0_18px_60px_rgba(39,70,48,0.12)] md:grid-cols-2">
        <div className="flex flex-col justify-center bg-[#174c3d] p-8 text-white md:p-12">
          <p className="text-sm font-semibold text-[#b9e4c5]">مركز متابعة وتحسين الفروع</p>
          <h1 className="mt-4 text-3xl font-bold leading-tight">دخول آمن لفريق التشغيل</h1>
          <p className="mt-4 text-sm leading-7 text-[#d8eee0]">تظهر بيانات الفروع والتقارير بعد التحقق من حسابك فقط. لا يتم عرض أي أرقام افتراضية عند غياب الجلسة.</p>
        </div>
        <div className="p-8 md:p-12">
          <h2 className="text-xl font-bold text-[#173d31]">تسجيل الدخول المحلي</h2>
          <p className="mt-2 text-sm text-[#718078]">للحسابات الداخلية التي ينشئها مدير النظام.</p>
          <form className="mt-6 space-y-4" onSubmit={(event) => { event.preventDefault(); localLogin.mutate({ username, password }); }}>
            <label className="block text-sm font-medium text-[#526359]">اسم المستخدم<Input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" className="mt-1 h-11 rounded-xl" dir="ltr" required /></label>
            <label className="block text-sm font-medium text-[#526359]">كلمة المرور<Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" className="mt-1 h-11 rounded-xl" dir="ltr" required /></label>
            {localLogin.error && <p className="rounded-xl bg-[#fff4ef] p-3 text-xs text-[#a44d36]" role="alert">{localLogin.error.message}</p>}
            <Button type="submit" disabled={localLogin.isPending || !username || !password} className="h-11 w-full rounded-xl bg-[#17624b] hover:bg-[#12513e]">{localLogin.isPending ? "جارٍ التحقق..." : "دخول إلى النظام"}</Button>
          </form>
          <div className="my-6 flex items-center gap-3 text-xs text-[#89948b]"><span className="h-px flex-1 bg-[#e5eee6]" /><span>أو</span><span className="h-px flex-1 bg-[#e5eee6]" /></div>
          <Button type="button" variant="outline" onClick={() => startLogin()} className="h-11 w-full rounded-xl border-[#b9d6c0] text-[#285c47]">الدخول عبر حساب المؤسسة (OAuth)</Button>
        </div>
      </div>
    </div>
  );
}
