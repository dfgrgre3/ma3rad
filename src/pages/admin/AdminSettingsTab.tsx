import React, { useEffect, useMemo, useState } from 'react';
import {
  Save, Palette, Store, ReceiptText, Boxes, ShieldCheck, Truck, Upload, RotateCcw, Image as ImageIcon, Check,
} from 'lucide-react';
import { SettingsService } from '../../services/SettingsService';
import { AuthService } from '../../services/AuthService';
import { usePermission } from '../../hooks/usePermission';
import { useToast } from '../../components/ui/Toast';
import type { SystemSettings } from '../../types';
import {
  BUSINESS_MODULES,
  BUSINESS_TYPES,
  BUSINESS_UNITS,
  getDefaultBusinessConfiguration,
  parseBusinessConfiguration,
  parseEnabledModules,
  type BusinessConfiguration,
} from '../../config/businessProfiles';
import { ModuleRegistryService } from '../../services/ModuleRegistryService';
import { BusinessProfileService } from '../../services/BusinessProfileService';
import { CompaniesPanel } from '../../components/CompaniesPanel';
import { getModuleDefinition, validateModuleSelection, withModuleDependencies } from '../../config/moduleRegistry';

const inputCls =
  'w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500/30';
const labelCls = 'mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300';

type Tab = 'general' | 'business' | 'branding' | 'invoice' | 'inventory' | 'operations' | 'security';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'general', label: 'عام والمعرض', icon: Store },
  { id: 'business', label: 'النشاط والوحدات', icon: Boxes },
  { id: 'branding', label: 'الهوية والمظهر', icon: Palette },
  { id: 'invoice', label: 'الفواتير والطباعة', icon: ReceiptText },
  { id: 'inventory', label: 'المخزون والتكلفة', icon: Boxes },
  { id: 'operations', label: 'التشغيل والموافقات', icon: Truck },
  { id: 'security', label: 'الأمان والنسخ', icon: ShieldCheck },
];

export const AdminSettingsTab: React.FC = () => {
  const toast = useToast();
  const can = usePermission();
  const readOnly = !can('settings.update');
  const [tab, setTab] = useState<Tab>('general');
  const [settings, setSettings] = useState<SystemSettings>(() => SettingsService.getSettings());
  const [businessProfile, setBusinessProfile] = useState(readBusinessProfile);
  const [businessConfig, setBusinessConfig] = useState(readBusinessConfiguration);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setSettings(SettingsService.getSettings());
    setBusinessProfile(readBusinessProfile());
    setBusinessConfig(readBusinessConfiguration());
  }, []);

  const set = <K extends keyof SystemSettings>(key: K, value: SystemSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const save = () => {
    try {
      const customName = businessProfile.customName.trim();
      if (businessProfile.type === 'custom' && customName.length < 2) {
        toast.error('اكتب اسم النشاط التجاري (حرفان على الأقل).');
        setTab('business');
        return;
      }
      const businessTypeLabel = businessProfile.type === 'custom'
        ? customName
        : BUSINESS_TYPES.find((type) => type.id === businessProfile.type)?.label || '';
      const moduleValidation = validateModuleSelection(businessProfile.enabledModules, {
        trackInventory: businessConfig.trackInventory,
      });
      if (moduleValidation.errors.length > 0) {
        toast.error('تعذر تفعيل الوحدات', moduleValidation.errors.join(' '));
        setTab('business');
        return;
      }
      const enabledModules = moduleValidation.enabled;
      const currentModules = ModuleRegistryService.getEnabledModuleIds();
      for (const removed of currentModules.filter((id) => !enabledModules.includes(id))) {
        const blocker = ModuleRegistryService.getDeactivationBlocker(removed, enabledModules);
        if (blocker) {
          toast.error('لا يمكن تعطيل وحدة مستخدمة', blocker);
          setTab('business');
          return;
        }
      }
      if (businessProfile.type !== readBusinessProfile().type
        && !window.confirm('تغيير نوع النشاط سيغيّر الوحدات والقوائم الافتراضية فقط. لن تُحذف أو تُحوّل أي بيانات سابقة. هل تريد المتابعة؟')) return;
      const actor = AuthService.getCurrentUser();
      // Module lifecycle changes go through the registry so activation history,
      // dependency guards and navigation visibility stay in one transaction.
      ModuleRegistryService.setEnabledModules(enabledModules, actor, 'تحديث من إعدادات النشاط');
      const next = SettingsService.update({
        ...settings,
        businessType: businessProfile.type,
        businessTypeLabel,
        businessProfileConfig: JSON.stringify({ ...businessConfig, businessType: businessProfile.type }),
      }, actor);
      // Applying a profile also creates its declared product attributes; this is
      // additive and never removes manually created attributes.
      BusinessProfileService.applyFromSettings();
      setSettings(next);
      setBusinessProfile((current) => ({ ...current, enabledModules }));
      setDirty(false);
      toast.success('تم حفظ إعدادات النشاط وبقية الإعدادات بنجاح.', moduleValidation.warnings.join(' '));
    } catch (error: any) {
      toast.error('تعذر حفظ الإعدادات', error?.message || String(error));
    }
  };

  const resetDefaults = () => {
    if (!window.confirm('إرجاع الحقول المعروضة إلى القيم الافتراضية؟')) return;
    setSettings(SettingsService.getSettings());
    setBusinessProfile(readBusinessProfile());
    setBusinessConfig(readBusinessConfiguration());
    setDirty(false);
  };

  const selectBusinessType = (type: string) => {
    setBusinessProfile((current) => ({
      ...current,
      type,
      enabledModules: parseEnabledModules(undefined, type),
    }));
    setBusinessConfig(getDefaultBusinessConfiguration(type));
    setDirty(true);
  };

  const updateBusinessConfig = (patch: Partial<BusinessConfiguration>) => {
    setBusinessConfig((current) => ({ ...current, ...patch }));
    setDirty(true);
  };

  const setInventoryEnabled = (enabled: boolean) => {
    updateBusinessConfig({ trackInventory: enabled });
    setBusinessProfile((current) => ({
      ...current,
      enabledModules: enabled
        ? [...new Set([...current.enabledModules, 'inventory'])]
        : current.enabledModules.filter((module) => module !== 'inventory'),
    }));
  };

  const toggleBusinessModule = (moduleId: string) => {
    const definition = getModuleDefinition(moduleId);
    if (definition?.activation.requiresInventoryTracking && !businessConfig.trackInventory) {
      toast.error('الوحدة غير متاحة', definition.activation.requiresInventoryTracking
        ? 'فعّل تتبع المخزون أولًا من إعدادات النشاط.'
        : 'هذه الوحدة غير متاحة.');
      return;
    }
    const current = businessProfile.enabledModules;
    if (current.includes(moduleId)) {
      const next = withModuleDependencies(current.filter((id) => id !== moduleId));
      const blocker = ModuleRegistryService.getDeactivationBlocker(moduleId, next);
      if (blocker) {
        toast.error('لا يمكن تعطيل الوحدة', blocker);
        return;
      }
      setBusinessProfile((state) => ({ ...state, enabledModules: next }));
    } else {
      setBusinessProfile((state) => ({
        ...state,
        enabledModules: withModuleDependencies([...state.enabledModules, moduleId]),
      }));
    }
    setDirty(true);
  };

  const onLogo = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 400 * 1024) {
      toast.error('الشعار كبير جداً', 'اختر صورة أقل من 400KB لتُحفظ داخل قاعدة البيانات.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      set('brandLogoDataUrl', String(reader.result || ''));
    };
    reader.readAsDataURL(file);
  };

  const previewStyle = useMemo(
    () => ({
      background: `linear-gradient(to top right, ${settings.brandPrimaryColor || '#0284c7'}, ${settings.brandAccentColor || '#4f46e5'})`,
    }),
    [settings.brandPrimaryColor, settings.brandAccentColor]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                active
                  ? 'bg-sky-600 text-white shadow-lg shadow-sky-600/20'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="h-4 w-4" /> {item.label}
            </button>
          );
        })}
        <div className="mr-auto flex items-center gap-2">
          <button onClick={resetDefaults} className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
            <RotateCcw className="h-3.5 w-3.5" /> استرجاع
          </button>
          <button
            onClick={save}
            disabled={readOnly || !dirty}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-40"
          >
            <Save className="h-4 w-4" /> حفظ التغييرات
          </button>
        </div>
      </div>

      <fieldset disabled={readOnly} className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
        {tab === 'general' && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="اسم المعرض *"><input value={settings.showroomName} onChange={(e) => set('showroomName', e.target.value)} className={inputCls} /></Field>
            <Field label="الوصف / الشعار النصي"><input value={settings.tagline || ''} onChange={(e) => set('tagline', e.target.value)} className={inputCls} /></Field>
            <Field label="الهاتف الأساسي"><input value={settings.phone} onChange={(e) => set('phone', e.target.value)} className={`${inputCls} font-mono`} /></Field>
            <Field label="هاتف إضافي"><input value={settings.phone2 || ''} onChange={(e) => set('phone2', e.target.value)} className={`${inputCls} font-mono`} /></Field>
            <Field label="العنوان" full><input value={settings.address} onChange={(e) => set('address', e.target.value)} className={inputCls} /></Field>
            <Field label="الرقم الضريبي"><input value={settings.taxNumber || ''} onChange={(e) => set('taxNumber', e.target.value)} className={`${inputCls} font-mono`} /></Field>
            <Field label="السجل التجاري"><input value={settings.commercialRecord || ''} onChange={(e) => set('commercialRecord', e.target.value)} className={`${inputCls} font-mono`} /></Field>
            <Field label="العملة (كود)"><input value={settings.currency} onChange={(e) => set('currency', e.target.value)} className={`${inputCls} font-mono`} /></Field>
            <Field label="رمز العملة"><input value={settings.currencySymbol} onChange={(e) => set('currencySymbol', e.target.value)} className={inputCls} /></Field>
            <Field label="نسبة الضريبة الافتراضية %"><input type="number" min={0} step="0.01" value={settings.defaultTaxPercentage} onChange={(e) => set('defaultTaxPercentage', Number(e.target.value))} className={inputCls} /></Field>
            <Field label="الأسعار شاملة الضريبة">
              <Toggle checked={settings.isTaxInclusive} onChange={(v) => set('isTaxInclusive', v)} label={settings.isTaxInclusive ? 'نعم، شاملة' : 'لا، الضريبة تُضاف'} />
            </Field>
          </div>
        )}

        {tab === 'business' && (
          <div className="space-y-5">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">خصص النظام لنشاطك</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                غيّر نوع النشاط والوحدات الظاهرة في القائمة في أي وقت. إخفاء الوحدة لا يحذف بياناتها.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {BUSINESS_TYPES.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => selectBusinessType(type.id)}
                  className={`rounded-xl border p-3 text-right transition ${
                    businessProfile.type === type.id
                      ? 'border-sky-500 bg-sky-50 ring-1 ring-sky-500 dark:bg-sky-500/10'
                      : 'border-slate-200 hover:border-sky-300 dark:border-slate-700'
                  }`}
                >
                  <span className="block text-xs font-bold text-slate-900 dark:text-slate-100">{type.label}</span>
                  <span className="mt-1 block text-[10px] text-slate-500 dark:text-slate-400">{type.description}</span>
                </button>
              ))}
            </div>
            {businessProfile.type === 'custom' && (
              <Field label="اسم النشاط التجاري *">
                <input
                  value={businessProfile.customName}
                  onChange={(event) => {
                    setBusinessProfile((current) => ({ ...current, customName: event.target.value }));
                    setDirty(true);
                  }}
                  placeholder="مثال: معرض أدوات رياضية"
                  className={inputCls}
                />
              </Field>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="نموذج العمل">
                <select value={businessConfig.businessModel} onChange={(event) => updateBusinessConfig({ businessModel: event.target.value as BusinessConfiguration['businessModel'] })} className={inputCls}>
                  <option value="products">بيع منتجات</option>
                  <option value="services">تقديم خدمات</option>
                  <option value="mixed">منتجات وخدمات</option>
                </select>
              </Field>
              <Field label="إدارة المخزون">
                <Toggle checked={businessConfig.trackInventory} onChange={setInventoryEnabled} label={businessConfig.trackInventory ? 'مفعلة' : 'معطلة'} />
              </Field>
            </div>
            <div>
              <h4 className="mb-2 text-xs font-bold text-slate-700 dark:text-slate-300">وحدات القياس</h4>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {BUSINESS_UNITS.map((unit) => (
                  <label key={unit.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={businessConfig.units.includes(unit.id)}
                      onChange={() => updateBusinessConfig({ units: businessConfig.units.includes(unit.id) ? businessConfig.units.filter((id) => id !== unit.id) : [...businessConfig.units, unit.id] })}
                      className="accent-sky-600"
                    />
                    {unit.label}
                  </label>
                ))}
              </div>
              <input
                value={businessConfig.customUnits.join(', ')}
                onChange={(event) => updateBusinessConfig({ customUnits: event.target.value.split(',').map((unit) => unit.trim()).filter(Boolean) })}
                className={`${inputCls} mt-2`}
                placeholder="وحدات مخصصة، مفصولة بفواصل"
              />
            </div>
            <Field label="خصائص المنتجات (مفصولة بفواصل)" full>
              <input
                value={businessConfig.productAttributes.join(', ')}
                onChange={(event) => updateBusinessConfig({ productAttributes: event.target.value.split(',').map((attribute) => attribute.trim()).filter(Boolean) })}
                className={inputCls}
                placeholder="مثال: المقاس، اللون، الموديل"
              />
            </Field>
            <div>
              <CompaniesPanel />
            </div>
            <div>
              <h4 className="mb-2 text-xs font-bold text-slate-700 dark:text-slate-300">وحدات النظام</h4>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {BUSINESS_MODULES.map((module) => {
                  const definition = getModuleDefinition(module.id);
                  const unavailable = Boolean(definition?.activation.requiresInventoryTracking && !businessConfig.trackInventory);
                  return (
                    <label
                      key={module.id}
                      title={definition?.description}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-300 ${unavailable ? 'cursor-not-allowed opacity-60' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={businessProfile.enabledModules.includes(module.id)}
                        onChange={() => toggleBusinessModule(module.id)}
                        disabled={unavailable}
                        className="accent-sky-600"
                      />
                      {module.label}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {tab === 'branding' && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_280px]">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="اسم النظام / العلامة"><input value={settings.brandName || ''} onChange={(e) => set('brandName', e.target.value)} className={inputCls} /></Field>
              <Field label="الحروف المختصرة"><input maxLength={2} value={settings.brandShortName || ''} onChange={(e) => set('brandShortName', e.target.value)} className={`${inputCls} font-mono`} /></Field>
              <Field label="اللون الأساسي">
                <ColorInput value={settings.brandPrimaryColor || '#0284c7'} onChange={(v) => set('brandPrimaryColor', v)} />
              </Field>
              <Field label="اللون الثانوي">
                <ColorInput value={settings.brandAccentColor || '#4f46e5'} onChange={(v) => set('brandAccentColor', v)} />
              </Field>
              <Field label="وضع العرض">
                <select value={settings.themeMode || 'light'} onChange={(e) => set('themeMode', e.target.value as SystemSettings['themeMode'])} className={inputCls}>
                  <option value="light">فاتح</option>
                  <option value="dark">داكن</option>
                  <option value="system">حسب النظام</option>
                </select>
              </Field>
              <Field label="الخط">
                <select value={settings.fontFamily || 'Cairo'} onChange={(e) => set('fontFamily', e.target.value)} className={inputCls}>
                  <option value="Cairo">Cairo</option>
                  <option value="Tajawal">Tajawal</option>
                  <option value="system-ui">System UI</option>
                  <option value="Arial">Arial</option>
                  <option value="Tahoma">Tahoma</option>
                </select>
              </Field>
              <Field label="إظهار اسم العلامة في الهيدر">
                <Toggle checked={settings.showBrandText !== false} onChange={(v) => set('showBrandText', v)} label={settings.showBrandText !== false ? 'ظاهر' : 'مخفي'} />
              </Field>
              <Field label="تخطيط التنقل في الشاشات الكبيرة" full>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {NAVIGATION_LAYOUT_OPTIONS.map((option) => {
                    const active = (settings.navigationLayout || 'sidebar') === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => set('navigationLayout', option.value)}
                        aria-pressed={active}
                        className={`rounded-xl border p-3 text-right transition ${
                          active
                            ? 'border-sky-500 bg-sky-50 ring-1 ring-sky-500 dark:bg-sky-500/10'
                            : 'border-slate-200 hover:border-sky-300 dark:border-slate-700'
                        }`}
                      >
                        <NavigationLayoutPreview variant={option.value} />
                        <span className="mt-2 flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-slate-900 dark:text-slate-100">{option.label}</span>
                          {active && <Check className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />}
                        </span>
                        <span className="mt-1 block text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">{option.hint}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-[11px] text-slate-400">
                  يطبَّق على الشاشات الكبيرة (1024px فأكثر). الشاشات الصغيرة تبقى على القائمة المنسدلة دائمًا.
                </p>
              </Field>
              <Field label="شعار الصورة">
                <div className="flex items-center gap-2">
                  <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
                    <Upload className="h-4 w-4" /> اختيار صورة
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => onLogo(e.target.files?.[0])} />
                  </label>
                  {settings.brandLogoDataUrl && (
                    <button onClick={() => set('brandLogoDataUrl', '')} className="rounded-lg border border-rose-200 px-2 py-2 text-[11px] font-bold text-rose-500 hover:bg-rose-50 dark:border-rose-500/30">
                      إزالة
                    </button>
                  )}
                </div>
              </Field>
            </div>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
              <div className="mb-2 text-xs font-bold text-slate-500">معاينة فورية</div>
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl text-lg font-black text-white shadow-lg" style={previewStyle}>
                  {settings.brandLogoDataUrl ? (
                    <img src={settings.brandLogoDataUrl} alt="logo" className="h-full w-full object-cover" />
                  ) : (
                    (settings.brandShortName || 'C').slice(0, 2)
                  )}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-extrabold text-slate-900 dark:text-slate-100">{settings.brandName || 'CeramiSys ERP'}</div>
                  <div className="truncate text-[11px] text-slate-500">{settings.showroomName}</div>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <span className="h-8 flex-1 rounded-lg" style={{ background: settings.brandPrimaryColor }} />
                <span className="h-8 flex-1 rounded-lg" style={{ background: settings.brandAccentColor }} />
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
                يُحفظ الشعار داخل قاعدة البيانات (Base64). للشعارات الكبيرة يُفضّل استخدام صورة مضغوطة أقل من 400KB.
              </p>
            </div>
          </div>
        )}

        {tab === 'invoice' && (
          <div className="grid grid-cols-1 gap-3">
            <Field label="ترويسة الفاتورة"><textarea rows={3} value={settings.receiptHeader || ''} onChange={(e) => set('receiptHeader', e.target.value)} className={inputCls} /></Field>
            <Field label="تذييل الفاتورة وشروط الاسترجاع"><textarea rows={3} value={settings.receiptFooter || ''} onChange={(e) => set('receiptFooter', e.target.value)} className={inputCls} /></Field>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="اسم طابعة الإيصالات الحرارية">
                <div className="flex gap-2">
                  <input value={settings.thermalPrinterName || ''} onChange={(e) => set('thermalPrinterName', e.target.value)} className={inputCls} />
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const res = await window.ceramisys?.printing?.listPrinters?.();
                        if (res?.ok && res.printers.length) {
                          const current = settings.thermalPrinterName || '';
                          const list = res.printers.map((p) => (p === current ? `${p} ✓` : p)).join('\n');
                          const picked = window.prompt('الطابعات المتاحة (اكتب الاسم بدقة):\n\n' + list, current);
                          if (picked) set('thermalPrinterName', picked.trim());
                        } else {
                          alert('لم يتم العثور على طابعات مثبتة في النظام.');
                        }
                      } catch {
                        alert('جلب قائمة الطابعات متاح داخل تطبيق سطح المكتب فقط.');
                      }
                    }}
                    className="shrink-0 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
                  >
                    استعراض
                  </button>
                </div>
              </Field>
              <Field label="كود صفحة الأحرف (Codepage)">
                <select value={settings.thermalCodepage ?? 54} onChange={(e) => set('thermalCodepage', Number(e.target.value))} className={inputCls}>
                  <option value={54}>54 — عربي Windows-1256 (الأغلب)</option>
                  <option value={32}>32 — عربي (بعض الأجهزة)</option>
                  <option value={16}>16 — WPC1256 (أخرى)</option>
                </select>
              </Field>
              <Field label="عرض ورق الإيصال">
                <select value={settings.thermalPaperWidth || '80'} onChange={(e) => set('thermalPaperWidth', e.target.value as '58' | '80')} className={inputCls}>
                  <option value="80">80 مم (48 حرفاً)</option>
                  <option value="58">58 مم (32 حرفاً)</option>
                </select>
              </Field>
              <Field label="طريقة التوصيل">
                <select value={settings.thermalTransport || 'system'} onChange={(e) => set('thermalTransport', e.target.value as 'system' | 'network')} className={inputCls}>
                  <option value="system">طابعة مثبتة في النظام (USB)</option>
                  <option value="network">طابعة شبكية مباشرة (TCP 9100)</option>
                </select>
              </Field>
              {settings.thermalTransport === 'network' && (
                <>
                  <Field label="عنوان IPv4 خاص بالطابعة">
                    <input value={settings.thermalHost || ''} onChange={(e) => set('thermalHost', e.target.value)} placeholder="مثال: 192.168.1.100" className={inputCls} />
                  </Field>
                  <Field label="منفذ الطباعة الشبكية">
                    <input value="9100" readOnly className={inputCls} />
                  </Field>
                </>
              )}
              <Field label="اسم طابعة A4"><input value={settings.a4PrinterName || ''} onChange={(e) => set('a4PrinterName', e.target.value)} className={inputCls} /></Field>
            </div>
          </div>
        )}

        {tab === 'inventory' && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="طريقة التكلفة">
              <select value={settings.costingMethod} onChange={(e) => set('costingMethod', e.target.value as SystemSettings['costingMethod'])} className={inputCls}>
                <option value="AVERAGE_COST">متوسط التكلفة المرجح</option>
                <option value="FIFO">FIFO (الوارد أولاً يصرف أولاً)</option>
              </select>
            </Field>
            <p className="text-xs text-amber-700 md:col-span-2">الرصيد الموجود عند تفعيل FIFO يبدأ بطبقة افتتاحية تقديرية حسب تكلفة الصنف الحالية؛ الدقة الفعلية للدفعات الجديدة تبدأ من تاريخ التفعيل.</p>
            <Field label="السماح بالمخزون السالب">
              <Toggle checked={settings.enableNegativeStock} onChange={(v) => set('enableNegativeStock', v)} label={settings.enableNegativeStock ? 'مسموح' : 'ممنوع'} />
            </Field>
            <Field label="حد تنبيه المخزون المنخفض (بوحدة الصنف)">
              <input type="number" min={0} value={settings.lowStockAlertThresholdM2 ?? 20} onChange={(e) => set('lowStockAlertThresholdM2', Number(e.target.value))} className={inputCls} />
            </Field>
          </div>
        )}

        {tab === 'operations' && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="حد اعتماد الخصم %">
              <input type="number" min={0} max={100} value={settings.discountApprovalThresholdPercent ?? 10} onChange={(e) => set('discountApprovalThresholdPercent', Number(e.target.value))} className={inputCls} />
            </Field>
            <Field label="رسوم التوصيل الافتراضية">
              <input type="number" min={0} value={settings.defaultDeliveryFee ?? 0} onChange={(e) => set('defaultDeliveryFee', Number(e.target.value))} className={inputCls} />
            </Field>
            <Field label="أيام سماح الأقساط">
              <input type="number" min={0} value={settings.installmentGraceDays ?? 3} onChange={(e) => set('installmentGraceDays', Number(e.target.value))} className={inputCls} />
            </Field>
            <Field label="اعتماد إجباري لتسويات المخزون">
              <Toggle checked={!!settings.requireApprovalForStockAdjustments} onChange={(v) => set('requireApprovalForStockAdjustments', v)} label={settings.requireApprovalForStockAdjustments ? 'مطلوب' : 'غير مطلوب'} />
            </Field>
            <Field label="اعتماد إجباري لتغيير الأسعار">
              <Toggle checked={!!settings.requireApprovalForPriceChanges} onChange={(v) => set('requireApprovalForPriceChanges', v)} label={settings.requireApprovalForPriceChanges ? 'مطلوب' : 'غير مطلوب'} />
            </Field>
          </div>
        )}

        {tab === 'security' && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="مدة انتهاء الجلسة (دقائق)">
              <input type="number" min={5} value={settings.sessionTimeoutMinutes ?? 480} onChange={(e) => set('sessionTimeoutMinutes', Number(e.target.value))} className={inputCls} />
            </Field>
            <Field label="أقصى محاولات دخول فاشلة">
              <input type="number" min={1} value={settings.maxFailedLoginAttempts ?? 5} onChange={(e) => set('maxFailedLoginAttempts', Number(e.target.value))} className={inputCls} />
            </Field>
            <Field label="فاصل النسخ الاحتياطي التلقائي (ساعات)">
              <input type="number" min={1} value={settings.autoBackupIntervalHours} onChange={(e) => set('autoBackupIntervalHours', Number(e.target.value))} className={inputCls} />
            </Field>
          </div>
        )}

      </fieldset>

      {readOnly && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          لا تملك صلاحية تعديل الإعدادات (settings.update). الحقول للعرض فقط.
        </div>
      )}
    </div>
  );
};

interface BusinessProfileForm {
  type: string;
  customName: string;
  enabledModules: string[];
}

function readBusinessProfile(): BusinessProfileForm {
  const storedType = SettingsService.getValue('businessType') || 'ceramics';
  const type = BUSINESS_TYPES.some((item) => item.id === storedType) ? storedType : 'custom';
  return {
    type,
    customName: SettingsService.getValue('businessTypeLabel') || (type === 'custom' ? storedType : ''),
    enabledModules: parseEnabledModules(SettingsService.getValue('enabledModules'), type),
  };
}

function readBusinessConfiguration(): BusinessConfiguration {
  const type = SettingsService.getValue('businessType') || 'ceramics';
  return parseBusinessConfiguration(SettingsService.getValue('businessProfileConfig'), type);
}

const Field: React.FC<{ label: string; full?: boolean; children: React.ReactNode }> = ({ label, full, children }) => (
  <div className={full ? 'md:col-span-2' : ''}>
    <label className={labelCls}>{label}</label>
    {children}
  </div>
);

const NAVIGATION_LAYOUT_OPTIONS: { value: 'sidebar' | 'header'; label: string; hint: string }[] = [
  {
    value: 'sidebar',
    label: 'قائمة جانبية',
    hint: 'شريط علوي للعنوان + قائمة تنقل رأسية على الجانب (الافتراضي).',
  },
  {
    value: 'header',
    label: 'شريط علوي',
    hint: 'القائمة الرئيسية داخل الهيدر أفقيًا بدون قائمة جانبية على الشاشات الكبيرة.',
  },
];

const NavigationLayoutPreview: React.FC<{ variant: 'sidebar' | 'header' }> = ({ variant }) => (
  <div
    className="flex h-16 w-full gap-1 overflow-hidden rounded-[2px] border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800"
    aria-hidden="true"
  >
    {variant === 'sidebar' ? (
      <>
        <div className="h-full w-5 shrink-0 rounded-[1px] bg-sky-500/80" />
        <div className="flex h-full flex-1 flex-col gap-1">
          <div className="h-2.5 w-full rounded-[1px] bg-slate-300 dark:bg-slate-600" />
          <div className="flex-1 rounded-[1px] bg-white dark:bg-slate-900" />
        </div>
      </>
    ) : (
      <div className="flex h-full flex-1 flex-col gap-1">
        <div className="flex h-2.5 items-center gap-1">
          <div className="h-2.5 w-2.5 shrink-0 rounded-[1px] bg-sky-500" />
          <div className="h-2 w-4 rounded-[1px] bg-slate-300 dark:bg-slate-600" />
          <div className="h-2 w-4 rounded-[1px] bg-slate-300 dark:bg-slate-600" />
          <div className="h-2 w-4 rounded-[1px] bg-slate-300 dark:bg-slate-600" />
          <div className="mr-auto h-2 w-3 rounded-[1px] bg-slate-300 dark:bg-slate-600" />
        </div>
        <div className="flex-1 rounded-[1px] bg-white dark:bg-slate-900" />
      </div>
    )}
  </div>
);

type SystemSettingsSetter = <K extends keyof SystemSettings>(key: K, value: SystemSettings[K]) => void;

const Toggle: React.FC<{ checked: boolean; onChange: (value: boolean) => void; label: string }> = ({ checked, onChange, label }) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-xs font-bold transition ${
      checked
        ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300'
        : 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
    }`}
  >
    <span>{label}</span>
    <span className={`relative h-5 w-9 rounded-full transition ${checked ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}>
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${checked ? 'right-0.5' : 'right-4'}`} />
    </span>
  </button>
);

const ColorInput: React.FC<{ value: string; onChange: (value: string) => void }> = ({ value, onChange }) => (
  <div className="flex items-center gap-2">
    <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-12 cursor-pointer rounded-lg border border-slate-200 bg-transparent dark:border-slate-700" />
    <input value={value} onChange={(e) => onChange(e.target.value)} className={`${inputCls} font-mono`} />
  </div>
);
