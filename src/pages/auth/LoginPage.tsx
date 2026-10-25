import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, Lock, User as UserIcon, ShieldCheck, Loader2 } from 'lucide-react';
import { AuthService } from '../../services/AuthService';
import type { User } from '../../types';

interface LoginPageProps {
  onSuccess: (user: User) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberOnDevice, setRememberOnDevice] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const credentialStore = window.ceramisys?.credentials;
    if (!credentialStore?.get) return;

    let mounted = true;
    void credentialStore.get().then((saved) => {
      if (!mounted || !saved?.consented) return;
      setUsername(saved.username);
      setPassword(saved.password);
      setRememberOnDevice(true);
    }).catch((loadError) => {
      console.error('Could not load consented login credentials:', loadError);
    });

    return () => { mounted = false; };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const normalizedUsername = username.trim();
      const user = AuthService.login(normalizedUsername, password);
      const credentialStore = window.ceramisys?.credentials;
      if (rememberOnDevice && credentialStore?.set) {
        try {
          await credentialStore.set(normalizedUsername, password);
        } catch (saveError) {
          console.error('Could not save remembered login credentials:', saveError);
          window.alert('تم تسجيل الدخول، لكن تعذر حفظ بيانات الدخول على هذا الجهاز.');
        }
      } else if (!rememberOnDevice && credentialStore?.clear) {
        try {
          await credentialStore.clear();
        } catch (clearError) {
          console.error('Could not clear remembered login credentials:', clearError);
          window.alert('تم تسجيل الدخول، لكن تعذر حذف بيانات الدخول المحفوظة سابقًا.');
        }
      }
      onSuccess(user);
    } catch (err: any) {
      setError(err?.message || 'تعذر تسجيل الدخول.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-screen flex bg-slate-100 text-slate-900" dir="rtl">
      {/* Brand panel */}
      <div className="hidden lg:flex flex-col justify-between w-[44%] bg-gradient-to-br from-sky-600 via-sky-700 to-indigo-800 text-white p-10 relative overflow-hidden">
        <div className="absolute -top-24 -left-24 w-80 h-80 rounded-full bg-white/10" />
        <div className="absolute bottom-0 right-0 w-96 h-96 rounded-full bg-white/5" />

        <div className="relative flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center font-black text-2xl">
            C
          </div>
          <div>
            <h1 className="text-xl font-black tracking-wide">CeramiSys ERP</h1>
            <p className="text-xs text-sky-100">نظام إدارة معارض السيراميك ومواد التشطيب</p>
          </div>
        </div>

        <div className="relative space-y-4">
          <h2 className="text-3xl font-black leading-snug">
            كل معرضك في مكان واحد
            <br />
            <span className="text-sky-200">مبيعات، مخزون، حسابات وتقارير</span>
          </h2>
          <ul className="space-y-3 text-sm text-sky-50">
            <li className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-sky-300" /> صلاحيات دقيقة لكل موظف وكل وحدة</li>
            <li className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-sky-300" /> يعمل بالكامل بدون اتصال بالإنترنت</li>
            <li className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-sky-300" /> قاعدة بيانات محلية بمعاملات آمنة وسجل تدقيق</li>
          </ul>
        </div>

        <p className="relative text-[11px] text-sky-200">CeramiSys ERP v1.0 — Commercial License</p>
      </div>

      {/* Form panel */}
      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shadow-xl shadow-sky-500/30 text-white font-black text-2xl mb-3">
              C
            </div>
            <h1 className="text-lg font-black">CeramiSys ERP</h1>
            <p className="text-xs text-slate-500">نظام إدارة معارض السيراميك</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl shadow-slate-200/60 p-7">
            <div className="mb-6">
              <h2 className="text-xl font-black text-slate-900">تسجيل الدخول</h2>
              <p className="text-xs text-slate-500 mt-1">أدخل بيانات حسابك للوصول إلى النظام</p>
            </div>

            {error && (
              <div className="mb-4 px-3 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">اسم المستخدم</label>
                <div className="relative">
                  <UserIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    autoFocus
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="admin"
                    className="w-full pr-10 pl-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm font-semibold focus:outline-none focus:border-sky-500 focus:bg-white transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">كلمة المرور</label>
                <div className="relative">
                  <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pr-10 pl-10 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm font-semibold focus:outline-none focus:border-sky-500 focus:bg-white transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-slate-600 transition"
                    aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                <input
                  type="checkbox"
                  checked={rememberOnDevice}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setRememberOnDevice(checked);
                    if (!checked) {
                      void window.ceramisys?.credentials?.clear?.().catch((clearError) => {
                        console.error('Could not clear remembered login credentials:', clearError);
                        setError('تعذر حذف بيانات الدخول المحفوظة من هذا الجهاز.');
                      });
                    }
                  }}
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                تذكرني على هذا الجهاز
              </label>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white text-sm font-bold shadow-lg shadow-sky-600/25 transition active:scale-[0.99]"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {loading ? 'جارٍ تسجيل الدخول...' : 'دخول النظام'}
              </button>
            </form>

            <div className="mt-5 pt-4 border-t border-slate-100 text-center">
              <p className="text-[11px] text-slate-500">
                لأول مرة: استخدم حساب المدير الذي أنشأه مسؤول النظام، ثم غيّر كلمة المرور فورًا من صفحة المستخدمين.
              </p>
              <p className="text-[10px] text-slate-400 mt-1">لن تُعرض بيانات الدخول على الشاشة حفاظًا على أمان النظام.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
