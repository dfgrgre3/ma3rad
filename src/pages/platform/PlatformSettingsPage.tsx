import React from 'react';
import {
  Settings,
  Save,
  KeyRound,
  ShieldCheck,
  Building2,
  Mail,
  CreditCard,
  Globe,
  Lock,
  Database,
  Languages,
  RefreshCw,
  Server,
  AlertTriangle,
  RotateCw,
} from 'lucide-react';
import { platformAdminService } from '../../services/domains/platform/PlatformAdminService';
import { AuthService } from '../../services/domains/auth/AuthService';
import { canPlatform } from '../../hooks/platform/usePlatformPermission';
import type { PlatformSettingsMap } from '../../services/domains/platform/platformTypes';
import type { User } from '../../types';
import { Button } from '../../components/ui/Button';
import { PageHeader } from '../../components/ui/PageHeader';
import { useToast } from '../../components/ui/Toast';
import { Field, inputClass, formatDateTime } from './components/PlatformUI';

interface PlatformSettingsPageProps {
  currentUser: User;
}

type SettingsTab = 'identity' | 'legal' | 'communications' | 'payments' | 'network' | 'security' | 'backup' | 'password';

export const PlatformSettingsPage: React.FC<PlatformSettingsPageProps> = ({ currentUser }) => {
  const toast = useToast();
  const canManageSettings = canPlatform('settings');
  const [activeTab, setActiveTab] = React.useState<SettingsTab>('identity');
  const [settings, setSettings] = React.useState<PlatformSettingsMap | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Key rotation state
  const [rotatingKey, setRotatingKey] = React.useState(false);

  // Password Change state
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

  React.useEffect(() => {
    load();
  }, [load]);

  const saveSettings = () => {
    if (!settings) return;
    if (!canManageSettings) {
      toast.error('لا تملك صلاحية تعديل إعدادات المنصة');
      return;
    }
    setSaving(true);
    try {
      const updated = platformAdminService.updateSettings({
        ...settings,
        defaultTrialDays: String(Math.max(1, Number(settings.defaultTrialDays) || 14)),
      });
      setSettings(updated);
      toast.success('تم حفظ إعدادات المنصة بنجاح');
    } catch (err) {
      toast.error('تعذر حفظ الإعدادات', err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const handleRotateEncryptionKeys = () => {
    if (!canManageSettings) {
      toast.error('لا تملك صلاحية إدارة إعدادات الأمان');
      return;
    }
    if (!window.confirm('هل أنت متأكد من تدوير مفاتيح التشفير المركزية للمنصة؟ سيتم تسجيل الحدث كعملية أمنية عالية الخطورة.')) {
      return;
    }
    setRotatingKey(true);
    try {
      const res = platformAdminService.rotatePlatformEncryptionKeys();
      toast.success(`تم تدوير المفاتيح بنجاح (بصمة المفتاح: ${res.newKeyFingerprint})`);
      load();
    } catch (err) {
      toast.error('فشل تدوير المفاتيح', err instanceof Error ? err.message : undefined);
    } finally {
      setRotatingKey(false);
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

  if (loading || !settings) {
    return (
      <div className="py-24 text-center text-sm font-semibold text-slate-500">
        جارٍ تحميل إعدادات المنصة المركزية...
      </div>
    );
  }

  const tabs: Array<{ id: SettingsTab; label: string; icon: React.ReactNode }> = [
    { id: 'identity', label: 'الهوية والعام', icon: <Settings className="h-4 w-4" /> },
    { id: 'legal', label: 'البيانات القانونية والضريبية', icon: <Building2 className="h-4 w-4" /> },
    { id: 'communications', label: 'البريد وخوادم الرسائل', icon: <Mail className="h-4 w-4" /> },
    { id: 'payments', label: 'الدفع والفوترة', icon: <CreditCard className="h-4 w-4" /> },
    { id: 'network', label: 'النطاقات والـ API', icon: <Globe className="h-4 w-4" /> },
    { id: 'security', label: 'الأمان والتشفير و MFA', icon: <Lock className="h-4 w-4" /> },
    { id: 'backup', label: 'النسخ الاحتياطي والاستبقاء', icon: <Database className="h-4 w-4" /> },
    { id: 'password', label: 'أمان الحساب الشخصي', icon: <KeyRound className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="إعدادات المنصة المركزية"
        description="إدارة الهوية القانونية، بوابات الدفع، خوادم الاتصالات، سياسات الأمان والتشفير من بيئة آمنة."
        icon={<Settings className="h-5 w-5 text-indigo-600" />}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" leadingIcon={<RefreshCw className="h-3.5 w-3.5" />} onClick={load}>
              تحديث
            </Button>
            {activeTab !== 'password' && (
              <Button
                variant="primary"
                size="sm"
                leadingIcon={<Save className="h-3.5 w-3.5" />}
                onClick={saveSettings}
                disabled={saving || !canManageSettings}
              >
                {saving ? 'جارٍ الحفظ...' : 'حفظ التغييرات'}
              </Button>
            )}
          </div>
        }
      />

      {error && (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-700">
          {error}
        </div>
      )}

      {/* Navigation Tabs Bar */}
      <div className="flex overflow-x-auto border-b border-slate-200 bg-white px-2 pt-2 rounded-t-xl gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? 'border-indigo-600 text-indigo-700 bg-indigo-50/40'
                : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Contents Card */}
      <div className="rounded-b-xl rounded-tr-xl border border-slate-200 bg-white p-6 shadow-sm">
        {/* 1. Identity & General */}
        {activeTab === 'identity' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-bold text-slate-900">هوية المنصة والإعدادات الإقليمية</h3>
              <p className="text-xs text-slate-500">اسم النظام الرسمي، اللغات، والعملات الافتراضية.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="اسم المنصة">
                <input
                  type="text"
                  value={settings.platformName}
                  onChange={(e) => setSettings({ ...settings, platformName: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="المنطقة الزمنية (Timezone)">
                <input
                  type="text"
                  value={settings.timezone || 'Africa/Cairo'}
                  onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="البريد الإلكتروني للدعم">
                <input
                  type="email"
                  value={settings.supportEmail}
                  onChange={(e) => setSettings({ ...settings, supportEmail: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="هاتف الدعم الفني">
                <input
                  type="tel"
                  value={settings.supportPhone}
                  onChange={(e) => setSettings({ ...settings, supportPhone: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="العملة الافتراضية">
                <input
                  type="text"
                  value={settings.defaultCurrency}
                  onChange={(e) => setSettings({ ...settings, defaultCurrency: e.target.value.toUpperCase() })}
                  className={inputClass}
                  placeholder="EGP, SAR, USD"
                />
              </Field>
              <Field label="اللغة الافتراضية للواجهة">
                <select
                  value={settings.defaultLocale || 'ar'}
                  onChange={(e) => setSettings({ ...settings, defaultLocale: e.target.value })}
                  className={inputClass}
                >
                  <option value="ar">العربية (Arabic)</option>
                  <option value="en">الإنجليزية (English)</option>
                </select>
              </Field>
            </div>
          </div>
        )}

        {/* 2. Legal & Tax */}
        {activeTab === 'legal' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-bold text-slate-900">البيانات القانونية والضريبية للمنصة</h3>
              <p className="text-xs text-slate-500">تستخدم هذه البيانات في العقود، الفواتير الرسمية، والتراخيص الموثقة.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="الاسم القانوني المسجل للشركة">
                <input
                  type="text"
                  value={settings.companyLegalName || ''}
                  onChange={(e) => setSettings({ ...settings, companyLegalName: e.target.value })}
                  className={inputClass}
                  placeholder="مثال: شركة تقنية المعلومات والحلول الرقمية ذ.م.م"
                />
              </Field>
              <Field label="الممثل القانوني / المفوض بالتوقيع">
                <input
                  type="text"
                  value={settings.legalRepresentative || ''}
                  onChange={(e) => setSettings({ ...settings, legalRepresentative: e.target.value })}
                  className={inputClass}
                  placeholder="اسم المفوض الرسمي"
                />
              </Field>
              <Field label="رقم السجل التجاري (CRN)">
                <input
                  type="text"
                  value={settings.commercialRegistry || ''}
                  onChange={(e) => setSettings({ ...settings, commercialRegistry: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="الرقم التعريفي الضريبي (VAT ID)">
                <input
                  type="text"
                  value={settings.taxNumber || ''}
                  onChange={(e) => setSettings({ ...settings, taxNumber: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <div className="md:col-span-2">
                <Field label="العنوان والمقر القانوني الرسمي">
                  <textarea
                    rows={2}
                    value={settings.officialAddress || ''}
                    onChange={(e) => setSettings({ ...settings, officialAddress: e.target.value })}
                    className={inputClass}
                    placeholder="العنوان الكامل للمقر الرئيسي المسجل"
                  />
                </Field>
              </div>
            </div>
          </div>
        )}

        {/* 3. Communications (Email & SMS) */}
        {activeTab === 'communications' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-bold text-slate-900">خوادم إرسال البريد الإلكتروني والرسائل القصيرة (SMS)</h3>
              <p className="text-xs text-slate-500">
                إرسال بيانات التفعيل، الفواتير، وتنبيهات الأمان. يتم حجب كلمات المرور والأسرار الحساسة تلقائياً.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="خادم البريد (SMTP Host)">
                <input
                  type="text"
                  value={settings.smtpHost || ''}
                  onChange={(e) => setSettings({ ...settings, smtpHost: e.target.value })}
                  className={inputClass}
                  placeholder="smtp.sendgrid.net"
                />
              </Field>
              <Field label="منفذ الخادم (SMTP Port)">
                <input
                  type="number"
                  value={settings.smtpPort || 587}
                  onChange={(e) => setSettings({ ...settings, smtpPort: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="نوع التشفير">
                <select
                  value={settings.smtpEncryption || 'TLS'}
                  onChange={(e) => setSettings({ ...settings, smtpEncryption: e.target.value as any })}
                  className={inputClass}
                >
                  <option value="TLS">STARTTLS (587)</option>
                  <option value="SSL">SSL / TLS (465)</option>
                  <option value="NONE">بدون تشفير</option>
                </select>
              </Field>
              <Field label="اسم مستخدم SMTP">
                <input
                  type="text"
                  value={settings.smtpUser || ''}
                  onChange={(e) => setSettings({ ...settings, smtpUser: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="كلمة مرور SMTP (محمية)">
                <input
                  type="password"
                  value={settings.smtpPassword || ''}
                  onChange={(e) => setSettings({ ...settings, smtpPassword: e.target.value })}
                  className={inputClass}
                  placeholder="اتركها فارغة للإبقاء على الحالية"
                />
              </Field>
              <Field label="عنوان البريد الصادر (From Email)">
                <input
                  type="email"
                  value={settings.smtpFromEmail || ''}
                  onChange={(e) => setSettings({ ...settings, smtpFromEmail: e.target.value })}
                  className={inputClass}
                  placeholder="no-reply@ceramisys.app"
                />
              </Field>
            </div>

            <div className="pt-4 border-t border-slate-100">
              <h4 className="text-xs font-bold text-slate-800 mb-3">بوابة الرسائل النصية القصيرة (SMS Gateway)</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field label="مزود خدمة SMS">
                  <select
                    value={settings.smsProvider || 'TWILIO'}
                    onChange={(e) => setSettings({ ...settings, smsProvider: e.target.value })}
                    className={inputClass}
                  >
                    <option value="TWILIO">Twilio SMS</option>
                    <option value="UNIFONIC">Unifonic</option>
                    <option value="VICTORY_LINK">Victory Link</option>
                    <option value="CUSTOM">مخصص (Webhook API)</option>
                  </select>
                </Field>
                <Field label="اسم المرسل المعتمد (Sender ID)">
                  <input
                    type="text"
                    value={settings.smsSenderId || ''}
                    onChange={(e) => setSettings({ ...settings, smsSenderId: e.target.value })}
                    className={inputClass}
                    placeholder="CERAMISYS"
                  />
                </Field>
                <Field label="مفتاح API الخاص بـ SMS (محمي)">
                  <input
                    type="password"
                    value={settings.smsApiKey || ''}
                    onChange={(e) => setSettings({ ...settings, smsApiKey: e.target.value })}
                    className={inputClass}
                    placeholder="اتركه فارغاً للإبقاء على الحالي"
                  />
                </Field>
              </div>
            </div>
          </div>
        )}

        {/* 4. Payments & Billing */}
        {activeTab === 'payments' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-bold text-slate-900">بوابات الدفع الإلكتروني وسياسات الفوترة</h3>
              <p className="text-xs text-slate-500">إعداد التحصيل الآلي لاشتراكات وتجديدات تراخيص العملاء.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="بوابة الدفع النشطة">
                <select
                  value={settings.paymentGateway || 'MANUAL'}
                  onChange={(e) => setSettings({ ...settings, paymentGateway: e.target.value as any })}
                  className={inputClass}
                >
                  <option value="PAYMOB">Paymob (بطاقات ومحافظ)</option>
                  <option value="FAWRY">Fawry Pay</option>
                  <option value="STRIPE">Stripe Global</option>
                  <option value="MOYASAR">Moyasar (مدى وفيزا)</option>
                  <option value="MANUAL">تحويل بنكي ودفع يدوي فقط</option>
                </select>
              </Field>
              <Field label="بيئة التشغيل (Payment Mode)">
                <select
                  value={settings.paymentMode || 'TEST'}
                  onChange={(e) => setSettings({ ...settings, paymentMode: e.target.value as any })}
                  className={inputClass}
                >
                  <option value="TEST">بيئة تجريبية (Sandbox / Test)</option>
                  <option value="LIVE">بيئة إنتاجية حية (Live Production)</option>
                </select>
              </Field>
              <Field label="معرف التاجر (Merchant ID)">
                <input
                  type="text"
                  value={settings.paymentMerchantId || ''}
                  onChange={(e) => setSettings({ ...settings, paymentMerchantId: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="المفتاح السري للبوابة (API Secret)">
                <input
                  type="password"
                  value={settings.paymentApiKey || ''}
                  onChange={(e) => setSettings({ ...settings, paymentApiKey: e.target.value })}
                  className={inputClass}
                  placeholder="اتركه فارغاً للإبقاء على الحالي"
                />
              </Field>
              <Field label="نسبة ضريبة القيمة المضافة الافتراضية (%)">
                <input
                  type="number"
                  value={settings.defaultTaxRate || 14}
                  onChange={(e) => setSettings({ ...settings, defaultTaxRate: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="بادئة الفاتورة (Invoice Prefix)">
                <input
                  type="text"
                  value={settings.invoicePrefix}
                  onChange={(e) => setSettings({ ...settings, invoicePrefix: e.target.value })}
                  className={inputClass}
                />
              </Field>
            </div>

            <div className="pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="مدة التجربة المجانية الافتراضية (بالأيام)">
                <input
                  type="number"
                  value={settings.defaultTrialDays}
                  onChange={(e) => setSettings({ ...settings, defaultTrialDays: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="فترة السماح بعد انتهاء الترخيص (Grace Period - أيام)">
                <input
                  type="number"
                  value={settings.licenseGracePeriodDays || 7}
                  onChange={(e) => setSettings({ ...settings, licenseGracePeriodDays: e.target.value })}
                  className={inputClass}
                />
              </Field>
            </div>
          </div>
        )}

        {/* 5. Network & APIs */}
        {activeTab === 'network' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-bold text-slate-900">النطاقات والشهادات وعناوين الـ API</h3>
              <p className="text-xs text-slate-500">إدارة نطاقات المنصة وعناوين خوادم الترخيص والمزامنة السحابية.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="النطاق الرسمي للمنصة (Platform Domain)">
                <input
                  type="text"
                  value={settings.platformDomain || ''}
                  onChange={(e) => setSettings({ ...settings, platformDomain: e.target.value })}
                  className={inputClass}
                  placeholder="app.ceramisys.com"
                />
              </Field>
              <Field label="عنوان خادم الـ API المركزي (Central API Endpoint)">
                <input
                  type="url"
                  value={settings.centralApiEndpoint || ''}
                  onChange={(e) => setSettings({ ...settings, centralApiEndpoint: e.target.value })}
                  className={inputClass}
                  placeholder="https://api.ceramisys.app/v1"
                />
              </Field>
              <Field label="عنوان خادم المزامنة الحية (WebSockets / Sync Endpoint)">
                <input
                  type="text"
                  value={settings.syncServerEndpoint || ''}
                  onChange={(e) => setSettings({ ...settings, syncServerEndpoint: e.target.value })}
                  className={inputClass}
                  placeholder="wss://sync.ceramisys.app"
                />
              </Field>
              <div className="flex items-center gap-3 pt-6">
                <input
                  type="checkbox"
                  id="enforceHttps"
                  checked={settings.enforceHttps !== 'false'}
                  onChange={(e) => setSettings({ ...settings, enforceHttps: e.target.checked ? 'true' : 'false' })}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="enforceHttps" className="text-xs font-semibold text-slate-700 cursor-pointer">
                  إلزام الاتصال الآمن (Enforce HTTPS & HSTS) لجميع العملاء والأجهزة
                </label>
              </div>
            </div>
          </div>
        )}

        {/* 6. Security, MFA & Encryption */}
        {activeTab === 'security' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-bold text-slate-900">أمان المنصة، سياسة كلمات المرور والمصادقة المزدوجة</h3>
              <p className="text-xs text-slate-500">حماية الجلسات وإدارة مفاتيح التشفير من البيئة الآمنة.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="مهلة خمول الجلسة (Session Timeout بالدقائق)">
                <input
                  type="number"
                  value={settings.sessionTimeoutMinutes || 30}
                  onChange={(e) => setSettings({ ...settings, sessionTimeoutMinutes: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="أقصى عدد محاولات دخول فاشلة قبل الحظر">
                <input
                  type="number"
                  value={settings.maxFailedLogins || 5}
                  onChange={(e) => setSettings({ ...settings, maxFailedLogins: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="الحد الأدنى لطول كلمة المرور">
                <input
                  type="number"
                  value={settings.passwordMinLength || 10}
                  onChange={(e) => setSettings({ ...settings, passwordMinLength: e.target.value })}
                  className={inputClass}
                />
              </Field>
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="enforceMfa"
                  checked={settings.enforceMfa === 'true'}
                  onChange={(e) => setSettings({ ...settings, enforceMfa: e.target.checked ? 'true' : 'false' })}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="enforceMfa" className="text-xs font-semibold text-slate-700 cursor-pointer">
                  إلزام المصادقة متعددة العوامل (Enforce 2FA / TOTP) على كافة مسؤولي المنصة
                </label>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="passwordRequireComplex"
                  checked={settings.passwordRequireComplex !== 'false'}
                  onChange={(e) => setSettings({ ...settings, passwordRequireComplex: e.target.checked ? 'true' : 'false' })}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="passwordRequireComplex" className="text-xs font-semibold text-slate-700 cursor-pointer">
                  اشتراط تعقيد كلمة المرور (أحرف كبيرة وصغيرة، أرقام، ورموز خاصة)
                </label>
              </div>
            </div>

            {/* Key Management Section */}
            <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/40 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-indigo-600" /> مفاتيح التشفير المركزية (Server-Side Encryption)
                  </h4>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    المفاتيح الخاصة محفوظة داخل بيئة الخادم المشفرة (KMS / Environment) ولا تخزن داخل القاعدة المحلية.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  leadingIcon={<RotateCw className={`h-3.5 w-3.5 ${rotatingKey ? 'animate-spin' : ''}`} />}
                  onClick={handleRotateEncryptionKeys}
                  disabled={rotatingKey || !canManageSettings}
                >
                  تدوير المفاتيح الآن
                </Button>
              </div>

              <div className="grid grid-cols-2 text-xs pt-2 border-t border-indigo-100 text-slate-600">
                <div>
                  مزود التشفير: <strong className="text-slate-800">{settings.kmsProvider || 'Server KMS'}</strong>
                </div>
                <div>
                  تاريخ آخر تدوير:{' '}
                  <strong className="text-slate-800 font-mono">
                    {formatDateTime(settings.lastEncryptionRotation || '2026-01-01')}
                  </strong>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 7. Backup & Retention */}
        {activeTab === 'backup' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-bold text-slate-900">سياسة النسخ الاحتياطي والاحتفاظ بالبيانات</h3>
              <p className="text-xs text-slate-500">جدولة إنشاء النسخ الاحتياطية المشفرة وتحديد مدة الاستبقاء.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="دورية النسخ الاحتياطي التلقائي">
                <select
                  value={settings.backupFrequency || 'DAILY'}
                  onChange={(e) => setSettings({ ...settings, backupFrequency: e.target.value as any })}
                  className={inputClass}
                >
                  <option value="DAILY">يومياً (منتصف الليل)</option>
                  <option value="TWICE_DAILY">مرتين يومياً (كل 12 ساعة)</option>
                  <option value="WEEKLY">أسبوعياً</option>
                </select>
              </Field>
              <Field label="مدة الاحتفاظ بالنسخ (Retention بالـ أيام)">
                <input
                  type="number"
                  value={settings.backupRetentionDays || 90}
                  onChange={(e) => setSettings({ ...settings, backupRetentionDays: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="وجهة التخزين الآمن">
                <select
                  value={settings.backupStorageTarget || 'CLOUD_ENCRYPTED'}
                  onChange={(e) => setSettings({ ...settings, backupStorageTarget: e.target.value as any })}
                  className={inputClass}
                >
                  <option value="CLOUD_ENCRYPTED">سحابة مشفرة بتوقيع AES-256</option>
                  <option value="LOCAL_SECURE">مخزن محلي آمن ومعزول</option>
                </select>
              </Field>
            </div>
          </div>
        )}

        {/* 8. Personal Password Tab */}
        {activeTab === 'password' && (
          <div className="space-y-6 max-w-md">
            <div>
              <h3 className="text-sm font-bold text-slate-900">تغيير كلمة مرور حسابك الحالي</h3>
              <p className="text-xs text-slate-500">حسابك الحالي: {currentUser.fullName} ({currentUser.username})</p>
            </div>

            {passwordError && (
              <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-700">
                {passwordError}
              </div>
            )}

            <div className="space-y-3">
              <Field label="كلمة المرور الحالية">
                <input
                  type="password"
                  value={passwordForm.current}
                  onChange={(e) => setPasswordForm({ ...passwordForm, current: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="كلمة المرور الجديدة">
                <input
                  type="password"
                  value={passwordForm.next}
                  onChange={(e) => setPasswordForm({ ...passwordForm, next: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="تأكيد كلمة المرور الجديدة">
                <input
                  type="password"
                  value={passwordForm.confirm}
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Button
                variant="primary"
                size="sm"
                onClick={changePassword}
                disabled={changingPassword || !passwordForm.current || !passwordForm.next}
                leadingIcon={<KeyRound className="h-3.5 w-3.5" />}
              >
                {changingPassword ? 'جارٍ التغيير...' : 'تحديث كلمة المرور'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PlatformSettingsPage;
