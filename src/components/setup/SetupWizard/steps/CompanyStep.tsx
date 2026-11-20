import React from 'react';
import { RefreshCw } from 'lucide-react';
import { CURRENCIES, inputClass, labelClass } from '../setupConstants';
import type {
  SetupForm,
  SetupOptionControlRenderer,
  SetupOptions,
  SetupSystemChecks,
  SystemCheckResult,
} from '../setupTypes';

interface CompanyStepProps {
  options: SetupOptions;
  form: SetupForm;
  set: (key: keyof SetupForm, value: string) => void;
  setForm: React.Dispatch<React.SetStateAction<SetupForm>>;
  systemChecks: SetupSystemChecks;
  visibleSystemChecks: Array<[string, SystemCheckResult]>;
  systemChecksRunning: boolean;
  onRecheckSystemChecks: () => void;
  optionControl: SetupOptionControlRenderer;
}

export const CompanyStep: React.FC<CompanyStepProps> = ({
  options,
  form,
  set,
  setForm,
  systemChecks,
  visibleSystemChecks,
  systemChecksRunning,
  onRecheckSystemChecks,
  optionControl,
}) => (
  <div className="space-y-4">
    <section className="rounded-xl border border-line bg-surface-muted p-3 dark:bg-primary/50" aria-labelledby="setup-system-checks">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 id="setup-system-checks" className="text-xs font-bold text-ink ">فحص النظام الفعلي</h2>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted ">سيراميسيس {systemChecks.version}</span>
          <button
            type="button"
            onClick={onRecheckSystemChecks}
            disabled={systemChecksRunning}
            className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[10px] font-bold text-ink-secondary hover:bg-surface-sunken disabled:cursor-wait disabled:opacity-50 dark:hover:bg-primary"
          >
            <RefreshCw className={`h-3 w-3 ${systemChecksRunning ? 'animate-spin' : ''}`} aria-hidden="true" />
            إعادة الفحص
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {visibleSystemChecks.map(([label, result]) => {
          const color = result.state === 'ready'
            ? 'bg-success'
            : result.state === 'error'
              ? 'bg-danger'
              : result.state === 'warning'
                ? 'bg-warning'
                : 'bg-line-strong animate-pulse';
          return (
            <div key={label} className="rounded-lg border border-line bg-surface px-3 py-2 ">
              <div className="flex items-center gap-2 text-[11px] font-bold text-ink ">
                <span className={`h-2 w-2 shrink-0 rounded-full ${color}`} aria-hidden="true" />
                {label}
              </div>
              <p className="mt-1 break-words text-[10px] text-muted ">{result.detail}</p>
            </div>
          );
        })}
      </div>
      {systemChecks.database.state === 'error' && (
        <p role="alert" className="mt-2 text-[10px] font-semibold text-danger ">
          لا تتابع إعداد النظام حتى تُحل مشكلة سلامة قاعدة البيانات.
        </p>
      )}
    </section>
    {optionControl('company', 'تهيئة بيانات المنشأة الآن', 'يمكنك تخطيها والاحتفاظ بالبيانات الحالية أو استكمالها لاحقًا من الإعدادات.')}
    <fieldset disabled={!options.company} className="m-0 min-w-0 space-y-4 border-0 p-0 disabled:opacity-60">
    <div>
      <label htmlFor="setup-showroom-name" className={labelClass}>اسم المعرض / الشركة *</label>
      <input
        id="setup-showroom-name"
        value={form.showroomName}
        onChange={(e) => set('showroomName', e.target.value)}
        className={inputClass}
        placeholder="مثال: معرض النور للسيراميك"
        disabled={!options.company}
      />
    </div>
    <div>
      <label htmlFor="setup-legal-name" className={labelClass}>الاسم القانوني للشركة</label>
      <input
        id="setup-legal-name"
        value={form.legalName}
        onChange={(e) => set('legalName', e.target.value)}
        className={inputClass}
        placeholder="يُستخدم في المستندات الرسمية"
        disabled={!options.company}
      />
    </div>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div>
        <label htmlFor="setup-phone" className={labelClass}>رقم الهاتف</label>
        <input id="setup-phone" value={form.phone} onChange={(e) => set('phone', e.target.value)} className={inputClass} placeholder="01000000000" disabled={!options.company} />
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
          disabled={!options.company}
        >
          {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
        </select>
      </div>
    </div>
    <div>
      <label htmlFor="setup-address" className={labelClass}>العنوان</label>
      <input id="setup-address" value={form.address} onChange={(e) => set('address', e.target.value)} className={inputClass} placeholder="المدينة - الشارع" disabled={!options.company} />
    </div>
    <p className="text-xs font-semibold text-ink-secondary ">بيانات التسجيل الاختيارية</p>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div>
        <label htmlFor="setup-tax-number" className={labelClass}>الرقم الضريبي</label>
        <input id="setup-tax-number" value={form.taxNumber} onChange={(e) => set('taxNumber', e.target.value)} className={inputClass} disabled={!options.company} />
      </div>
      <div>
        <label htmlFor="setup-commercial-record" className={labelClass}>السجل التجاري</label>
        <input id="setup-commercial-record" value={form.commercialRecord} onChange={(e) => set('commercialRecord', e.target.value)} className={inputClass} disabled={!options.company} />
      </div>
    </div>
    </fieldset>
  </div>
);
