import { localDateString } from '../../../../utils/shared/date';
import type { OperationsWorkMode } from './types';

export const WORK_MODES: OperationsWorkMode[] = ['NORMAL', 'TWO_SHIFTS', 'THREE_SHIFTS', 'CONTINUOUS'];
export const WORK_MODE_KEY = 'operationsWorkMode';

export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function dateOffset(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function localNow(): string {
  const now = new Date();
  return `${localDateString(now)}T${now.toTimeString().slice(0, 8)}`;
}

export function toDateTime(date: string, time: string): string {
  return `${date}T${time.length === 5 ? `${time}:00` : time}`;
}

export function timeMinutes(value: string): number {
  const [hours, minutes] = value.slice(0, 5).split(':').map(Number);
  return hours * 60 + minutes;
}

export function durationMinutes(start: string | null, end: string | null): number {
  if (!start || !end) return 0;
  return Math.max(0, Math.floor((Date.parse(end) - Date.parse(start)) / 60_000));
}

export function bool(value: unknown): boolean {
  return Boolean(Number(value));
}

export function scheduledWindow(businessDate: string, startTime: string, endTime: string): { start: string; end: string } {
  const start = toDateTime(businessDate, startTime);
  const endSameDay = toDateTime(businessDate, endTime);
  const end = timeMinutes(endTime) <= timeMinutes(startTime)
    ? toDateTime(dateOffset(businessDate, 1), endTime)
    : endSameDay;
  return { start, end };
}
