import React from 'react';
import { History } from 'lucide-react';
import { BusinessProfileSupportNotice } from '../../../../components/business/BusinessProfileSupportNotice';
import { CompaniesPanel } from '../../../../components/admin/CompaniesPanel';
import {
  BUSINESS_ACTIVITY_FAMILY_OPTIONS,
  BUSINESS_MODULES,
  BUSINESS_TYPES,
  BUSINESS_UNITS,
  getProfileFeatures,
  getProfileNavigation,
  type BusinessConfiguration,
} from '../../../../config/businessProfiles';
import { getModuleDefinition } from '../../../../config/moduleRegistry';
import {
  BUSINESS_TERMINOLOGY,
  BUSINESS_TERM_KEYS,
  resolveBusinessTerm,
  type BusinessTermKey,
  type BusinessTermOverrides,
} from '../../../../config/businessTerminology';
import { TerminologyService } from '../../../../services/domains/config/TerminologyService';
import type { ActivityConfigurationVersion } from '../../../../services/domains/config/ConfigurationVersionService';
import { Field, inputCls, Toggle } from '../AdminSettingsFields';
import type { BusinessProfileForm } from './types';

interface BusinessTabProps {
  businessProfile: BusinessProfileForm;
  setBusinessProfile: React.Dispatch<React.SetStateAction<BusinessProfileForm>>;
  businessConfig: BusinessConfiguration;
  terminologyOverrides: BusinessTermOverrides;
  activitySearch: string;
  setActivitySearch: (value: string) => void;
  activityFamily: string;
  setActivityFamily: (value: string) => void;
  visibleBusinessTypes: typeof BUSINESS_TYPES;
  selectBusinessType: (type: string) => void;
  toggleAdditionalActivity: (activityId: string, enabled: boolean) => void;
  updateBusinessConfig: (patch: Partial<BusinessConfiguration>) => void;
  setInventoryEnabled: (enabled: boolean) => void;
  updateTermOverride: (key: BusinessTermKey, value: string) => void;
  toggleBusinessModule: (moduleId: string) => void;
  setDirty: React.Dispatch<React.SetStateAction<boolean>>;
  canViewConfigHistory: boolean;
  configurationVersions: ActivityConfigurationVersion[];
  configurationHistoryError: string | null;
  compareVersionIds: [string, string];
  setCompareVersionIds: React.Dispatch<React.SetStateAction<[string, string]>>;
  comparedVersions: (ActivityConfigurationVersion | undefined)[];
  restoreConfigurationForReview: (version: ActivityConfigurationVersion) => void;
  readOnly: boolean;
}

export const BusinessTab: React.FC<BusinessTabProps> = ({
  businessProfile,
  setBusinessProfile,
  businessConfig,
  terminologyOverrides,
  activitySearch,
  setActivitySearch,
  activityFamily,
  setActivityFamily,
  visibleBusinessTypes,
  selectBusinessType,
  toggleAdditionalActivity,
  updateBusinessConfig,
  setInventoryEnabled,
  updateTermOverride,
  toggleBusinessModule,
  setDirty,
  canViewConfigHistory,
  configurationVersions,
  configurationHistoryError,
  compareVersionIds,
  setCompareVersionIds,
  comparedVersions,
  restoreConfigurationForReview,
  readOnly,
}) => (
  <div className="space-y-5">
    {getProfileFeatures(businessProfile.type).length > 0 && (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-700 dark:bg-slate-800">
        <span className="font-bold text-slate-500">ميزات النشاط: </span>
        {getProfileFeatures(businessProfile.type).map((f) => (
          <span key={f} className="ml-2 inline-block rounded-full bg-white px-2 py-0.5 dark:bg-slate-700">{f}</span>
        ))}
      </div>
    )}
    <div>
      <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">خصص النظام لنشاطك</h3>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        غيّر نوع النشاط والوحدات الظاهرة في القائمة في أي وقت. إخفاء الوحدة لا يحذف بياناتها.
      </p>
    </div>
    {getProfileNavigation(businessProfile.type)?.groups?.length ? (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-700 dark:bg-slate-800">
        <span className="font-bold text-slate-500">navigation النشاط: </span>
        {getProfileNavigation(businessProfile.type)!.groups.map((g) => (
          <span key={g.id} className="ml-2 inline-block rounded-full bg-white px-2 py-0.5 dark:bg-slate-700">{g.label.ar}</span>
        ))}
      </div>
    ) : null}
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_14rem]">
      <input
        type="search"
        aria-label="البحث في الأنشطة"
        value={activitySearch}
        onChange={(event) => setActivitySearch(event.target.value)}
        placeholder="ابحث باسم النشاط أو عائلته..."
        className={inputCls}
      />
      <select
        aria-label="تصنيف النشاط"
        value={activityFamily}
        onChange={(event) => setActivityFamily(event.target.value)}
        className={inputCls}
      >
        <option value="all">جميع عائلات الأنشطة</option>
        {BUSINESS_ACTIVITY_FAMILY_OPTIONS.map((family) => (
          <option key={family.id} value={family.id}>{family.label}</option>
        ))}
      </select>
    </div>
    <p className="text-[11px] text-slate-500 dark:text-slate-400" aria-live="polite">
      {visibleBusinessTypes.length} نشاط متاح. اختيار النشاط هنا لا يحذف أو يحوّل السجلات السابقة.
    </p>
    {visibleBusinessTypes.length === 0 ? (
      <p className="rounded-lg border border-slate-200 p-4 text-center text-xs text-slate-500">لا توجد أنشطة تطابق البحث.</p>
    ) : (
      <div className="grid max-h-80 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
        {visibleBusinessTypes.map((type) => {
          const isPrimary = businessProfile.type === type.id;
          const isAdditional = businessProfile.additionalActivityIds.includes(type.id);
          return (
            <article
              key={type.id}
              className={`rounded-xl border p-3 transition ${
                isPrimary
                  ? 'border-sky-500 bg-sky-50 ring-1 ring-sky-500 dark:bg-sky-500/10'
                  : 'border-slate-200 dark:border-slate-700'
              }`}
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
                  className="accent-sky-600"
                />
                نشاط فرعي
              </label>
            </article>
          );
        })}
      </div>
    )}
    <BusinessProfileSupportNotice businessType={businessProfile.type} />
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
      <div className="grid grid-cols-1  gap-2 sm:grid-cols-3">
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
    <section className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
      <div>
        <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-200">مصطلحات النشاط</h4>
        <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
          هذه الأسماء للعرض فقط؛ لا تغيّر مفاتيح البيانات أو قواعد العمليات. يسبق تخصيص المنشأة ملف النشاط ثم القيمة الافتراضية.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {BUSINESS_TERM_KEYS.map((key) => {
          const definition = BUSINESS_TERMINOLOGY[key];
          const value = terminologyOverrides.ar?.[key] || '';
          const preview = resolveBusinessTerm(key, {
            businessType: businessProfile.type,
            language: 'ar',
            overrides: terminologyOverrides,
          });
          const source = TerminologyService.getSource(
            key,
            businessProfile.type,
            terminologyOverrides,
          );
          const sourceLabel = source === 'organization'
            ? 'تخصيص المنشأة'
            : source === 'profile'
              ? 'ملف النشاط'
              : 'الافتراضي العام';
          return (
            <Field key={key} label={definition.label}>
              <div className="space-y-1.5">
                <div className="flex gap-2">
                  <input
                    value={value}
                    onChange={(event) => updateTermOverride(key, event.target.value)}
                    className={inputCls}
                    maxLength={80}
                    placeholder={preview}
                    aria-label={`تخصيص ${definition.label}`}
                  />
                  {value && (
                    <button
                      type="button"
                      onClick={() => updateTermOverride(key, '')}
                      className="shrink-0 rounded-xl border border-slate-200 px-2 text-[10px] font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      title="العودة إلى قيمة ملف النشاط"
                    >
                      افتراضي
                    </button>
                  )}
                </div>
                <p className="text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
                  {definition.description} المعاينة: <strong>{preview}</strong> · المصدر: {sourceLabel}
                </p>
                <code className="block text-[9px] text-slate-400" dir="ltr">{key}</code>
              </div>
            </Field>
          );
        })}
      </div>
    </section>
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
    {canViewConfigHistory && (
      <section className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700" aria-labelledby="activity-configuration-history">
        <div className="flex items-start gap-2">
          <History className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" aria-hidden="true" />
          <div>
            <h4 id="activity-configuration-history" className="text-xs font-extrabold text-slate-800 dark:text-slate-200">سجل إصدارات التكوين</h4>
            <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
              الإصدارات محفوظة كسجل إضافي غير قابل للتعديل. تحميل إصدار يجهزه للمراجعة؛ الحفظ يمر بفحوص الوحدات والاعتمادات المعتادة.
            </p>
          </div>
        </div>
        {configurationHistoryError && (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300">
            تعذر تحميل سجل التكوين: {configurationHistoryError}
          </p>
        )}
        {!configurationHistoryError && configurationVersions.length === 0 && (
          <p className="rounded-lg border border-slate-200 px-3 py-3 text-center text-[10px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
            لا توجد إصدارات محفوظة بعد. سيُحفظ إصدار عند إنهاء الإعداد أو حفظ تغيير في النشاط.
          </p>
        )}
        {configurationVersions.length > 0 && (
          <>
            <div className="max-h-56 space-y-2 overflow-y-auto">
              {configurationVersions.map((version) => {
                const activity = BUSINESS_TYPES.find((type) => type.id === version.snapshot.businessType);
                return (
                  <article key={version.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-slate-800 dark:text-slate-100">
                        الإصدار {version.version} · {version.snapshot.businessTypeLabel || activity?.label || version.snapshot.businessType}
                      </p>
                      <p className="mt-1 text-[9px] text-slate-500 dark:text-slate-400">
                        {version.reason} · {version.createdByName} · {version.createdAt}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => restoreConfigurationForReview(version)}
                      disabled={readOnly}
                      className="rounded-lg border border-sky-200 px-2.5 py-1.5 text-[10px] font-bold text-sky-700 hover:bg-sky-50 disabled:opacity-50 dark:border-sky-800 dark:text-sky-300 dark:hover:bg-sky-950/40"
                    >
                      تحميل للمراجعة
                    </button>
                  </article>
                );
              })}
            </div>
            {configurationVersions.length > 1 && (
              <div className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-700">
                <h5 className="text-[11px] font-bold text-slate-700 dark:text-slate-200">مقارنة إصدارين</h5>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {[0, 1].map((index) => (
                    <select
                      key={index}
                      aria-label={`إصدار المقارنة ${index + 1}`}
                      value={compareVersionIds[index]}
                      onChange={(event) => setCompareVersionIds((current) => {
                        const next: [string, string] = [...current];
                        next[index] = event.target.value;
                        return next;
                      })}
                      className={inputCls}
                    >
                      {configurationVersions.map((version) => (
                        <option key={version.id} value={version.id}>الإصدار {version.version} · {version.createdAt}</option>
                      ))}
                    </select>
                  ))}
                </div>
                {comparedVersions[0] && comparedVersions[1] && (() => {
                  const first = comparedVersions[0].snapshot;
                  const second = comparedVersions[1].snapshot;
                  const activityLabel = (snapshot: typeof first) =>
                    snapshot.businessTypeLabel
                    || BUSINESS_TYPES.find((type) => type.id === snapshot.businessType)?.label
                    || snapshot.businessType;
                  const moduleLabels = (snapshot: typeof first) => snapshot.enabledModules
                    .map((id) => BUSINESS_MODULES.find((module) => module.id === id)?.label || id)
                    .sort()
                    .join('، ') || 'لا توجد وحدات';
                  const unitLabels = (snapshot: typeof first) => snapshot.configuration.units
                    .map((id) => BUSINESS_UNITS.find((unit) => unit.id === id)?.label || id)
                    .join('، ') || 'لا توجد';
                  const customTerms = (snapshot: typeof first) => Object.entries(snapshot.terminologyOverrides)
                    .flatMap(([language, terms]) => Object.entries(terms || {}).map(([key, value]) => `${language}.${key}: ${value}`))
                    .sort()
                    .join('، ') || 'لا توجد مصطلحات مخصصة';
                  const modelLabel = (model: typeof first.configuration.businessModel) => ({
                    products: 'بيع منتجات',
                    services: 'تقديم خدمات',
                    mixed: 'منتجات وخدمات',
                  })[model];
                  const comparisonRows = [
                    ['النشاط الرئيسي', activityLabel(first), activityLabel(second)],
                    ['الأنشطة الفرعية', first.configuration.additionalActivityIds.join('، ') || 'لا توجد', second.configuration.additionalActivityIds.join('، ') || 'لا توجد'],
                    ['نموذج العمل', modelLabel(first.configuration.businessModel), modelLabel(second.configuration.businessModel)],
                    ['إدارة المخزون', first.configuration.trackInventory ? 'مفعلة' : 'معطلة', second.configuration.trackInventory ? 'مفعلة' : 'معطلة'],
                    ['وحدات النظام', moduleLabels(first), moduleLabels(second)],
                    ['خصائص المنتجات', first.configuration.productAttributes.join('، ') || 'لا توجد', second.configuration.productAttributes.join('، ') || 'لا توجد'],
                    ['وحدات القياس', unitLabels(first), unitLabels(second)],
                    ['وحدات مخصصة', first.configuration.customUnits.join('، ') || 'لا توجد', second.configuration.customUnits.join('، ') || 'لا توجد'],
                    ['مصطلحات مخصصة', customTerms(first), customTerms(second)],
                  ];
                  return (
                    <div className="space-y-1.5">
                      {comparisonRows.map(([label, firstValue, secondValue]) => (
                        <div key={label} className={`grid grid-cols-[7rem_minmax(0,1fr)_minmax(0,1fr)] gap-2 rounded-md px-2 py-1.5 text-[9px] ${firstValue === secondValue ? 'bg-slate-50 dark:bg-slate-800/40' : 'bg-amber-50 dark:bg-amber-950/20'}`}>
                          <span className="font-bold text-slate-600 dark:text-slate-300">{label}</span>
                          <span className="break-words text-slate-700 dark:text-slate-200">{firstValue}</span>
                          <span className="break-words text-slate-700 dark:text-slate-200">{secondValue}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}
          </>
        )}
      </section>
    )}
  </div>
);
