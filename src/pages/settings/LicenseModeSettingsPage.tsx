import React, { useCallback, useState } from 'react';
import { Shield, Globe, Lock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { usePermission } from '../../hooks/usePermission';

export const LicenseModeSettingsPage: React.FC = () => {
  const can = usePermission();
  const canManage = can('admin.license.manage') || can('settings.license_mode.manage');
  const [mode, setMode] = useState<'account' | 'hardwa'>('hardwa');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleChange = useCallback(async (nextMode: 'account' | 'hardwa') => {
    if (!canManage) return;
    if (loading) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await window.ceramisys?.license?.save?.({
        mode: nextMode,
        licenseMode: nextMode,
      });
      if (!res?.ok) {
        throw new Error((res as any)?.error || 'تعذر حفظ وضع الترخيص.');
      }
      setMode(nextMode);
      setSuccess('تم حفظ إعدادات وضع الترخيص بنجاح.');
    } catch (err: any) {
      setError(err?.message || 'حدث خطأ أثناء حفظ الإعدادات.');
    } finally {
      setLoading(false);
    }
  }, [loading, canManage]);

  if (!canManage) {
    return (
      <div className="m-8 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm font-bold text-amber-900" dir="rtl">
        لا تملك صلاحية إدارة وضع الترخيص.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-50 text-slate-900 dark:bg-slate-950 p-4 lg:p-6 dir-rtl">
      <div className="w-full space-y-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-600 text-white shadow-lg shadow-sky-500/25">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-slate-100">إعدادات التشغيل على أي جهاز</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              حدد كيف يرتبط الترخيص بالجهاز المثبت عليه البرنامج.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <span>وضع الترخيص</span>
            </h2>
          </div>

          <div className="p-4 space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              حدد ما إذا كان ملف الترخيص مرتبطاً ببصمة العتاد للجهاز الحالي فقط، أم مرتبطاً
              بالحساب المرخص ويمكن تشغيله على أي جهاز بعد التفعيل.
            </p>

            {/* Account Mode Switch */}
            <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border transition-colors ${
              mode === 'account'
                ? 'border-sky-500 bg-sky-50/50 dark:bg-sky-950/20 dark:border-sky-500/40'
                : 'border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-800/40'
            }`}>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Globe className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    تشغيل على أي جهاز (حسب الحساب)
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  الترخيص مرتبط بالحساب والبيانات المرسلة من المنصة المركزية، ويمكن تثبيت البرنامج
                  وتشغيله على أي جهاز بعد التفعيل باستخدام مفتاح الترخيص.
                </p>
              </div>
              <button
                type="button"
                disabled={loading}
                onClick={() => handleChange('account')}
                className={`px-4 py-2 text-sm font-medium rounded-lg shrink-0 transition-colors ${
                  mode === 'account'
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'
                }`}
              >
                {mode === 'account' ? 'مفعل حالياً' : 'تفعيل'}
              </button>
            </div>

            {/* Hardwa Mode Switch */}
            <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border transition-colors ${
              mode === 'hardwa'
                ? 'border-sky-500 bg-sky-50/50 dark:bg-sky-950/20 dark:border-sky-500/40'
                : 'border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-800/40'
            }`}>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Lock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    ربط صارم بجهاز واحد (حسب العتاد)
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  الترخيص مرتبط ببصمة العتاد الفريدة لهذا الجهاز فقط (لوحة الأم، المعالج، القرص).
                  لا يمكن تشغيل نفس ملف الترخيص على جهاز آخر.
                </p>
              </div>
              <button
                type="button"
                disabled={loading}
                onClick={() => handleChange('hardwa')}
                className={`px-4 py-2 text-sm font-medium rounded-lg shrink-0 transition-colors ${
                  mode === 'hardwa'
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'
                }`}
              >
                {mode === 'hardwa' ? 'مفعل حالياً' : 'تفعيل'}
              </button>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400 text-sm">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-400 text-sm">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <span>{success}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LicenseModeSettingsPage;
