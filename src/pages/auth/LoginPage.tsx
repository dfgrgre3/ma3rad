import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Eye,
  EyeOff,
  Lock,
  Loader2,
  ShieldCheck,
  User as UserIcon,
} from 'lucide-react';
import { AuthService, type LoginGuardStatus } from '../../services/AuthService';
import type { User } from '../../types';
import { LoginBrandPanel } from './LoginBrandPanel';

interface LoginPageProps {
  onSuccess: (user: User) => void;
}

type FieldErrors = { username?: string; password?: string };

const EMPTY_GUARD: LoginGuardStatus = {
  maxAttempts: 0,
  failedAttempts: 0,
  remainingAttempts: null,
  isLocked: false,
  lockedUntil: null,
  windowMinutes: 15,
};

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onSuccess }) => {
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberOnDevice, setRememberOnDevice] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);
  const [guard, setGuard] = useState<LoginGuardStatus>(EMPTY_GUARD);
  const [now, setNow] = useState(() => Date.now());

  // Restore device-remembered credentials (only when the user previously consented).
  useEffect(() => {
    const credentialStore = window.ceramisys?.credentials;
    if (!credentialStore?.get) {
      usernameRef.current?.focus();
      return;
    }

    let mounted = true;
    void credentialStore.get().then((saved) => {
      if (!mounted) return;
      if (!saved?.consented) {
        usernameRef.current?.focus();
        return;
      }
      setUsername(saved.username);
      setPassword(saved.password);
      setRememberOnDevice(true);
      setGuard(AuthService.getLoginGuardStatus(saved.username));
      // The username is already filled, so start at the password field.
      passwordRef.current?.focus();
      passwordRef.current?.select();
    }).catch((loadError) => {
      console.error('Could not load consented login credentials:', loadError);
      if (mounted) usernameRef.current?.focus();
    });

    return () => { mounted = false; };
  }, []);

  // Live countdown while the account is temporarily locked.
  useEffect(() => {
    if (!guard.isLocked) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [guard.isLocked]);

  const lockedRemainingMs = useMemo(() => {
    if (!guard.isLocked || !guard.lockedUntil) return 0;
    return Math.max(0, new Date(guard.lockedUntil).getTime() - now);
  }, [guard.isLocked, guard.lockedUntil, now]);

  useEffect(() => {
    if (guard.isLocked && lockedRemainingMs === 0) {
      // The window elapsed — re-read the guard so the form unlocks.
      setGuard(AuthService.getLoginGuardStatus(username.trim()));
      setError(null);
    }
  }, [guard.isLocked, lockedRemainingMs, username]);

  const clearFieldError = (field: keyof FieldErrors) => {
    setFieldErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
    setError(null);
  };

  const validate = useCallback((): boolean => {
    const next: FieldErrors = {};
    if (!username.trim()) next.username = 'أدخل اسم المستخدم.';
    if (!password) next.password = 'أدخل كلمة المرور.';
    setFieldErrors(next);

    if (next.username) {
      usernameRef.current?.focus();
      return false;
    }
    if (next.password) {
      passwordRef.current?.focus();
      return false;
    }
    return true;
  }, [username, password]);

  const updateCapsLock = (event: React.KeyboardEvent<HTMLInputElement>) => {
    try {
      setCapsLockOn(event.getModifierState('CapsLock'));
    } catch {
      setCapsLockOn(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || guard.isLocked) return;
    if (!validate()) return;

    setError(null);
    setLoading(true);
    const normalizedUsername = username.trim();

    try {
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
      const message = err?.message || 'تعذر تسجيل الدخول.';
      setError(message);

      // Refresh the lockout state so the UI can show remaining attempts or a countdown.
      const nextGuard = AuthService.getLoginGuardStatus(normalizedUsername);
      setGuard(nextGuard);
      setNow(Date.now());
      if (nextGuard.isLocked) setPassword('');

      passwordRef.current?.focus();
      passwordRef.current?.select();
    } finally {
      setLoading(false);
    }
  };

  const handleRememberChange = (checked: boolean) => {
    setRememberOnDevice(checked);
    if (!checked) {
      void window.ceramisys?.credentials?.clear?.().catch((clearError) => {
        console.error('Could not clear remembered login credentials:', clearError);
        setError('تعذر حذف بيانات الدخول المحفوظة من هذا الجهاز.');
      });
    }
  };

  const submitDisabled = loading || guard.isLocked;
  const showAttemptsHint = !guard.isLocked && (guard.remainingAttempts ?? 0) > 0
    && guard.remainingAttempts !== guard.maxAttempts;

  return (
    <div
      className="win-auth flex min-h-screen w-screen bg-[#f3f3f3] text-[#1b1b1b] dark:bg-[#1f1f1f] dark:text-[#f0f0f0]"
      dir="rtl"
    >
      <LoginBrandPanel />

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-[380px]">
          <div className="mb-6 flex flex-col items-center lg:hidden">
            <div className="mb-2 flex h-12 w-12 items-center justify-center border border-[#005a9e] bg-[#0078d4] text-xl font-bold text-white">
              C
            </div>
            <h1 className="text-[15px] font-semibold">CeramiSys ERP</h1>
            <p className="text-[11px] text-[#767676] dark:text-[#a6a6a6]">نظام إدارة معارض السيراميك</p>
          </div>

          <div className="border border-[#d9d9d9] bg-white dark:border-[#3d3d3d] dark:bg-[#2b2b2b]">
            <div className="border-b border-[#e5e5e5] px-6 py-5 dark:border-[#3d3d3d]">
              <h2 className="text-[18px] font-semibold text-[#1b1b1b] dark:text-[#f0f0f0]">تسجيل الدخول</h2>
              <p className="mt-1 text-[11.5px] text-[#767676] dark:text-[#a6a6a6]">
                أدخل بيانات حسابك للوصول إلى النظام
              </p>
            </div>

            <form onSubmit={handleSubmit} noValidate className="space-y-4 px-6 py-5" aria-busy={loading}>
              {error && (
                <div
                  role="alert"
                  aria-live="assertive"
                  className="flex items-start gap-2 border border-[#e5b8b3] border-r-[3px] border-r-[#c42b1c] bg-[#fdf3f2] px-3 py-2 text-[11.5px] font-semibold text-[#a4262c] dark:border-[#5a2a2a] dark:bg-[#3a2626] dark:text-[#f1707b]"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              {guard.isLocked && (
                <div
                  role="status"
                  aria-live="polite"
                  className="flex items-start gap-2 border border-[#f0d58c] border-r-[3px] border-r-[#9d5d00] bg-[#fff8e6] px-3 py-2 text-[11.5px] text-[#7a4a00] dark:border-[#5c4620] dark:bg-[#3a3221] dark:text-[#f0c674]"
                >
                  <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    الحساب مقفل مؤقتًا. يمكنك المحاولة مجددًا بعد{' '}
                    <span dir="ltr" className="inline-block font-mono font-bold tabular-nums">
                      {formatCountdown(lockedRemainingMs)}
                    </span>
                    .
                  </span>
                </div>
              )}

              {showAttemptsHint && (
                <p className="text-[11px] text-[#9d5d00] dark:text-[#f0c674]">
                  المحاولات المتبقية قبل الإيقاف المؤقت: <strong>{guard.remainingAttempts}</strong>
                </p>
              )}

              <div>
                <label
                  htmlFor="username"
                  className="mb-1 block text-[11.5px] font-semibold text-[#1b1b1b] dark:text-[#f0f0f0]"
                >
                  اسم المستخدم
                </label>
                <div className="relative">
                  <UserIcon
                    className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#767676]"
                    aria-hidden="true"
                  />
                  <input
                    ref={usernameRef}
                    id="username"
                    type="text"
                    dir="ltr"
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    disabled={loading}
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      clearFieldError('username');
                    }}
                    placeholder="admin"
                    aria-invalid={Boolean(fieldErrors.username)}
                    aria-describedby={fieldErrors.username ? 'username-error' : undefined}
                    className={`win-input w-full pl-2 pr-8 text-[12.5px] text-left disabled:opacity-60 ${
                      fieldErrors.username ? 'border-[#c42b1c] dark:border-[#f1707b]' : ''
                    }`}
                  />
                </div>
                {fieldErrors.username && (
                  <p id="username-error" role="alert" className="mt-1 text-[11px] text-[#c42b1c] dark:text-[#f1707b]">
                    {fieldErrors.username}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="mb-1 block text-[11.5px] font-semibold text-[#1b1b1b] dark:text-[#f0f0f0]"
                >
                  كلمة المرور
                </label>
                <div className="relative">
                  <Lock
                    className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#767676]"
                    aria-hidden="true"
                  />
                  <input
                    ref={passwordRef}
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    dir="ltr"
                    autoComplete="current-password"
                    disabled={loading}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      clearFieldError('password');
                    }}
                    onKeyDown={updateCapsLock}
                    onKeyUp={updateCapsLock}
                    onBlur={() => setCapsLockOn(false)}
                    placeholder="••••••••"
                    aria-invalid={Boolean(fieldErrors.password)}
                    aria-describedby={fieldErrors.password ? 'password-error' : undefined}
                    className={`win-input w-full pl-8 pr-8 text-[12.5px] text-left disabled:opacity-60 ${
                      fieldErrors.password ? 'border-[#c42b1c] dark:border-[#f1707b]' : ''
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    disabled={loading}
                    className="absolute left-1.5 top-1/2 -translate-y-1/2 rounded-[2px] p-1 text-[#767676] hover:bg-[#f0f0f0] hover:text-[#1b1b1b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0078d4] disabled:opacity-50 dark:hover:bg-[#3a3a3a] dark:hover:text-[#f0f0f0]"
                    aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
                {fieldErrors.password && (
                  <p id="password-error" role="alert" className="mt-1 text-[11px] text-[#c42b1c] dark:text-[#f1707b]">
                    {fieldErrors.password}
                  </p>
                )}
                {capsLockOn && !fieldErrors.password && (
                  <p role="status" className="mt-1 flex items-center gap-1 text-[11px] text-[#9d5d00] dark:text-[#f0c674]">
                    <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
                    مفتاح Caps Lock مُفعّل
                  </p>
                )}
              </div>

              <label className="flex items-start gap-2 text-[11.5px] font-medium text-[#4d4d4d] dark:text-[#c8c8c8]">
                <input
                  type="checkbox"
                  checked={rememberOnDevice}
                  disabled={loading}
                  onChange={(event) => handleRememberChange(event.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[#0078d4]"
                />
                <span>
                  تذكرني على هذا الجهاز
                  <span className="mt-0.5 block text-[10.5px] font-normal text-[#767676] dark:text-[#a6a6a6]">
                    تُحفظ بيانات الدخول مشفّرة على هذا الجهاز فقط.
                  </span>
                </span>
              </label>

              <button
                type="submit"
                disabled={submitDisabled}
                aria-live="polite"
                className="win-btn win-btn--primary flex w-full items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
                {loading ? 'جارٍ تسجيل الدخول...' : 'دخول النظام'}
              </button>

              <p className="text-center text-[10px] text-[#767676] dark:text-[#a6a6a6]">
                اضغط <kbd className="border border-[#d9d9d9] bg-[#fafafa] px-1 font-mono text-[10px] dark:border-[#565656] dark:bg-[#323232]">Enter</kbd> للدخول
              </p>
            </form>

            <div className="border-t border-[#e5e5e5] bg-[#fafafa] px-6 py-3 dark:border-[#3d3d3d] dark:bg-[#272727]">
              <p className="text-[10.5px] leading-relaxed text-[#767676] dark:text-[#a6a6a6]">
                لأول مرة: استخدم حساب المدير الذي أنشأه مسؤول النظام، ثم غيّر كلمة المرور فورًا من صفحة المستخدمين.
              </p>
            </div>
          </div>

          <p className="mt-4 text-center text-[10px] text-[#999] dark:text-[#8a8a8a]">
            لن تُعرض بيانات الدخول على الشاشة حفاظًا على أمان النظام.
          </p>
        </div>
      </div>
    </div>
  );
};
