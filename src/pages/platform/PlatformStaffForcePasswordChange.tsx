import React, { useEffect, useRef, useState } from 'react';
import { Lock, ShieldAlert, CheckCircle2, Eye, EyeOff, KeyRound } from 'lucide-react';
import { platformAdminService } from '../../services/domains/platform/PlatformAdminService';
import type { User } from '../../types';

interface Props {
  currentUser: User;
}

/**
 * Blocking overlay shown to platform staff whose account is flagged with
 * must_change_password (first login, admin reset, policy). The ERP
 * ForcePasswordChangeModal targets the `users` table and cannot serve staff
 * accounts, so staff get this dedicated flow backed by the staff service.
 * The overlay cannot be dismissed until the password is changed.
 */
export const PlatformStaffForcePasswordChange: React.FC<Props> = ({ currentUser }) => {
  const currentRef = useRef<HTMLInputElement>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    currentRef.current?.focus();
    // Prevent keyboard navigation escaping the overlay.
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Tab') event.preventDefault();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const hasMinLength = newPassword.length >= 8;
  const hasLetters = /[a-zA-Z\u0600-\u06FF]/.test(newPassword);
  const hasNumbers = /[0-9]/.test(newPassword);
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const isValid = hasMinLength && hasLetters && hasNumbers && passwordsMatch;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (loading || !isValid) return;
    setError(null);
    setLoading(true);
    try {
      platformAdminService.changeOwnStaffPassword(currentPassword, newPassword);
      // Rehydrate the whole app so App/AuthService state drops the flag everywhere.
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تغيير كلمة المرور.');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-primary/90 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="staff-force-title">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-warning/30 bg-primary shadow-2xl">
        <div className="flex items-center gap-3 border-b border-line-strong bg-gradient-to-l from-warning/15 to-transparent px-6 py-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-warning/15">
            <ShieldAlert className="h-6 w-6 text-warning" />
          </span>
          <div>
            <h2 id="staff-force-title" className="text-sm font-black text-muted">تغيير كلمة المرور الإلزامي</h2>
            <p className="text-[10.5px] text-warning/90">حساب "{currentUser.fullName}" يتطلب تغيير كلمة المرور قبل المتابعة</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5 text-right">
          {error && (
            <div role="alert" className="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-[11px] font-bold text-danger">
              {error}
            </div>
          )}
          <div>
            <label htmlFor="staff-current-password" className="mb-1 block text-[11px] font-bold text-muted">كلمة المرور الحالية</label>
            <div className="relative">
              <input
                ref={currentRef}
                id="staff-current-password"
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full rounded-lg border border-line-strong bg-primary px-3 py-2.5 pl-10 text-xs text-muted outline-none focus:border-warning"
                dir="ltr"
                autoComplete="current-password"
              />
              <button type="button" onClick={() => setShowCurrent((v) => !v)} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted hover:text-muted" aria-label={showCurrent ? 'إخفاء' : 'إظهار'}>
                {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div>
            <label htmlFor="staff-new-password" className="mb-1 block text-[11px] font-bold text-muted">كلمة المرور الجديدة</label>
            <div className="relative">
              <input
                id="staff-new-password"
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-lg border border-line-strong bg-primary px-3 py-2.5 pl-10 text-xs text-muted outline-none focus:border-warning"
                dir="ltr"
                autoComplete="new-password"
              />
              <button type="button" onClick={() => setShowNew((v) => !v)} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted hover:text-muted" aria-label={showNew ? 'إخفاء' : 'إظهار'}>
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div>
            <label htmlFor="staff-confirm-password" className="mb-1 block text-[11px] font-bold text-muted">تأكيد كلمة المرور الجديدة</label>
            <input
              id="staff-confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-lg border border-line-strong bg-primary px-3 py-2.5 text-xs text-muted outline-none focus:border-warning"
              dir="ltr"
              autoComplete="new-password"
            />
          </div>
          <ul className="space-y-1 text-[10px]">
            <li className={`flex items-center gap-1.5 ${hasMinLength ? 'text-success' : 'text-muted'}`}><CheckCircle2 className="h-3 w-3" /> 8 أحرف على الأقل</li>
            <li className={`flex items-center gap-1.5 ${hasLetters && hasNumbers ? 'text-success' : 'text-muted'}`}><CheckCircle2 className="h-3 w-3" /> تحتوي على حروف وأرقام معاً</li>
            <li className={`flex items-center gap-1.5 ${passwordsMatch ? 'text-success' : 'text-muted'}`}><CheckCircle2 className="h-3 w-3" /> تطابق كلمة المرور</li>
          </ul>
          <button
            type="submit"
            disabled={!isValid || loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-warning py-3 text-xs font-black text-white transition hover:bg-warning disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? <KeyRound className="h-4 w-4 animate-pulse" /> : <Lock className="h-4 w-4" />}
            {loading ? 'جارٍ الحفظ...' : 'حفظ كلمة المرور والمتابعة إلى المنصة'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default PlatformStaffForcePasswordChange;
