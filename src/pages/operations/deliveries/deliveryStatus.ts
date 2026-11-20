import type { Delivery } from '../../../services/domains/operations/OperationsService';

export const STATUS_LABEL: Record<Delivery['status'], string> = {
  PENDING: 'قيد الانتظار', SCHEDULED: 'مجدولة', IN_TRANSIT: 'في الطريق',
  DELIVERED: 'تم التسليم', FAILED: 'فشلت', CANCELLED: 'ملغاة',
};
export const STATUS_STYLE: Record<Delivery['status'], string> = {
  PENDING: 'bg-surface-sunken text-ink-secondary border-line',
  SCHEDULED: 'bg-accent-soft text-primary border-accent-border',
  IN_TRANSIT: 'bg-accent-soft text-primary border-accent-border',
  DELIVERED: 'bg-success-soft text-success border-success-border',
  FAILED: 'bg-danger-soft text-danger border-danger-border',
  CANCELLED: 'bg-surface-sunken text-muted border-line',
};

