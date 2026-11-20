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
  PAID: 'bg-success-soft text-success ',
  PARTIAL: 'bg-warning-soft text-warning ',
  UNPAID: 'bg-danger-soft text-danger ',
};

export const METHOD_STYLE: Record<string, { bar: string; dot: string; text: string }> = {
  CASH: { bar: 'bg-success', dot: 'bg-success', text: 'text-success ' },
  BANK_TRANSFER: { bar: 'bg-primary', dot: 'bg-primary', text: 'text-primary ' },
  CARD: { bar: 'bg-primary', dot: 'bg-primary', text: 'text-primary ' },
  CHEQUE: { bar: 'bg-primary', dot: 'bg-primary', text: 'text-primary ' },
  CREDIT: { bar: 'bg-danger', dot: 'bg-danger', text: 'text-danger ' },
  MIXED: { bar: 'bg-line-strong', dot: 'bg-line-strong', text: 'text-ink-secondary ' },
};
