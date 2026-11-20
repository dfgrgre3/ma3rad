import { OrderStatus } from '../../services/domains/sales/OrderService';
import { getEffectiveBusinessType } from '../../services/domains/config/BusinessTypeService';
import { ACTIVITY_ORDER_STATUS_LABELS, ACTIVITY_ORDER_ACTION_LABELS } from '../../config/activityOrderLabels';

export const PAGE_SIZE = 15;

export const STATUS_LABELS: Record<OrderStatus, { label: string; color: string }> = {
  PENDING: { label: 'بانتظار التأكيد', color: 'bg-surface-sunken text-ink-secondary border-line' },
  CONFIRMED: { label: 'مؤكد', color: 'bg-accent-soft text-primary border-accent-border' },
  PROCESSING: { label: 'قيد التجهيز', color: 'bg-accent-soft text-primary border-accent-border' },
  PARTIAL: { label: 'تسليم جزئي', color: 'bg-warning-soft text-warning border-warning-border' },
  READY: { label: 'جاهز', color: 'bg-accent-soft text-primary border-accent-border' },
  ON_HOLD: { label: 'معلّق', color: 'bg-warning-soft text-warning border-warning-border' },
  COMPLETED: { label: 'تم التسليم / مفوتر', color: 'bg-success-soft text-success border-success-border' },
  CANCELLED: { label: 'ملغي', color: 'bg-danger-soft text-danger border-danger-border' },
};

/** Status chip text resolved for the active business activity. */
export function getOrderStatusLabel(status: OrderStatus): { label: string; color: string } {
  const base = STATUS_LABELS[status];
  const override = ACTIVITY_ORDER_STATUS_LABELS[getEffectiveBusinessType()]?.[status];
  return override ? { ...base, label: override } : base;
}

/** Primary order action labels resolved for the active business activity. */
export function getOrderActionLabels(): { confirm: string; start: string } {
  const sector = ACTIVITY_ORDER_ACTION_LABELS[getEffectiveBusinessType()];
  return { confirm: sector?.confirm || 'تأكيد الطلب', start: sector?.start || 'بدء التجهيز' };
}

export const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(n) || 0) + ' ج';

export type Line = { productId: string; uom: string; quantity: number; unitPrice: number; discountAmount: number };

export interface FormState {
  customerId: string;
  warehouseId: string;
  salesRepId: string;
  deliveryDate: string;
  notes: string;
  shipping: string;
  discount: string;
  tax: string;
  lines: Line[];
}

export const emptyForm = (): FormState => ({
  customerId: '', warehouseId: '', salesRepId: '', deliveryDate: '', notes: '',
  shipping: '', discount: '', tax: '',
  lines: [{ productId: '', uom: '', quantity: 0, unitPrice: 0, discountAmount: 0 }],
});
