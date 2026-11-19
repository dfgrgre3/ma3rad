import React from 'react';
import { ArrowLeft, ArrowRight, Loader2, CheckCircle2 } from 'lucide-react';
import { STEPS } from './setupConstants';

interface SetupWizardFooterProps {
  step: number;
  canContinue: boolean;
  passwordValid: boolean;
  saving: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onFinish: () => void;
}

export const SetupWizardFooter: React.FC<SetupWizardFooterProps> = ({
  step,
  canContinue,
  passwordValid,
  saving,
  onPrevious,
  onNext,
  onFinish,
}) => (
  <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900 sm:px-6 sm:py-4">
    <button
      type="button"
      onClick={onPrevious}
      disabled={step === 0 || saving}
      className="flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-200 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800 sm:flex-none sm:px-4 sm:text-sm"
    >
      <ArrowRight className="h-4 w-4" aria-hidden="true" /> السابق
    </button>
    <div className="flex flex-1 justify-end sm:flex-none">
      {step < STEPS.length - 1 ? (
        <button
          type="button"
          onClick={onNext}
          disabled={!canContinue || (step === 3 && !passwordValid)}
          className="flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-sky-700 disabled:opacity-40 sm:w-auto sm:px-5 sm:text-sm"
        >
          التالي <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : (
        <button
          type="button"
          onClick={onFinish}
          disabled={saving}
          className="flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60 sm:w-auto sm:px-5 sm:text-sm"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
          بدء الاستخدام
        </button>
      )}
    </div>
  </footer>
);
