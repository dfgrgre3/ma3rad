import { v4 as uuidv4 } from 'uuid';
import { mapTenantOverride, nowIso } from '../platformUtils';
import type { PlatformTenantOverride, PlatformTenantOverrideInput } from '../platformTypes';
import type { TenantServiceContext } from './context';

export function listTenantOverrides(ctx: TenantServiceContext, tenantId: string): PlatformTenantOverride[] {
  ctx.requirePlatformAccess('tenants', 'platform.tenants.view');
  const rows = ctx.db.query<any>('SELECT * FROM platform_tenant_overrides WHERE tenant_id = ? ORDER BY created_at DESC', [tenantId]);
  return rows.map(mapTenantOverride);
}

export function addTenantOverride(ctx: TenantServiceContext, tenantId: string, input: PlatformTenantOverrideInput): PlatformTenantOverride {
  ctx.requirePlatformAccess('tenants', 'platform.tenants.update');

  const tenant = ctx.getTenant(tenantId);
  if (!tenant) throw new Error('العميل غير موجود.');

  const id = `ovr_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
  const now = nowIso();

  ctx.db.run(
    `INSERT INTO platform_tenant_overrides
      (id, tenant_id, kind, code, value, is_enabled, expires_at, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
    [id, tenantId, input.kind, input.code, input.value ?? null, input.expiresAt ?? null, input.notes ?? null, now, now]
  );

  ctx.audit('إضافة تجاوز عميل', 'TENANT_OVERRIDE', id, { tenantId, kind: input.kind, code: input.code });

  const row = ctx.db.query<any>('SELECT * FROM platform_tenant_overrides WHERE id = ?', [id])[0];
  return mapTenantOverride(row);
}

export function setTenantOverrideEnabled(ctx: TenantServiceContext, id: string, enabled: boolean): PlatformTenantOverride {
  ctx.requirePlatformAccess('tenants', 'platform.tenants.update');

  const row = ctx.db.query<any>('SELECT * FROM platform_tenant_overrides WHERE id = ?', [id])[0];
  if (!row) throw new Error('التجاوز غير موجود.');

  const now = nowIso();
  ctx.db.run('UPDATE platform_tenant_overrides SET is_enabled = ?, updated_at = ? WHERE id = ?', [enabled ? 1 : 0, now, id]);

  ctx.audit(enabled ? 'تفعيل تجاوز عميل' : 'تعطيل تجاوز عميل', 'TENANT_OVERRIDE', id, {});

  const updated = ctx.db.query<any>('SELECT * FROM platform_tenant_overrides WHERE id = ?', [id])[0];
  return mapTenantOverride(updated);
}

export function removeTenantOverride(ctx: TenantServiceContext, id: string): void {
  ctx.requirePlatformAccess('tenants', 'platform.tenants.delete');

  const row = ctx.db.query<any>('SELECT * FROM platform_tenant_overrides WHERE id = ?', [id])[0];
  if (!row) throw new Error('التجاوز غير موجود.');

  ctx.db.run('DELETE FROM platform_tenant_overrides WHERE id = ?', [id]);
  ctx.audit('إزالة تجاوز عميل', 'TENANT_OVERRIDE', id, {});
}
