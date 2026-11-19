import { OrderStatus } from '../../services/domains/sales/OrderService';
import { getEffectiveBusinessType } from '../../services/domains/config/BusinessTypeService';
import { ACTIVITY_ORDER_STATUS_LABELS, ACTIVITY_ORDER_ACTION_LABELS } from '../../config/activityOrderLabels';

export const PAGE_SIZE = 15;

export const STATUS_LABELS: Record<OrderStatus, { label: string; color: string }> = {
  PENDING: { label: 'بانتظار التأكيد', color: 'bg-slate-100 text-slate-600 border-slate-200' },
  CONFIRMED: { label: 'مؤكد', color: 'bg-violet-50 text-violet-600 border-violet-200' },
  PROCESSING: { label: 'قيد التجهيز', color: 'bg-sky-50 text-sky-600 border-sky-200' },
  PARTIAL: { label: 'تسليم جزئي', color: 'bg-amber-50 text-amber-600 border-amber-200' },
  READY: { label: 'جاهز', color: 'bg-cyan-50 text-cyan-600 border-cyan-200' },
  ON_HOLD: { label: 'معلّق', color: 'bg-orange-50 text-orange-600 border-orange-200' },
  COMPLETED: { label: 'تم التسليم / مفوتر', color: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
  CANCELLED: { label: 'ملغي', color: 'bg-rose-50 text-rose-600 border-rose-200' },
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
