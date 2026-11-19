import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, Loader2, ShieldCheck, Lock, User as UserIcon } from 'lucide-react';
import { platformAdminService } from '../../services/domains/platform/PlatformAdminService';
import { AuthService } from '../../services/domains/auth/AuthService';
import type { PlatformStaffInvite } from '../../services/domains/platform/platformTypes';
import type { User } from '../../types';

interface Props {
  token: string;
  onSuccess: (user: User) => void;
}

/**
 * Pre-auth screen for a platform staff invitation. The token in the URL hash
 * is the credential: we show who the invite was issued to (read-only preview),
 * then let the invitee choose their password. On success we log them in and
 * drop them onto the platform console.
 */
export const PlatformStaffInviteAcceptPage: React.FC<Props> = ({ token, onSuccess }) => {
  const [invite, setInvite] = useState<PlatformStaffInvite | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      const preview = platformAdminService.getStaffInviteByToken(token);
      setInvite(preview);
      setFullName(preview.fullName);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'رابط الدعوة غير صالح.');
    }
  }, [token]);

  const hasMinLength = password.length >= 8;
  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const isValid = fullName.trim().length >= 2 && hasMinLength && passwordsMatch;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isValid || loading || !invite) return;
    setError(null);
    setLoading(true);
    try {
      platformAdminService.acceptStaffInvite(token, fullName.trim(), password);
      const user = await AuthService.loginAsync(invite.email, password);
      if (typeof window !== 'undefined') {
        window.location.hash = '#/platform';
      }
      onSuccess(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر قبول الدعوة.');
      setLoading(false);
    }
  };

  const roleLabel = invite?.role === 'SUPPORT_AGENT' ? 'دعم فني'
    : invite?.role === 'PLATFORM_ADMIN' ? 'مدير المنصة'
    : invite?.role === 'OPERATIONS_ENGINEER' ? 'مهندس عمليات'
    : invite?.role === 'BILLING_SPECIALIST' ? 'فوترة واشتراكات'
    : invite?.role === 'LICENSE_MANAGER' ? 'إدارة التراخيص'
    : invite?.role ?? '';

  return (
    <div className="win-auth flex min-h-screen w-screen items-center justify-center">
      <div className="w-full max-w-[420px] px-4 py-10">
        {loadError ? (
          <div className="win-auth-card">
            <div className="win-auth-card-head">
              <h2 className="text-[17px] font-semibold text-[var(--win-text)]">رابط الدعوة غير صالح</h2>
            </div>
            <div className="px-6 py-6 text-center">
              <AlertCircle className="mx-auto mb-3 h-10 w-10 text-[#a8413e]" />
              <p className="text-[13px] font-semibold text-[var(--win-text)]">{loadError}</p>
              <p className="mt-2 text-xs text-[var(--win-text-muted)]">تواصل مع مالك المنصة لإصدار دعوة جديدة.</p>
            </div>
          </div>
        ) : !invite ? (
          <div className="py-16 text-center text-sm text-[var(--win-text-muted)]">جارٍ التحقق من الدعوة...</div>
        ) : (
          <div className="win-auth-card">
            <div className="win-auth-card-head">
              <h2 className="text-[17px] font-semibold text-[var(--win-text)]">قبِل دعوة الانضمام إلى فريق المنصة</h2>
              <p className="mt-1 text-xs text-[var(--win-text-muted)]">أنشئ كلمة المرور الخاصة بحسابك — الدعوة صالحة للاستخدام مرة واحدة فقط.</p>
            </div>

            <div className="border-b border-[var(--win-card-border)] px-6 py-4">
              <dl className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-[var(--win-text-muted)]">الاسم</dt>
                  <dd className="font-semibold text-[var(--win-text)]">{invite.fullName}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-[var(--win-text-muted)]">البريد</dt>
                  <dd dir="ltr" className="font-mono text-[11px] font-semibold text-[var(--win-text)]">{invite.email}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-[var(--win-text-muted)]">الدور</dt>
                  <dd className="font-semibold text-[var(--win-text)]">{roleLabel}</dd>
                </div>
              </dl>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5" aria-busy={loading}>
              {error && (
                <div role="alert" className="flex items-start gap-2 border border-[#e4c6c2] border-r-[3px] border-r-[#a8413e] bg-[#f6e9e7] px-3 py-2 text-xs font-semibold text-[#8f3937]">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              <div>
                <label htmlFor="invite-full-name" className="mb-1 block text-[11.5px] font-semibold text-[var(--win-text)]">الاسم المعروض</label>
                <div className="relative">
                  <UserIcon className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--win-text-muted)]" />
                  <input
                    id="invite-full-name"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    disabled={loading}
                    className="win-input w-full pl-2 pr-8 text-[12.5px]"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="invite-password" className="mb-1 block text-[11.5px] font-semibold text-[var(--win-text)]">كلمة المرور الجديدة</label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--win-text-muted)]" />
                  <input
                    id="invite-password"
                    type="password"
                    dir="ltr"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="8 أحرف على الأقل"
                    disabled={loading}
                    className="win-input w-full pl-2 pr-8 text-left text-[12.5px]"
                    autoComplete="new-password"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="invite-confirm-password" className="mb-1 block text-[11.5px] font-semibold text-[var(--win-text)]">تأكيد كلمة المرور</label>
                <input
                  id="invite-confirm-password"
                  type="password"
                  dir="ltr"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="أعد إدخال كلمة المرور"
                  disabled={loading}
                  className="win-input w-full px-2 text-left text-[12.5px]"
                  autoComplete="new-password"
                />
              </div>
              <ul className="space-y-1 text-[10px] text-[var(--win-text-muted)]">
                <li className={`flex items-center gap-1.5 ${hasMinLength ? 'text-emerald-700 dark:text-emerald-400' : ''}`}>
                  <CheckCircle2 className="h-3 w-3" /> 8 أحرف على الأقل
                </li>
                <li className={`flex items-center gap-1.5 ${passwordsMatch ? 'text-emerald-700 dark:text-emerald-400' : ''}`}>
                  <CheckCircle2 className="h-3 w-3" /> تطابق كلمة المرور
                </li>
              </ul>
              <button type="submit" disabled={!isValid || loading} className="win-btn win-btn--primary flex w-full items-center justify-center gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                {loading ? 'جارٍ إنشاء الحساب...' : 'قبول الدعوة والدخول إلى المنصة'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
