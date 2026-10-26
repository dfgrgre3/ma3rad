import React, { useMemo, useState } from 'react';
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
import { NAV_STORAGE_KEYS } from '../config/navigation';

interface SetupWizardProps {
  onComplete: () => void;
}

const CURRENCIES = [
  { code: 'EGP', symbol: 'ج.م', label: 'جنيه مصري' },
  { code: 'SAR', symbol: 'ر.س', label: 'ريال سعودي' },
  { code: 'AED', symbol: 'د.إ', label: 'درهم إماراتي' },
  { code: 'USD', symbol: '$', label: 'دولار أمريكي' },
];

const BUSINESS_TYPES = [
  { id: 'ceramics', label: 'سيراميك وبورسلين', description: 'مساحات ومقاسات ومخزون بالمتر والكرتونة' },
  { id: 'building_materials', label: 'مواد بناء وتشطيب', description: 'أصناف متنوعة ومخازن ومشتريات' },
  { id: 'sanitary', label: 'أدوات صحية', description: 'منتجات وماركات ومبيعات المعرض' },
  { id: 'lighting', label: 'إضاءة وكهرباء', description: 'كتالوج أصناف وباركود ومخزون' },
  { id: 'furniture', label: 'أثاث وديكور', description: 'طلبات ومشروعات وتسليمات' },
  { id: 'electronics', label: 'أجهزة وإلكترونيات', description: 'أجهزة برقم تسلسلي وضمان ومتابعة مخزون' },
  { id: 'clothing', label: 'ملابس وأحذية', description: 'مقاسات وألوان وموديلات وبيع بالتجزئة' },
  { id: 'automotive', label: 'قطع غيار وسيارات', description: 'أصناف وموردون ومخزون وطلبات شراء' },
  { id: 'home_appliances', label: 'أجهزة منزلية', description: 'منتجات وضمانات وتوصيل ومتابعة العملاء' },
  { id: 'cosmetics', label: 'عطور ومستحضرات تجميل', description: 'كتالوج منتجات ومخزون ومبيعات' },
  { id: 'food', label: 'مواد غذائية وسوبر ماركت', description: 'أصناف سريعة الحركة ومشتريات ومخزون' },
  { id: 'general', label: 'معرض متعدد الأنشطة', description: 'تخصيص مرن لأي نشاط تجاري' },
];

const MODULES = [
  { id: 'sales', label: 'المبيعات ونقطة البيع', paths: ['/daily/sales', '/pos', '/sales', '/sales/analytics', '/quotations', '/orders', '/returns'] },
  { id: 'inventory', label: 'المخزون والمنتجات', paths: ['/inventory', '/inventory/warehouse-stock', '/inventory/showroom-stock', '/inventory/ledger', '/inventory/transfers', '/inventory/counts', '/inventory/valuation', '/inventory/adjustments', '/inventory/reservations', '/products', '/categories', '/brands', '/products/attributes', '/pricing', '/promotions', '/products/barcodes'] },
  { id: 'customers', label: 'العملاء والمشروعات', paths: ['/customers', '/customers/imported-products', '/customers/ready-deliveries', '/crm/leads', '/crm/pipeline', '/crm/activities', '/crm/campaigns', '/projects'] },
  { id: 'purchasing', label: 'المشتريات والموردون', paths: ['/daily/purchases', '/suppliers', '/purchases/requests', '/purchases/orders', '/purchases/incoming', '/purchases', '/purchases/returns'] },
  { id: 'finance', label: 'الحسابات والمالية', paths: ['/daily/expenses', '/daily/debts', '/finance', '/cashboxes', '/finance/expenses', '/finance/accounts', '/finance/journal', '/finance/cheques', '/finance/assets', '/finance/debts', '/finance/other-receivables', '/finance/installments'] },
  { id: 'operations', label: 'الفروع والموظفون والتوصيل', paths: ['/branches', '/warehouses', '/employees', '/employees/attendance', '/employees/payroll', '/employees/commissions', '/deliveries', '/drivers', '/vehicles'] },
  { id: 'reports', label: 'التقارير', paths: ['/reports', '/reports/statements', '/reports/profit-loss', '/reports/tax'] },
  { id: 'approvals', label: 'الموافقات', paths: ['/approvals'] },
];

const PROFILE_MODULES: Record<string, string[]> = {
  ceramics: ['sales', 'inventory', 'customers', 'purchasing', 'finance', 'operations', 'reports', 'approvals'],
  building_materials: ['sales', 'inventory', 'customers', 'purchasing', 'finance', 'operations', 'reports', 'approvals'],
  sanitary: ['sales', 'inventory', 'customers', 'purchasing', 'finance', 'reports'],
  lighting: ['sales', 'inventory', 'customers', 'purchasing', 'finance', 'reports'],
  furniture: ['sales', 'inventory', 'customers', 'purchasing', 'finance', 'operations', 'reports'],
  electronics: ['sales', 'inventory', 'customers', 'purchasing', 'finance', 'operations', 'reports', 'approvals'],
  clothing: ['sales', 'inventory', 'customers', 'purchasing', 'finance', 'reports'],
  automotive: ['sales', 'inventory', 'customers', 'purchasing', 'finance', 'operations', 'reports', 'approvals'],
  home_appliances: ['sales', 'inventory', 'customers', 'purchasing', 'finance', 'operations', 'reports'],
  cosmetics: ['sales', 'inventory', 'customers', 'purchasing', 'finance', 'reports'],
  food: ['sales', 'inventory', 'customers', 'purchasing', 'finance', 'operations', 'reports'],
  general: MODULES.map((module) => module.id),
};

export const SetupWizard: React.FC<SetupWizardProps> = ({ onComplete }) => {
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [security] = useState(() => {
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
  });
  const [form, setForm] = useState(() => {
    let current: ReturnType<typeof SettingsService.getSettings> | null = null;
    try { current = SettingsService.getSettings(); } catch { current = null; }
    return {
      showroomName: current?.showroomName || '',
      businessType: SettingsService.getValue('businessType') || 'ceramics',
      enabledModules: (() => {
        try { return JSON.parse(SettingsService.getValue('enabledModules') || ''); }
        catch { return PROFILE_MODULES.ceramics; }
      })() as string[],
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

  const currencySymbol = useMemo(
    () => CURRENCIES.find((c) => c.code === form.currency)?.symbol || form.currencySymbol,
    [form.currency, form.currencySymbol]
  );

  const set = (key: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const selectBusinessType = (businessType: string) => setForm((prev) => ({
    ...prev,
    businessType,
    enabledModules: PROFILE_MODULES[businessType] || PROFILE_MODULES.general,
  }));

  const toggleModule = (id: string) => setForm((prev) => ({
    ...prev,
    enabledModules: prev.enabledModules.includes(id)
      ? prev.enabledModules.filter((module) => module !== id)
      : [...prev.enabledModules, id],
  }));

  const canContinue = step !== 0 || form.showroomName.trim().length >= 2;

  const passwordValid = !security.required
    || (newPassword.length >= 8 && newPassword === confirmPassword);

  const finish = () => {
    if (form.showroomName.trim().length < 2) {
      setStep(0);
      toast.error('اسم المعرض مطلوب (حرفان على الأقل)');
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
    if (!passwordValid) {
      setStep(2);
      toast.error('يجب تغيير كلمة مرور المسؤول الافتراضية (8 أحرف على الأقل)');
      return;
    }
    setSaving(true);
    try {
      if (security.required) {
        new AuthService().resetPassword(security.userId, newPassword);
      }
      SettingsService.update({
        showroomName: form.showroomName.trim(),
        businessType: form.businessType,
        enabledModules: JSON.stringify(form.enabledModules),
        [NAV_STORAGE_KEYS.hidden]: JSON.stringify(MODULES.filter((module) => !form.enabledModules.includes(module.id)).flatMap((module) => module.paths)),
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
      DatabaseManager.getInstance().run(
        `INSERT OR REPLACE INTO system_settings (key, value) VALUES ('setup_completed', '1')`
      );
      toast.success('تم إعداد النظام بنجاح، مرحبًا بك في CeramiSys');
      onComplete();
    } catch (e: any) {
      toast.error(e?.message || 'تعذر حفظ إعدادات النظام');
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 bg-white';
  const labelClass = 'block text-xs font-semibold text-slate-600 mb-1.5';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-sky-50 flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl shadow-slate-900/10 border border-slate-200 overflow-hidden">
        <div className="bg-gradient-to-l from-sky-600 to-indigo-600 px-6 py-5 text-white">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center">
              <Store className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-black">إعداد نظام ERP</h1>
              <p className="text-xs text-sky-100">خصص النظام لنشاط معرضك قبل بدء العمل</p>
            </div>
          </div>
          <div className="flex gap-2 mt-5">
            {['بيانات المعرض', 'نوع النشاط والوحدات', 'الإعدادات المالية', 'جاهز للانطلاق'].map((label, index) => (
              <div key={label} className="flex-1">
                <div className={`h-1.5 rounded-full ${index <= step ? 'bg-white' : 'bg-white/25'}`} />
                <p className={`mt-2 text-[10px] font-semibold ${index <= step ? 'text-white' : 'text-sky-200'}`}>{label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="p-6 min-h-[290px]">
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <label className={labelClass}>اسم المعرض / الشركة *</label>
                <input
                  autoFocus
                  value={form.showroomName}
                  onChange={(e) => set('showroomName', e.target.value)}
                  className={inputClass}
                  placeholder="مثال: معرض النور للسيراميك"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>رقم الهاتف</label>
                  <input value={form.phone} onChange={(e) => set('phone', e.target.value)} className={inputClass} placeholder="01000000000" />
                </div>
                <div>
                  <label className={labelClass}>العملة</label>
                  <select
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
                <label className={labelClass}>العنوان</label>
                <input value={form.address} onChange={(e) => set('address', e.target.value)} className={inputClass} placeholder="المدينة - الشارع" />
              </div>
              <p className="text-xs font-semibold text-slate-600">بيانات التسجيل الاختيارية</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>الرقم الضريبي</label>
                  <input value={form.taxNumber} onChange={(e) => set('taxNumber', e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>السجل التجاري</label>
                  <input value={form.commercialRecord} onChange={(e) => set('commercialRecord', e.target.value)} className={inputClass} />
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-xl border border-sky-100 bg-sky-50 p-3">
                <Boxes className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" />
                <div><h2 className="text-sm font-bold text-slate-900">خصص النظام حسب نشاط المعرض</h2><p className="mt-1 text-xs text-slate-600">اختيار النشاط يجهز القوائم المناسبة، ويمكنك تغييرها لاحقًا من مركز التحكم.</p></div>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {BUSINESS_TYPES.map((type) => <button key={type.id} type="button" onClick={() => selectBusinessType(type.id)} className={`rounded-xl border p-3 text-right transition ${form.businessType === type.id ? 'border-sky-500 bg-sky-50 ring-1 ring-sky-500' : 'border-slate-200 hover:border-sky-300'}`}>
                  <span className="block text-xs font-bold text-slate-900">{type.label}</span><span className="mt-1 block text-[10px] text-slate-500">{type.description}</span>
                </button>)}
              </div>
              <div><h3 className="mb-2 text-xs font-bold text-slate-700">الوحدات التي تحتاجها</h3><div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {MODULES.map((module) => <label key={module.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"><input type="checkbox" checked={form.enabledModules.includes(module.id)} onChange={() => toggleModule(module.id)} className="accent-sky-600" />{module.label}</label>)}
              </div></div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>نسبة ضريبة القيمة المضافة الافتراضية %</label>
                  <div className="relative">
                    <Percent className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                    <input
                      type="number" min="0" max="100" step="0.1"
                      value={form.taxPercentage}
                      onChange={(e) => set('taxPercentage', e.target.value)}
                      className={`${inputClass} pl-9`}
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>حد التنبيه للمخزون المنخفض (بوحدة الصنف)</label>
                  <input
                    type="number" min="0" step="0.5"
                    value={form.lowStockThreshold}
                    onChange={(e) => set('lowStockThreshold', e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>
              <div>
                <label className={labelClass}>حد الخصم المسموح بدون اعتماد %</label>
                <input
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
                <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 text-xs font-semibold text-slate-700">
                  <span>الأسعار شاملة الضريبة</span>
                  <input type="checkbox" checked={form.isTaxInclusive} onChange={(e) => setForm((prev) => ({ ...prev, isTaxInclusive: e.target.checked }))} className="h-4 w-4 accent-sky-600" />
                </label>
                <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 text-xs font-semibold text-slate-700">
                  <span>السماح بالبيع من رصيد سالب</span>
                  <input type="checkbox" checked={form.enableNegativeStock} onChange={(e) => setForm((prev) => ({ ...prev, enableNegativeStock: e.target.checked }))} className="h-4 w-4 accent-sky-600" />
                </label>
              </div>
              <div>
                <label className={labelClass}>طريقة احتساب تكلفة المخزون</label>
                <select value={form.costingMethod} onChange={(e) => setForm((prev) => ({ ...prev, costingMethod: e.target.value as 'AVERAGE_COST' | 'FIFO' }))} className={inputClass}>
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
                      <label className={labelClass}>كلمة المرور الجديدة</label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className={inputClass}
                        placeholder="8 أحرف على الأقل"
                      />
                    </div>
                    <div>
                      <label className={labelClass}>تأكيد كلمة المرور</label>
                      <input
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
                  ['نوع النشاط', BUSINESS_TYPES.find((type) => type.id === form.businessType)?.label || 'معرض متعدد الأنشطة'],
                  ['الوحدات المفعلة', `${form.enabledModules.length} وحدات`],
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
