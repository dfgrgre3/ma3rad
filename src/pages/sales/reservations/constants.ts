export const reservationStatusStyles: Record<string, string> = {
  ACTIVE: 'bg-sky-50 text-sky-700 border-sky-200',
  RELEASED: 'bg-slate-100 text-slate-500 border-slate-200',
  CONSUMED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  EXPIRED: 'bg-amber-50 text-amber-700 border-amber-200',
};

export const reservationStatusLabels: Record<string, string> = {
  ACTIVE: 'نشط ومحجوز',
  RELEASED: 'مُفرج عنه',
  CONSUMED: 'تم التنفيذ والصرف',
  EXPIRED: 'منتهي الصلاحية',
};

export const orderStatusLabels: Record<string, string> = {
  PENDING: 'قيد الانتظار',
  CONFIRMED: 'مؤكد',
  PROCESSING: 'قيد التجهيز',
  PARTIAL: 'تسليم جزئي',
  COMPLETED: 'مكتمل ومفوتر',
  CANCELLED: 'ملغي',
};

export const orderStatusBadges: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
  CONFIRMED: 'bg-blue-50 text-blue-700 border-blue-200',
  PROCESSING: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  PARTIAL: 'bg-purple-50 text-purple-700 border-purple-200',
  COMPLETED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CANCELLED: 'bg-rose-50 text-rose-700 border-rose-200',
};
