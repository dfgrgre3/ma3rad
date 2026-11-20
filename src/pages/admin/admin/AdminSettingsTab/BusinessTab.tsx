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
  getProfilePermissionSuggestions,
  getProfilePricingRules,
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
      <div className="rounded-xl border border-line bg-surface-muted p-3 text-xs ">
        <span className="font-bold text-muted">ميزات النشاط: </span>
        {getProfileFeatures(businessProfile.type).map((f) => (
          <span key={f} className="ml-2 inline-block rounded-full bg-surface px-2 py-0.5 ">{f}</span>
        ))}
      </div>
    )}
    <div>
      <h3 className="text-sm font-extrabold text-ink ">خصص النظام لنشاطك</h3>
      <p className="mt-1 text-xs text-muted ">
        غيّر نوع النشاط والوحدات الظاهرة في القائمة في أي وقت. إخفاء الوحدة لا يحذف بياناتها.
      </p>
    </div>
    {getProfilePermissionSuggestions(businessProfile.type)?.roles?.length ? (
      <div className="rounded-xl border border-line bg-surface-muted p-3 text-xs ">
        <span className="font-bold text-muted">أدوار مقترحة للنشاط: </span>
        {getProfilePermissionSuggestions(businessProfile.type)!.roles.map((r) => (
          <span key={r.role} className="ml-2 inline-block rounded-full bg-surface px-2 py-0.5 " title={r.permissions.join('، ')}>
            {r.name || r.role} <span className="text-muted">({r.permissions.length})</span>
          </span>
        ))}
        <span className="mt-1 block text-[10px] text-muted">تُنشأ تلقائيًا كأدوار جاهزة عند حفظ الإعداد.</span>
      </div>
    ) : null}
    {getProfilePricingRules(businessProfile.type)?.tiers?.length ? (
      <div className="rounded-xl border border-line bg-surface-muted p-3 text-xs ">
        <span className="font-bold text-muted">شرائح تسعير النشاط: </span>
        {getProfilePricingRules(businessProfile.type)!.tiers.map((tier) => (
          <span key={tier.id} className="ml-2 inline-block rounded-full bg-surface px-2 py-0.5 ">
            {tier.name} {Math.round(tier.factor * 100)}%
          </span>
        ))}
      </div>
    ) : null}
    {getProfileNavigation(businessProfile.type)?.groups?.length ? (
      <div className="rounded-xl border border-line bg-surface-muted p-3 text-xs ">
        <span className="font-bold text-muted">navigation النشاط: </span>
        {getProfileNavigation(businessProfile.type)!.groups.map((g) => (
          <span key={g.id} className="ml-2 inline-block rounded-full bg-surface px-2 py-0.5 ">{g.label.ar}</span>
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
    <p className="text-[11px] text-muted " aria-live="polite">
      {visibleBusinessTypes.length} نشاط متاح. اختيار النشاط هنا لا يحذف أو يحوّل السجلات السابقة.
    </p>
    {visibleBusinessTypes.length === 0 ? (
      <p className="rounded-lg border border-line p-4 text-center text-xs text-muted">لا توجد أنشطة تطابق البحث.</p>
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
                  ? 'border-primary bg-accent-soft ring-1 ring-primary dark:bg-primary/10'
                  : 'border-line '
              }`}
            >
              <button
                type="button"
                onClick={() => selectBusinessType(type.id)}
                aria-pressed={isPrimary}
                className="w-full text-right"
              >
                <span className="mb-1 block text-[9px] font-semibold text-primary ">{type.familyLabel}</span>
                <span className="block text-xs font-bold text-ink ">{type.label}</span>
                <span className="mt-1 block text-[10px] text-muted ">{type.description}</span>
              </button>
              <label className="mt-2 flex items-center gap-2 border-t border-line pt-2 text-[10px] font-semibold text-ink-secondary ">
                <input
                  type="checkbox"
                  checked={isAdditional}
                  disabled={isPrimary}
                  onChange={(event) => toggleAdditionalActivity(type.id, event.target.checked)}
                  className="accent-primary"
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
      <h4 className="mb-2 text-xs font-bold text-ink ">وحدات القياس</h4>
      <div className="grid grid-cols-1  gap-2 sm:grid-cols-3">
        {BUSINESS_UNITS.map((unit) => (
          <label key={unit.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink ">
            <input
              type="checkbox"
              checked={businessConfig.units.includes(unit.id)}
              onChange={() => updateBusinessConfig({ units: businessConfig.units.includes(unit.id) ? businessConfig.units.filter((id) => id !== unit.id) : [...businessConfig.units, unit.id] })}
              className="accent-primary"
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
    <section className="space-y-3 rounded-xl border border-line p-4 ">
      <div>
        <h4 className="text-xs font-extrabold text-ink ">مصطلحات النشاط</h4>
        <p className="mt-1 text-[10px] text-muted ">
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
                      className="shrink-0 rounded-xl border border-line px-2 text-[10px] font-bold text-ink-secondary hover:bg-surface-muted dark:hover:bg-primary"
                      title="العودة إلى قيمة ملف النشاط"
                    >
                      افتراضي
                    </button>
                  )}
                </div>
                <p className="text-[10px] leading-relaxed text-muted ">
                  {definition.description} المعاينة: <strong>{preview}</strong> · المصدر: {sourceLabel}
                </p>
                <code className="block text-[9px] text-muted" dir="ltr">{key}</code>
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
      <h4 className="mb-2 text-xs font-bold text-ink ">وحدات النظام</h4>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {BUSINESS_MODULES.map((module) => {
          const definition = getModuleDefinition(module.id);
          const unavailable = Boolean(definition?.activation.requiresInventoryTracking && !businessConfig.trackInventory);
          return (
            <label
              key={module.id}
              title={definition?.description}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink ${unavailable ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              <input
                type="checkbox"
                checked={businessProfile.enabledModules.includes(module.id)}
                onChange={() => toggleBusinessModule(module.id)}
                disabled={unavailable}
                className="accent-primary"
              />
              {module.label}
            </label>
          );
        })}
      </div>
    </div>
    {canViewConfigHistory && (
      <section className="space-y-3 rounded-xl border border-line p-4 " aria-labelledby="activity-configuration-history">
        <div className="flex items-start gap-2">
          <History className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <h4 id="activity-configuration-history" className="text-xs font-extrabold text-ink ">سجل إصدارات التكوين</h4>
            <p className="mt-1 text-[10px] text-muted ">
              الإصدارات محفوظة كسجل إضافي غير قابل للتعديل. تحميل إصدار يجهزه للمراجعة؛ الحفظ يمر بفحوص الوحدات والاعتمادات المعتادة.
            </p>
          </div>
        </div>
        {configurationHistoryError && (
          <p role="alert" className="rounded-lg border border-danger-border bg-danger-soft px-3 py-2 text-[10px] text-danger dark:bg-danger/30 ">
            تعذر تحميل سجل التكوين: {configurationHistoryError}
          </p>
        )}
        {!configurationHistoryError && configurationVersions.length === 0 && (
          <p className="rounded-lg border border-line px-3 py-3 text-center text-[10px] text-muted ">
            لا توجد إصدارات محفوظة بعد. سيُحفظ إصدار عند إنهاء الإعداد أو حفظ تغيير في النشاط.
          </p>
        )}
        {configurationVersions.length > 0 && (
          <>
            <div className="max-h-56 space-y-2 overflow-y-auto">
              {configurationVersions.map((version) => {
                const activity = BUSINESS_TYPES.find((type) => type.id === version.snapshot.businessType);
                return (
                  <article key={version.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 ">
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-ink ">
                        الإصدار {version.version} · {version.snapshot.businessTypeLabel || activity?.label || version.snapshot.businessType}
                      </p>
                      <p className="mt-1 text-[9px] text-muted ">
                        {version.reason} · {version.createdByName} · {version.createdAt}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => restoreConfigurationForReview(version)}
                      disabled={readOnly}
                      className="rounded-lg border border-accent-border px-2.5 py-1.5 text-[10px] font-bold text-primary hover:bg-accent-soft disabled:opacity-50 dark:hover:bg-primary/40"
                    >
                      تحميل للمراجعة
                    </button>
                  </article>
                );
              })}
            </div>
            {configurationVersions.length > 1 && (
              <div className="space-y-2 border-t border-line pt-3 ">
                <h5 className="text-[11px] font-bold text-ink ">مقارنة إصدارين</h5>
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
                        <div key={label} className={`grid grid-cols-[7rem_minmax(0,1fr)_minmax(0,1fr)] gap-2 rounded-md px-2 py-1.5 text-[9px] ${firstValue === secondValue ? 'bg-surface-muted dark:bg-primary/40' : 'bg-warning-soft dark:bg-warning/20'}`}>
                          <span className="font-bold text-ink-secondary ">{label}</span>
                          <span className="break-words text-ink ">{firstValue}</span>
                          <span className="break-words text-ink ">{secondValue}</span>
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
