import { formatProductQuantity } from '../../utils/productUnits';

export const fmt = (n: number, product: { productType?: 'CERAMIC' | 'GENERAL'; baseUnit?: string; customUnit?: string }) =>
  formatProductQuantity(n, product);

export const statusStyles: Record<string, string> = {
  ACTIVE: 'bg-sky-50 text-sky-700 border-sky-200',
  RELEASED: 'bg-slate-100 text-slate-500 border-slate-200',
  CONSUMED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  EXPIRED: 'bg-amber-50 text-amber-700 border-amber-200',
};
export const statusLabels: Record<string, string> = {
  ACTIVE: 'نشط', RELEASED: 'مُفرج', CONSUMED: 'مُنفّذ', EXPIRED: 'منتهي',
};
