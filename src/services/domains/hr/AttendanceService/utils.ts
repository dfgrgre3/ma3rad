import { localDateString } from '../../../../utils/shared/date';
import type { AttendanceStatus } from '../EmployeeService';
import type { AttendanceSnapshot } from './types';

export const VALID_STATUSES: AttendanceStatus[] = ['PRESENT', 'LATE', 'ABSENT', 'LEAVE'];

export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function toLocalDateTime(date: string, time: string): string {
  return `${date}T${time.length === 5 ? `${time}:00` : time}`;
}

export function localNow(): string {
  const now = new Date();
  return `${localDateString(now)}T${now.toTimeString().slice(0, 8)}`;
}

export function durationMinutes(start: string | null, end: string | null): number {
  if (!start || !end) return 0;
  return Math.max(0, Math.floor((Date.parse(end) - Date.parse(start)) / 60_000));
}

export function dateOffset(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function dateRangesOverlap(startA: string, endA: string | null, startB: string, endB: string | null): boolean {
  return startA <= (endB ?? '9999-12-31') && (endA ?? '9999-12-31') >= startB;
}

export function timeMinutes(value: string): number {
  const [hours, minutes] = value.slice(0, 5).split(':').map(Number);
  return hours * 60 + minutes;
}

export function snapshot(row: any): AttendanceSnapshot {
  return {
    status: row.status,
    checkInAt: row.checkInAt ?? null,
    checkOutAt: row.checkOutAt ?? null,
    lateMinutes: Number(row.lateMinutes) || 0,
    overtimeMinutes: Number(row.overtimeMinutes) || 0,
    notes: row.notes ?? '',
    source: row.source ?? 'MANUAL',
  };
}
