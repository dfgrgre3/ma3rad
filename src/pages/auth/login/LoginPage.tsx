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
  KeyRound,
} from 'lucide-react';
import {
  AuthService,
  SECURITY_KEY_LOGIN_GUARD_KEY,
  TwoFactorRequiredError,
  type LoginGuardStatus,
} from '../../../services/domains/auth/AuthService';
import type { User } from '../../../types';
import { LoginBrandPanel } from './LoginBrandPanel';

interface LoginPageProps {
  onSuccess: (user: User) => void;
}

type FieldErrors = { username?: string; password?: string; pinCode?: string; securityKey?: string };

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
  const pinRef = useRef<HTMLInputElement>(null);
  const securityKeyRef = useRef<HTMLInputElement>(null);
  const twoFactorRef = useRef<HTMLInputElement>(null);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pinCode, setPinCode] = useState('');
  const [securityKey, setSecurityKey] = useState('');
  const [loginMethod, setLoginMethod] = useState<'password' | 'pin' | 'security-key'>('password');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [twoFactorRequired, setTwoFactorRequired] = useState(false);
  const [rememberOnDevice, setRememberOnDevice] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);
  const [guard, setGuard] = useState<LoginGuardStatus>(EMPTY_GUARD);
  const [now, setNow] = useState(() => Date.now());
  const [loginPinLength, setLoginPinLength] = useState(4);

  useEffect(() => {
    setLoginPinLength(AuthService.getLoginPinLength());
  }, []);

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
      setGuard(AuthService.getLoginGuardStatus(
        loginMethod === 'pin' ? '__PIN_LOGIN__'
          : loginMethod === 'security-key' ? SECURITY_KEY_LOGIN_GUARD_KEY : username.trim()
      ));
      setError(null);
    }
  }, [guard.isLocked, lockedRemainingMs, username, loginMethod]);

  // Changing the credentials invalidates any pending second-factor challenge.
  useEffect(() => {
    setTwoFactorRequired(false);
    setTwoFactorCode('');
  }, [username, password]);

  useEffect(() => {
    if (twoFactorRequired) twoFactorRef.current?.focus();
  }, [twoFactorRequired]);

  const clearFieldError = (field: keyof FieldErrors) => {
    setFieldErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
    setError(null);
  };

  const validate = useCallback((): boolean => {
    const next: FieldErrors = {};
    if (loginMethod === 'pin') {
      if (!pinCode.trim()) next.pinCode = 'أدخل رمز الدخول.';
    } else if (loginMethod === 'security-key') {
      if (!securityKey.trim()) next.securityKey = 'أدخل مفتاح الأمان.';
    } else {
      if (!username.trim()) next.username = 'أدخل اسم المستخدم.';
      if (!password) next.password = 'أدخل كلمة المرور.';
    }
    setFieldErrors(next);

    if (next.pinCode) {
      pinRef.current?.focus();
      return false;
    }
    if (next.securityKey) {
      securityKeyRef.current?.focus();
      return false;
    }
    if (next.username) {
      usernameRef.current?.focus();
      return false;
    }
    if (next.password) {
      passwordRef.current?.focus();
      return false;
    }
    return true;
  }, [loginMethod, username, password, pinCode, securityKey]);

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
    if (twoFactorRequired) {
      if (!twoFactorCode.trim()) {
        setError('أدخل رمز التحقق الثنائي.');
        twoFactorRef.current?.focus();
        return;
      }
    } else if (!validate()) {
      return;
    }

    setError(null);
    setLoading(true);
    const normalizedUsername = username.trim();

    try {
      const user = loginMethod === 'pin'
        ? AuthService.loginByPin(pinCode.trim())
        : loginMethod === 'security-key'
          ? AuthService.loginBySecurityKey(securityKey.trim())
          : await AuthService.loginAsync(
          normalizedUsername,
          password,
          twoFactorRequired ? twoFactorCode : undefined
        );
      setTwoFactorRequired(false);
      setTwoFactorCode('');
      onSuccess(user);

      const credentialStore = window.ceramisys?.credentials;

      if (loginMethod === 'password' && rememberOnDevice && credentialStore?.set) {
        void credentialStore.set(normalizedUsername, password).catch((saveError) => {
          console.error('Could not save remembered login credentials:', saveError);
          window.alert('تم تسجيل الدخول، لكن تعذر حفظ بيانات الدخول على هذا الجهاز.');
        });
      } else if (loginMethod === 'password' && !rememberOnDevice && credentialStore?.clear) {
        void credentialStore.clear().catch((clearError) => {
          console.error('Could not clear remembered login credentials:', clearError);
          window.alert('تم تسجيل الدخول، لكن تعذر حذف بيانات الدخول المحفوظة سابقًا.');
        });
      }
    } catch (err: any) {
      if (err instanceof TwoFactorRequiredError || err?.code === 'TWO_FACTOR_REQUIRED') {
        // Password accepted; ask for the one-time code without reporting an error.
        setTwoFactorRequired(true);
        setTwoFactorCode('');
        setError(null);
        return;
      }

      const message = err?.message || 'تعذر تسجيل الدخول.';
      setError(message);

      // Refresh the lockout state so the UI can show remaining attempts or a countdown.
      const guardKey = loginMethod === 'pin' ? '__PIN_LOGIN__'
        : loginMethod === 'security-key' ? SECURITY_KEY_LOGIN_GUARD_KEY : normalizedUsername;
      const nextGuard = AuthService.getLoginGuardStatus(guardKey);
      setGuard(nextGuard);
      setNow(Date.now());
      if (nextGuard.isLocked) {
        setPassword('');
        setPinCode('');
        setSecurityKey('');
      }

      if (loginMethod === 'pin') {
        pinRef.current?.focus();
        pinRef.current?.select();
      } else if (loginMethod === 'security-key') {
        securityKeyRef.current?.focus();
        securityKeyRef.current?.select();
      } else {
        passwordRef.current?.focus();
        passwordRef.current?.select();
      }
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
      className="win-auth flex min-h-screen w-screen"
      dir="rtl"
    >
      <LoginBrandPanel />

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-[380px]">
          <div className="mb-6 flex flex-col items-center lg:hidden">
            <div className="win-auth-brand-mark mb-2 flex h-12 w-12 items-center justify-center text-xl font-bold text-white">
              س
            </div>
            <h1 className="text-[15px] font-semibold">سيراميسيس</h1>
            <p className="mt-0.5 text-xs text-[var(--win-text-muted)]">نظام إدارة معارض السيراميك</p>
          </div>

          <div className="win-auth-card">
            <div className="win-auth-card-head">
              <h2 className="text-[18px] font-semibold text-[var(--win-text)]">تسجيل الدخول</h2>
              <p className="mt-1 text-xs text-[var(--win-text-muted)]">
                أدخل بيانات حسابك أو رمز الدخول للوصول إلى النظام
              </p>
            </div>

            <form onSubmit={handleSubmit} noValidate className="space-y-4 px-6 py-5" aria-busy={loading}>
              {!twoFactorRequired && (
                <div className="grid grid-cols-3 gap-1 rounded-[2px] border border-[#d9d9d9] bg-[#f5f5f5] p-1 dark:border-[#4a4a4a] dark:bg-[#252525]">
                  <button
                    type="button"
                    onClick={() => {
                      setLoginMethod('password');
                      setGuard(AuthService.getLoginGuardStatus(username.trim()));
                      setError(null);
                      setFieldErrors({});
                    }}
                    aria-pressed={loginMethod === 'password'}
                    className={`rounded-[2px] px-1.5 py-1.5 text-[11px] font-semibold ${loginMethod === 'password' ? 'bg-white text-[#0078d4] shadow-sm dark:bg-[#3a3a3a]' : 'text-[var(--win-text-muted)]'}`}
                  >
                    اسم المستخدم وكلمة المرور
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLoginMethod('pin');
                      setGuard(AuthService.getLoginGuardStatus('__PIN_LOGIN__'));
                      setError(null);
                      setFieldErrors({});
                    }}
                    aria-pressed={loginMethod === 'pin'}
                    className={`rounded-[2px] px-1.5 py-1.5 text-[11px] font-semibold ${loginMethod === 'pin' ? 'bg-white text-[#0078d4] shadow-sm dark:bg-[#3a3a3a]' : 'text-[var(--win-text-muted)]'}`}
                  >
                    رمز الدخول
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLoginMethod('security-key');
                      setGuard(AuthService.getLoginGuardStatus(SECURITY_KEY_LOGIN_GUARD_KEY));
                      setError(null);
                      setFieldErrors({});
                    }}
                    aria-pressed={loginMethod === 'security-key'}
                    className={`rounded-[2px] px-1.5 py-1.5 text-[11px] font-semibold ${loginMethod === 'security-key' ? 'bg-white text-[#0078d4] shadow-sm dark:bg-[#3a3a3a]' : 'text-[var(--win-text-muted)]'}`}
                  >
                    مفتاح الأمان
                  </button>
                </div>
              )}
              {error && (
                <div
                  role="alert"
                  aria-live="assertive"
                  className="flex items-start gap-2 border border-[#e4c6c2] border-r-[3px] border-r-[#a8413e] bg-[#f6e9e7] px-3 py-2 text-xs font-semibold text-[#8f3937] dark:border-[#65413e] dark:bg-[#412c2a] dark:text-[#e3a09b]"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              {guard.isLocked && (
                <div
                  role="status"
                  aria-live="polite"
                  className="flex items-start gap-2 border border-[var(--win-warning-border)] border-r-[3px] border-r-[var(--win-warning)] bg-[var(--win-warning-soft)] px-3 py-2 text-xs text-[var(--win-warning-text)] dark:text-[#ddc184]"
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
                <p className="text-xs text-[#855e27] dark:text-[#ddc184]">
                  المحاولات المتبقية قبل الإيقاف المؤقت: <strong>{guard.remainingAttempts}</strong>
                </p>
              )}

              {loginMethod === 'password' && (
                <div>
                  <label
                    htmlFor="username"
                    className="mb-1 block text-[11.5px] font-semibold text-[#1b1b1b] dark:text-[#f0f0f0]"
                  >
                    اسم المستخدم
                  </label>
                  <div className="relative">
                    <UserIcon
                      className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--win-text-muted)]"
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
                      disabled={loading || twoFactorRequired}
                      value={username}
                      onChange={(e) => {
                        setUsername(e.target.value);
                        clearFieldError('username');
                      }}
                      placeholder="admin"
                      aria-invalid={Boolean(fieldErrors.username)}
                      aria-describedby={fieldErrors.username ? 'username-error' : undefined}
                      className={`win-input w-full pl-2 pr-8 text-[12.5px] text-left disabled:opacity-60 ${
                        fieldErrors.username ? 'border-[#a8413e] dark:border-[#e3a09b]' : ''
                      }`}
                    />
                  </div>
                  {fieldErrors.username && (
                    <p id="username-error" role="alert" className="mt-1 text-xs text-[#a8413e] dark:text-[#e3a09b]">
                      {fieldErrors.username}
                    </p>
                  )}
                </div>
              )}

              {loginMethod === 'pin' && !twoFactorRequired && (
                <div>
                  <label htmlFor="login-pin" className="mb-1 block text-[11.5px] font-semibold text-[#1b1b1b] dark:text-[#f0f0f0]">
                    رمز الدخول الشخصي
                  </label>
                  <input
                    ref={pinRef}
                    id="login-pin"
                    type="password"
                    dir="ltr"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={8}
                    disabled={loading}
                    value={pinCode}
                    onChange={(event) => {
                      setPinCode(event.target.value.replace(/\D/g, ''));
                      clearFieldError('pinCode');
                    }}
                    placeholder={`${'•'.repeat(loginPinLength)}`}
                    aria-invalid={Boolean(fieldErrors.pinCode)}
                    aria-describedby={fieldErrors.pinCode ? 'login-pin-error' : undefined}
                    className={`win-input w-full text-center font-mono text-[16px] tracking-[0.3em] disabled:opacity-60 ${
                      fieldErrors.pinCode ? 'border-[#a8413e] dark:border-[#e3a09b]' : ''
                    }`}
                  />
                  {fieldErrors.pinCode && (
                    <p id="login-pin-error" role="alert" className="mt-1 text-xs text-[#a8413e] dark:text-[#e3a09b]">
                      {fieldErrors.pinCode}
                    </p>
                  )}
                  <p className="mt-1 text-[10px] text-[var(--win-text-muted)]">
                    أدخل رمز الدخول الذي عيّنه المدير أو وافق عليه.
                  </p>
                </div>
              )}

              {loginMethod === 'security-key' && !twoFactorRequired && (
                <div>
                  <label htmlFor="login-security-key" className="mb-1 block text-[11.5px] font-semibold text-[#1b1b1b] dark:text-[#f0f0f0]">
                    مفتاح الأمان
                  </label>
                  <div className="relative">
                    <KeyRound
                      className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--win-text-muted)]"
                      aria-hidden="true"
                    />
                    <input
                      ref={securityKeyRef}
                      id="login-security-key"
                      type="password"
                      dir="ltr"
                      autoComplete="off"
                      maxLength={12}
                      disabled={loading}
                      value={securityKey}
                      onChange={(event) => {
                        setSecurityKey(event.target.value);
                        clearFieldError('securityKey');
                      }}
                      placeholder="••••••••"
                      aria-invalid={Boolean(fieldErrors.securityKey)}
                      aria-describedby={fieldErrors.securityKey ? 'login-security-key-error' : undefined}
                      className={`win-input w-full pl-2 pr-8 text-left disabled:opacity-60 ${
                        fieldErrors.securityKey ? 'border-[#a8413e] dark:border-[#e3a09b]' : ''
                      }`}
                    />
                  </div>
                  {fieldErrors.securityKey && (
                    <p id="login-security-key-error" role="alert" className="mt-1 text-xs text-[#a8413e] dark:text-[#e3a09b]">
                      {fieldErrors.securityKey}
                    </p>
                  )}
                  <p className="mt-1 text-[10px] text-[var(--win-text-muted)]">
                    أدخل مفتاح الأمان الذي أنشأته عند إعداد الحساب.
                  </p>
                </div>
              )}

              {twoFactorRequired && (
                <div>
                  <div
                    role="status"
                    aria-live="polite"
                    className="mb-3 flex items-start gap-2 border border-[var(--win-accent-border)] border-r-[3px] border-r-[var(--win-accent)] bg-[var(--win-accent-soft)] px-3 py-2 text-xs text-[var(--win-accent-pressed)] dark:border-[#285552] dark:text-[#88c9bd]"
                  >
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>أدخل رمز التحقق المكوّن من 6 أرقام من تطبيق المصادقة، أو رمز استرداد.</span>
                  </div>
                  <label
                    htmlFor="two-factor-code"
                    className="mb-1 block text-[11.5px] font-semibold text-[#1b1b1b] dark:text-[#f0f0f0]"
                  >
                    رمز التحقق الثنائي
                  </label>
                  <input
                    ref={twoFactorRef}
                    id="two-factor-code"
                    type="text"
                    dir="ltr"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={20}
                    disabled={loading}
                    value={twoFactorCode}
                    onChange={(e) => {
                      setTwoFactorCode(e.target.value);
                      setError(null);
                    }}
                    placeholder="000000"
                    className="win-input w-full px-2 text-center font-mono text-[15px] tracking-[0.3em] disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setTwoFactorRequired(false);
                      setTwoFactorCode('');
                      setError(null);
                      passwordRef.current?.focus();
                    }}
                    disabled={loading}
                    className="mt-2 text-xs font-semibold text-[var(--win-accent)] underline-offset-2 hover:underline disabled:opacity-50"
                  >
                    العودة إلى بيانات الدخول
                  </button>
                </div>
              )}

              {!twoFactorRequired && loginMethod === 'password' && (
              <div>
                <label
                  htmlFor="password"
                  className="mb-1 block text-[11.5px] font-semibold text-[#1b1b1b] dark:text-[#f0f0f0]"
                >
                  كلمة المرور
                </label>
                <div className="relative">
                  <Lock
                    className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--win-text-muted)]"
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
                    className={`win-input w-full pl-10 pr-8 text-[12.5px] text-left disabled:opacity-60 ${
                      fieldErrors.password ? 'border-[#a8413e] dark:border-[#e3a09b]' : ''
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    disabled={loading}
                    className="absolute left-1.5 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-[2px] bg-transparent p-1 text-[var(--win-text-muted)] transition-colors hover:bg-[var(--win-surface-sunken)] hover:text-[var(--win-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--win-accent)] disabled:opacity-50"
                    aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
                {fieldErrors.password && (
                  <p id="password-error" role="alert" className="mt-1 text-xs text-[#a8413e] dark:text-[#e3a09b]">
                    {fieldErrors.password}
                  </p>
                )}
                {capsLockOn && !fieldErrors.password && (
                  <p role="status" className="mt-1 flex items-center gap-1 text-xs text-[#855e27] dark:text-[#ddc184]">
                    <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
                    مفتاح Caps Lock مُفعّل
                  </p>
                )}
              </div>
              )}

              {!twoFactorRequired && loginMethod === 'password' && (
              <label className="flex items-start gap-2 text-xs font-medium text-[var(--win-text-secondary)]">
                <input
                  type="checkbox"
                  checked={rememberOnDevice}
                  disabled={loading}
                  onChange={(event) => handleRememberChange(event.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--win-accent)]"
                />
                <span>
                  تذكرني على هذا الجهاز
                  <span className="mt-1 block text-xs font-normal text-[var(--win-text-muted)]">
                    تُحفظ بيانات الدخول مشفّرة على هذا الجهاز فقط.
                  </span>
                </span>
              </label>
              )}

              <button
                type="submit"
                disabled={submitDisabled}
                aria-live="polite"
                className="win-btn win-btn--primary flex w-full items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
                {loading ? 'جارٍ تسجيل الدخول...' : twoFactorRequired ? 'تحقق ودخول' : 'دخول النظام'}
              </button>

              <p className="text-center text-xs text-[var(--win-text-muted)]">
                اضغط <kbd className="win-auth-kbd">إدخال</kbd> للدخول
              </p>
            </form>

            <div className="win-auth-card-foot">
              <p className="text-xs leading-relaxed text-[var(--win-text-secondary)]">
                لأول مرة: استخدم حساب المدير الذي أنشأه مسؤول النظام، ثم غيّر كلمة المرور فورًا من صفحة المستخدمين.
              </p>
            </div>
          </div>

          <p className="mt-4 text-center text-xs text-[var(--win-text-muted)]">
            لن تُعرض بيانات الدخول على الشاشة حفاظًا على أمان النظام.
          </p>
        </div>
      </div>
    </div>
  );
};
