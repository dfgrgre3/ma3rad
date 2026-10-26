import type { Delivery } from '../../services/OperationsService';

export const STATUS_LABEL: Record<Delivery['status'], string> = {
  PENDING: 'قيد الانتظار', SCHEDULED: 'مجدولة', IN_TRANSIT: 'في الطريق',
  DELIVERED: 'تم التسليم', FAILED: 'فشلت', CANCELLED: 'ملغاة',
};
export const STATUS_STYLE: Record<Delivery['status'], string> = {
  PENDING: 'bg-slate-100 text-slate-600 border-slate-200',
  SCHEDULED: 'bg-violet-50 text-violet-600 border-violet-200',
  IN_TRANSIT: 'bg-sky-50 text-sky-600 border-sky-200',
  DELIVERED: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  FAILED: 'bg-rose-50 text-rose-600 border-rose-200',
  CANCELLED: 'bg-slate-100 text-slate-400 border-slate-200',
};

