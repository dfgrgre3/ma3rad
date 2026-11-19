export const MAX_DRILLDOWN_ROWS = 1500;
export const SLOW_MOVING_DAYS = 60;

export const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

export const money = (value: number): string => {
  const formatted = (Number.isFinite(value) ? value : 0).toLocaleString('ar-EG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${formatted} ج.م`;
};

export const count = (value: number): string => (Number.isFinite(value) ? value : 0).toLocaleString('ar-EG');

export const numberAr = (value: number): string =>
  (Number.isFinite(value) ? value : 0).toLocaleString('ar-EG', { maximumFractionDigits: 2 });

export const paymentStatusLabel = (status: string): string => {
  const labels: Record<string, string> = {
    PAID: 'مدفوع',
    PARTIAL: 'جزئي',
    UNPAID: 'آجل',
    PENDING: 'معلق',
  };
  return labels[status] ?? status ?? '—';
};

export const paymentTypeLabel = (method: string): string => {
  const labels: Record<string, string> = {
    CASH: 'نقدي',
    CARD: 'بطاقة',
    BANK_TRANSFER: 'تحويل بنكي',
    CHEQUE: 'شيك',
    CREDIT: 'آجل',
    MIXED: 'مختلط',
  };
  return labels[method] ?? method ?? '—';
};
