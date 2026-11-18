import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

/** Shared utilities for platform services */

export function nowIso(): string {
  return new Date().toISOString();
}

export function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function formatCount(value: unknown): string {
  return toNumber(value).toLocaleString('ar-EG');
}

export function formatMoneyText(value: unknown): string {
  const amount = toNumber(value);
  try {
    return new Intl.NumberFormat('ar-EG', {
      style: 'currency',
      currency: 'EGP',
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString('ar-EG')} EGP`;
  }
}

export function safeJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function safeJsonObject<T = Record<string, unknown>>(value: unknown): T {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as T;
  if (typeof value !== 'string' || !value.trim()) return {} as T;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as T) : ({} as T);
  } catch {
    return {} as T;
  }
}

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const targetMonth = result.getMonth() + months;
  const day = result.getDate();
  result.setMonth(targetMonth);
  if (result.getDate() < day) result.setDate(0);
  return result;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setDate(result.getDate() + days);
  return result;
}

export function randomToken(length: number, alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'): string {
  const bytes = crypto.randomBytes(length);
  let value = '';
  for (let index = 0; index < length; index += 1) {
    value += alphabet[bytes[index] % alphabet.length];
  }
  return value;
}

export function generateTemporaryPassword(): string {
  return `Cs-${randomToken(4)}${randomToken(4, '23456789')}!`;
}

export function generateActivationCode(): string {
  return `${randomToken(4)}-${randomToken(4)}`;
}

export function generateLicenseActivationCode(): string {
  return `${randomToken(4)}-${randomToken(4)}-${randomToken(4)}`;
}

// DEPRECATED: demo-only signature using a static secret. Phase 0 of the
// central-admin migration replaces this with Ed25519 server-side signing
// (issued by /api/v1/admin/licenses/issue). Local issuance is dev-only and
// must be gated behind `platform.localIssuance === true` before production.
// SECURITY WARNING: This is NOT a cryptographic signature. Do not use in production.
export function signCertificate(payload: Record<string, unknown>): string {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Local certificate signing is not allowed in production. Use central server signing instead.');
  }
  const secret = 'ceramisys-platform-certificate-secret';
  const body = JSON.stringify(payload);
  const signature = btoa(`${secret}:${body}`).replace(/=+$/, '');
  return btoa(JSON.stringify({ ...payload, signature })).replace(/=+$/, '');
}

export function mapTenantAccount(row: any) {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    username: String(row.username),
    email: row.email ?? null,
    fullName: row.full_name ?? null,
    isActive: Boolean(row.is_active),
    activationCode: row.activation_code ?? null,
    lastActivatedAt: row.last_activated_at ?? null,
    lastLoginAt: row.last_login_at ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function mapTenantOverride(row: any) {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    kind: row.kind,
    code: String(row.code),
    value: row.value ?? null,
    isEnabled: Boolean(row.is_enabled),
    expiresAt: row.expires_at ?? null,
    notes: row.notes ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function formatDate(dateString: string): string {
  try {
    return new Date(dateString).toLocaleDateString('ar-EG');
  } catch {
    return dateString;
  }
}