import { OrderStatus } from '../../../services/OrderService';

export const PAGE_SIZE = 15;

export const STATUS_LABELS: Record<OrderStatus, { label: string; color: string }> = {
  PENDING: { label: 'بانتظار التأكيد', color: 'bg-slate-100 text-slate-600 border-slate-200' },
  CONFIRMED: { label: 'مؤكد', color: 'bg-violet-50 text-violet-600 border-violet-200' },
  PROCESSING: { label: 'قيد التجهيز', color: 'bg-sky-50 text-sky-600 border-sky-200' },
  PARTIAL: { label: 'تسليم جزئي', color: 'bg-amber-50 text-amber-600 border-amber-200' },
  COMPLETED: { label: 'تم التسليم / مفوتر', color: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
  CANCELLED: { label: 'ملغي', color: 'bg-rose-50 text-rose-600 border-rose-200' },
};

export const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(n) || 0) + ' ج';

export type Line = { productId: string; quantityM2: number; unitPrice: number; discountAmount: number };

export interface FormState {
  customerId: string;
  warehouseId: string;
  deliveryDate: string;
  notes: string;
  shipping: string;
  discount: string;
  tax: string;
  lines: Line[];
}

export const emptyForm = (): FormState => ({
  customerId: '', warehouseId: '', deliveryDate: '', notes: '',
  shipping: '', discount: '', tax: '',
  lines: [{ productId: '', quantityM2: 0, unitPrice: 0, discountAmount: 0 }],
});
