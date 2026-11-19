import { v4 as uuidv4 } from 'uuid';
import type {
  PlatformTenant,
  PlatformTenantInput,
  PlatformTenantStatus,
} from '../platformTypes';
import { nowIso, toNumber, addMonths } from '../platformUtils';
import type { TenantServiceContext } from './context';
import { mapTenantJoinedRow, mapTenantBaseRow } from './mappers';
import { generateTenantCode } from './helpers';

export function listTenants(ctx: TenantServiceContext, search = '', status = '', planId = ''): PlatformTenant[] {
  const user = ctx.requirePlatformAccess('tenants', 'platform.tenants.view');
  const scopeIds = ctx.staffTenantScope(user);

  const where: string[] = [];
  const params: (string | number)[] = [];

  if (scopeIds !== null) {
    if (!scopeIds.length) return [];
    where.push(`t.id IN (${scopeIds.map(() => '?').join(',')})`);
    params.push(...scopeIds);
  }

  if (search) {
    where.push('(t.name LIKE ? OR t.code LIKE ? OR COALESCE(t.email,\'\') LIKE ? OR COALESCE(t.phone,\'\') LIKE ?)');
    const term = `%${search}%`;
    params.push(term, term, term, term);
  }
  if (status) {
    where.push('t.status = ?');
    params.push(status);
  }
  if (planId) {
    where.push('t.plan_id = ?');
    params.push(planId);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = ctx.db.query<any>(
    `SELECT t.*,
            p.name AS planName, p.price / 100.0 AS planPrice,
            (SELECT COUNT(*) FROM platform_subscriptions s WHERE s.tenant_id = t.id AND s.status IN ('ACTIVE','TRIAL')) AS activeLicenses,
            (SELECT COUNT(*) FROM platform_licenses l WHERE l.tenant_id = t.id) AS licensesTotal,
            (SELECT COUNT(*) FROM platform_devices d
             JOIN platform_licenses l ON l.id = d.license_id
             WHERE l.tenant_id = t.id AND d.status = 'ACTIVE') AS devicesUsed,
            COALESCE((
              SELECT SUM(total - COALESCE(paid_amount, 0)) / 100.0
              FROM platform_invoices i
              WHERE i.tenant_id = t.id AND i.status IN ('SENT','PARTIAL','OVERDUE')
            ), 0) AS outstanding
     FROM platform_tenants t
     LEFT JOIN platform_plans p ON p.id = t.plan_id
     ${whereSql}
     ORDER BY t.created_at DESC`,
    params
  );

  return rows.map(mapTenantJoinedRow);
}

export function getTenant(ctx: TenantServiceContext, id: string): PlatformTenant | null {
  const user = ctx.requirePlatformAccess('tenants', 'platform.tenants.view');
  const scopeIds = ctx.staffTenantScope(user);
  if (scopeIds !== null && !scopeIds.includes(String(id))) {
    throw new Error('هذا العميل خارج نطاق البيانات المخصص لك.');
  }
  const row = ctx.db.query<any>('SELECT * FROM platform_tenants WHERE id = ?', [id])[0];
  if (!row) return null;
  return mapTenantBaseRow(row);
}

export function createTenant(ctx: TenantServiceContext, input: PlatformTenantInput): PlatformTenant {
  ctx.requirePlatformAccess('tenants', 'platform.tenants.create');

  const code = input.code?.trim() || generateTenantCode(ctx.db, input.name);
  if (ctx.db.query('SELECT 1 FROM platform_tenants WHERE code = ?', [code]).length) {
    throw new Error('رمز العميل مستخدم بالفعل.');
  }
  if (input.name.length < 2) throw new Error('اسم العميل مطلوب (حرفان على الأقل).');

  const plan = input.planId
    ? ctx.db.query<any>('SELECT * FROM platform_plans WHERE id = ? AND is_active = 1', [input.planId])[0]
    : ctx.db.query<any>('SELECT * FROM platform_plans WHERE is_default = 1 AND is_active = 1 LIMIT 1')[0];

  const id = `ten_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
  const now = nowIso();

  ctx.db.run(
    `INSERT INTO platform_tenants
      (id, code, name, contact_name, email, phone, country, city, address, business_type,
       status, plan_id, seats_limit, branches_limit, devices_limit, notes,
       subscription_started_at, subscription_expires_at, subscription_id, price,
       created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ROUND(?*100), ?, ?)`,
    [
      id, code, input.name.trim(), input.contactName?.trim() ?? null, input.email?.trim() ?? null,
      input.phone?.trim() ?? null, input.country?.trim() ?? null, input.city?.trim() ?? null,
      input.address?.trim() ?? null, input.businessType?.trim() ?? null,
      input.status ?? 'TRIAL', plan?.id ?? null,
      toNumber(input.seatsLimit, plan?.seatsLimit ?? 1),
      toNumber(input.branchesLimit, plan?.branchesLimit ?? 1),
      toNumber(input.devicesLimit, plan?.devicesLimit ?? 1),
      input.notes?.trim() ?? null,
      plan ? now : null,
      plan ? addMonths(new Date(), plan.trialDays).toISOString() : null,
      plan ? `sub_${uuidv4().replace(/-/g, '').slice(0, 12)}` : null,
      toNumber(plan?.price, 0),
      now, now,
    ]
  );

  if (plan) {
    ctx.db.run(
      `INSERT INTO platform_subscriptions
        (id, tenant_id, plan_id, status, start_date, end_date, seats, price, billing_cycle, auto_renew, branches_limit)
       VALUES (?, ?, ?, 'TRIAL', ?, ?, ?, ROUND(?*100), ?, 1, ?)`,
      [
        `sub_${uuidv4().replace(/-/g, '').slice(0, 12)}`, id, plan.id,
        now, addMonths(new Date(), plan.trialDays).toISOString(),
        toNumber(input.seatsLimit, plan.seatsLimit), toNumber(plan.price), plan.billingCycle,
        toNumber(input.branchesLimit, plan.branchesLimit),
      ]
    );
  }

  ctx.audit('إنشاء عميل', 'TENANT', id, { name: input.name, code, planId: plan?.id ?? null });

  const tenant = ctx.getTenant(id);
  if (!tenant) throw new Error('فشل إنشاء العميل.');
  return tenant;
}

export function updateTenant(ctx: TenantServiceContext, id: string, input: PlatformTenantInput): PlatformTenant {
  ctx.requirePlatformAccess('tenants', 'platform.tenants.update');

  const tenant = ctx.getTenant(id);
  if (!tenant) throw new Error('العميل غير موجود.');
  if (input.name.length < 2) throw new Error('اسم العميل مطلوب.');

  const plan = input.planId
    ? ctx.db.query<any>('SELECT * FROM platform_plans WHERE id = ? AND is_active = 1', [input.planId])[0]
    : null;

  const now = nowIso();
  ctx.db.run(
    `UPDATE platform_tenants SET
       name = ?, contact_name = ?, email = ?, phone = ?, country = ?, city = ?, address = ?, business_type = ?,
       status = ?, plan_id = ?, seats_limit = ?, branches_limit = ?, devices_limit = ?, notes = ?, updated_at = ?
     WHERE id = ?`,
    [
      input.name.trim(), input.contactName?.trim() ?? null, input.email?.trim() ?? null,
      input.phone?.trim() ?? null, input.country?.trim() ?? null, input.city?.trim() ?? null,
      input.address?.trim() ?? null, input.businessType?.trim() ?? null,
      input.status ?? tenant.status, plan?.id ?? tenant.planId,
      toNumber(input.seatsLimit, plan?.seatsLimit ?? tenant.seatsLimit),
      toNumber(input.branchesLimit, plan?.branchesLimit ?? tenant.branchesLimit),
      toNumber(input.devicesLimit, plan?.devicesLimit ?? tenant.devicesLimit),
      input.notes?.trim() ?? null, now, id,
    ]
  );

  ctx.audit('تحديث عميل', 'TENANT', id, { name: input.name });

  const updated = ctx.getTenant(id);
  if (!updated) throw new Error('فشل تحديث العميل.');
  return updated;
}

export function setTenantStatus(ctx: TenantServiceContext, id: string, status: PlatformTenantStatus): void {
  ctx.requirePlatformAccess('tenants', 'platform.tenants.update');

  const tenant = ctx.getTenant(id);
  if (!tenant) throw new Error('العميل غير موجود.');

  const now = nowIso();
  ctx.db.run('UPDATE platform_tenants SET status = ?, updated_at = ? WHERE id = ?', [status, now, id]);

  ctx.audit('تغيير حالة العميل', 'TENANT', id, { status });
}

export function archiveTenant(ctx: TenantServiceContext, id: string): void {
  ctx.requirePlatformAccess('tenants', 'platform.tenants.delete');

  const tenant = ctx.getTenant(id);
  if (!tenant) throw new Error('العميل غير موجود.');

  const now = nowIso();
  ctx.db.run('UPDATE platform_tenants SET status = \'CANCELLED\', updated_at = ? WHERE id = ?', [now, id]);

  // Cancel active subscriptions
  ctx.db.run(
    `UPDATE platform_subscriptions SET status = 'CANCELLED', auto_renew = 0, updated_at = ?
     WHERE tenant_id = ? AND status IN ('ACTIVE','TRIAL','PAST_DUE','SUSPENDED')`,
    [now, id]
  );

  // Revoke active licenses
  ctx.db.run(
    `UPDATE platform_licenses SET status = 'REVOKED', updated_at = ?
     WHERE tenant_id = ? AND status IN ('ACTIVE','ISSUED','SUSPENDED')`,
    [now, id]
  );

  ctx.audit('أرشفة العميل', 'TENANT', id, {});
}
