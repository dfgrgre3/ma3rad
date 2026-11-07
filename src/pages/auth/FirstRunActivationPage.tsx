import React, { useState, useEffect } from 'react';
import { AlertCircle, KeyRound, Loader2, Lock, Phone, ShieldCheck, User as UserIcon } from 'lucide-react';
import { CentralLicenseService } from '../../services/CentralLicenseService';
import { CentralConfigApplier } from '../../services/CentralConfigApplier';
import { AuthService } from '../../services/AuthService';

interface FirstRunActivationPageProps {
  onSuccess: () => void;
}

export const FirstRunActivationPage: React.FC<FirstRunActivationPageProps> = ({ onSuccess }) => {
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [activationCode, setActivationCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Show the same notice as the screenshot when no central server is
  // configured yet (e.g. running in a plain browser without Electron bridge).
  useEffect(() => {
    let active = true;
    void CentralLicenseService.getStatus()
      .then((status) => {
        if (active && !status.configured) {
          setError((current) => current ?? 'Central server URL not configured');
        }
      })
      .catch(() => {
        if (active) {
          setError((current) => current ?? 'Central server URL not configured');
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;

    setError(null);
    setLoading(true);
    try {
      const cleanAccount = account.trim();
      const cleanPhone = phone.trim();
      const code = activationCode.trim();
      if (!cleanAccount) throw new Error('أدخل اسم الحساب.');
      if (!password) throw new Error('أدخل كلمة المرور.');
      if (!cleanPhone) throw new Error('أدخل رقم الهاتف.');
      if (!code) throw new Error('أدخل مفتاح الترخيص.');

      const result = await CentralLicenseService.activateFirstRun({
        activationCode: code,
        account: cleanAccount,
        password,
        phone: cleanPhone,
      });
      if (result.credentialStored !== true) {
        throw new Error('بيانات الحساب لم تمنح هذا الجهاز صلاحية فتح البرنامج.');
      }

      try {
        const local = result.localAccount;
        AuthService.provisionCentralAccount({
          username: local?.username || cleanAccount,
          password,
          fullName: local?.fullName,
          phone: local?.phone || cleanPhone,
          role: local?.role,
        });
      } catch (provisionError) {
        console.error('Could not provision the local account after activation:', provisionError);
      }

      CentralLicenseService.markFirstRunActivationComplete();
      try {
        await CentralLicenseService.fetchConfig();
        CentralConfigApplier.apply();
      } catch { /* ignore */ }
      onSuccess();
    } catch (activationError) {
      setError(activationError instanceof Error ? activationError.message : 'تعذر التحقق من بيانات التفعيل.');
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full rounded-lg border border-slate-200 bg-white px-4 py-3 pl-11 text-left text-sm font-normal text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 disabled:opacity-60';

  return (
    <main dir="rtl" className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-lg overflow-hidden rounded-[28px] bg-white shadow-xl shadow-slate-900/10 ring-1 ring-slate-200/60">
        {/* Header — same as screenshot */}
        <div className="bg-[#31445c] px-8 py-8 text-white">
          <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10">
            <ShieldCheck size={30} strokeWidth={2} />
          </div>
          <p className="text-sm font-bold text-slate-200">تهيئة لمرة واحدة</p>
          <h1 className="mt-1 text-[28px] font-extrabold leading-9">تفعيل سيراميسيس</h1>
          <p className="mt-2 max-w-md text-sm leading-6 text-slate-300">
            أدخل بيانات حساب العميل الذي أنشأه مسؤول النظام ومفتاح الترخيص لفتح البرنامج على هذا الجهاز.
          </p>
        </div>

        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-5 px-8 py-7">
          <label className="block space-y-2 text-sm font-bold text-slate-700">
            <span>اسم الحساب</span>
            <span className="relative block">
              <UserIcon size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" dir="ltr" value={account} onChange={(event) => setAccount(event.target.value)} placeholder="fasf" autoComplete="username" disabled={loading} className={inputClass} />
            </span>
          </label>

          <label className="block space-y-2 text-sm font-bold text-slate-700">
            <span>كلمة المرور</span>
            <span className="relative block">
              <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="password" dir="ltr" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••" autoComplete="current-password" disabled={loading} className={inputClass} />
            </span>
          </label>

          <label className="block space-y-2 text-sm font-bold text-slate-700">
            <span>رقم الهاتف</span>
            <span className="relative block">
              <Phone size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="tel" dir="ltr" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="123123" autoComplete="tel" disabled={loading} className={inputClass} />
            </span>
          </label>

          <label className="block space-y-2 text-sm font-bold text-slate-700">
            <span>مفتاح الترخيص</span>
            <span className="relative block">
              <KeyRound size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" dir="ltr" value={activationCode} onChange={(event) => setActivationCode(event.target.value)} placeholder="3123123e12" autoComplete="off" disabled={loading} className={inputClass} />
            </span>
          </label>

          {error && (
            <div dir="ltr" role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-600">
              <span>{error}</span>
              <AlertCircle size={18} className="shrink-0" />
            </div>
          )}

          <button type="submit" disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#22344a] px-5 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-slate-900/20 transition hover:bg-[#2b405a] disabled:cursor-not-allowed disabled:opacity-60">
            {loading ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
            {loading ? 'جارٍ التحقق من البيانات...' : 'تحقق وانتقل لتسجيل الدخول'}
          </button>
          <p className="text-center text-xs leading-5 text-slate-400">
            بعد نجاح التفعيل لن تظهر هذه الصفحة مجددًا على هذا الجهاز.
          </p>
        </form>
      </div>
    </main>
  );
};
