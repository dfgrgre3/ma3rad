import React, { useEffect, useRef, useState } from 'react';
import { Lock, ShieldAlert, CheckCircle2, AlertCircle, Eye, EyeOff, KeyRound, ShieldCheck } from 'lucide-react';
import { AuthService } from '../../services/domains/auth/AuthService';
import { useToast } from '../ui/Toast';
import type { User } from '../../types';

interface ForcePasswordChangeModalProps {
  user: User;
  onSuccess: (updatedUser: User) => void;
}

export const ForcePasswordChangeModal: React.FC<ForcePasswordChangeModalProps> = ({ user, onSuccess }) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const currentPasswordRef = useRef<HTMLInputElement>(null);
  const securityKeyRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const [step, setStep] = useState<'password' | 'security-key'>(
    user.mustChangePassword ? 'password' : 'security-key'
  );
  const [currentPassword, setCurrentPassword] = useState('');
  const [fullName, setFullName] = useState(user.fullName);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [securityKey, setSecurityKey] = useState('');
  const [confirmSecurityKey, setConfirmSecurityKey] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    currentPasswordRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    };
  }, []);

  useEffect(() => {
    if (step === 'security-key') securityKeyRef.current?.focus();
  }, [step]);

  const hasMinLength = newPassword.length >= 8;
  const hasLetters = /[a-zA-Z\u0600-\u06FF]/.test(newPassword);
  const hasNumbers = /[0-9]/.test(newPassword);
  const isNotDefault = newPassword !== 'admin123';
  const passwordsMatch = newPassword === confirmPassword && newPassword.length > 0;
  const isFullNameValid = fullName.trim().length >= 2 && fullName.trim().length <= 100;
  const isValid = isFullNameValid && hasMinLength && hasLetters && hasNumbers && isNotDefault && passwordsMatch;
  const normalizedSecurityKey = securityKey.trim();
  const securityKeyLengthValid = normalizedSecurityKey.length >= 8 && normalizedSecurityKey.length <= 12;
  const securityKeysMatch = normalizedSecurityKey === confirmSecurityKey.trim() && normalizedSecurityKey.length > 0;
  const isSecurityKeyValid = securityKeyLengthValid && securityKeysMatch;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (step === 'security-key') {
      if (!securityKeyLengthValid) {
        setError('يجب أن يتكون مفتاح الأمان من 8 إلى 12 حرفًا.');
        return;
      }
      if (!securityKeysMatch) {
        setError('تأكيد مفتاح الأمان غير مطابق.');
        return;
      }

      setLoading(true);
      try {
        await new AuthService().setOwnSecurityKeyAsync(user.id, normalizedSecurityKey);
        const securedUser: User = {
          ...user,
          fullName: fullName.trim(),
          mustChangePassword: false,
          securityKeySetupRequired: false,
        };
        AuthService.setCurrentUser(securedUser);
        toast.success('تم إنشاء مفتاح الأمان وحفظه بصورة آمنة.');
        onSuccess(securedUser);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'فشل إنشاء مفتاح الأمان');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!isFullNameValid) {
      setError('يجب أن يتكون الاسم المعروض من حرفين إلى 100 حرف.');
      return;
    }

    if (!isValid) {
      setError('يرجى استيفاء جميع شروط كلمة المرور وتطابق التأكيد.');
      return;
    }

    setLoading(true);
    try {
      const authService = new AuthService();
      const savedFullName = fullName.trim();
      await authService.changeOwnPasswordAsync(user.id, currentPassword, newPassword, savedFullName, true);
      toast.success('تم تغيير كلمة المرور. أكمل الآن إنشاء مفتاح الأمان.');
      const updatedUser: User = {
        ...user,
        fullName: savedFullName,
        mustChangePassword: true,
        securityKeySetupRequired: true,
      };
      AuthService.setCurrentUser(updatedUser);
      setStep('security-key');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل تغيير كلمة المرور');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-primary/80 backdrop-blur-md flex items-center justify-center p-4">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="force-password-title" aria-describedby="force-password-description" className="bg-surface border border-warning dark:border-warning/60 rounded-2xl shadow-2xl max-w-md w-full max-h-[92vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
        <div className="bg-gradient-to-r from-warning to-warning px-6 py-5 text-white flex items-center gap-3">
          <div className="p-2.5 bg-surface/20 rounded-xl backdrop-blur-sm">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h2 id="force-password-title" className="text-lg font-bold">
              {step === 'password' ? 'تغيير كلمة المرور الافتراضية' : 'إنشاء مفتاح الأمان'}
            </h2>
            <p id="force-password-description" className="text-xs text-warning">
              {step === 'password' ? 'الخطوة 1 من 2 · تأمين حساب المدير' : 'الخطوة 2 من 2 · أضف طريقة دخول آمنة بديلة'}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4" aria-busy={loading}>
          {step === 'password' ? (
            <>
          <div className="p-3 bg-warning-soft dark:bg-warning/30 border border-warning-border dark:border-warning/40 rounded-xl text-xs text-warning leading-relaxed">
            تم رصد استخدام كلمة المرور الافتراضية (<strong>admin123</strong>) لحساب المدير. يرجى تعيين كلمة مرور قوية لمتابعة العمل على البرنامج.
          </div>

          <div>
            <label htmlFor="display-name" className="block text-xs font-bold text-ink mb-1.5">
              الاسم المعروض
            </label>
            <input
              id="display-name"
              type="text"
              required
              minLength={2}
              maxLength={100}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="أدخل الاسم المعروض"
              className="w-full px-3.5 py-2.5 text-sm bg-surface-muted border border-line-strong rounded-xl focus:outline-none focus:ring-2 focus:ring-warning"
            />
          </div>

          {error && (
            <div role="alert" aria-live="assertive" className="p-3 bg-danger-soft dark:bg-danger/30 border border-danger-border dark:border-danger/40 rounded-xl text-xs text-danger flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label htmlFor="current-password" className="block text-xs font-bold text-ink mb-1.5">
              كلمة المرور الحالية (الافتراضية: admin123)
            </label>
            <div className="relative">
              <input
                ref={currentPasswordRef}
                id="current-password"
                type={showCurrent ? 'text' : 'password'}
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="أدخل كلمة المرور الحالية"
                className="w-full px-3.5 py-2.5 text-sm bg-surface-muted border border-line-strong rounded-xl focus:outline-none focus:ring-2 focus:ring-warning pr-10"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                aria-label={showCurrent ? 'إخفاء كلمة المرور الحالية' : 'إظهار كلمة المرور الحالية'}
                aria-pressed={showCurrent}
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning dark:hover:text-white"
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="new-password" className="block text-xs font-bold text-ink mb-1.5">
              كلمة المرور الجديدة
            </label>
            <div className="relative">
              <input
                id="new-password"
                type={showNew ? 'text' : 'password'}
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="أدخل كلمة مرور قوية"
                className="w-full px-3.5 py-2.5 text-sm bg-surface-muted border border-line-strong rounded-xl focus:outline-none focus:ring-2 focus:ring-warning pr-10"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                aria-label={showNew ? 'إخفاء كلمة المرور الجديدة' : 'إظهار كلمة المرور الجديدة'}
                aria-pressed={showNew}
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning dark:hover:text-white"
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="confirm-password" className="block text-xs font-bold text-ink mb-1.5">
              تأكيد كلمة المرور الجديدة
            </label>
            <input
              id="confirm-password"
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="أعد إدخال كلمة المرور"
              className="w-full px-3.5 py-2.5 text-sm bg-surface-muted border border-line-strong rounded-xl focus:outline-none focus:ring-2 focus:ring-warning pr-10"
            />
          </div>

          <div className="space-y-1.5 pt-1 text-xs">
            <div className={`flex items-center gap-2 ${hasMinLength ? 'text-success dark:text-success' : 'text-muted'}`}>
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>8 أحرف أو أكثر</span>
            </div>
            <div className={`flex items-center gap-2 ${hasLetters && hasNumbers ? 'text-success dark:text-success' : 'text-muted'}`}>
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>تحتوي على حروف وأرقام معاً</span>
            </div>
            <div className={`flex items-center gap-2 ${isNotDefault ? 'text-success dark:text-success' : 'text-muted'}`}>
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>تختلف عن كلمة المرور الافتراضية القديمة</span>
            </div>
            <div className={`flex items-center gap-2 ${passwordsMatch ? 'text-success dark:text-success' : 'text-muted'}`}>
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>تطابق كلمتي المرور</span>
            </div>
          </div>

          <div className="pt-3">
            <button
              type="submit"
              disabled={!isValid || loading}
              className="w-full py-3 bg-warning hover:bg-warning disabled:opacity-50 text-white rounded-xl font-bold text-sm shadow-md transition flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning focus-visible:ring-offset-2"
            >
              <Lock className="w-4 h-4" />
              <span aria-live="polite">{loading ? 'جاري الحفظ...' : 'حفظ كلمة المرور وتأمين النظام'}</span>
            </button>
          </div>
            </>
          ) : (
            <>
              <div className="flex items-start gap-3 rounded-xl border border-warning-border bg-warning-soft p-3 text-xs leading-relaxed text-warning dark:border-warning/50 dark:bg-warning/30 ">
                <KeyRound className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <p>أنشئ مفتاحًا سريًا من 8 إلى 12 حرفًا. سيُحفظ كتجزئة مشفّرة، ويمكن استخدامه لاحقًا بدل اسم المستخدم وكلمة المرور.</p>
              </div>

              <div>
                <label htmlFor="security-key" className="mb-1.5 block text-xs font-bold text-ink ">
                  مفتاح الأمان
                </label>
                <input
                  ref={securityKeyRef}
                  id="security-key"
                  type="password"
                  autoComplete="new-password"
                  maxLength={12}
                  required
                  value={securityKey}
                  onChange={(event) => setSecurityKey(event.target.value)}
                  placeholder="أدخل مفتاحًا من 8 إلى 12 حرفًا"
                  aria-describedby="security-key-guidance"
                  className="w-full rounded-xl border border-line-strong bg-surface-muted px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-warning "
                />
              </div>

              <div>
                <label htmlFor="confirm-security-key" className="mb-1.5 block text-xs font-bold text-ink ">
                  تأكيد مفتاح الأمان
                </label>
                <input
                  id="confirm-security-key"
                  type="password"
                  autoComplete="new-password"
                  maxLength={12}
                  required
                  value={confirmSecurityKey}
                  onChange={(event) => setConfirmSecurityKey(event.target.value)}
                  placeholder="أعد إدخال مفتاح الأمان"
                  className="w-full rounded-xl border border-line-strong bg-surface-muted px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-warning "
                />
              </div>
              <p id="security-key-guidance" className={`text-xs ${securityKeyLengthValid ? 'text-success dark:text-success' : 'text-muted dark:text-muted'}`}>
                <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                من 8 إلى 12 حرفًا
              </p>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={!isSecurityKeyValid || loading}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-warning py-3 text-sm font-bold text-white shadow-md transition hover:bg-warning disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning focus-visible:ring-offset-2"
                >
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  <span aria-live="polite">{loading ? 'جاري الحفظ...' : 'حفظ مفتاح الأمان ومتابعة العمل'}</span>
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
};
