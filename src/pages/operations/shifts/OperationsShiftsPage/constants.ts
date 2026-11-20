import type { OperationsWorkMode } from '../../../../services/domains/operations/OperationsShiftService';
import { localDateString } from '../../../../utils/shared/date';

export type Tab = 'board' | 'schedule' | 'settings' | 'reports';

export const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export const STATUS_LABELS: Record<string, string> = {
  PLANNED: 'مخططة', OPEN: 'مفتوحة', HANDOVER_PENDING: 'بانتظار الاستلام',
  CLOSED: 'مغلقة', MISSED: 'فائتة', CANCELLED: 'ملغاة',
};
export const STATUS_STYLES: Record<string, string> = {
  PLANNED: 'bg-surface-sunken text-ink border-line',
  OPEN: 'bg-success-soft text-success border-success-border',
  HANDOVER_PENDING: 'bg-warning-soft text-warning border-warning-border',
  CLOSED: 'bg-accent-soft text-primary border-accent-border',
  MISSED: 'bg-danger-soft text-danger border-danger-border',
  CANCELLED: 'bg-surface-sunken text-muted border-line',
};
export const WORK_MODES: Array<{ value: OperationsWorkMode; label: string }> = [
  { value: 'NORMAL', label: 'وردية واحدة' },
  { value: 'TWO_SHIFTS', label: 'ورديتان' },
  { value: 'THREE_SHIFTS', label: 'ثلاث ورديات' },
  { value: 'CONTINUOUS', label: 'تشغيل متواصل 24/7' },
];
export const money = (value: number) => `${Number(value || 0).toLocaleString('en-US', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
})}`;
export const timeOf = (value: string | null | undefined) => String(value || '').slice(11, 16);
export const _dateOf = (value: string | null | undefined) => String(value || '').slice(0, 10);
export const offsetDate = (days: number) => {
  const date = new Date(`${localDateString()}T00:00:00`);
  date.setDate(date.getDate() + days);
  return localDateString(date);
};
export const schedulePeriod = (mode: 'week' | 'month', anchor: string) => {
  const date = new Date(`${anchor}T00:00:00Z`);
  if (mode === 'week') {
    const start = new Date(date);
    start.setUTCDate(start.getUTCDate() - start.getUTCDay());
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
  }
  const from = `${anchor.slice(0, 7)}-01`;
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  return { from, to: end.toISOString().slice(0, 10) };
};
