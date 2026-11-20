import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Shield, Globe, Lock, AlertCircle, CheckCircle2, KeyRound } from 'lucide-react';
import { usePermission } from '../../../hooks/domains/auth/usePermission';
import { PageHeader } from '../../../components/ui/PageHeader';
import { AuthService } from '../../../services/domains/auth/AuthService';

export const LicenseModeSettingsPage: React.FC = () => {
  const can = usePermission();
  const canManage = can('admin.license.manage') || can('settings.license_mode.manage');
  const [mode, setMode] = useState<'account' | 'hardwa'>('hardwa');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pendingMode, setPendingMode] = useState<'account' | 'hardwa' | null>(null);
  const [adminUsername, setAdminUsername] = useState(() => AuthService.getCurrentUser()?.username || '');
  const [adminPassword, setAdminPassword] = useState('');

  useEffect(() => {
    let active = true;
    void window.ceramisys?.license?.getMode?.().then((storedMode) => {
      if (active) setMode(storedMode);
    }).catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : 'تعذر قراءة وضع الترخيص.');
    });
    return () => { active = false; };
  }, []);

  const handleChange = useCallback(async (nextMode: 'account' | 'hardwa') => {
    if (!canManage) return;
    if (loading) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await window.ceramisys?.license?.setMode?.({
        mode: nextMode,
        username: adminUsername,
        password: adminPassword,
      });
      if (!res?.ok) {
        throw new Error('تعذر حفظ وضع الترخيص.');
      }
      setMode(nextMode);
      setPendingMode(null);
      setAdminPassword('');
      setSuccess('تم حفظ وضع الترخيص وتطبيقه.');
    } catch (err: any) {
      setError(err?.message || 'حدث خطأ أثناء حفظ الإعدادات.');
    } finally {
      setLoading(false);
    }
  }, [loading, canManage, adminUsername, adminPassword]);

  if (!canManage) {
    return (
      <div className="m-8 rounded-2xl border border-warning-border bg-warning-soft p-6 text-sm font-bold text-warning">
        لا تملك صلاحية إدارة وضع الترخيص.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-surface-muted text-ink p-4 lg:p-6 dir-rtl">
      <div className="w-full space-y-6 max-w-4xl mx-auto">
        <PageHeader
          icon={<Shield className="w-5 h-5" />}
          title="إعدادات التشغيل على أي جهاز"
          description="حدد كيف يرتبط الترخيص بالجهاز المثبت عليه البرنامج."
        />

        <div className="rounded-2xl border border-line bg-surface shadow-sm overflow-hidden">
          <div className="p-4 border-b border-line ">
            <h2 className="text-base font-bold text-ink flex items-center gap-2">
              <span>وضع الترخيص</span>
            </h2>
          </div>

          <div className="p-4 space-y-4">
            <p className="text-sm text-ink-secondary ">
              حدد ما إذا كان ملف الترخيص مرتبطاً ببصمة العتاد للجهاز الحالي فقط، أم مرتبطاً
              بالحساب المرخص ويمكن تشغيله على أي جهاز بعد التفعيل.
            </p>

            {/* Account Mode Switch */}
            <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border transition-colors ${
              mode === 'account'
                ? 'border-primary bg-accent-soft/50 dark:bg-primary/20 dark:border-primary/40'
                : 'border-line bg-surface-muted/60 dark:bg-primary/40'
            }`}>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Globe className="w-5 h-5 text-primary " />
                  <span className="font-bold text-ink ">
                    تشغيل على أي جهاز (حسب الحساب)
                  </span>
                </div>
                <p className="text-xs text-muted ">
                  الترخيص مرتبط بالحساب والبيانات المرسلة من المنصة المركزية، ويمكن تثبيت البرنامج
                  وتشغيله على أي جهاز بعد التفعيل باستخدام مفتاح الترخيص.
                </p>
                {mode === 'account' && (
                  <Link
                    to="/central-activation"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    تفعيل الترخيص المركزي على هذا الجهاز
                  </Link>
                )}
              </div>
              <button
                type="button"
                disabled={loading}
                onClick={() => setPendingMode('account')}
                className={`px-4 py-2 text-sm font-medium rounded-lg shrink-0 transition-colors ${
                  mode === 'account'
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-surface border border-line-strong hover:bg-surface-sunken dark:hover:bg-primary text-ink '
                }`}
              >
                {mode === 'account' ? 'مفعل حالياً' : 'تفعيل'}
              </button>
            </div>

            {/* Hardwa Mode Switch */}
            <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border transition-colors ${
              mode === 'hardwa'
                ? 'border-primary bg-accent-soft/50 dark:bg-primary/20 dark:border-primary/40'
                : 'border-line bg-surface-muted/60 dark:bg-primary/40'
            }`}>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Lock className="w-5 h-5 text-warning " />
                  <span className="font-bold text-ink ">
                    ربط صارم بجهاز واحد (حسب العتاد)
                  </span>
                </div>
                <p className="text-xs text-muted ">
                  الترخيص مرتبط ببصمة العتاد الفريدة لهذا الجهاز فقط (لوحة الأم، المعالج، القرص).
                  لا يمكن تشغيل نفس ملف الترخيص على جهاز آخر.
                </p>
              </div>
              <button
                type="button"
                disabled={loading}
                onClick={() => setPendingMode('hardwa')}
                className={`px-4 py-2 text-sm font-medium rounded-lg shrink-0 transition-colors ${
                  mode === 'hardwa'
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-surface border border-line-strong hover:bg-surface-sunken dark:hover:bg-primary text-ink '
                }`}
              >
                {mode === 'hardwa' ? 'مفعل حالياً' : 'تفعيل'}
              </button>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-danger-soft dark:bg-danger/40 border border-danger-border text-danger text-sm">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-success-soft dark:bg-success/40 border border-success-border text-success text-sm">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <span>{success}</span>
              </div>
            )}
          </div>
        </div>
      </div>
      {pendingMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/60 p-4" role="presentation">
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="license-mode-auth-title"
            onSubmit={(event) => {
              event.preventDefault();
              void handleChange(pendingMode);
            }}
            className="w-full max-w-md space-y-4 rounded-2xl bg-surface p-6 shadow-2xl "
          >
            <h2 id="license-mode-auth-title" className="text-lg font-black text-ink ">
              تأكيد صلاحية المسؤول
            </h2>
            <p className="text-sm text-ink-secondary ">
              أدخل بيانات مسؤول مخوّل لتغيير وضع الترخيص. تُستخدم كلمة المرور للتحقق فقط ولا تُحفظ.
            </p>
            <label className="block space-y-1 text-sm font-bold">
              <span>اسم المستخدم</span>
              <input
                autoComplete="username"
                value={adminUsername}
                onChange={(event) => setAdminUsername(event.target.value)}
                required
                disabled={loading}
                className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-left font-normal "
              />
            </label>
            <label className="block space-y-1 text-sm font-bold">
              <span>كلمة المرور</span>
              <input
                type="password"
                autoComplete="current-password"
                value={adminPassword}
                onChange={(event) => setAdminPassword(event.target.value)}
                required
                disabled={loading}
                className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-left font-normal "
              />
            </label>
            {error && <p role="alert" className="text-sm text-danger ">{error}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => { setPendingMode(null); setAdminPassword(''); setError(null); }}
                className="rounded-lg border border-line-strong px-4 py-2 text-sm font-bold "
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={loading}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
              >
                {loading ? 'جارٍ التحقق...' : 'تأكيد'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default LicenseModeSettingsPage;
