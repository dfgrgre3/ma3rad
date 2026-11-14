import React from 'react';
import {
  Settings,
  Save,
  KeyRound,
  ShieldCheck,
  Mail,
  Phone,
  Wallet,
  CalendarClock,
  Hash,
} from 'lucide-react';
import { platformAdminService } from '../../services/domains/platform/PlatformAdminService';
import { AuthService } from '../../services/domains/auth/AuthService';
import type { PlatformSettingsMap } from '../../services/domains/platform/platformTypes';
import type { User } from '../../types';
import { Button } from '../../components/ui/Button';
import { PageHeader } from '../../components/ui/PageHeader';
import { useToast } from '../../components/ui/Toast';
import { Field, inputClass } from './components/PlatformUI';

interface PlatformSettingsPageProps {
  currentUser: User;
}

const defaultSettings: PlatformSettingsMap = {
  platformName: '',
  supportEmail: '',
  supportPhone: '',
  defaultCurrency: 'EGP',
  defaultTrialDays: 14,
  invoicePrefix: 'CS-INV',
};

export const PlatformSettingsPage: React.FC<PlatformSettingsPageProps> = ({ currentUser }) => {
  const toast = useToast();
  const [settings, setSettings] = React.useState<PlatformSettingsMap>(defaultSettings);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [passwordForm, setPasswordForm] = React.useState({ current: '', next: '', confirm: '' });
  const [changingPassword, setChangingPassword] = React.useState(false);
  const [passwordError, setPasswordError] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setLoading(true);
    try {
      setSettings(platformAdminService.getSettings());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل إعدادات المنصة.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const saveSettings = () => {
    setSaving(true);
    try {
      const updated = platformAdminService.updateSettings({
        ...settings,
        defaultTrialDays: Math.max(1, Number(settings.defaultTrialDays) || 14),
      });
      setSettings(updated);
      toast.success('تم حفظ إعدادات المنصة');
    } catch (err) {
      toast.error('تعذر حفظ الإعدادات', err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    setPasswordError(null);
    if (passwordForm.next !== passwordForm.confirm) {
      setPasswordError('تأكيد كلمة المرور غير مطابق.');
      return;
    }
    if (passwordForm.next.length < 8) {
      setPasswordError('كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل.');
      return;
    }
    setChangingPassword(true);
    try {
      await new AuthService().changeOwnPasswordAsync(
        currentUser.id,
        passwordForm.current,
        passwordForm.next,
        currentUser.fullName
      );
      toast.success('تم تغيير كلمة المرور بنجاح');
      setPasswordForm({ current: '', next: '', confirm: '' });
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'تعذر تغيير كلمة المرور.');
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="إعدادات المنصة"
        description="بيانات المنصة الافتراضية وسياسات الفوترة وحساب مالك المنصة."
        icon={<Settings className="h-5 w-5" />}
      />

      {error && (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-700">{error}</div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <header className="mb-3 flex items-center gap-2 border-b border-slate-100 pb-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-[13px] font-black text-slate-800">بيانات المنصة</h2>
              <p className="text-[10.5px] text-slate-500">تظهر للعملاء في الفواتير ورسائل الدعم.</p>
            </div>
          </header>

          {loading ? (
            <div className="py-10 text-center text-xs font-semibold text-slate-500">جارٍ تحميل الإعدادات...</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="اسم المنصة" required className="sm:col-span-2">
                <input className={inputClass} value={settings.platformName} onChange={(event) => setSettings({ ...settings, platformName: event.target.value })} />
              </Field>
              <Field label="بريد الدعم">
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input dir="ltr" type="email" className={`${inputClass} pl-8`} value={settings.supportEmail} onChange={(event) => setSettings({ ...settings, supportEmail: event.target.value })} />
                </div>
              </Field>
              <Field label="هاتف الدعم">
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input dir="ltr" className={`${inputClass} pl-8`} value={settings.supportPhone} onChange={(event) => setSettings({ ...settings, supportPhone: event.target.value })} />
                </div>
              </Field>
              <Field label="العملة الافتراضية">
                <div className="relative">
                  <Wallet className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <select className={`${inputClass} pl-8`} value={settings.defaultCurrency} onChange={(event) => setSettings({ ...settings, defaultCurrency: event.target.value })}>
                    {['EGP', 'SAR', 'AED', 'USD', 'EUR'].map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                  </select>
                </div>
              </Field>
              <Field label="مدة التجربة (أيام)">
                <div className="relative">
                  <CalendarClock className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input type="number" min={1} className={`${inputClass} pl-8`} value={settings.defaultTrialDays} onChange={(event) => setSettings({ ...settings, defaultTrialDays: Number(event.target.value) })} />
                </div>
              </Field>
              <Field label="بادئة رقم الفاتورة" hint="مثال: CS-INV" className="sm:col-span-2">
                <div className="relative">
                  <Hash className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input dir="ltr" className={`${inputClass} pl-8`} value={settings.invoicePrefix} onChange={(event) => setSettings({ ...settings, invoicePrefix: event.target.value })} />
                </div>
              </Field>
            </div>
          )}

          <div className="mt-4 flex justify-end border-t border-slate-100 pt-3">
            <Button variant="primary" leadingIcon={<Save className="h-3.5 w-3.5" />} onClick={saveSettings} loading={saving} disabled={loading}>
              حفظ الإعدادات
            </Button>
          </div>
        </section>

        <div className="space-y-4">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <header className="mb-3 flex items-center gap-2 border-b border-slate-100 pb-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                <KeyRound className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-[13px] font-black text-slate-800">حساب مالك المنصة</h2>
                <p className="text-[10.5px] text-slate-500">تغيير كلمة مرور الحساب الحالي.</p>
              </div>
            </header>

            <div className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-[11.5px]">
              <p className="font-bold text-slate-800">{currentUser.fullName}</p>
              <p className="font-mono text-[10.5px] text-slate-500" dir="ltr">@{currentUser.username}</p>
            </div>

            <div className="space-y-3">
              <Field label="كلمة المرور الحالية" required>
                <input type="password" dir="ltr" className={inputClass} value={passwordForm.current} onChange={(event) => setPasswordForm({ ...passwordForm, current: event.target.value })} autoComplete="current-password" />
              </Field>
              <Field label="كلمة المرور الجديدة" required hint="8 أحرف على الأقل مع حرف ورقم">
                <input type="password" dir="ltr" className={inputClass} value={passwordForm.next} onChange={(event) => setPasswordForm({ ...passwordForm, next: event.target.value })} autoComplete="new-password" />
              </Field>
              <Field label="تأكيد كلمة المرور" required>
                <input type="password" dir="ltr" className={inputClass} value={passwordForm.confirm} onChange={(event) => setPasswordForm({ ...passwordForm, confirm: event.target.value })} autoComplete="new-password" />
              </Field>
              {passwordError && (
                <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-700">{passwordError}</p>
              )}
            </div>

            <div className="mt-4 flex justify-end border-t border-slate-100 pt-3">
              <Button variant="secondary" leadingIcon={<KeyRound className="h-3.5 w-3.5" />} onClick={changePassword} loading={changingPassword}>
                تغيير كلمة المرور
              </Button>
            </div>
          </section>

          <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <h2 className="flex items-center gap-2 text-[12.5px] font-bold text-amber-900">
              <ShieldCheck className="h-4 w-4" /> تنبيه أمني
            </h2>
            <p className="mt-1 text-[11px] leading-6 text-amber-800">
              حساب مالك المنصة يتحكم في كل العملاء والتراخيص والمبيعات. استخدم كلمة مرور قوية وفريدة، ولا تشارك بيانات الدخول مع أي مستخدم آخر.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default PlatformSettingsPage;
