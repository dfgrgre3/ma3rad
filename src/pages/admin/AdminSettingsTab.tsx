import React, { useEffect, useMemo, useState } from 'react';
import {
  Save, Palette, Store, ReceiptText, Boxes, ShieldCheck, Truck, Upload, RotateCcw, Image as ImageIcon,
} from 'lucide-react';
import { SettingsService } from '../../services/SettingsService';
import { AuthService } from '../../services/AuthService';
import { usePermission } from '../../hooks/usePermission';
import { useToast } from '../../components/ui/Toast';
import type { SystemSettings } from '../../types';
import { BUSINESS_MODULES, BUSINESS_TYPES, getManagedBusinessPaths, getProfileHiddenPaths, parseEnabledModules } from '../../config/businessProfiles';
import { NAV_STORAGE_KEYS } from '../../config/navigation';
import { NavigationService } from '../../services/NavigationService';

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
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setSettings(SettingsService.getSettings());
    setBusinessProfile(readBusinessProfile());
  }, []);

  const set = <K extends keyof SystemSettings>(key: K, value: SystemSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const save = () => {
    try {
      const managedPaths = getManagedBusinessPaths();
      const existingHidden = NavigationService.getOverrides().hidden.filter((path) => !managedPaths.has(path));
      const customName = businessProfile.customName.trim();
      if (businessProfile.type === 'custom' && customName.length < 2) {
        toast.error('اكتب اسم النشاط التجاري (حرفان على الأقل).');
        setTab('business');
        return;
      }
      const businessTypeLabel = businessProfile.type === 'custom'
        ? customName
        : BUSINESS_TYPES.find((type) => type.id === businessProfile.type)?.label || '';
      const next = SettingsService.update({
        ...settings,
        businessType: businessProfile.type,
        businessTypeLabel,
        enabledModules: JSON.stringify(businessProfile.enabledModules),
        [NAV_STORAGE_KEYS.hidden]: JSON.stringify([
          ...existingHidden,
          ...getProfileHiddenPaths(businessProfile.enabledModules),
        ]),
      }, AuthService.getCurrentUser());
      setSettings(next);
      setDirty(false);
      toast.success('تم حفظ إعدادات النشاط وبقية الإعدادات بنجاح.');
    } catch (error: any) {
      toast.error('تعذر حفظ الإعدادات', error?.message || String(error));
    }
  };

  const resetDefaults = () => {
    if (!window.confirm('إرجاع الحقول المعروضة إلى القيم الافتراضية؟')) return;
    setSettings(SettingsService.getSettings());
    setBusinessProfile(readBusinessProfile());
    setDirty(false);
  };

  const selectBusinessType = (type: string) => {
    setBusinessProfile((current) => ({
      ...current,
      type,
      enabledModules: parseEnabledModules(undefined, type),
    }));
    setDirty(true);
  };

  const toggleBusinessModule = (moduleId: string) => {
    setBusinessProfile((current) => ({
      ...current,
      enabledModules: current.enabledModules.includes(moduleId)
        ? current.enabledModules.filter((id) => id !== moduleId)
        : [...current.enabledModules, moduleId],
    }));
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
            <div>
              <h4 className="mb-2 text-xs font-bold text-slate-700 dark:text-slate-300">وحدات النظام</h4>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {BUSINESS_MODULES.map((module) => (
                  <label key={module.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={businessProfile.enabledModules.includes(module.id)}
                      onChange={() => toggleBusinessModule(module.id)}
                      className="accent-sky-600"
                    />
                    {module.label}
                  </label>
                ))}
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
                  <Field label="عنوان IP للطابعة">
                    <input value={settings.thermalHost || ''} onChange={(e) => set('thermalHost', e.target.value)} placeholder="مثال: 192.168.1.100" className={inputCls} />
                  </Field>
                  <Field label="المنفذ (عادة 9100)">
                    <input type="number" value={settings.thermalPort ?? 9100} onChange={(e) => set('thermalPort', Number(e.target.value))} className={inputCls} />
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

const Field: React.FC<{ label: string; full?: boolean; children: React.ReactNode }> = ({ label, full, children }) => (
  <div className={full ? 'md:col-span-2' : ''}>
    <label className={labelCls}>{label}</label>
    {children}
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
