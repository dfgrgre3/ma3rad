import React, { useState } from 'react';
import { AlertCircle, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { CentralLicenseService } from '../../services/CentralLicenseService';
import { CentralConfigApplier } from '../../services/CentralConfigApplier';

interface FirstRunActivationPageProps {
  onSuccess: () => void;
}

function validateServerUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('أدخل رابط خادم ترخيص صحيحًا.');
  }

  const isLocalhost = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocalhost))
    || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('استخدم رابط HTTPS لخادم الترخيص، أو HTTP للاختبار المحلي فقط.');
  }

  return url.origin;
}

export const FirstRunActivationPage: React.FC<FirstRunActivationPageProps> = ({ onSuccess }) => {
  const [serverUrl, setServerUrl] = useState(CentralLicenseService.getServerUrl());
  const [activationCode, setActivationCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;

    setError(null);
    setLoading(true);
    try {
      const normalizedUrl = validateServerUrl(serverUrl);
      const code = activationCode.trim();
      if (!code) throw new Error('أدخل رمز التفعيل.');

      CentralLicenseService.setServerUrl(normalizedUrl);
      const result = await CentralLicenseService.activate(code);
      if (!result.deviceCredential || CentralLicenseService.getCredential() !== result.deviceCredential) {
        throw new Error('الرمز لم يمنح هذا الجهاز صلاحية فتح البرنامج.');
      }

      CentralLicenseService.markFirstRunActivationComplete();
      try {
        await CentralLicenseService.fetchConfig();
        CentralConfigApplier.apply();
      } catch { /* ignore */ }
      onSuccess();
    } catch (activationError) {
      setError(activationError instanceof Error ? activationError.message : 'تعذر التحقق من رمز التفعيل.');
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
            أدخل رمز التفعيل المخصص لك لفتح البرنامج على هذا الجهاز.
          </p>
        </div>

        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-5 p-8">
          <label className="block space-y-2 text-sm font-bold text-slate-700">
            <span>رابط خادم الترخيص</span>
            <input
              type="url"
              dir="ltr"
              value={serverUrl}
              onChange={(event) => setServerUrl(event.target.value)}
              placeholder="https://license.example.com"
              autoComplete="url"
              disabled={loading}
              className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-left text-sm font-normal text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 disabled:opacity-60"
            />
            <span className="block text-xs font-normal leading-5 text-slate-500">
              أدخل عنوان الخادم الذي أصدر رمز التفعيل. يقبل HTTP للاختبار على هذا الجهاز فقط.
            </span>
          </label>

          <label className="block space-y-2 text-sm font-bold text-slate-700">
            <span>رمز التفعيل</span>
            <span className="relative block">
              <KeyRound size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                dir="ltr"
                value={activationCode}
                onChange={(event) => setActivationCode(event.target.value)}
                placeholder="أدخل رمز العميل"
                autoComplete="one-time-code"
                disabled={loading}
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 pl-11 text-left text-sm font-normal text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 disabled:opacity-60"
              />
            </span>
          </label>

          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm leading-6 text-rose-800">
              <AlertCircle size={18} className="mt-1 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-700 px-5 py-3.5 text-sm font-black text-white shadow-lg shadow-sky-900/20 transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
            {loading ? 'جارٍ التحقق من الرمز...' : 'تحقق وانتقل لتسجيل الدخول'}
          </button>
          <p className="text-center text-xs leading-5 text-slate-500">
            بعد نجاح التفعيل لن تظهر هذه الصفحة مجددًا على هذا الجهاز.
          </p>
        </form>
      </div>
    </main>
  );
};
