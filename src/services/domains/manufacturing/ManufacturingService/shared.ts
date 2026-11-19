import type { ProductionPriority } from './types';

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const PRIORITIES: ProductionPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

export function assertDate(value: string | undefined | null, label: string): void {
  if (!value) return;
  if (!DATE_PATTERN.test(value) || Number.isNaN(new Date(`${value}T00:00:00`).getTime())) {
    throw new Error(`${label} غير صالح. استخدم الصيغة YYYY-MM-DD.`);
  }
}
