export const reservationStatusStyles: Record<string, string> = {
  ACTIVE: 'bg-accent-soft text-primary border-accent-border',
  RELEASED: 'bg-surface-sunken text-muted border-line',
  CONSUMED: 'bg-success-soft text-success border-success-border',
  EXPIRED: 'bg-warning-soft text-warning border-warning-border',
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
  PENDING: 'bg-warning-soft text-warning border-warning-border',
  CONFIRMED: 'bg-accent-soft text-primary border-accent-border',
  PROCESSING: 'bg-accent-soft text-primary border-accent-border',
  PARTIAL: 'bg-accent-soft text-primary border-accent-border',
  COMPLETED: 'bg-success-soft text-success border-success-border',
  CANCELLED: 'bg-danger-soft text-danger border-danger-border',
};
