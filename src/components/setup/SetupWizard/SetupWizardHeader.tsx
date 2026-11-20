import React from 'react';
import { Store, Check } from 'lucide-react';
import { STEPS } from './setupConstants';

interface SetupWizardHeaderProps {
  step: number;
}

export const SetupWizardHeader: React.FC<SetupWizardHeaderProps> = ({ step }) => (
  <header className="shrink-0 bg-gradient-to-l from-primary to-primary px-4 py-4 text-white sm:px-6 sm:py-5">
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface/15 sm:h-11 sm:w-11">
          <Store className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-base font-black sm:text-lg">إعداد نظام ERP</h1>
          <p className="truncate text-[11px] text-primary sm:text-xs">خصص النظام لنشاط معرضك قبل بدء العمل</p>
        </div>
      </div>
      <span
        className="shrink-0 rounded-full border border-white/25 bg-surface/10 px-2.5 py-1 text-[10px] font-bold sm:text-[11px]"
        aria-live="polite"
      >
        الخطوة {step + 1} من {STEPS.length}
      </span>
    </div>

    <div className="mt-4">
      <div className="grid grid-cols-5 gap-1.5 sm:gap-2" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={step + 1} aria-label="تقدم الإعداد">
        {STEPS.map((item, index) => (
          <div key={item.label} aria-hidden="true">
            <div className={`h-1.5 rounded-full transition-colors ${index <= step ? 'bg-surface' : 'bg-surface/25'}`} />
          </div>
        ))}
      </div>
      <div className="mt-2 hidden grid-cols-1 sm:grid-cols-5 gap-2 sm:grid">
        {STEPS.map((item, index) => {
          const Icon = item.icon;
          const reached = index <= step;
          return (
            <div
              key={item.label}
              className={`flex min-w-0 items-center gap-1 text-[10px] font-semibold ${reached ? 'text-white' : 'text-primary/70'}`}
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
      <p className="mt-2 text-[11px] font-semibold text-primary sm:hidden" aria-live="polite">
        {STEPS[step].label}
      </p>
    </div>
  </header>
);
