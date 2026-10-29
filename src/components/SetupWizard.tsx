import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Store, Percent, CheckCircle2, ArrowLeft, ArrowRight, Loader2,
  ShieldCheck, Boxes, Layers, Shirt, Zap, Sofa, Car, Apple,
  Sparkles, Wrench, Package, ShoppingBag, Gem, Tv, Coffee,
  Building2, Palette, BookOpen, Settings2,
  Users, BarChart3, Shield, Check, X, Phone, MapPin,
  FileText, DollarSign, Lock, Eye, EyeOff, Star, Rocket,
  Warehouse, ClipboardList, Activity,
  Hash, Tag, Ruler,
} from 'lucide-react';
import bcrypt from 'bcryptjs';
import { DatabaseManager } from '../database/db';
import { SettingsService } from '../services/SettingsService';
import { AuthService } from '../services/AuthService';
import { useToast } from './ui/Toast';
import {
  BUSINESS_UNITS,
  BUSINESS_MODULES,
  BUSINESS_TYPES,
  getDefaultBusinessConfiguration,
  getProfileModuleIds,
  parseBusinessConfiguration,
  parseEnabledModules,
  type BusinessConfiguration,
} from '../config/businessProfiles';
import { getModuleDefinition, validateModuleSelection, withModuleDependencies } from '../config/moduleRegistry';
import { ModuleRegistryService } from '../services/ModuleRegistryService';
import { BusinessProfileService } from '../services/BusinessProfileService';

interface SetupWizardProps {
  onComplete: () => void;
}

/** Detect whether the built-in admin account still uses the default password. */
function readDefaultAdminState(): { required: boolean; userId: string } {
  try {
    if (AuthService.getCurrentUser()?.role !== 'ADMIN') return { required: false, userId: '' };
    const admin = DatabaseManager.getInstance().query<any>(
      `SELECT id, password_hash AS passwordHash FROM users WHERE username = 'admin' LIMIT 1`
    )[0];
    if (admin && bcrypt.compareSync('admin123', admin.passwordHash)) {
      return { required: true, userId: admin.id };
    }
  } catch { /* ignore */ }
  return { required: false, userId: '' };
}

const CURRENCIES = [
  { code: 'EGP', symbol: 'ج.م', label: 'جنيه مصري' },
  { code: 'SAR', symbol: 'ر.س', label: 'ريال سعودي' },
  { code: 'AED', symbol: 'د.إ', label: 'درهم إماراتي' },
  { code: 'USD', symbol: '$', label: 'دولار أمريكي' },
];

const STEPS = [
  { label: 'بيانات المعرض', icon: Store },
  { label: 'نوع النشاط والوحدات', icon: Boxes },
  { label: 'الإعدادات المالية', icon: Settings2 },
  { label: 'جاهز للانطلاق', icon: Rocket },
] as const;

export const SetupWizard: React.FC<SetupWizardProps> = ({ onComplete }) => {
  const toast = useToast();
  const bodyRef = useRef<HTMLDivElement>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(0);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [security, setSecurity] = useState(readDefaultAdminState);
  const [form, setForm] = useState(() => {
    let current: ReturnType<typeof SettingsService.getSettings> | null = null;
    try { current = SettingsService.getSettings(); } catch { current = null; }
    const businessType = SettingsService.getValue('businessType') || 'ceramics';
    return {
      showroomName: current?.showroomName || '',
      businessType,
      businessTypeLabel: SettingsService.getValue('businessTypeLabel') || '',
      enabledModules: parseEnabledModules(SettingsService.getValue('enabledModules'), businessType),
      phone: current?.phone || '',
      address: current?.address || '',
      taxNumber: current?.taxNumber || '',
      commercialRecord: current?.commercialRecord || '',
      currency: current?.currency || 'EGP',
      currencySymbol: current?.currencySymbol || 'ج.م',
      taxPercentage: String(current?.defaultTaxPercentage ?? 0),
      lowStockThreshold: String(current?.lowStockAlertThresholdM2 ?? 20),
      discountThreshold: String(current?.discountApprovalThresholdPercent ?? 10),
      isTaxInclusive: current?.isTaxInclusive ?? false,
      enableNegativeStock: current?.enableNegativeStock ?? false,
      costingMethod: current?.costingMethod ?? 'AVERAGE_COST',
    };
  });
  const [businessConfig, setBusinessConfig] = useState<BusinessConfiguration>(() => {
    const businessType = SettingsService.getValue('businessType') || 'ceramics';
    return parseBusinessConfiguration(SettingsService.getValue('businessProfileConfig'), businessType);
  });

  const currencySymbol = useMemo(
    () => CURRENCIES.find((c) => c.code === form.currency)?.symbol || form.currencySymbol,
    [form.currency, form.currencySymbol]
  );

  const set = (key: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const selectBusinessType = (businessType: string) => {
    setForm((prev) => ({
      ...prev,
      businessType,
      enabledModules: getProfileModuleIds(businessType),
    }));
    setBusinessConfig(getDefaultBusinessConfiguration(businessType));
  };

  const updateBusinessConfig = (patch: Partial<BusinessConfiguration>) =>
    setBusinessConfig((current) => ({ ...current, ...patch }));

  const setInventoryEnabled = (enabled: boolean) => {
    updateBusinessConfig({ trackInventory: enabled });
    setForm((current) => ({
      ...current,
      enabledModules: enabled
        ? [...new Set([...current.enabledModules, 'inventory'])]
        : current.enabledModules.filter((module) => module !== 'inventory'),
    }));
  };

  const toggleModule = (id: string) => setForm((prev) => ({
    ...prev,
    enabledModules: prev.enabledModules.includes(id)
      ? prev.enabledModules.filter((module) => module !== id)
      : withModuleDependencies([...prev.enabledModules, id]),
  }));

  const canContinue = step !== 0 || form.showroomName.trim().length >= 2;

  // The default password may have been changed from the forced-password modal
  // (or another window) after this wizard mounted, so re-check before deciding
  // whether the admin password fields are still required.
  useEffect(() => {
    if (!security.required || step < 2) return;
    const current = readDefaultAdminState();
    if (!current.required) setSecurity(current);
  }, [step, security.required]);

  // Keep the wizard usable on short screens: whenever the step changes, scroll the
  // content area back to the top and move focus to the new step heading.
  useEffect(() => {
    if (previousStep.current === step) return;
    previousStep.current = step;
    bodyRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    stepHeadingRef.current?.focus({ preventScroll: true });
  }, [step]);

  const passwordValid = !security.required
    || (newPassword.length >= 8 && newPassword === confirmPassword);

  const finish = async () => {
    if (form.showroomName.trim().length < 2) {
      setStep(0);
      toast.error('اسم المعرض مطلوب (حرفان على الأقل)');
      return;
    }
    if (form.businessType === 'custom' && form.businessTypeLabel.trim().length < 2) {
      setStep(1);
      toast.error('اكتب اسم النشاط التجاري (حرفان على الأقل)');
      return;
    }
    const taxPercentage = Number(form.taxPercentage);
    const lowStockThreshold = Number(form.lowStockThreshold);
    const discountThreshold = Number(form.discountThreshold);
    if (![taxPercentage, lowStockThreshold, discountThreshold].every(Number.isFinite)
      || taxPercentage < 0 || taxPercentage > 100
      || lowStockThreshold < 0
      || discountThreshold < 0 || discountThreshold > 100) {
      setStep(2);
      toast.error('راجع نسبة الضريبة وحدود المخزون والخصم قبل المتابعة');
      return;
    }
    const activeSecurity = readDefaultAdminState();
    if (activeSecurity.required !== security.required) setSecurity(activeSecurity);
    const requiresPassword = activeSecurity.required;
    if (requiresPassword && !(newPassword.length >= 8 && newPassword === confirmPassword)) {
      setStep(2);
      toast.error('يجب تغيير كلمة مرور المسؤول الافتراضية (8 أحرف على الأقل)');
      return;
    }
    const moduleValidation = validateModuleSelection(form.enabledModules, {
      trackInventory: businessConfig.trackInventory,
    });
    if (moduleValidation.errors.length > 0) {
      setStep(1);
      toast.error('راجع الوحدات المفعّلة', moduleValidation.errors.join(' '));
      return;
    }
    setSaving(true);
    try {
      if (requiresPassword) {
        const current = AuthService.getCurrentUser();
        // Changing the signed-in admin's own password keeps this session active;
        // resetPassword is reserved for other accounts.
        if (current && current.id === activeSecurity.userId) {
          new AuthService().changeOwnPassword(current.id, 'admin123', newPassword);
        } else {
          new AuthService().resetPassword(activeSecurity.userId, newPassword);
        }
      }
      SettingsService.update({
        showroomName: form.showroomName.trim(),
        businessType: form.businessType,
        businessProfileConfig: JSON.stringify({ ...businessConfig, businessType: form.businessType }),
        businessTypeLabel: form.businessType === 'custom'
          ? form.businessTypeLabel.trim()
          : BUSINESS_TYPES.find((type) => type.id === form.businessType)?.label || '',
        phone: form.phone.trim(),
        address: form.address.trim(),
        taxNumber: form.taxNumber.trim(),
        commercialRecord: form.commercialRecord.trim(),
        currency: form.currency,
        currencySymbol: currencySymbol,
        defaultTaxPercentage: taxPercentage,
        isTaxInclusive: form.isTaxInclusive,
        enableNegativeStock: form.enableNegativeStock,
        costingMethod: form.costingMethod,
        lowStockAlertThresholdM2: lowStockThreshold,
        discountApprovalThresholdPercent: discountThreshold,
      });
      ModuleRegistryService.setEnabledModules(moduleValidation.enabled, AuthService.getCurrentUser(), 'إعداد أولي');
      // Materialize the profile's attribute names so the product form is usable
      // immediately after setup instead of showing an empty attributes panel.
      BusinessProfileService.applyFromSettings();
      DatabaseManager.getInstance().run(
        `INSERT OR REPLACE INTO system_settings (key, value) VALUES ('setup_completed', '1')`
      );
      // Persist immediately so the wizard does not reappear after a restart even
      // if the app is closed before the regular autosave tick.
      try {
        await DatabaseManager.getInstance().flush();
      } catch (error) {
        console.warn('Setup persistence flush failed:', error);
      }
      toast.success('تم إعداد النظام بنجاح، مرحبًا بك في CeramiSys');
      onComplete();
    } catch (e: any) {
      toast.error(e?.message || 'تعذر حفظ إعدادات النظام');
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'w-full min-h-10 px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500';
  const labelClass = 'block text-xs font-semibold text-slate-600 mb-1.5 dark:text-slate-300';

  return (
    <div
      className="flex min-h-dvh w-full items-center justify-center bg-gradient-to-br from-slate-100 via-white to-sky-50 p-2 sm:p-4 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950"
      dir="rtl"
    >
      <div className="flex max-h-[calc(100dvh-1rem)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/10 sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl dark:border-slate-800 dark:bg-slate-900">
        {/* Header stays visible while only the step content scrolls. */}
        <header className="shrink-0 bg-gradient-to-l from-sky-600 to-indigo-600 px-4 py-4 text-white sm:px-6 sm:py-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 sm:h-11 sm:w-11">
                <Store className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-base font-black sm:text-lg">إعداد نظام ERP</h1>
                <p className="truncate text-[11px] text-sky-100 sm:text-xs">خصص النظام لنشاط معرضك قبل بدء العمل</p>
              </div>
            </div>
            <span
              className="shrink-0 rounded-full border border-white/25 bg-white/10 px-2.5 py-1 text-[10px] font-bold sm:text-[11px]"
              aria-live="polite"
            >
              الخطوة {step + 1} من {STEPS.length}
            </span>
          </div>

          <div className="mt-4">
            <div className="grid grid-cols-4 gap-1.5 sm:gap-2" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={step + 1} aria-label="تقدم الإعداد">
              {STEPS.map((item, index) => (
                <div key={item.label} aria-hidden="true">
                  <div className={`h-1.5 rounded-full transition-colors ${index <= step ? 'bg-white' : 'bg-white/25'}`} />
                </div>
              ))}
            </div>
            <div className="mt-2 hidden grid-cols-4 gap-2 sm:grid">
              {STEPS.map((item, index) => {
                const Icon = item.icon;
                const reached = index <= step;
                return (
                  <div
                    key={item.label}
                    className={`flex min-w-0 items-center gap-1 text-[10px] font-semibold ${reached ? 'text-white' : 'text-sky-200/70'}`}
                  >
                    {index < step ? (
                      <Check className="h-3 w-3 shrink-0" aria-hidden="true" />
                    ) : (
                      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
                    )}
                    <span className="truncate">{item.label}</span>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] font-semibold text-sky-100 sm:hidden" aria-live="polite">
              {STEPS[step].label}
            </p>
          </div>
        </header>

        <div
          ref={bodyRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5"
        >
          <h2 ref={stepHeadingRef} tabIndex={-1} className="sr-only">
            {STEPS[step].label}
          </h2>
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <label htmlFor="setup-showroom-name" className={labelClass}>اسم المعرض / الشركة *</label>
                <input
                  id="setup-showroom-name"
                  value={form.showroomName}
                  onChange={(e) => set('showroomName', e.target.value)}
                  className={inputClass}
                  placeholder="مثال: معرض النور للسيراميك"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="setup-phone" className={labelClass}>رقم الهاتف</label>
                  <input id="setup-phone" value={form.phone} onChange={(e) => set('phone', e.target.value)} className={inputClass} placeholder="01000000000" />
                </div>
                <div>
                  <label htmlFor="setup-currency" className={labelClass}>العملة</label>
                  <select
                    id="setup-currency"
                    value={form.currency}
                    onChange={(e) => {
                      const next = CURRENCIES.find((c) => c.code === e.target.value);
                      setForm((prev) => ({ ...prev, currency: e.target.value, currencySymbol: next?.symbol || prev.currencySymbol }));
                    }}
                    className={inputClass}
                  >
                    {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="setup-address" className={labelClass}>العنوان</label>
                <input id="setup-address" value={form.address} onChange={(e) => set('address', e.target.value)} className={inputClass} placeholder="المدينة - الشارع" />
              </div>
              <p className="text-xs font-semibold text-slate-600">بيانات التسجيل الاختيارية</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="setup-tax-number" className={labelClass}>الرقم الضريبي</label>
                  <input id="setup-tax-number" value={form.taxNumber} onChange={(e) => set('taxNumber', e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="setup-commercial-record" className={labelClass}>السجل التجاري</label>
                  <input id="setup-commercial-record" value={form.commercialRecord} onChange={(e) => set('commercialRecord', e.target.value)} className={inputClass} />
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-xl border border-sky-100 bg-sky-50 p-3">
                <Boxes className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" />
                <div><h2 className="text-sm font-bold text-slate-900">خصص النظام حسب طبيعة عملك</h2><p className="mt-1 text-xs text-slate-600">تُحفظ هذه الخيارات محليًا ويمكن تعديلها لاحقًا من إعدادات النشاط.</p></div>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {BUSINESS_TYPES.map((type) => <button key={type.id} type="button" onClick={() => selectBusinessType(type.id)} className={`rounded-xl border p-3 text-right transition ${form.businessType === type.id ? 'border-sky-500 bg-sky-50 ring-1 ring-sky-500' : 'border-slate-200 hover:border-sky-300'}`}>
                  <span className="block text-xs font-bold text-slate-900">{type.label}</span><span className="mt-1 block text-[10px] text-slate-500">{type.description}</span>
                </button>)}
              </div>
              {form.businessType === 'custom' && (
                <div>
                  <label htmlFor="setup-business-type-label" className={labelClass}>اسم النشاط التجاري *</label>
                  <input
                    id="setup-business-type-label"
                    value={form.businessTypeLabel}
                    onChange={(e) => set('businessTypeLabel', e.target.value)}
                    className={inputClass}
                    placeholder="مثال: معرض أدوات رياضية"
                  />
                </div>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="setup-business-model" className={labelClass}>نموذج العمل</label>
                  <select id="setup-business-model" value={businessConfig.businessModel} onChange={(e) => updateBusinessConfig({ businessModel: e.target.value as BusinessConfiguration['businessModel'] })} className={inputClass}>
                    <option value="products">بيع منتجات</option>
                    <option value="services">تقديم خدمات</option>
                    <option value="mixed">منتجات وخدمات</option>
                  </select>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 text-xs font-semibold text-slate-700">
                  <label htmlFor="setup-track-inventory" className="cursor-pointer">إدارة المخزون</label>
                  <input id="setup-track-inventory" type="checkbox" checked={businessConfig.trackInventory} onChange={(e) => setInventoryEnabled(e.target.checked)} className="h-4 w-4 accent-sky-600" />
                </div>
              </div>
              <div>
                <h3 className="mb-2 text-xs font-bold text-slate-700">وحدات المنتجات والخدمات</h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {BUSINESS_UNITS.map((unit) => (
                    <div key={unit.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">
                      <input id={`setup-unit-${unit.id}`} type="checkbox" checked={businessConfig.units.includes(unit.id)} onChange={() => updateBusinessConfig({ units: businessConfig.units.includes(unit.id) ? businessConfig.units.filter((id) => id !== unit.id) : [...businessConfig.units, unit.id] })} className="accent-sky-600" />
                      <label htmlFor={`setup-unit-${unit.id}`} className="cursor-pointer">{unit.label}</label>
                    </div>
                  ))}
                </div>
                <label htmlFor="setup-custom-units" className={`${labelClass} mt-2`}>وحدات مخصصة (مفصولة بفواصل)</label>
                <input
                  id="setup-custom-units"
                  value={businessConfig.customUnits.join(', ')}
                  onChange={(e) => updateBusinessConfig({ customUnits: e.target.value.split(',').map((unit) => unit.trim()).filter(Boolean) })}
                  className={inputClass}
                  placeholder="وحدات مخصصة، مفصولة بفواصل"
                />
              </div>
              <div>
                <label htmlFor="setup-product-attributes" className={labelClass}>خصائص المنتجات (مفصولة بفواصل)</label>
                <input
                  id="setup-product-attributes"
                  value={businessConfig.productAttributes.join(', ')}
                  onChange={(e) => updateBusinessConfig({ productAttributes: e.target.value.split(',').map((attribute) => attribute.trim()).filter(Boolean) })}
                  className={inputClass}
                  placeholder="مثال: المقاس، اللون، الموديل"
                />
              </div>
              <div><h3 className="mb-2 text-xs font-bold text-slate-700">الوحدات التي تحتاجها</h3><div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {BUSINESS_MODULES.map((module) => {
                  const definition = getModuleDefinition(module.id);
                  const unavailable = Boolean(definition?.activation.requiresInventoryTracking && !businessConfig.trackInventory);
                  return (
                    <div key={module.id} title={definition?.description} className={`flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 ${unavailable ? 'opacity-50' : ''}`}>
                      <input id={`setup-module-${module.id}`} type="checkbox" checked={form.enabledModules.includes(module.id)} onChange={() => toggleModule(module.id)} disabled={unavailable} className="accent-sky-600" />
                      <label htmlFor={`setup-module-${module.id}`} className="cursor-pointer">{module.label}</label>
                    </div>
                  );
                })}
              </div></div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="setup-default-tax" className={labelClass}>نسبة ضريبة القيمة المضافة الافتراضية %</label>
                  <div className="relative">
                    <Percent className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                    <input
                      id="setup-default-tax"
                      type="number" min="0" max="100" step="0.1"
                      value={form.taxPercentage}
                      onChange={(e) => set('taxPercentage', e.target.value)}
                      className={`${inputClass} pl-9`}
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="setup-low-stock-threshold" className={labelClass}>حد التنبيه للمخزون المنخفض (بوحدة الصنف)</label>
                  <input
                    id="setup-low-stock-threshold"
                    type="number" min="0" step="0.5"
                    value={form.lowStockThreshold}
                    onChange={(e) => set('lowStockThreshold', e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="setup-discount-threshold" className={labelClass}>حد الخصم المسموح بدون اعتماد %</label>
                <input
                  id="setup-discount-threshold"
                  type="number" min="0" max="100" step="0.5"
                  value={form.discountThreshold}
                  onChange={(e) => set('discountThreshold', e.target.value)}
                  className={inputClass}
                />
                <p className="text-[11px] text-slate-500 mt-1.5">
                  أي خصم يتجاوز هذه النسبة سيُرسل كطلب اعتماد للمسؤول من نقطة البيع.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 text-xs font-semibold text-slate-700">
                  <label htmlFor="setup-is-tax-inclusive" className="cursor-pointer">الأسعار شاملة الضريبة</label>
                  <input id="setup-is-tax-inclusive" type="checkbox" checked={form.isTaxInclusive} onChange={(e) => setForm((prev) => ({ ...prev, isTaxInclusive: e.target.checked }))} className="h-4 w-4 accent-sky-600" />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 text-xs font-semibold text-slate-700">
                  <label htmlFor="setup-enable-negative-stock" className="cursor-pointer">السماح بالبيع من رصيد سالب</label>
                  <input id="setup-enable-negative-stock" type="checkbox" checked={form.enableNegativeStock} onChange={(e) => setForm((prev) => ({ ...prev, enableNegativeStock: e.target.checked }))} className="h-4 w-4 accent-sky-600" />
                </div>
              </div>
              <div>
                <label htmlFor="setup-costing-method" className={labelClass}>طريقة احتساب تكلفة المخزون</label>
                <select id="setup-costing-method" value={form.costingMethod} onChange={(e) => setForm((prev) => ({ ...prev, costingMethod: e.target.value as 'AVERAGE_COST' | 'FIFO' }))} className={inputClass}>
                  <option value="AVERAGE_COST">متوسط التكلفة</option>
                  <option value="FIFO">الوارد أولاً يصرف أولاً (FIFO)</option>
                </select>
                <p className="mt-1.5 text-[11px] text-slate-500">طريقة التكلفة تؤثر على تقييم المخزون والأرباح.</p>
              </div>

              {security.required && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <ShieldCheck className="w-4 h-4 text-amber-600" />
                    <h3 className="text-xs font-bold text-amber-800">تأمين حساب المسؤول</h3>
                  </div>
                  <p className="text-[11px] text-amber-700 mb-3">
                    لا يزال حساب admin يستخدم كلمة المرور الافتراضية. اختر كلمة مرور جديدة للمتابعة.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="setup-admin-password" className={labelClass}>كلمة المرور الجديدة</label>
                      <input
                        id="setup-admin-password"
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className={inputClass}
                        placeholder="8 أحرف على الأقل"
                      />
                    </div>
                    <div>
                      <label htmlFor="setup-admin-password-confirmation" className={labelClass}>تأكيد كلمة المرور</label>
                      <input
                        id="setup-admin-password-confirmation"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className={inputClass}
                      />
                    </div>
                  </div>
                  {newPassword && newPassword.length < 8 && (
                    <p className="text-[11px] text-rose-600 mt-2">كلمة المرور قصيرة جدًا.</p>
                  )}
                  {confirmPassword && newPassword !== confirmPassword && (
                    <p className="text-[11px] text-rose-600 mt-2">كلمتا المرور غير متطابقتين.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h2 className="text-center text-base font-black text-slate-900">كل شيء جاهز</h2>
              <p className="text-center text-xs text-slate-500">راجع الملخص ثم اضغط «بدء الاستخدام».</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                {[
                  ['المعرض', form.showroomName || '—'],
                  ['نوع النشاط', form.businessType === 'custom' ? form.businessTypeLabel || 'نشاط مخصص' : BUSINESS_TYPES.find((type) => type.id === form.businessType)?.label || 'معرض متعدد الأنشطة'],
                  ['الوحدات المفعلة', `${form.enabledModules.length} وحدات`],
                  ['نموذج العمل', businessConfig.businessModel === 'services' ? 'خدمات' : businessConfig.businessModel === 'mixed' ? 'منتجات وخدمات' : 'منتجات'],
                  ['إدارة المخزون', businessConfig.trackInventory ? 'مفعلة' : 'معطلة'],
                  ['وحدات القياس', `${businessConfig.units.length + businessConfig.customUnits.length} وحدات`],
                  ['الهاتف', form.phone || '—'],
                  ['العملة', `${form.currency} (${currencySymbol})`],
                  ['الضريبة الافتراضية', `${form.taxPercentage || 0}%`],
                  ['تنبيه المخزون', `${form.lowStockThreshold || 0} بوحدة الصنف`],
                  ['حد اعتماد الخصم', `${form.discountThreshold || 0}%`],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between px-3 py-2.5 bg-slate-50 rounded-lg border border-slate-100">
                    <span className="text-[11px] text-slate-500">{label}</span>
                    <span className="text-xs font-bold text-slate-900">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || saving}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-slate-600 rounded-lg hover:bg-slate-200 disabled:opacity-40"
          >
            <ArrowRight className="w-4 h-4" /> السابق
          </button>
          {step < 3 ? (
            <button
              onClick={() => canContinue && setStep((s) => s + 1)}
              disabled={!canContinue || (step === 2 && !passwordValid)}
              className="flex items-center gap-1.5 px-5 py-2 bg-sky-600 text-white rounded-lg text-sm font-bold hover:bg-sky-700 disabled:opacity-40"
            >
              التالي <ArrowLeft className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={finish}
              disabled={saving}
              className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              بدء الاستخدام
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
