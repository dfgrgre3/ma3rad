import { APP_CONFIG_DOMAINS } from './appConfiguration_part01';
import type { AppConfigDomain } from './appConfiguration_part01';

export const APP_CONFIG_PRINT_CATALOG: Array<{ key: string; label: string }> = [
  { key: 'sales.invoice.a4', label: 'فاتورة بيع A4 — عنوان المستند' },
  { key: 'sales.invoice.a4.footer', label: 'فاتورة بيع A4 — التذييل' },
  { key: 'sales.invoice.receipt', label: 'إيصال بيع حراري — عنوان المستند' },
  { key: 'sales.invoice.receipt.footer', label: 'إيصال بيع حراري — التذييل' },
  { key: 'purchase.invoice.a4', label: 'فاتورة شراء A4 — عنوان المستند' },
  { key: 'quotation.a4', label: 'عرض سعر A4 — عنوان المستند' },
  { key: 'quotation.a4.footer', label: 'عرض سعر A4 — التذييل' },
  { key: 'statement.customer', label: 'كشف حساب عميل — عنوان المستند' },
  { key: 'statement.supplier', label: 'كشف حساب مورد — عنوان المستند' },
];

export const PAGE_KEY_PATTERN = /^\/[A-Za-z0-9_\-./:*?]*$/;

export const ENTRY_KEY_PATTERN = /^\/?[A-Za-z0-9\u0600-\u06FF][A-Za-z0-9\u0600-\u06FF_.:/#@-]{0,199}$/;

export const DOMAIN_SET = new Set<string>(APP_CONFIG_DOMAINS);

export function normalizePagePath(input: unknown): string {
  const raw = typeof input === 'string' ? input.trim() : '';
  if (!raw || raw === '*') return '*';
  const withSlash = raw.startsWith('/') ? raw : `/${raw}`;
  const collapsed = withSlash.replace(/\/{2,}/g, '/');
  return collapsed.length > 1 ? collapsed.replace(/\/+$/, '') : '/';
}

export function normalizeConfigKey(input: unknown): string {
  return typeof input === 'string' ? input.trim() : '';
}

export function entryId(domain: AppConfigDomain, key: string): string {
  return `${domain}:${key}`;
}

export function isAppConfigDomain(value: unknown): value is AppConfigDomain {
  return typeof value === 'string' && DOMAIN_SET.has(value);
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function boundedString(
  value: unknown,
  label: string,
  maxLength: number,
  { allowEmpty = true }: { allowEmpty?: boolean } = {},
): string {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string') throw new Error(`${label} يجب أن يكون نصًا.`);
  const trimmed = value.trim();
  if (!allowEmpty && !trimmed) throw new Error(`${label} مطلوب.`);
  if (trimmed.length > maxLength) throw new Error(`${label} أطول من الحد المسموح (${maxLength} حرف).`);
  return trimmed;
}

export function boundedInteger(value: unknown, label: string, min: number, max: number): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new Error(`${label} يجب أن يكون رقمًا.`);
  const integer = Math.trunc(numeric);
  if (integer < min || integer > max) throw new Error(`${label} يجب أن يكون بين ${min} و${max}.`);
  return integer;
}
