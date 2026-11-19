import type { LeaveType } from '../../../../types/hr/leave';

export const LEAVE_TYPES: LeaveType[] = ['ANNUAL', 'SICK', 'UNPAID', 'OTHER'];
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function assertDate(value: string, label: string): void {
  const parsed = DATE_PATTERN.test(value) ? new Date(`${value}T00:00:00Z`) : null;
  if (!parsed || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} غير صالح. استخدم الصيغة YYYY-MM-DD.`);
  }
}

export function dateOffset(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function yearStart(year: number): string {
  return `${year}-01-01`;
}

export function yearEnd(year: number): string {
  return `${year}-12-31`;
}

export function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function monthEnd(year: number, month: number): string {
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function roundLeaveDays(days: number): number {
  return Math.round(days * 10000) / 10000;
}

export function dateYears(startDate: string, endDate: string): number[] {
  const years: number[] = [];
  for (let year = Number(startDate.slice(0, 4)); year <= Number(endDate.slice(0, 4)); year += 1) {
    years.push(year);
  }
  return years;
}
