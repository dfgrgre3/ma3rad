import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import type {
  PlatformTenant,
  PlatformTenantAccount,
  PlatformTenantAccountInput,
  PlatformActivationDetails,
} from '../platformTypes';
import { nowIso, generateTemporaryPassword, generateActivationCode, mapTenantAccount } from '../platformUtils';
import type { TenantServiceContext } from './context';
import { generateUsername, getActiveLicenseKey, getPlanModules } from './helpers';

function buildActivationDetails(
  ctx: TenantServiceContext,
  tenant: PlatformTenant,
  account: PlatformTenantAccount,
  username: string,
  temporaryPassword: string,
  activationCode: string,
  now: string
): PlatformActivationDetails {
  return {
    tenant,
    account,
    username,
    temporaryPassword,
    activationCode,
    planName: tenant.planName ?? null,
    licenseKey: getActiveLicenseKey(ctx.db, tenant.id),
    licenseExpiresAt: tenant.subscriptionExpiresAt ?? null,
    modules: tenant.planId ? getPlanModules(ctx.db, tenant.planId) : [],
    loginUrl: `${ctx.setting('platform.clientUrl', 'https://app.ceramisys.com')}/login`,
    generatedAt: now,
  };
}

export function getTenantAccount(ctx: TenantServiceContext, tenantId: string): PlatformTenantAccount | null {
  ctx.requirePlatformAccess('tenants', 'platform.tenants.view');
  const row = ctx.db.query<any>('SELECT * FROM platform_tenant_accounts WHERE tenant_id = ?', [tenantId])[0];
  return row ? mapTenantAccount(row) : null;
}

export function createTenantAccount(
  ctx: TenantServiceContext,
  tenantId: string,
  input: PlatformTenantAccountInput
): PlatformActivationDetails {
  ctx.requirePlatformAccess('tenants', 'platform.tenants.update');

  const tenant = ctx.getTenant(tenantId);
  if (!tenant) throw new Error('العميل غير موجود.');
  if (ctx.getTenantAccount(tenantId)) throw new Error('هذا العميل لديه حساب بالفعل.');

  const username = input.username?.trim() || generateUsername(ctx.db, tenant.name);
  const temporaryPassword = input.password || generateTemporaryPassword();
  const passwordHash = bcrypt.hashSync(temporaryPassword, 10);
  const activationCode = generateActivationCode();
  const id = `acc_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
  const now = nowIso();

  ctx.db.run(
    `INSERT INTO platform_tenant_accounts
      (id, tenant_id, username, email, full_name, password_hash, is_active, activation_code, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    [id, tenantId, username, input.email?.trim() ?? null, input.fullName?.trim() ?? null, passwordHash, activationCode, now, now]
  );

  ctx.audit('إنشاء حساب عميل', 'TENANT_ACCOUNT', id, { tenantId, username });

  return buildActivationDetails(ctx, tenant, ctx.getTenantAccount(tenantId)!, username, temporaryPassword, activationCode, now);
}

export function resetTenantAccountPassword(ctx: TenantServiceContext, tenantId: string, temporaryPassword?: string): PlatformActivationDetails {
  ctx.requirePlatformAccess('tenants', 'platform.tenants.update');

  const tenant = ctx.getTenant(tenantId);
  if (!tenant) throw new Error('العميل غير موجود.');

  const account = ctx.getTenantAccount(tenantId);
  if (!account) throw new Error('لا يوجد حساب لهذا العميل. أنشئ حساباً أولاً.');

  const pwd = temporaryPassword || generateTemporaryPassword();
  if (pwd.length < 8) throw new Error('كلمة المرور يجب أن تكون 8 أحرف على الأقل.');

  const passwordHash = bcrypt.hashSync(pwd, 10);
  const activationCode = generateActivationCode();
  const now = nowIso();

  ctx.db.run(
    'UPDATE platform_tenant_accounts SET password_hash = ?, activation_code = ?, updated_at = ? WHERE tenant_id = ?',
    [passwordHash, activationCode, now, tenantId]
  );

  ctx.audit('إعادة تعيين كلمة مرور حساب العميل', 'TENANT_ACCOUNT', account.id, { tenantId });

  return buildActivationDetails(ctx, tenant, ctx.getTenantAccount(tenantId)!, account.username, pwd, activationCode, now);
}

export function updateTenantAccount(
  ctx: TenantServiceContext,
  tenantId: string,
  input: { username?: string; email?: string; fullName?: string; password?: string }
): PlatformTenantAccount {
  ctx.requirePlatformAccess('tenants', 'platform.tenants.update');

  const account = ctx.getTenantAccount(tenantId);
  if (!account) throw new Error('لا يوجد حساب لهذا العميل.');

  const username = input.username?.trim().toLowerCase();
  if (username !== undefined && username !== account.username) {
    if (!/^[a-z0-9._-]{3,24}$/.test(username)) {
      throw new Error('اسم المستخدم يجب أن يكون 3-24 حرفًا من a-z و0-9 و. _ -');
    }
    const clash = ctx.db.query<any>(
      'SELECT id FROM platform_tenant_accounts WHERE username = ? AND id != ?',
      [username, account.id]
    )[0];
    if (clash) throw new Error('اسم المستخدم مستخدم بالفعل.');
  }
  if (input.password !== undefined && input.password !== '' && input.password.length < 8) {
    throw new Error('كلمة المرور يجب أن تكون 8 أحرف على الأقل.');
  }

  const sets: string[] = [];
  const params: any[] = [];
  if (username !== undefined && username !== account.username) {
    sets.push('username = ?');
    params.push(username);
  }
  if (input.email !== undefined) {
    sets.push('email = ?');
    params.push(input.email.trim() || null);
  }
  if (input.fullName !== undefined) {
    sets.push('full_name = ?');
    params.push(input.fullName.trim() || null);
  }
  if (input.password) {
    sets.push('password_hash = ?');
    params.push(bcrypt.hashSync(input.password, 10));
  }
  if (sets.length === 0) return account;
  const now = nowIso();
  sets.push('updated_at = ?');
  params.push(now, account.id);
  ctx.db.run(`UPDATE platform_tenant_accounts SET ${sets.join(', ')} WHERE id = ?`, params);
  ctx.audit('تحديث حساب العميل', 'TENANT_ACCOUNT', account.id, { tenantId });
  const updated = ctx.getTenantAccount(tenantId);
  if (!updated) throw new Error('فشل تحديث الحساب.');
  return updated;
}

export function setTenantAccountActive(ctx: TenantServiceContext, tenantId: string, active: boolean): PlatformTenantAccount {
  ctx.requirePlatformAccess('tenants', 'platform.tenants.update');

  const account = ctx.getTenantAccount(tenantId);
  if (!account) throw new Error('لا يوجد حساب لهذا العميل.');

  const now = nowIso();
  ctx.db.run('UPDATE platform_tenant_accounts SET is_active = ?, updated_at = ? WHERE tenant_id = ?', [active ? 1 : 0, now, tenantId]);

  ctx.audit(active ? 'تفعيل حساب العميل' : 'تعطيل حساب العميل', 'TENANT_ACCOUNT', account.id, { tenantId });

  const updated = ctx.getTenantAccount(tenantId);
  if (!updated) throw new Error('فشل تحديث الحساب.');
  return updated;
}
