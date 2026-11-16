import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PlatformStaffAuthService } from './PlatformStaffAuthService';
import { PlatformAuthorizationService } from './PlatformAuthorizationService';
import { centralAuditService } from './CentralAuditService';
import {
  PlatformTenant,
  PlatformTenantInput,
  PlatformTenantStatus,
  PlatformTenantAccount,
  PlatformTenantAccountInput,
  PlatformTenantProfile,
  PlatformTenantUser,
  PlatformTenantUserInput,
  PlatformTenantUserProvisioningResult,
  PlatformTenantOverride,
  PlatformTenantOverrideInput,
  PlatformPlan,
  PlatformSubscription,
  PlatformLicense,
  PlatformInvoice,
  PlatformPayment,
  PlatformAuditEntry,
  PlatformTenantUsage,
  PlatformActivationDetails,
  PlatformTenantActivityConfig,
  PlatformTenantActivityInput,
  PlatformTenantActivityVersion,
} from './platformTypes';
import { nowIso, toNumber, formatCount, formatMoneyText, safeJsonArray, safeJsonObject, addMonths, addDays, randomToken, generateTemporaryPassword, generateActivationCode, mapTenantAccount, mapTenantOverride } from './platformUtils';

export class PlatformTenantService {
  private db = DatabaseManager.getInstance();

  private static requirePlatformAccess(modules: string | string[], action?: string) {
    const user = AuthService.getCurrentUser();
    if (!user || !user.isActive) {
      throw new Error('هذه العملية تتطلب جلسة منصة صالحة.');
    }

    if (user.role === 'SUPER_ADMIN') {
      return user;
    }

    const allowedRoles = new Set(['PLATFORM_ADMIN', 'SUPPORT_AGENT', 'OPERATIONS_ENGINEER', 'BILLING_SPECIALIST', 'LICENSE_MANAGER']);
    if (!allowedRoles.has(String(user.role))) {
      throw new Error('هذه العملية متاحة لمستخدمي المنصة المصرح لهم فقط.');
    }

    const permissionsOverride = PlatformStaffAuthService.getCurrentPermissionsOverride();
    const required = Array.isArray(modules) ? modules : [modules];
    const permitted = required.some((moduleKey) => {
      if (action && action.startsWith('platform.')) {
        return PlatformAuthorizationService.canAccessPermission(user.role, action, permissionsOverride);
      }
      return PlatformAuthorizationService.canAccessModule(user.role, moduleKey, permissionsOverride)
        && (!action || PlatformAuthorizationService.canAccessModule(user.role, action, permissionsOverride));
    });

    if (!permitted) {
      throw new Error('لا تملك صلاحية تنفيذ هذه العملية.');
    }

    return user;
  }

  private audit(
    action: string,
    entityType: string,
    entityId: string | null,
    details?: unknown,
    options?: {
      severity?: import('./platformTypes').AuditSeverity;
      status?: import('./platformTypes').AuditStatus;
      actorType?: import('./platformTypes').AuditActorType;
      tenantId?: string | null;
      deviceId?: string | null;
      deviceName?: string | null;
      ipAddress?: string | null;
      oldValues?: unknown;
      newValues?: unknown;
      errorMessage?: string | null;
    }
  ): void {
    const actor = AuthService.getCurrentUser();
    if (!actor) throw new Error('هذه العملية تتطلب جلسة منصة صالحة.');
    centralAuditService.log(actor, {
      action,
      entityType,
      entityId,
      details,
      severity: options?.severity,
      status: options?.status,
      actorType: options?.actorType,
      tenantId: options?.tenantId || (entityType === 'TENANT' ? entityId : undefined),
      deviceId: options?.deviceId,
      deviceName: options?.deviceName,
      ipAddress: options?.ipAddress,
      oldValues: options?.oldValues,
      newValues: options?.newValues,
      errorMessage: options?.errorMessage,
    });
  }

  private setting(key: string, fallback = ''): string {
    const row = this.db.query<{ value: string }>(
      'SELECT value FROM platform_settings WHERE key = ?',
      [key]
    )[0];
    return row?.value ?? fallback;
  }

  private nextSequence(table: string): number {
    const row = this.db.query<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`)[0];
    return toNumber(row?.count, 0) + 1;
  }

  // ─── Tenant CRUD ──────────────────────────────────────────────────────────────

  public listTenants(search = '', status = '', planId = ''): PlatformTenant[] {
    PlatformTenantService.requirePlatformAccess('tenants', 'platform.tenants.view');

    const where: string[] = [];
    const params: (string | number)[] = [];

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

    const rows = this.db.query<any>(
      `SELECT t.*,
              p.name AS planName, p.price AS planPrice,
              (SELECT COUNT(*) FROM platform_subscriptions s WHERE s.tenant_id = t.id AND s.status IN ('ACTIVE','TRIAL')) AS activeLicenses,
              (SELECT COUNT(*) FROM platform_licenses l WHERE l.tenant_id = t.id) AS licensesTotal,
              (SELECT COUNT(*) FROM platform_devices d
               JOIN platform_licenses l ON l.id = d.license_id
               WHERE l.tenant_id = t.id AND d.status = 'ACTIVE') AS devicesUsed,
              COALESCE((
                SELECT SUM(total - COALESCE(paid, 0))
                FROM platform_invoices i
                WHERE i.tenant_id = t.id AND i.status IN ('SENT','PARTIAL','OVERDUE')
              ), 0) AS outstanding
       FROM platform_tenants t
       LEFT JOIN platform_plans p ON p.id = t.plan_id
       ${whereSql}
       ORDER BY t.created_at DESC`,
      params
    );

    return rows.map((row) => ({
      id: String(row.id),
      code: String(row.code),
      name: String(row.name),
      contactName: row.contactName ?? null,
      email: row.email ?? null,
      phone: row.phone ?? null,
      country: row.country ?? null,
      city: row.city ?? null,
      address: row.address ?? null,
      businessType: row.businessType ?? null,
      status: row.status as PlatformTenantStatus,
      planId: row.planId ?? null,
      planName: row.planName ?? null,
      planPrice: row.planPrice ?? null,
      subscriptionStartedAt: row.subscription_started_at ?? null,
      subscriptionExpiresAt: row.subscription_expires_at ?? null,
      seatsLimit: toNumber(row.seats_limit, 1),
      branchesLimit: toNumber(row.branches_limit, 1),
      devicesLimit: toNumber(row.devices_limit, 1),
      notes: row.notes ?? null,
      activeLicenses: toNumber(row.activeLicenses, 0),
      licensesTotal: toNumber(row.licensesTotal, 0),
      devicesUsed: toNumber(row.devicesUsed, 0),
      outstanding: toNumber(row.outstanding, 0),
      subscriptionId: row.subscription_id ?? null,
      price: row.price ?? null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    }));
  }

  public getTenant(id: string): PlatformTenant | null {
    PlatformTenantService.requirePlatformAccess('tenants', 'platform.tenants.view');
    const row = this.db.query<any>('SELECT * FROM platform_tenants WHERE id = ?', [id])[0];
    if (!row) return null;
    return {
      id: String(row.id),
      code: String(row.code),
      name: String(row.name),
      contactName: row.contactName ?? null,
      email: row.email ?? null,
      phone: row.phone ?? null,
      country: row.country ?? null,
      city: row.city ?? null,
      address: row.address ?? null,
      businessType: row.businessType ?? null,
      status: row.status as PlatformTenantStatus,
      planId: row.plan_id ?? null,
      planName: null,
      planPrice: null,
      subscriptionStartedAt: row.subscription_started_at ?? null,
      subscriptionExpiresAt: row.subscription_expires_at ?? null,
      seatsLimit: toNumber(row.seats_limit, 1),
      branchesLimit: toNumber(row.branches_limit, 1),
      devicesLimit: toNumber(row.devices_limit, 1),
      notes: row.notes ?? null,
      activeLicenses: 0,
      licensesTotal: 0,
      devicesUsed: 0,
      outstanding: 0,
      subscriptionId: row.subscription_id ?? null,
      price: row.price ?? null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  public createTenant(input: PlatformTenantInput): PlatformTenant {
    PlatformTenantService.requirePlatformAccess('tenants', 'platform.tenants.create');

    const code = input.code?.trim() || this.generateTenantCode(input.name);
    if (this.db.query('SELECT 1 FROM platform_tenants WHERE code = ?', [code]).length) {
      throw new Error('رمز العميل مستخدم بالفعل.');
    }
    if (input.name.length < 2) throw new Error('اسم العميل مطلوب (حرفان على الأقل).');

    const plan = input.planId
      ? this.db.query<any>('SELECT * FROM platform_plans WHERE id = ? AND is_active = 1', [input.planId])[0]
      : this.db.query<any>('SELECT * FROM platform_plans WHERE is_default = 1 AND is_active = 1 LIMIT 1')[0];

    const id = `ten_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = nowIso();

    this.db.run(
      `INSERT INTO platform_tenants
        (id, code, name, contact_name, email, phone, country, city, address, business_type,
         status, plan_id, seats_limit, branches_limit, devices_limit, notes,
         subscription_started_at, subscription_expires_at, subscription_id, price,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      this.db.run(
        `INSERT INTO platform_subscriptions
          (id, tenant_id, plan_id, status, start_date, end_date, seats, price, billing_cycle, auto_renew, branches_limit)
         VALUES (?, ?, ?, 'TRIAL', ?, ?, ?, ?, ?, 1, ?)`,
        [
          `sub_${uuidv4().replace(/-/g, '').slice(0, 12)}`, id, plan.id,
          now, addMonths(new Date(), plan.trialDays).toISOString(),
          toNumber(input.seatsLimit, plan.seatsLimit), toNumber(plan.price), plan.billingCycle,
          toNumber(input.branchesLimit, plan.branchesLimit),
        ]
      );
    }

    this.audit('إنشاء عميل', 'TENANT', id, { name: input.name, code, planId: plan?.id ?? null });

    const tenant = this.getTenant(id);
    if (!tenant) throw new Error('فشل إنشاء العميل.');
    return tenant;
  }

  public updateTenant(id: string, input: PlatformTenantInput): PlatformTenant {
    PlatformTenantService.requirePlatformAccess('tenants', 'platform.tenants.update');

    const tenant = this.getTenant(id);
    if (!tenant) throw new Error('العميل غير موجود.');
    if (input.name.length < 2) throw new Error('اسم العميل مطلوب.');

    const plan = input.planId
      ? this.db.query<any>('SELECT * FROM platform_plans WHERE id = ? AND is_active = 1', [input.planId])[0]
      : null;

    const now = nowIso();
    this.db.run(
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

    this.audit('تحديث عميل', 'TENANT', id, { name: input.name });

    const updated = this.getTenant(id);
    if (!updated) throw new Error('فشل تحديث العميل.');
    return updated;
  }

  public setTenantStatus(id: string, status: PlatformTenantStatus): void {
    PlatformTenantService.requirePlatformAccess('tenants', 'platform.tenants.update');

    const tenant = this.getTenant(id);
    if (!tenant) throw new Error('العميل غير موجود.');

    const now = nowIso();
    this.db.run('UPDATE platform_tenants SET status = ?, updated_at = ? WHERE id = ?', [status, now, id]);

    this.audit('تغيير حالة العميل', 'TENANT', id, { status });
  }

  public archiveTenant(id: string): void {
    PlatformTenantService.requirePlatformAccess('tenants', 'platform.tenants.delete');

    const tenant = this.getTenant(id);
    if (!tenant) throw new Error('العميل غير موجود.');

    const now = nowIso();
    this.db.run('UPDATE platform_tenants SET status = \'CANCELLED\', updated_at = ? WHERE id = ?', [now, id]);

    // Cancel active subscriptions
    this.db.run(
      `UPDATE platform_subscriptions SET status = 'CANCELLED', auto_renew = 0, updated_at = ?
       WHERE tenant_id = ? AND status IN ('ACTIVE','TRIAL','PAST_DUE','SUSPENDED')`,
      [now, id]
    );

    // Revoke active licenses
    this.db.run(
      `UPDATE platform_licenses SET status = 'REVOKED', updated_at = ?
       WHERE tenant_id = ? AND status IN ('ACTIVE','ISSUED','SUSPENDED')`,
      [now, id]
    );

    this.audit('أرشفة العميل', 'TENANT', id, {});
  }

  public getTenantProfile(id: string): PlatformTenantProfile {
    PlatformTenantService.requirePlatformAccess('tenants', 'platform.tenants.view');

    const tenant = this.getTenant(id);
    if (!tenant) throw new Error('العميل غير موجود.');

    const plan = tenant.planId
      ? this.db.query<any>('SELECT * FROM platform_plans WHERE id = ?', [tenant.planId])[0]
      : null;

    const account = this.getTenantAccount(id);
    const subscriptions = this.db.query<any>('SELECT * FROM platform_subscriptions WHERE tenant_id = ? ORDER BY created_at DESC', [id]);
    const licenses = this.db.query<any>('SELECT * FROM platform_licenses WHERE tenant_id = ? ORDER BY created_at DESC', [id]);
    const invoices = this.db.query<any>('SELECT * FROM platform_invoices WHERE tenant_id = ? ORDER BY created_at DESC', [id]);
    const payments = this.db.query<any>('SELECT * FROM platform_payments WHERE tenant_id = ? ORDER BY created_at DESC', [id]);
    const activationLog = this.db.query<any>('SELECT * FROM platform_audit WHERE entity_type = \'TENANT\' AND entity_id = ? ORDER BY created_at DESC LIMIT 50', [id]);
    const changeLog = this.db.query<any>('SELECT * FROM platform_audit WHERE entity_type IN (\'SUBSCRIPTION\',\'LICENSE\',\'INVOICE\',\'PAYMENT\') AND (details LIKE ? OR details LIKE ?) ORDER BY created_at DESC LIMIT 100', [`%${id}%`, `%"tenantId":"${id}"%`]);
    const activityLog = this.db.query<any>('SELECT * FROM platform_audit WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 200', [id]);

    const seatsUsed = this.db.query<any>('SELECT COUNT(*) AS c FROM platform_staff WHERE tenant_id = ? AND is_active = 1', [id])[0]?.c ?? 0;
    const branchesUsed = this.db.query<any>('SELECT COUNT(*) AS c FROM platform_branches WHERE tenant_id = ?', [id])[0]?.c ?? 0;
    const modulesCount = this.db.query<any>('SELECT COUNT(DISTINCT json_each.value) AS c FROM platform_licenses, json_each(modules) WHERE tenant_id = ? AND status IN (\'ACTIVE\',\'ISSUED\')', [id])[0]?.c ?? 0;

    return {
      tenant,
      plan: plan ? this.mapPlan(plan) : null,
      account,
      subscriptions: subscriptions.map(this.mapSubscription),
      licenses: licenses.map(this.mapLicense),
      invoices: invoices.map(this.mapInvoice),
      payments: payments.map(this.mapPayment),
      activationLog: activationLog.map(this.mapAuditEntry),
      changeLog: changeLog.map(this.mapAuditEntry),
      activityLog: activityLog.map(this.mapAuditEntry),
      usage: {
        seatsLimit: tenant.seatsLimit,
        devicesLimit: tenant.devicesLimit,
        devicesUsed: toNumber(tenant.devicesUsed, 0),
        branchesLimit: tenant.branchesLimit,
        branchesUsed: toNumber(branchesUsed, 0),
        modulesCount: toNumber(modulesCount, 0),
      },
    };
  }

  // ─── Tenant Account ───────────────────────────────────────────────────────────

  public getTenantAccount(tenantId: string): PlatformTenantAccount | null {
    PlatformTenantService.requirePlatformAccess('tenants', 'platform.tenants.view');
    const row = this.db.query<any>('SELECT * FROM platform_tenant_accounts WHERE tenant_id = ?', [tenantId])[0];
    return row ? mapTenantAccount(row) : null;
  }

  public createTenantAccount(
    tenantId: string,
    input: PlatformTenantAccountInput
  ): PlatformActivationDetails {
    PlatformTenantService.requirePlatformAccess('tenants', 'platform.tenants.update');

    const tenant = this.getTenant(tenantId);
    if (!tenant) throw new Error('العميل غير موجود.');
    if (this.getTenantAccount(tenantId)) throw new Error('هذا العميل لديه حساب بالفعل.');

    const username = input.username?.trim() || this.generateUsername(tenant.name);
    const temporaryPassword = input.password || generateTemporaryPassword();
    const passwordHash = require('bcryptjs').hashSync(temporaryPassword, 10);
    const activationCode = generateActivationCode();
    const id = `acc_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = nowIso();

    this.db.run(
      `INSERT INTO platform_tenant_accounts
        (id, tenant_id, username, email, full_name, password_hash, is_active, activation_code, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      [id, tenantId, username, input.email?.trim() ?? null, input.fullName?.trim() ?? null, passwordHash, activationCode, now, now]
    );

    this.audit('إنشاء حساب عميل', 'TENANT_ACCOUNT', id, { tenantId, username });

    return {
      tenant,
      account: this.getTenantAccount(tenantId)!,
      username,
      temporaryPassword,
      activationCode,
      planName: tenant.planName ?? null,
      licenseKey: null,
      licenseExpiresAt: tenant.subscriptionExpiresAt ?? null,
      modules: tenant.planId ? this.getPlanModules(tenant.planId) : [],
      loginUrl: `${this.setting('platform.clientUrl', 'https://app.ceramisys.com')}/login`,
      generatedAt: now,
    };
  }

  public resetTenantAccountPassword(tenantId: string, temporaryPassword?: string): PlatformActivationDetails {
    PlatformTenantService.requirePlatformAccess('tenants', 'platform.tenants.update');

    const tenant = this.getTenant(tenantId);
    if (!tenant) throw new Error('العميل غير موجود.');

    const account = this.getTenantAccount(tenantId);
    if (!account) throw new Error('لا يوجد حساب لهذا العميل. أنشئ حساباً أولاً.');

    const pwd = temporaryPassword || generateTemporaryPassword();
    if (pwd.length < 8) throw new Error('كلمة المرور يجب أن تكون 8 أحرف على الأقل.');

    const passwordHash = require('bcryptjs').hashSync(pwd, 10);
    const activationCode = generateActivationCode();
    const now = nowIso();

    this.db.run(
      'UPDATE platform_tenant_accounts SET password_hash = ?, activation_code = ?, updated_at = ? WHERE tenant_id = ?',
      [passwordHash, activationCode, now, tenantId]
    );

    this.audit('إعادة تعيين كلمة مرور حساب العميل', 'TENANT_ACCOUNT', account.id, { tenantId });

    return {
      tenant,
      account: this.getTenantAccount(tenantId)!,
      username: account.username,
      temporaryPassword: pwd,
      activationCode,
      planName: tenant.planName ?? null,
      licenseKey: null,
      licenseExpiresAt: tenant.subscriptionExpiresAt ?? null,
      modules: tenant.planId ? this.getPlanModules(tenant.planId) : [],
      loginUrl: `${this.setting('platform.clientUrl', 'https://app.ceramisys.com')}/login`,
      generatedAt: now,
    };
  }

  public setTenantAccountActive(tenantId: string, active: boolean): PlatformTenantAccount {
    PlatformTenantService.requirePlatformAccess('tenants', 'platform.tenants.update');

    const account = this.getTenantAccount(tenantId);
    if (!account) throw new Error('لا يوجد حساب لهذا العميل.');

    const now = nowIso();
    this.db.run('UPDATE platform_tenant_accounts SET is_active = ?, updated_at = ? WHERE tenant_id = ?', [active ? 1 : 0, now, tenantId]);

    this.audit(active ? 'تفعيل حساب العميل' : 'تعطيل حساب العميل', 'TENANT_ACCOUNT', account.id, { tenantId });

    const updated = this.getTenantAccount(tenantId);
    if (!updated) throw new Error('فشل تحديث الحساب.');
    return updated;
  }

  // ─── Tenant Users (Provisioning) ──────────────────────────────────────────────

  public listTenantUsers(tenantId: string): PlatformTenantUser[] {
    PlatformTenantService.requirePlatformAccess('tenants', 'platform.tenants.view');
    const rows = this.db.query<any>('SELECT * FROM platform_tenant_users WHERE tenant_id = ? ORDER BY created_at DESC', [tenantId]);
    return rows.map(this.mapTenantUser);
  }

  public createTenantUser(tenantId: string, input: PlatformTenantUserInput): PlatformTenantUserProvisioningResult {
    PlatformTenantService.requirePlatformAccess('tenants', 'platform.tenants.update');

    const tenant = this.getTenant(tenantId);
    if (!tenant) throw new Error('العميل غير موجود.');

    const fullName = input.fullName.trim();
    if (fullName.length < 2) throw new Error('اسم المستخدم مطلوب (حرفان على الأقل).');

    let username = input.username?.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '').replace(/^[-_.]+|[-_.]+$/g, '').slice(0, 24);
    if (!username) {
      username = this.generateUsername(fullName, tenantId);
    } else {
      const unique = username;
      let conflict = this.db.query<any>('SELECT 1 FROM platform_tenant_users WHERE tenant_id = ? AND username = ?', [tenantId, unique])[0];
      let index = 2;
      while (conflict) {
        username = `${unique}${index}`;
        conflict = this.db.query<any>('SELECT 1 FROM platform_tenant_users WHERE tenant_id = ? AND username = ?', [tenantId, username])[0];
        index++;
      }
    }

    const id = `tu_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = nowIso();
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = require('bcryptjs').hashSync(temporaryPassword, 10);
    const activationCode = generateActivationCode();

    this.db.run(
      `INSERT INTO platform_tenant_users
        (id, tenant_id, username, full_name, email, phone, role, password_hash, activation_code, is_active, provisioned, identity_user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?, ?)`,
      [id, tenantId, username, fullName, input.email?.trim() ?? null, input.phone?.trim() ?? null,
       input.role ?? 'USER', passwordHash, activationCode, null, now, now]
    );

    this.audit('إنشاء مستخدم عميل', 'TENANT_USER', id, { tenantId, username, role: input.role ?? 'USER' });

    return {
      user: this.getTenantUser(id)!,
      temporaryPassword,
      activationCode,
      loginUrl: `${this.setting('platform.clientUrl', 'https://app.ceramisys.com')}/login`,
      provisioned: false,
      message: 'تم إنشاء المستخدم بنجاح',
    };
  }

  public updateTenantUser(id: string, input: PlatformTenantUserInput): PlatformTenantUser {
    PlatformTenantService.requirePlatformAccess('tenants', 'platform.tenants.update');

    const existing = this.getTenantUser(id);
    if (!existing) throw new Error('المستخدم غير موجود.');

    const fullName = input.fullName.trim();
    if (fullName.length < 2) throw new Error('اسم المستخدم مطلوب.');

    let username = existing.username;
    if (input.username?.trim()) {
      username = input.username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '').replace(/^[-_.]+|[-_.]+$/g, '').slice(0, 24);
      if (username !== existing.username) {
        const conflict = this.db.query<any>('SELECT 1 FROM platform_tenant_users WHERE tenant_id = ? AND username = ? AND id <> ?', [existing.tenantId, username, id])[0];
        if (conflict) throw new Error('اسم المستخدم مستخدم بالفعل لهذا العميل.');
      }
    }

    const now = nowIso();
    this.db.run(
      `UPDATE platform_tenant_users SET
         username = ?, full_name = ?, email = ?, phone = ?, role = ?, updated_at = ?
       WHERE id = ?`,
      [username, fullName, input.email?.trim() ?? null, input.phone?.trim() ?? null, input.role ?? existing.role, now, id]
    );

    this.audit('تحديث مستخدم عميل', 'TENANT_USER', id, { tenantId: existing.tenantId });

    const updated = this.getTenantUser(id);
    if (!updated) throw new Error('فشل تحديث المستخدم.');
    return updated;
  }

  public setTenantUserActive(id: string, active: boolean): PlatformTenantUser {
    PlatformTenantService.requirePlatformAccess('tenants', 'platform.tenants.update');

    const existing = this.getTenantUser(id);
    if (!existing) throw new Error('المستخدم غير موجود.');

    const now = nowIso();
    this.db.run('UPDATE platform_tenant_users SET is_active = ?, updated_at = ? WHERE id = ?', [active ? 1 : 0, now, id]);

    this.audit(active ? 'تفعيل مستخدم عميل' : 'تعطيل مستخدم عميل', 'TENANT_USER', id, { tenantId: existing.tenantId });

    const updated = this.getTenantUser(id);
    if (!updated) throw new Error('فشل تحديث المستخدم.');
    return updated;
  }

  public deleteTenantUser(id: string): void {
    PlatformTenantService.requirePlatformAccess('tenants', 'platform.tenants.delete');

    const existing = this.getTenantUser(id);
    if (!existing) throw new Error('المستخدم غير موجود.');

    this.db.run('DELETE FROM platform_tenant_users WHERE id = ?', [id]);
    this.audit('حذف مستخدم عميل', 'TENANT_USER', id, { tenantId: existing.tenantId });
  }

  public resendTenantUserInvite(id: string): PlatformTenantUserProvisioningResult {
    PlatformTenantService.requirePlatformAccess('tenants', 'platform.tenants.update');

    const existing = this.getTenantUser(id);
    if (!existing) throw new Error('المستخدم غير موجود.');

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = require('bcryptjs').hashSync(temporaryPassword, 10);
    const activationCode = generateActivationCode();
    const now = nowIso();

    this.db.run(
      'UPDATE platform_tenant_users SET password_hash = ?, activation_code = ?, updated_at = ? WHERE id = ?',
      [passwordHash, activationCode, now, id]
    );

    this.audit('إعادة إرسال دعوة مستخدم عميل', 'TENANT_USER', id, { tenantId: existing.tenantId });

    return {
      user: this.getTenantUser(id)!,
      temporaryPassword,
      activationCode,
      loginUrl: `${this.setting('platform.clientUrl', 'https://app.ceramisys.com')}/login`,
      provisioned: false,
      message: 'تم إعادة إرسال الدعوة بنجاح',
    };
  }

  public markTenantUserProvisioned(id: string, identityUserId?: string): PlatformTenantUser {
    PlatformTenantService.requirePlatformAccess('tenants', 'platform.tenants.update');

    const existing = this.getTenantUser(id);
    if (!existing) throw new Error('المستخدم غير موجود.');

    const now = nowIso();
    this.db.run(
      'UPDATE platform_tenant_users SET provisioned = 1, identity_user_id = ?, updated_at = ? WHERE id = ?',
      [identityUserId ?? null, now, id]
    );

    this.audit('وضع علامة مستخدم عميل كمُجهز', 'TENANT_USER', id, { tenantId: existing.tenantId, identityUserId });

    const updated = this.getTenantUser(id);
    if (!updated) throw new Error('فشل تحديث المستخدم.');
    return updated;
  }

  // ─── Tenant Overrides ─────────────────────────────────────────────────────────

  public listTenantOverrides(tenantId: string): PlatformTenantOverride[] {
    PlatformTenantService.requirePlatformAccess('tenants', 'platform.tenants.view');
    const rows = this.db.query<any>('SELECT * FROM platform_tenant_overrides WHERE tenant_id = ? ORDER BY created_at DESC', [tenantId]);
    return rows.map(mapTenantOverride);
  }

  public addTenantOverride(tenantId: string, input: PlatformTenantOverrideInput): PlatformTenantOverride {
    PlatformTenantService.requirePlatformAccess('tenants', 'platform.tenants.update');

    const tenant = this.getTenant(tenantId);
    if (!tenant) throw new Error('العميل غير موجود.');

    const id = `ovr_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = nowIso();

    this.db.run(
      `INSERT INTO platform_tenant_overrides
        (id, tenant_id, kind, code, value, is_enabled, expires_at, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
      [id, tenantId, input.kind, input.code, input.value ?? null, input.expiresAt ?? null, input.notes ?? null, now, now]
    );

    this.audit('إضافة تجاوز عميل', 'TENANT_OVERRIDE', id, { tenantId, kind: input.kind, code: input.code });

    const row = this.db.query<any>('SELECT * FROM platform_tenant_overrides WHERE id = ?', [id])[0];
    return mapTenantOverride(row);
  }

  public setTenantOverrideEnabled(id: string, enabled: boolean): PlatformTenantOverride {
    PlatformTenantService.requirePlatformAccess('tenants', 'platform.tenants.update');

    const row = this.db.query<any>('SELECT * FROM platform_tenant_overrides WHERE id = ?', [id])[0];
    if (!row) throw new Error('التجاوز غير موجود.');

    const now = nowIso();
    this.db.run('UPDATE platform_tenant_overrides SET is_enabled = ?, updated_at = ? WHERE id = ?', [enabled ? 1 : 0, now, id]);

    this.audit(enabled ? 'تفعيل تجاوز عميل' : 'تعطيل تجاوز عميل', 'TENANT_OVERRIDE', id, {});

    const updated = this.db.query<any>('SELECT * FROM platform_tenant_overrides WHERE id = ?', [id])[0];
    return mapTenantOverride(updated);
  }

  public removeTenantOverride(id: string): void {
    PlatformTenantService.requirePlatformAccess('tenants', 'platform.tenants.delete');

    const row = this.db.query<any>('SELECT * FROM platform_tenant_overrides WHERE id = ?', [id])[0];
    if (!row) throw new Error('التجاوز غير موجود.');

    this.db.run('DELETE FROM platform_tenant_overrides WHERE id = ?', [id]);
    this.audit('إزالة تجاوز عميل', 'TENANT_OVERRIDE', id, {});
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private generateTenantCode(name: string): string {
    const base = name.trim().replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '').slice(0, 8).toUpperCase() || 'TEN';
    let index = 1;
    let candidate = `${base}-${String(index).padStart(4, '0')}`;
    while (this.db.query('SELECT 1 FROM platform_tenants WHERE code = ?', [candidate]).length) {
      index++;
      candidate = `${base}-${String(index).padStart(4, '0')}`;
    }
    return candidate;
  }

  private generateUsername(name: string, tenantId?: string): string {
    const base = name.trim().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16) || 'user';
    let index = 1;
    let candidate = `${base}${index}`;
    const checkSql = tenantId
      ? 'SELECT 1 FROM platform_tenant_users WHERE tenant_id = ? AND username = ?'
      : 'SELECT 1 FROM platform_staff WHERE username = ?';
    const checkParams = tenantId ? [tenantId, candidate] : [candidate];
    while (this.db.query(checkSql, checkParams).length) {
      index++;
      candidate = `${base}${index}`;
    }
    return candidate;
  }

  private getPlanModules(planId: string): string[] {
    const plan = this.db.query<any>('SELECT included_modules FROM platform_plans WHERE id = ?', [planId])[0];
    return plan ? safeJsonArray(plan.included_modules) : [];
  }

  private getTenantUser(id: string): PlatformTenantUser | null {
    const row = this.db.query<any>('SELECT * FROM platform_tenant_users WHERE id = ?', [id])[0];
    return row ? this.mapTenantUser(row) : null;
  }

  private mapTenantUser(row: any): PlatformTenantUser {
    return {
      id: String(row.id),
      tenantId: String(row.tenant_id),
      username: String(row.username),
      fullName: String(row.full_name),
      email: row.email ?? null,
      phone: row.phone ?? null,
      role: String(row.role),
      status: row.status as 'ACTIVE' | 'SUSPENDED' | 'INVITED',
      isActive: row.status === 'ACTIVE',
      provisioningStatus: row.provisioning_status as any ?? 'NOT_REQUESTED',
      provisionedAt: row.provisioned_at ?? null,
      identityUserId: row.identity_user_id ?? null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapPlan(row: any): PlatformPlan {
    return {
      id: String(row.id),
      code: String(row.code),
      name: String(row.name),
      description: row.description ?? null,
      billingCycle: row.billing_cycle,
      price: toNumber(row.price, 0),
      monthlyPrice: toNumber(row.monthly_price, 0),
      yearlyPrice: toNumber(row.yearly_price, 0),
      currency: row.currency ?? 'EGP',
      seatsLimit: toNumber(row.seats_limit, 1),
      branchesLimit: toNumber(row.branches_limit, 1),
      devicesLimit: toNumber(row.devices_limit, 1),
      storageLimitMb: toNumber(row.storage_limit_mb, 500),
      maxProducts: toNumber(row.max_products, 1000),
      maxWarehouses: toNumber(row.max_warehouses, 2),
      trialDays: toNumber(row.trial_days, 14),
      includedModules: safeJsonArray(row.included_modules),
      features: safeJsonArray(row.features),
      permissions: safeJsonArray(row.permissions),
      isActive: Boolean(row.is_active),
      isDefault: Boolean(row.is_default),
      sortOrder: toNumber(row.sort_order, 0),
      subscriberCount: toNumber(row.subscriber_count, 0),
      offlineGracePeriodDays: toNumber(row.offline_grace_period_days, 14),
      versioned: Boolean(row.versioned),
      currentVersion: row.current_version ?? null,
    };
  }

  private mapSubscription(row: any): PlatformSubscription {
    return {
      id: String(row.id),
      tenantId: String(row.tenant_id),
      planId: String(row.plan_id),
      status: row.status,
      startDate: String(row.start_date),
      endDate: row.end_date ?? null,
      seats: toNumber(row.seats, 1),
      price: toNumber(row.price, 0),
      billingCycle: row.billing_cycle,
      autoRenew: Boolean(row.auto_renew),
      branchesLimit: toNumber(row.branches_limit, 1),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapLicense(row: any): PlatformLicense {
    return {
      id: String(row.id),
      tenantId: String(row.tenant_id),
      subscriptionId: String(row.subscription_id),
      planId: String(row.plan_id),
      licenseKey: String(row.license_key),
      status: row.status,
      issuedAt: String(row.issued_at),
      startsAt: String(row.starts_at),
      expiresAt: row.expires_at ?? null,
      seats: toNumber(row.seats, 1),
      deviceLimit: toNumber(row.device_limit, 1),
      branchesLimit: toNumber(row.branches_limit, 1),
      modules: safeJsonArray(row.modules),
      features: safeJsonArray(row.features),
      activationCode: row.activation_code ?? null,
      certificate: row.certificate ?? null,
      offlineGracePeriodDays: toNumber(row.offline_grace_period_days, 14),
      couplingMode: row.coupling_mode,
      notes: row.notes ?? null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapInvoice(row: any): PlatformInvoice {
    return {
      id: String(row.id),
      number: String(row.number ?? row.id),
      tenantId: String(row.tenant_id),
      subscriptionId: row.subscription_id ?? null,
      status: row.status,
      total: toNumber(row.total, 0),
      paidAmount: toNumber(row.paid, 0),
      currency: row.currency ?? 'EGP',
      dueDate: row.due_date ?? null,
      issueDate: String(row.issued_at),
      notes: row.notes ?? null,
      createdAt: String(row.created_at),
      subtotal: toNumber(row.subtotal, 0),
      discount: toNumber(row.discount, 0),
      tax: toNumber(row.tax, 0),
    };
  }

  private mapPayment(row: any): PlatformPayment {
    return {
      id: String(row.id),
      tenantId: String(row.tenant_id),
      invoiceId: row.invoice_id ?? null,
      amount: toNumber(row.amount, 0),
      method: row.method,
      reference: row.reference ?? null,
      paidAt: String(row.received_at),
      notes: row.notes ?? null,
    };
  }

  private mapAuditEntry(row: any): PlatformAuditEntry {
    return {
      id: String(row.id),
      actorId: String(row.actor_id),
      actorType: row.actor_type,
      action: String(row.action),
      entityType: row.entity_type,
      entityId: row.entity_id ?? null,
      details: row.details ?? null,
      severity: row.severity,
      status: row.status,
      tenantId: row.tenant_id ?? null,
      deviceId: row.device_id ?? null,
      deviceName: row.device_name ?? null,
      ipAddress: row.ip_address ?? null,
      oldValues: row.old_values ?? null,
      newValues: row.new_values ?? null,
      errorMessage: row.error_message ?? null,
      createdAt: String(row.created_at),
    };
  }
}

export const platformTenantService = new PlatformTenantService();