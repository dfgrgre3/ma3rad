import type {
  ContractEffectiveStatus,
  ContractPartyType,
  ContractStatus,
  DocumentConfidentiality,
  DocumentStatus,
} from '../../../../types/documents';

export const DOCUMENT_STATUSES: DocumentStatus[] = ['DRAFT', 'ACTIVE', 'ARCHIVED'];
export const CONFIDENTIALITY: DocumentConfidentiality[] = ['INTERNAL', 'RESTRICTED', 'CONFIDENTIAL'];
export const PARTY_TYPES: ContractPartyType[] = ['CUSTOMER', 'SUPPLIER', 'EMPLOYEE', 'OTHER'];
export const CONTRACT_STATUSES: ContractStatus[] = ['DRAFT', 'ACTIVE', 'TERMINATED'];

export const MODULE_ID = 'documents';

export const NUMBER_PATTERN = /^[A-Z0-9][A-Z0-9_/-]{1,39}$/;
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const CURRENCY_PATTERN = /^[A-Z]{3}$/;
export const STORAGE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export function requireText(value: unknown, label: string, min = 1, max = 200): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length < min || text.length > max) {
    throw new Error(`${label} مطلوب (${min} إلى ${max} حرفًا).`);
  }
  // eslint-disable-next-line no-control-regex
   if (/[\u0000-\u001f]/.test(text)) throw new Error(`${label} يحتوي على رموز غير صالحة.`);
  return text;
}

export function optionalText(value: unknown, label: string, max = 2000): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new Error(`${label} غير صالح.`);
  const text = value.trim();
  if (text.length > max) throw new Error(`${label} يتجاوز الحد المسموح (${max} حرفًا).`);
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) {
    throw new Error(`${label} يحتوي على رموز غير صالحة.`);
  }
  return text || null;
}

export function optionalDate(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    throw new Error(`${label} يجب أن يكون تاريخًا بصيغة YYYY-MM-DD.`);
  }
  const parsed = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed)) throw new Error(`${label} غير صالح.`);
  return value;
}

export function requiredDate(value: unknown, label: string): string {
  const parsed = optionalDate(value, label);
  if (!parsed) throw new Error(`${label} مطلوب.`);
  return parsed;
}

export function toEpochDay(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

export function effectiveContractStatus(row: { status: ContractStatus; startDate: string; endDate: string; renewalNoticeDays: number }, today: string): ContractEffectiveStatus {
  if (row.status === 'TERMINATED') return 'TERMINATED';
  if (row.status === 'DRAFT') return 'DRAFT';
  if (row.endDate < today) return 'EXPIRED';
  if (row.startDate > today) return 'SCHEDULED';
  const days = toEpochDay(row.endDate) - toEpochDay(today);
  return days <= Number(row.renewalNoticeDays || 0) ? 'EXPIRING' : 'ACTIVE';
}

export function daysBetween(from: string, to: string): number {
  return toEpochDay(to) - toEpochDay(from);
}

export interface NormalizedVersion {
  fileName: string;
  mimeType: string | null;
  fileSize: number | null;
  checksum: string | null;
  storageName: string | null;
  notes: string | null;
}
