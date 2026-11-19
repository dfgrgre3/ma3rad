import React from 'react';
import { Boxes } from 'lucide-react';
import { BusinessProfileSupportNotice } from '../../../business/BusinessProfileSupportNotice';
import {
  BUSINESS_UNITS,
  BUSINESS_MODULES,
  BUSINESS_ACTIVITY_FAMILY_OPTIONS,
  BUSINESS_TYPES,
  type BusinessConfiguration,
} from '../../../../config/businessProfiles';
import { getModuleDefinition } from '../../../../config/moduleRegistry';
import { inputClass, labelClass } from '../setupConstants';
import type { SetupForm, SetupOptionControlRenderer, SetupOptions } from '../setupTypes';

interface ActivityStepProps {
  options: SetupOptions;
  form: SetupForm;
  set: (key: keyof SetupForm, value: string) => void;
  businessConfig: BusinessConfiguration;
  visibleBusinessTypes: typeof BUSINESS_TYPES;
  activitySearch: string;
  setActivitySearch: (value: string) => void;
  activityFamily: string;
  setActivityFamily: (value: string) => void;
  selectBusinessType: (businessType: string) => void;
  toggleAdditionalActivity: (activityId: string, enabled: boolean) => void;
  toggleModule: (id: string) => void;
  updateBusinessConfig: (patch: Partial<BusinessConfiguration>) => void;
  optionControl: SetupOptionControlRenderer;
}

export const ActivityStep: React.FC<ActivityStepProps> = ({
  options,
  form,
  set,
  businessConfig,
  visibleBusinessTypes,
  activitySearch,
  setActivitySearch,
  activityFamily,
  setActivityFamily,
  selectBusinessType,
  toggleAdditionalActivity,
  toggleModule,
  updateBusinessConfig,
  optionControl,
}) => (
  <div className="space-y-4">
    <div className="flex items-start gap-3 rounded-xl border border-sky-100 bg-sky-50 p-3">
      <Boxes className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" />
      <div><h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">خصص النظام حسب طبيعة عملك</h2><p className="mt-1 text-xs text-slate-600 dark:text-slate-300">تُحفظ هذه الخيارات محليًا ويمكن تعديلها لاحقًا من إعدادات النشاط.</p></div>
    </div>
    {optionControl('modules', 'تهيئة النشاط والوحدات الآن', 'يمكنك تخطيها والاحتفاظ بالنشاط والوحدات الحالية، ثم تغييرها لاحقًا من إعدادات النشاط.')}
    <fieldset disabled={!options.modules} className="m-0 min-w-0 space-y-4 border-0 p-0 disabled:opacity-60">
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_14rem]">
      <input
        type="search"
        aria-label="البحث في الأنشطة"
        value={activitySearch}
        onChange={(event) => setActivitySearch(event.target.value)}
        className={inputClass}
        placeholder="ابحث باسم النشاط أو عائلته..."
      />
      <select
        aria-label="تصنيف النشاط"
        value={activityFamily}
        onChange={(event) => setActivityFamily(event.target.value)}
        className={inputClass}
      >
        <option value="all">جميع عائلات الأنشطة</option>
        {BUSINESS_ACTIVITY_FAMILY_OPTIONS.map((family) => (
          <option key={family.id} value={family.id}>{family.label}</option>
        ))}
      </select>
    </div>
    <p className="text-[11px] text-slate-500 dark:text-slate-400" aria-live="polite">
      {visibleBusinessTypes.length} نشاط متاح. اختر نشاطًا رئيسيًا، ويمكن إضافة أنشطة فرعية.
    </p>
    {visibleBusinessTypes.length === 0 ? (
      <p className="rounded-lg border border-slate-200 p-4 text-center text-xs text-slate-500">لا توجد أنشطة تطابق البحث.</p>
    ) : (
      <div className="grid max-h-72 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
        {visibleBusinessTypes.map((type) => {
          const isPrimary = form.businessType === type.id;
          const isAdditional = businessConfig.additionalActivityIds.includes(type.id);
          return (
            <article
              key={type.id}
              className={`rounded-xl border p-3 transition ${isPrimary ? 'border-sky-500 bg-sky-50 ring-1 ring-sky-500 dark:bg-sky-900/30' : 'border-slate-200 dark:border-slate-700 dark:bg-slate-800/30'}`}
            >
              <button
                type="button"
                onClick={() => selectBusinessType(type.id)}
                aria-pressed={isPrimary}
                className="w-full text-right"
              >
                <span className="mb-1 block text-[9px] font-semibold text-sky-700 dark:text-sky-300">{type.familyLabel}</span>
                <span className="block text-xs font-bold text-slate-900 dark:text-slate-100">{type.label}</span>
                <span className="mt-1 block text-[10px] text-slate-500 dark:text-slate-400">{type.description}</span>
              </button>
              <label className="mt-2 flex items-center gap-2 border-t border-slate-200 pt-2 text-[10px] font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={isAdditional}
                  disabled={isPrimary}
                  onChange={(event) => toggleAdditionalActivity(type.id, event.target.checked)}
                  className="h-3.5 w-3.5 accent-sky-600"
                />
                نشاط فرعي
              </label>
            </article>
          );
        })}
      </div>
    )}
    {businessConfig.additionalActivityIds.length > 0 && (
      <p className="text-[11px] text-slate-600 dark:text-slate-300">
        الأنشطة الفرعية: {businessConfig.additionalActivityIds
          .map((id) => BUSINESS_TYPES.find((type) => type.id === id)?.label || id)
          .join('، ')}
      </p>
    )}
    <BusinessProfileSupportNotice businessType={form.businessType} />
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
    </div>
    <div>
      <h3 className="mb-2 text-xs font-bold text-slate-700 dark:text-slate-200">وحدات المنتجات والخدمات</h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {BUSINESS_UNITS.map((unit) => (
          <div key={unit.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 dark:border-slate-700 dark:bg-slate-800/30 dark:text-slate-200">
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
    <div><h3 className="mb-2 text-xs font-bold text-slate-700 dark:text-slate-200">الوحدات التي تحتاجها</h3><div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {BUSINESS_MODULES.map((module) => {
        const definition = getModuleDefinition(module.id);
        const unavailable = Boolean(definition?.activation.requiresInventoryTracking && !businessConfig.trackInventory);
        return (
          <div key={module.id} title={definition?.description} className={`flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 dark:border-slate-700 dark:bg-slate-800/30 dark:text-slate-200 ${unavailable ? 'opacity-50' : ''}`}>
            <input id={`setup-module-${module.id}`} type="checkbox" checked={form.enabledModules.includes(module.id)} onChange={() => toggleModule(module.id)} disabled={unavailable} className="accent-sky-600" />
            <label htmlFor={`setup-module-${module.id}`} className="cursor-pointer">{module.label}</label>
          </div>
        );
      })}
    </div></div>
    </fieldset>
  </div>
);
