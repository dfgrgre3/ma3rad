import { v4 as uuidv4 } from 'uuid';
import crypto from 'node:crypto';
import type { StaffServiceContext } from './context';
import { nowIso, randomToken } from '../platformUtils';

export function listApiKeys(ctx: StaffServiceContext, tenantId?: string): any[] {
  ctx.requirePlatformAccess('apiKeys', 'platform.apiKeys.view');

  const where = tenantId ? 'WHERE tenant_id = ?' : '';
  const params = tenantId ? [tenantId] : [];

  const rows = ctx.db.query<any>(`SELECT * FROM platform_api_keys ${where} ORDER BY created_at DESC`, params);
  return rows.map((row: any) => ({
    id: String(row.id),
    tenantId: String(row.tenant_id),
    name: String(row.name),
    keyPrefix: String(row.key_prefix),
    scopes: row.scopes ? JSON.parse(row.scopes) : [],
    expiresAt: row.expires_at ?? null,
    lastUsedAt: row.last_used_at ?? null,
    createdAt: String(row.created_at),
    revokedAt: row.revoked_at ?? null,
  }));
}

export function createApiKey(ctx: StaffServiceContext, input: { tenantId: string; name: string; scopes?: string[]; expiresAt?: string }): any {
  ctx.requirePlatformAccess('apiKeys', 'platform.apiKeys.create');

  const tenant = ctx.db.query<any>('SELECT * FROM platform_tenants WHERE id = ?', [input.tenantId])[0];
  if (!tenant) throw new Error('العميل غير موجود.');

  const id = `ak_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
  const plainKey = `cs_${randomToken(32, 'abcdefghijklmnopqrstuvwxyz0123456789')}`;
  const keyPrefix = plainKey.substring(0, 12);
  const keyHash = crypto.createHash('sha256').update(plainKey).digest('hex');
  const now = nowIso();

  ctx.db.run(
    `INSERT INTO platform_api_keys (id, tenant_id, name, key_prefix, key_hash, scopes, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.tenantId, input.name.trim(), keyPrefix, keyHash, JSON.stringify(input.scopes ?? []), input.expiresAt ?? null, now]
  );

  ctx.audit('إنشاء مفتاح API', 'API_KEY', id, { tenantId: input.tenantId, name: input.name });

  return { id, name: input.name, key: plainKey, keyPrefix, scopes: input.scopes ?? [], expiresAt: input.expiresAt ?? null };
}

export function revokeApiKey(ctx: StaffServiceContext, id: string): void {
  ctx.requirePlatformAccess('apiKeys', 'platform.apiKeys.delete');

  const row = ctx.db.query<any>('SELECT * FROM platform_api_keys WHERE id = ?', [id])[0];
  if (!row) throw new Error('مفتاح API غير موجود.')

  const now = nowIso();
  ctx.db.run('UPDATE platform_api_keys SET revoked_at = ? WHERE id = ?', [now, id]);

  ctx.audit('إلغاء مفتاح API', 'API_KEY', id, {});
}

export function rotateApiKey(ctx: StaffServiceContext, id: string): any {
  ctx.requirePlatformAccess('apiKeys', 'platform.apiKeys.update');

  const row = ctx.db.query<any>('SELECT * FROM platform_api_keys WHERE id = ?', [id])[0];
  if (!row) throw new Error('مفتاح API غير موجود.')

  const plainKey = `cs_${randomToken(32, 'abcdefghijklmnopqrstuvwxyz0123456789')}`;
  const keyPrefix = plainKey.substring(0, 12);
  const keyHash = crypto.createHash('sha256').update(plainKey).digest('hex');
  const now = nowIso();

  ctx.db.run('UPDATE platform_api_keys SET key_prefix = ?, key_hash = ?, rotated_at = ?, updated_at = ? WHERE id = ?', [keyPrefix, keyHash, now, now, id]);

  ctx.audit('تدوير مفتاح API', 'API_KEY', id, {});

  return { id, name: row.name, key: plainKey, keyPrefix, scopes: JSON.parse(row.scopes || '[]'), expiresAt: row.expires_at };
}

export function validateApiKey(ctx: StaffServiceContext, plainTextKey: string): any {
  const keyHash = crypto.createHash('sha256').update(plainTextKey).digest('hex');
  const row = ctx.db.query<any>('SELECT * FROM platform_api_keys WHERE key_hash = ? AND revoked_at IS NULL', [keyHash])[0];
  if (!row) return null;
  if (row.expires_at && new Date(row.expires_at) < new Date()) return null;
  return { tenantId: row.tenant_id, scopes: JSON.parse(row.scopes || '[]') };
}
