import { formatProductQuantity } from '../../../utils/products/productUnits';

export const fmt = (n: number, product: { productType?: 'CERAMIC' | 'GENERAL'; baseUnit?: string; customUnit?: string }) =>
  formatProductQuantity(n, product);

export const statusStyles: Record<string, string> = {
  ACTIVE: 'bg-accent-soft text-primary border-accent-border',
  RELEASED: 'bg-surface-sunken text-muted border-line',
  CONSUMED: 'bg-success-soft text-success border-success-border',
  EXPIRED: 'bg-warning-soft text-warning border-warning-border',
};
export const statusLabels: Record<string, string> = {
  ACTIVE: 'نشط', RELEASED: 'مُفرج', CONSUMED: 'مُنفّذ', EXPIRED: 'منتهي',
};
