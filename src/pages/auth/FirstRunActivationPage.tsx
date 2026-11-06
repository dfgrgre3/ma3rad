import React, { useState } from 'react';
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

  return (
    <main dir="rtl" className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10">
      <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-white/10 bg-white shadow-2xl">
        <div className="bg-gradient-to-l from-sky-700 to-indigo-800 px-8 py-8 text-white">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15">
            <ShieldCheck size={30} />
          </div>
          <p className="text-sm font-bold text-sky-100">تهيئة لمرة واحدة</p>
          <h1 className="mt-1 text-2xl font-black">تفعيل سيراميسيس</h1>
          <p className="mt-2 text-sm leading-6 text-sky-100">
            أدخل بيانات حساب العميل الذي أنشأه مسؤول النظام ومفتاح الترخيص لفتح البرنامج على هذا الجهاز.
          </p>
        </div>

        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-5 p-8">
          <label className="block space-y-2 text-sm font-bold text-slate-700">
            <span>اسم الحساب</span>
            <span className="relative block">
              <UserIcon size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" dir="ltr" value={account} onChange={(event) => setAccount(event.target.value)} placeholder="account" autoComplete="username" disabled={loading} className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 pl-11 text-left text-sm font-normal text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 disabled:opacity-60" />
            </span>
          </label>

          <label className="block space-y-2 text-sm font-bold text-slate-700">
            <span>كلمة المرور</span>
            <span className="relative block">
              <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="password" dir="ltr" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" autoComplete="current-password" disabled={loading} className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 pl-11 text-left text-sm font-normal text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 disabled:opacity-60" />
            </span>
          </label>

          <label className="block space-y-2 text-sm font-bold text-slate-700">
            <span>رقم الهاتف</span>
            <span className="relative block">
              <Phone size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="tel" dir="ltr" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="01xxxxxxxxx" autoComplete="tel" disabled={loading} className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 pl-11 text-left text-sm font-normal text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 disabled:opacity-60" />
            </span>
          </label>

          <label className="block space-y-2 text-sm font-bold text-slate-700">
            <span>مفتاح الترخيص</span>
            <span className="relative block">
              <KeyRound size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" dir="ltr" value={activationCode} onChange={(event) => setActivationCode(event.target.value)} placeholder="EDAR-XXXX-XXXX-XXXX" autoComplete="off" disabled={loading} className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 pl-11 text-left text-sm font-normal text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 disabled:opacity-60" />
            </span>
          </label>

          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm leading-6 text-rose-800">
              <AlertCircle size={18} className="mt-1 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button type="submit" disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-700 px-5 py-3.5 text-sm font-black text-white shadow-lg shadow-sky-900/20 transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60">
            {loading ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
            {loading ? 'جارٍ التحقق من البيانات...' : 'تحقق وانتقل لتسجيل الدخول'}
          </button>
          <p className="text-center text-xs leading-5 text-slate-500">
            بعد نجاح التفعيل لن تظهر هذه الصفحة مجددًا على هذا الجهاز.
          </p>
        </form>
      </div>
    </main>
  );
};
