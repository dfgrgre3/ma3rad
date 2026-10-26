export const PAY_LABEL: Record<string, string> = {
  PAID: 'مدفوعة',
  PARTIAL: 'جزئيًا',
  UNPAID: 'آجلة',
  CASH: 'نقدي',
  CREDIT: 'آجل',
  BANK: 'بنكي',
  BANK_TRANSFER: 'تحويل بنكي',
  CARD: 'بطاقة',
  CHEQUE: 'شيك',
  MIXED: 'مختلط',
};

export const STATUS_BADGE: Record<string, string> = {
  PAID: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  PARTIAL: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  UNPAID: 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
};

export const METHOD_STYLE: Record<string, { bar: string; dot: string; text: string }> = {
  CASH: { bar: 'bg-emerald-500', dot: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-300' },
  BANK_TRANSFER: { bar: 'bg-sky-500', dot: 'bg-sky-500', text: 'text-sky-700 dark:text-sky-300' },
  CARD: { bar: 'bg-violet-500', dot: 'bg-violet-500', text: 'text-violet-700 dark:text-violet-300' },
  CHEQUE: { bar: 'bg-indigo-500', dot: 'bg-indigo-500', text: 'text-indigo-700 dark:text-indigo-300' },
  CREDIT: { bar: 'bg-rose-500', dot: 'bg-rose-500', text: 'text-rose-700 dark:text-rose-300' },
  MIXED: { bar: 'bg-slate-500', dot: 'bg-slate-500', text: 'text-slate-600 dark:text-slate-300' },
};
