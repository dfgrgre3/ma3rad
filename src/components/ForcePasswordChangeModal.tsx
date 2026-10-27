import React, { useEffect, useRef, useState } from 'react';
import { Lock, ShieldAlert, CheckCircle2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { AuthService } from '../services/AuthService';
import { useToast } from './ui/Toast';
import type { User } from '../types';

interface ForcePasswordChangeModalProps {
  user: User;
  onSuccess: (updatedUser: User) => void;
}

export const ForcePasswordChangeModal: React.FC<ForcePasswordChangeModalProps> = ({ user, onSuccess }) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const currentPasswordRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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

  const hasMinLength = newPassword.length >= 8;
  const hasLetters = /[a-zA-Z\u0600-\u06FF]/.test(newPassword);
  const hasNumbers = /[0-9]/.test(newPassword);
  const isNotDefault = newPassword !== 'admin123';
  const passwordsMatch = newPassword === confirmPassword && newPassword.length > 0;
  const isValid = hasMinLength && hasLetters && hasNumbers && isNotDefault && passwordsMatch;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isValid) {
      setError('يرجى استيفاء جميع شروط كلمة المرور وتطابق التأكيد.');
      return;
    }

    setLoading(true);
    try {
      const authService = new AuthService();
      authService.changeOwnPassword(user.id, currentPassword, newPassword);
      toast.success('تم تغيير كلمة المرور بنجاح وتم تأمين حساب المدير.');
      const updatedUser: User = { ...user, mustChangePassword: false };
      AuthService.setCurrentUser(updatedUser);
      onSuccess(updatedUser);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل تغيير كلمة المرور');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="force-password-title" aria-describedby="force-password-description" className="bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700/60 rounded-2xl shadow-2xl max-w-md w-full max-h-[92vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
        <div className="bg-gradient-to-r from-amber-500 to-amber-600 px-6 py-5 text-white flex items-center gap-3">
          <div className="p-2.5 bg-white/20 rounded-xl backdrop-blur-sm">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h2 id="force-password-title" className="text-lg font-bold">تغيير كلمة المرور الافتراضية</h2>
            <p id="force-password-description" className="text-xs text-amber-100">إجراء أمني إلزامي لتأمين النظام وقاعدة البيانات</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4" aria-busy={loading}>
          <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-xl text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
            تم رصد استخدام كلمة المرور الافتراضية (<strong>admin123</strong>) لحساب المدير. يرجى تعيين كلمة مرور قوية لمتابعة العمل على البرنامج.
          </div>

          {error && (
            <div role="alert" aria-live="assertive" className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/40 rounded-xl text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label htmlFor="current-password" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
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
                className="w-full px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                aria-label={showCurrent ? 'إخفاء كلمة المرور الحالية' : 'إظهار كلمة المرور الحالية'}
                aria-pressed={showCurrent}
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:text-slate-300 dark:hover:text-white"
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="new-password" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
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
                className="w-full px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                aria-label={showNew ? 'إخفاء كلمة المرور الجديدة' : 'إظهار كلمة المرور الجديدة'}
                aria-pressed={showNew}
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:text-slate-300 dark:hover:text-white"
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="confirm-password" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              تأكيد كلمة المرور الجديدة
            </label>
            <input
              id="confirm-password"
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="أعد إدخال كلمة المرور"
              className="w-full px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 pr-10"
            />
          </div>

          <div className="space-y-1.5 pt-1 text-xs">
            <div className={`flex items-center gap-2 ${hasMinLength ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>8 أحرف أو أكثر</span>
            </div>
            <div className={`flex items-center gap-2 ${hasLetters && hasNumbers ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>تحتوي على حروف وأرقام معاً</span>
            </div>
            <div className={`flex items-center gap-2 ${isNotDefault ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>تختلف عن كلمة المرور الافتراضية القديمة</span>
            </div>
            <div className={`flex items-center gap-2 ${passwordsMatch ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>تطابق كلمتي المرور</span>
            </div>
          </div>

          <div className="pt-3">
            <button
              type="submit"
              disabled={!isValid || loading}
              className="w-full py-3 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl font-bold text-sm shadow-md transition flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
            >
              <Lock className="w-4 h-4" />
              <span aria-live="polite">{loading ? 'جاري الحفظ...' : 'حفظ كلمة المرور وتأمين النظام'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
