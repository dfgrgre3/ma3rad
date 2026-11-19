import type { PlatformTenantProfile } from '../platformTypes';
import { toNumber } from '../platformUtils';
import type { TenantServiceContext } from './context';
import { mapPlan, mapSubscription, mapLicense, mapInvoice, mapPayment, mapAuditEntry } from './mappers';

export function getTenantProfile(ctx: TenantServiceContext, id: string): PlatformTenantProfile {
  ctx.requirePlatformAccess('tenants', 'platform.tenants.view');

  const tenant = ctx.getTenant(id);
  if (!tenant) throw new Error('العميل غير موجود.');

  const plan = tenant.planId
    ? ctx.db.query<any>('SELECT * FROM platform_plans WHERE id = ?', [tenant.planId])[0]
    : null;

  const account = ctx.getTenantAccount(id);
  const subscriptions = ctx.db.query<any>('SELECT * FROM platform_subscriptions WHERE tenant_id = ? ORDER BY created_at DESC', [id]);
  const licenses = ctx.db.query<any>('SELECT * FROM platform_licenses WHERE tenant_id = ? ORDER BY created_at DESC', [id]);
  const invoices = ctx.db.query<any>('SELECT * FROM platform_invoices WHERE tenant_id = ? ORDER BY created_at DESC', [id]);
  const payments = ctx.db.query<any>('SELECT * FROM platform_payments WHERE tenant_id = ? ORDER BY created_at DESC', [id]);
  const activationLog = ctx.db.query<any>('SELECT * FROM platform_audit WHERE entity_type = \'TENANT\' AND entity_id = ? ORDER BY created_at DESC LIMIT 50', [id]);
  const changeLog = ctx.db.query<any>('SELECT * FROM platform_audit WHERE entity_type IN (\'SUBSCRIPTION\',\'LICENSE\',\'INVOICE\',\'PAYMENT\') AND (details LIKE ? OR details LIKE ?) ORDER BY created_at DESC LIMIT 100', [`%${id}%`, `%"tenantId":"${id}"%`]);
  const activityLog = ctx.db.query<any>('SELECT * FROM platform_audit WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 200', [id]);

  const seatsUsed = ctx.db.query<any>('SELECT COUNT(*) AS c FROM platform_tenant_users WHERE tenant_id = ? AND is_active = 1', [id])[0]?.c ?? 0;
  const branchesUsed = ctx.db.query<any>('SELECT COUNT(*) AS c FROM platform_branches WHERE tenant_id = ?', [id])[0]?.c ?? 0;
  const devicesUsed = ctx.db.query<any>(
    `SELECT COUNT(*) AS c FROM platform_devices d
     JOIN platform_licenses l ON l.id = d.license_id
     WHERE l.tenant_id = ? AND d.status = 'ACTIVE'`,
    [id]
  )[0]?.c ?? 0;
  const modulesCount = ctx.db.query<any>('SELECT COUNT(DISTINCT json_each.value) AS c FROM platform_licenses, json_each(modules) WHERE tenant_id = ? AND status IN (\'ACTIVE\',\'ISSUED\')', [id])[0]?.c ?? 0;

  return {
    tenant,
    plan: plan ? mapPlan(plan) : null,
    account,
    subscriptions: subscriptions.map(mapSubscription),
    licenses: licenses.map(mapLicense),
    invoices: invoices.map(mapInvoice),
    payments: payments.map(mapPayment),
    activationLog: activationLog.map(mapAuditEntry),
    changeLog: changeLog.map(mapAuditEntry),
    activityLog: activityLog.map(mapAuditEntry),
    usage: {
      seatsLimit: tenant.seatsLimit,
      devicesLimit: tenant.devicesLimit,
      devicesUsed: toNumber(devicesUsed, 0),
      branchesLimit: tenant.branchesLimit,
      branchesUsed: toNumber(branchesUsed, 0),
      modulesCount: toNumber(modulesCount, 0),
    },
  };
}
