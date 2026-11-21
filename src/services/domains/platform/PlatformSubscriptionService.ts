import { randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PlatformStaffAuthService } from './PlatformStaffAuthService';
import { PlatformAuthorizationService } from './PlatformAuthorizationService';
import { centralAuditService } from './CentralAuditService';
import { platformAdminApiClient } from './PlatformAdminApiClient';
import { provisioningQueueService } from './ProvisioningQueueService';
import { provisioningExecutorService } from './ProvisioningExecutorService';
import type {
  PlatformSubscription,
  PlatformSubscriptionCreateInput,
  PlatformTrialCreateInput,
  PlatformPlan,
  PlatformTenant,
  PlatformLicense,
  PlatformCoupon,
  PlatformPlanChangeRequest,
  PlatformPlanChangeResult,
  PlatformSubscriptionStatus,
  PlatformPlanVersioningInput,
  PlatformPlanUpgradeRule,
  PlatformSubscriptionMetrics,
  PlatformPlanChangeType,
  PlatformPeriod,
} from './platformTypes';
import { nowIso, toNumber, addMonths, addDays, formatDate, signCertificate, generateLicenseActivationCode, safeJsonArray } from './platformUtils';

export class PlatformSubscriptionService {
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
      tenantId: options?.tenantId,
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

  // ─── Subscription Management ──────────────────────────────────────────────────

  public listSubscriptions(filters?: { status?: string; planId?: string; search?: string }): PlatformSubscription[] {
    PlatformSubscriptionService.requirePlatformAccess('subscriptions', 'platform.subscriptions.view');

    const where: string[] = [];
    const params: (string | number)[] = [];

    if (filters?.status) {
      where.push('s.status = ?');
      params.push(filters.status);
    }
    if (filters?.planId) {
      where.push('s.plan_id = ?');
      params.push(filters.planId);
    }
    if (filters?.search) {
      where.push('(t.name LIKE ? OR t.code LIKE ?)');
      const term = `%${filters.search}%`;
      params.push(term, term);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const rows = this.db.query<any>(
      `SELECT s.*, t.name AS tenantName, t.code AS tenantCode, p.name AS planName
       FROM platform_subscriptions s
       JOIN platform_tenants t ON t.id = s.tenant_id
       LEFT JOIN platform_plans p ON p.id = s.plan_id
       ${whereSql}
       ORDER BY s.created_at DESC`,
      params
    );

    return rows.map(this.mapSubscription);
  }

  public getSubscription(id: string): PlatformSubscription | null {
    PlatformSubscriptionService.requirePlatformAccess('subscriptions', 'platform.subscriptions.view');
    const row = this.db.query<any>('SELECT * FROM platform_subscriptions WHERE id = ?', [id])[0];
    return row ? this.mapSubscription(row) : null;
  }

  public createSubscription(input: PlatformSubscriptionCreateInput): PlatformSubscription {
    PlatformSubscriptionService.requirePlatformAccess('subscriptions', 'platform.subscriptions.create');

    const tenant = this.getTenant(input.tenantId);
    if (!tenant) throw new Error('العميل غير موجود.');

    const plan = this.getPlan(input.planId);
    if (!plan) throw new Error('الخطة غير موجودة.');
    if (!plan.isActive) throw new Error('هذه الخطة غير مفعّلة.');

    const id = `sub_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = nowIso();
    const start = new Date(input.startDate ?? now);
    const end = input.endDate ? new Date(input.endDate) : addMonths(start, 12);

    this.db.executeTransaction(() => {
      this.db.run(
        `INSERT INTO platform_subscriptions
          (id, tenant_id, plan_id, status, start_date, end_date, seats, price, billing_cycle, auto_renew, branches_limit, is_trial, trial_ends_at, last_change_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ROUND(?*100), ?, 1, ?, ?, ?, 'CREATE')`,
        [
          id, input.tenantId, input.planId,
          input.status ?? 'ACTIVE',
          start.toISOString(), end.toISOString(),
          toNumber(input.seats, plan.seatsLimit),
          toNumber(input.price, plan.price),
          plan.billingCycle,
          toNumber(input.branchesLimit, plan.branchesLimit),
          input.isTrial ? 1 : 0,
          input.trialEndsAt ?? null,
        ]
      );

      // Create license
      const licenseId = `lic_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      const licenseKey = this.generateLicenseKey();
      const activationCode = generateLicenseActivationCode();
      const certificate = signCertificate({ licenseKey, tenantId: input.tenantId, planId: input.planId, issuedAt: start.toISOString(), expiresAt: end.toISOString(), deviceLimit: toNumber(plan.devicesLimit, 1), seats: toNumber(input.seats, plan.seatsLimit) });

      this.db.run(
        `INSERT INTO platform_licenses
          (id, tenant_id, subscription_id, plan_id, license_key, status, issued_at, starts_at, expires_at,
           seats, device_limit, branches_limit, modules, features, activation_code, certificate, offline_grace_period_days, coupling_mode, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          licenseId, input.tenantId, id, input.planId, licenseKey,
          'ACTIVE', start.toISOString(), start.toISOString(), end.toISOString(),
          toNumber(input.seats, plan.seatsLimit), toNumber(plan.devicesLimit, 1), toNumber(input.branchesLimit, plan.branchesLimit),
          JSON.stringify(plan.includedModules), JSON.stringify(plan.features), activationCode, JSON.stringify(certificate),
          toNumber(plan.offlineGracePeriodDays, 14), 'FULL', 'اشتراك جديد',
        ]
      );

      // Update tenant
      this.db.run(
        `UPDATE platform_tenants SET plan_id = ?, subscription_started_at = ?, subscription_expires_at = ?,
           seats_limit = ?, branches_limit = ?, devices_limit = ?, updated_at = ?
         WHERE id = ?`,
        [input.planId, start.toISOString(), end.toISOString(), toNumber(input.seats, plan.seatsLimit), toNumber(input.branchesLimit, plan.branchesLimit), toNumber(plan.devicesLimit, 1), now, input.tenantId]
      );

      this.recordSubscriptionChange(id, 'CREATE', null, { tenantId: input.tenantId, planId: input.planId, status: input.status ?? 'ACTIVE', startDate: start.toISOString(), endDate: end.toISOString() }, input.isTrial ? 'إنشاء اشتراك تجريبي' : 'إنشاء اشتراك');
    });



    this.audit('إنشاء اشتراك', 'SUBSCRIPTION', id, { tenantId: input.tenantId, planId: input.planId });

    const sub = this.getSubscription(id);
    if (!sub) throw new Error('فشل إنشاء الاشتراك.');
    return sub;
  }

  public createTrialSubscription(input: PlatformTrialCreateInput): PlatformSubscription {
    PlatformSubscriptionService.requirePlatformAccess('subscriptions', 'platform.subscriptions.create');

    const plan = this.getPlan(input.planId);
    if (!plan) throw new Error('الخطة غير موجودة.');
    if (!plan.isActive) throw new Error('هذه الخطة غير مفعّلة.');

    const tenant = this.getTenant(input.tenantId);
    if (!tenant) throw new Error('العميل غير موجود.');

    const id = `sub_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = nowIso();
    const start = new Date();
    const end = addDays(start, Math.max(1, plan.trialDays));

    this.db.executeTransaction(() => {
      this.db.run(
        `INSERT INTO platform_subscriptions
          (id, tenant_id, plan_id, status, start_date, end_date, seats, price, billing_cycle, auto_renew, branches_limit, is_trial, trial_ends_at, last_change_type)
         VALUES (?, ?, ?, 'TRIAL', ?, ?, ?, ?, ?, 1, ?, 1, ?, 'CREATE')`,
        [
          id, input.tenantId, input.planId,
          start.toISOString(), end.toISOString(),
          toNumber(input.seats, plan.seatsLimit),
          0, // trial price
          plan.billingCycle,
          toNumber(input.branchesLimit, plan.branchesLimit),
          end.toISOString(),
        ]
      );

      // Create trial license
      const licenseId = `lic_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      const licenseKey = this.generateLicenseKey();
      const activationCode = generateLicenseActivationCode();
      const certificate = signCertificate({ licenseKey, tenantId: input.tenantId, planId: input.planId, issuedAt: start.toISOString(), expiresAt: end.toISOString(), deviceLimit: toNumber(plan.devicesLimit, 1), seats: toNumber(input.seats, plan.seatsLimit) });

      this.db.run(
        `INSERT INTO platform_licenses
          (id, tenant_id, subscription_id, plan_id, license_key, status, issued_at, starts_at, expires_at,
           seats, device_limit, branches_limit, modules, features, activation_code, certificate, offline_grace_period_days, coupling_mode, notes)
         VALUES (?, ?, ?, ?, ?, 'TRIAL', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          licenseId, input.tenantId, id, input.planId, licenseKey,
          start.toISOString(), start.toISOString(), end.toISOString(),
          toNumber(input.seats, plan.seatsLimit), toNumber(plan.devicesLimit, 1), toNumber(input.branchesLimit, plan.branchesLimit),
          JSON.stringify(plan.includedModules), JSON.stringify(plan.features), activationCode, JSON.stringify(certificate),
          toNumber(plan.offlineGracePeriodDays, 14), 'FULL', 'تجريبي',
        ]
      );

      // Update tenant
      this.db.run(
        `UPDATE platform_tenants SET plan_id = ?, subscription_started_at = ?, subscription_expires_at = ?,
           seats_limit = ?, branches_limit = ?, devices_limit = ?, updated_at = ?
         WHERE id = ?`,
        [input.planId, start.toISOString(), end.toISOString(), toNumber(input.seats, plan.seatsLimit), toNumber(input.branchesLimit, plan.branchesLimit), toNumber(plan.devicesLimit, 1), now, input.tenantId]
      );

      this.recordSubscriptionChange(id, 'CREATE', null, { tenantId: input.tenantId, planId: input.planId, trial: true, endDate: end.toISOString() }, 'إنشاء اشتراك تجريبي');
    });



    this.audit('إنشاء اشتراك تجريبي', 'SUBSCRIPTION', id, { tenantId: input.tenantId, planId: input.planId });

    const sub = this.getSubscription(id);
    if (!sub) throw new Error('فشل إنشاء الاشتراك التجريبي.');
    return sub;
  }

  public renewTenantSubscription(tenantId: string, months = 12): PlatformTenant {
    PlatformSubscriptionService.requirePlatformAccess('subscriptions', 'platform.subscriptions.update');

    const tenant = this.getTenant(tenantId);
    if (!tenant) throw new Error('العميل غير موجود.');

    const activeSub = this.db.query<any>(
      `SELECT * FROM platform_subscriptions WHERE tenant_id = ? AND status IN ('ACTIVE','TRIAL','PAST_DUE','SUSPENDED') ORDER BY created_at DESC LIMIT 1`,
      [tenantId]
    )[0];

    if (!activeSub) throw new Error('لا يوجد اشتراك نشط لهذا العميل.');

    const plan = this.getPlan(activeSub.plan_id);
    if (!plan) throw new Error('الخطة غير موجودة.');

    const now = nowIso();
    const currentEnd = activeSub.end_date ? new Date(activeSub.end_date) : new Date();
    const newEnd = addMonths(currentEnd > new Date() ? currentEnd : new Date(), months);

    this.db.executeTransaction(() => {
      // Update subscription
      this.db.run(
        `UPDATE platform_subscriptions SET end_date = ?, last_change_type = 'renewal', updated_at = ? WHERE id = ?`,
        [newEnd.toISOString(), now, activeSub.id]
      );

      // Update license
      this.db.run(
        `UPDATE platform_licenses SET expires_at = ?, updated_at = ? WHERE subscription_id = ? AND status IN ('ACTIVE','ISSUED','SUSPENDED')`,
        [newEnd.toISOString(), now, activeSub.id]
      );

      // Update tenant
      this.db.run(
        `UPDATE platform_tenants SET subscription_expires_at = ?, updated_at = ? WHERE id = ?`,
        [newEnd.toISOString(), now, tenantId]
      );

      this.recordSubscriptionChange(activeSub.id, 'RENEW', { endDate: activeSub.end_date ?? null }, { endDate: newEnd.toISOString(), months }, `تجديد ${months} شهر`);
    });

    this.audit('تجديد اشتراك', 'SUBSCRIPTION', activeSub.id, { tenantId, months, newEndDate: newEnd.toISOString() });

    return this.getTenant(tenantId)!;
  }

  public cancelTenantSubscription(tenantId: string, reason?: string): PlatformTenant {
    PlatformSubscriptionService.requirePlatformAccess('subscriptions', 'platform.subscriptions.delete');

    const tenant = this.getTenant(tenantId);
    if (!tenant) throw new Error('العميل غير موجود.');

    const now = nowIso();
    this.db.executeTransaction(() => {
      this.db.run(
        `UPDATE platform_subscriptions SET status = 'CANCELLED', auto_renew = 0, updated_at = ?
         WHERE tenant_id = ? AND status IN ('ACTIVE','TRIAL','PAST_DUE','SUSPENDED')`,
        [now, tenantId]
      );

      this.db.run(
        `UPDATE platform_licenses SET status = 'REVOKED', updated_at = ?
         WHERE tenant_id = ? AND status IN ('ACTIVE','ISSUED','SUSPENDED')`,
        [now, tenantId]
      );

      this.db.run(
        `UPDATE platform_tenants SET status = 'CANCELLED', updated_at = ? WHERE id = ?`,
        [now, tenantId]
      );

      const cancelledSubs = this.db.query<any>(
        `SELECT id FROM platform_subscriptions WHERE tenant_id = ? AND status = 'CANCELLED' AND updated_at = ?`,
        [tenantId, now]
      );
      for (const sub of cancelledSubs) {
        this.recordSubscriptionChange(String(sub.id), 'CANCEL', { status: 'ACTIVE' }, { status: 'CANCELLED' }, reason);
      }
    });

    this.audit('إلغاء اشتراك', 'SUBSCRIPTION', null, { tenantId, reason });

    return this.getTenant(tenantId)!;
  }

  public suspendTenantSubscription(tenantId: string, reason?: string): PlatformTenant {
    PlatformSubscriptionService.requirePlatformAccess('subscriptions', 'platform.subscriptions.update');

    const tenant = this.getTenant(tenantId);
    if (!tenant) throw new Error('العميل غير موجود.');

    const now = nowIso();
    const openSubs = this.db.query<any>(
      `SELECT id FROM platform_subscriptions WHERE tenant_id = ? AND status IN ('ACTIVE','TRIAL','PAST_DUE')`,
      [tenantId]
    );
    if (openSubs.length === 0) throw new Error('لا يوجد اشتراك مفتوح لإيقافه.');

    this.db.executeTransaction(() => {
      this.db.run(
        `UPDATE platform_subscriptions SET status = 'SUSPENDED', updated_at = ?
         WHERE tenant_id = ? AND status IN ('ACTIVE','TRIAL','PAST_DUE')`,
        [now, tenantId]
      );
      this.db.run(
        `UPDATE platform_licenses SET status = 'SUSPENDED', updated_at = ?
         WHERE tenant_id = ? AND status IN ('ACTIVE','ISSUED','TRIAL')`,
        [now, tenantId]
      );
      for (const sub of openSubs) {
        this.recordSubscriptionChange(String(sub.id), 'SUSPEND', { status: 'ACTIVE' }, { status: 'SUSPENDED' }, reason);
      }
    });

    this.audit('إيقاف اشتراك', 'SUBSCRIPTION', null, { tenantId, reason });

    return this.getTenant(tenantId)!;
  }

  public resumeTenantSubscription(tenantId: string): PlatformTenant {
    PlatformSubscriptionService.requirePlatformAccess('subscriptions', 'platform.subscriptions.update');

    const tenant = this.getTenant(tenantId);
    if (!tenant) throw new Error('العميل غير موجود.');

    const now = nowIso();
    const suspendedSubs = this.db.query<any>(
      `SELECT id FROM platform_subscriptions WHERE tenant_id = ? AND status = 'SUSPENDED'`,
      [tenantId]
    );
    if (suspendedSubs.length === 0) throw new Error('لا يوجد اشتراك موقوف لتفعيله.');

    this.db.executeTransaction(() => {
      this.db.run(
        `UPDATE platform_subscriptions SET status = 'ACTIVE', updated_at = ?
         WHERE tenant_id = ? AND status = 'SUSPENDED'`,
        [now, tenantId]
      );
      this.db.run(
        `UPDATE platform_licenses SET status = 'ACTIVE', updated_at = ?
         WHERE tenant_id = ? AND status = 'SUSPENDED'`,
        [now, tenantId]
      );
      for (const sub of suspendedSubs) {
        this.recordSubscriptionChange(String(sub.id), 'SUSPEND', { status: 'SUSPENDED' }, { status: 'ACTIVE' }, 'إعادة تفعيل');
      }
    });

    this.audit('تفعيل اشتراك', 'SUBSCRIPTION', null, { tenantId });

    return this.getTenant(tenantId)!;
  }

  public setSubscriptionAutoRenew(tenantId: string, autoRenew: boolean): void {
    PlatformSubscriptionService.requirePlatformAccess('subscriptions', 'platform.subscriptions.update');

    const tenant = this.getTenant(tenantId);
    if (!tenant) throw new Error('العميل غير موجود.');

    const now = nowIso();
    const subs = this.db.query<any>(
      `SELECT id, auto_renew FROM platform_subscriptions WHERE tenant_id = ? AND status IN ('ACTIVE','TRIAL','PAST_DUE','SUSPENDED')`,
      [tenantId]
    );
    if (subs.length === 0) throw new Error('لا يوجد اشتراك مفتوح لتعديل التجديد التلقائي.');

    this.db.executeTransaction(() => {
      this.db.run(
        `UPDATE platform_subscriptions SET auto_renew = ?, updated_at = ?
         WHERE tenant_id = ? AND status IN ('ACTIVE','TRIAL','PAST_DUE','SUSPENDED')`,
        [autoRenew ? 1 : 0, now, tenantId]
      );
      for (const sub of subs) {
        this.recordSubscriptionChange(
          String(sub.id), 'LIMIT_CHANGE',
          { autoRenew: Boolean(sub.auto_renew) }, { autoRenew },
          autoRenew ? 'تفعيل التجديد التلقائي' : 'إيقاف التجديد التلقائي'
        );
      }
    });

    this.audit('تعديل التجديد التلقائي', 'SUBSCRIPTION', null, { tenantId, autoRenew });
  }

  public updateSubscriptionSeats(tenantId: string, seats: number, branchesLimit?: number): void {
    PlatformSubscriptionService.requirePlatformAccess('subscriptions', 'platform.subscriptions.update');

    const tenant = this.getTenant(tenantId);
    if (!tenant) throw new Error('العميل غير موجود.');

    const safeSeats = Math.max(1, Math.floor(toNumber(seats, 1)));
    const safeBranches = branchesLimit != null ? Math.max(1, Math.floor(toNumber(branchesLimit, 1))) : null;
    const now = nowIso();

    const subs = this.db.query<any>(
      `SELECT id, seats, branches_limit FROM platform_subscriptions WHERE tenant_id = ? AND status IN ('ACTIVE','TRIAL','PAST_DUE','SUSPENDED')`,
      [tenantId]
    );
    if (subs.length === 0) throw new Error('لا يوجد اشتراك مفتوح لتعديل المقاعد.');

    this.db.executeTransaction(() => {
      this.db.run(
        `UPDATE platform_subscriptions SET seats = ?, branches_limit = COALESCE(?, branches_limit), updated_at = ?
         WHERE tenant_id = ? AND status IN ('ACTIVE','TRIAL','PAST_DUE','SUSPENDED')`,
        [safeSeats, safeBranches, now, tenantId]
      );
      this.db.run(
        `UPDATE platform_licenses SET seats = ?, branches_limit = COALESCE(?, branches_limit), updated_at = ?
         WHERE tenant_id = ? AND status IN ('ACTIVE','ISSUED','SUSPENDED','TRIAL')`,
        [safeSeats, safeBranches, now, tenantId]
      );
      this.db.run(
        `UPDATE platform_tenants SET seats_limit = ?, branches_limit = COALESCE(?, branches_limit), updated_at = ? WHERE id = ?`,
        [safeSeats, safeBranches, now, tenantId]
      );
      for (const sub of subs) {
        this.recordSubscriptionChange(
          String(sub.id), 'SEATS_CHANGE',
          { seats: toNumber(sub.seats, 1), branchesLimit: toNumber(sub.branches_limit, 1) },
          { seats: safeSeats, branchesLimit: safeBranches ?? toNumber(sub.branches_limit, 1) },
          'تعديل المقاعد/الفروع'
        );
      }
    });

    this.audit('تعديل مقاعد الاشتراك', 'SUBSCRIPTION', null, { tenantId, seats: safeSeats, branchesLimit: safeBranches });
  }

  public changeSubscriptionPlan(
    tenantId: string,
    targetPlanId: string,
    options: {
      months?: number;
      price?: number;
      branchesLimit?: number;
      couponCode?: string;
      coupling?: 'FULL' | 'EXPIRY_ONLY' | 'NONE';
      priceLockMonths?: number;
      reason?: string;
      allowLocal?: boolean;
      /** Approved platform_op_approvals id required when the upgrade rule demands approval. */
      approvalId?: string;
    } = {}
  ): PlatformPlanChangeResult {
    PlatformSubscriptionService.requirePlatformAccess('subscriptions', 'platform.subscriptions.update');

    const tenant = this.getTenant(tenantId);
    if (!tenant) throw new Error('العميل غير موجود.');

    const targetPlan = this.getPlan(targetPlanId);
    if (!targetPlan) throw new Error('الخطة الهدف غير موجودة.');
    if (!targetPlan.isActive) throw new Error('الخطة الهدف غير مفعّلة.');

    const currentPlanId = tenant.planId;
    const currentPlan = currentPlanId ? this.getPlan(currentPlanId) : null;

    // Check upgrade rules
    if (currentPlanId && currentPlanId !== targetPlanId) {
      const rule = this.getUpgradeRule(currentPlanId, targetPlanId);
      if (rule && rule.allowed === false) throw new Error('لا يسمح بالترقية/التخفيض من الخطة الحالية إلى الخطة الهدف.');
      if (rule?.requiresApproval) {
        this.assertPlanChangeApproved(tenantId, targetPlanId, options);
      }
    }

    const months = options.months ?? 12;
    const price = options.price ?? targetPlan.price;
    const branchesLimit = options.branchesLimit ?? targetPlan.branchesLimit;
    const coupling = options.coupling ?? 'FULL';
    const now = nowIso();
    const start = new Date();
    const expires = addMonths(start, months);

    let changeType: PlatformPlanChangeType = 'same';
    if (currentPlan && targetPlan.price > currentPlan.price) changeType = 'upgrade';
    else if (currentPlan && targetPlan.price < currentPlan.price) changeType = 'downgrade';
    else if (!currentPlan) changeType = 'new';

    const allowLocal = options.allowLocal ?? this.setting('platform.localIssuance', 'true') === 'true';

    // Generate IDs upfront so they're available after transaction
    const subscriptionId = `sub_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const licenseId = `lic_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const licenseKey = this.generateLicenseKey();

    this.db.executeTransaction(() => {
      // Cancel old subscription
      this.db.run(
        `UPDATE platform_subscriptions SET status = 'CANCELLED', auto_renew = 0, updated_at = ?
         WHERE tenant_id = ? AND status IN ('ACTIVE','TRIAL','PAST_DUE','SUSPENDED')`,
        [now, tenantId]
      );

      // Revoke old licenses
      this.db.run(
        `UPDATE platform_licenses SET status = 'REVOKED', updated_at = ?
         WHERE tenant_id = ? AND status IN ('ACTIVE','ISSUED','SUSPENDED')`,
        [now, tenantId]
      );

      // Create new subscription
      this.db.run(
        `INSERT INTO platform_subscriptions
          (id, tenant_id, plan_id, status, start_date, end_date, seats, price, billing_cycle, auto_renew, branches_limit, last_change_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ROUND(?*100), ?, 1, ?, ?)`,
        [subscriptionId, tenantId, targetPlanId, 'ACTIVE', start.toISOString(), expires.toISOString(),
         tenant.seatsLimit, price, targetPlan.billingCycle, branchesLimit, changeType]
      );

      // Create new license
      const activationCode = generateLicenseActivationCode();
      const certificate = signCertificate({ licenseKey, tenantId, planId: targetPlanId, issuedAt: start.toISOString(), expiresAt: expires.toISOString(), deviceLimit: toNumber(targetPlan.devicesLimit, 1), seats: tenant.seatsLimit });

      this.db.run(
        `INSERT INTO platform_licenses
          (id, tenant_id, subscription_id, plan_id, license_key, status, issued_at, starts_at, expires_at,
           seats, device_limit, branches_limit, modules, features, activation_code, certificate, offline_grace_period_days, coupling_mode, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [licenseId, tenantId, subscriptionId, targetPlanId, licenseKey,
         'ACTIVE', start.toISOString(), start.toISOString(), expires.toISOString(),
         tenant.seatsLimit, toNumber(targetPlan.devicesLimit, 1), branchesLimit,
         JSON.stringify(targetPlan.includedModules), JSON.stringify(targetPlan.features), activationCode, JSON.stringify(certificate),
         toNumber(targetPlan.offlineGracePeriodDays, 14), coupling, `تغيير باقة إلى ${targetPlan.name}${options.reason ? `: ${options.reason}` : ''}`]
      );

      // Update tenant
      this.db.run(
        `UPDATE platform_tenants SET status = 'ACTIVE', plan_id = ?, subscription_started_at = ?,
           subscription_expires_at = ?, seats_limit = ?, branches_limit = ?, devices_limit = ?, updated_at = ?
         WHERE id = ?`,
        [targetPlanId, start.toISOString(), expires.toISOString(), tenant.seatsLimit, branchesLimit, toNumber(targetPlan.devicesLimit, 1), now, tenantId]
      );

      // Price lock
      if (options.priceLockMonths && options.priceLockMonths > 0) {
        this.db.run(
          `INSERT INTO platform_subscription_price_locks (id, subscription_id, locked_price, locked_until, created_at)
           VALUES (?, ?, ROUND(?*100), ?, ?)`,
          [`pl_${uuidv4().replace(/-/g, '').slice(0, 12)}`, subscriptionId, price, addMonths(new Date(), options.priceLockMonths).toISOString(), now]
        );
      }

      // Coupon
      if (options.couponCode) {
        const coupon = this.validateCoupon(options.couponCode, price);
        if (coupon) {
          this.db.run(
            `UPDATE platform_coupons SET used_count = used_count + 1 WHERE id = ?`,
            [coupon.coupon.id]
          );
        }
      }

      // Enqueue outbox event
      this.enqueueTenantOutboxEvent(tenantId, 'PLAN_CHANGE', {
        previousPlanId: currentPlanId, newPlanId: targetPlanId, months, price, branchesLimit,
        reason: options.reason ?? null, source: allowLocal ? 'local' : 'central',
      });

      this.recordSubscriptionChange(subscriptionId, 'PLAN_CHANGE', { planId: currentPlanId }, { planId: targetPlanId, months, price, changeType }, options.reason);
    });

    this.audit('تغيير باقة عميل', 'SUBSCRIPTION', null, { tenantId, fromPlan: currentPlanId, toPlan: targetPlanId, changeType });

    return {
      subscriptionId,
      planId: targetPlanId,
      oldPlanId: currentPlanId ?? '',
      effectiveFrom: start.toISOString(),
      priceChange: {
        oldPrice: currentPlan?.price ?? 0,
        newPrice: price,
        currency: targetPlan.currency ?? 'EGP',
        proratedAmount: 0,
      },
      status: 'ACTIVE',
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  /**
   * Fail-closed gate for upgrade rules with `requiresApproval`.
   *
   * Without a valid approvalId a PENDING `PLAN_CHANGE` request is registered in
   * platform_op_approvals (reusing an existing pending request for the same
   * tenant+plan) and the change is rejected. After an operator approves the
   * request, the caller re-invokes changeSubscriptionPlan with that approvalId.
   */
  private assertPlanChangeApproved(
    tenantId: string,
    targetPlanId: string,
    options: { approvalId?: string; reason?: string }
  ): void {
    if (options.approvalId) {
      const approval = this.getOpApproval(options.approvalId);
      const payload = approval?.opPayload ?? {};
      const matches =
        approval?.opType === 'PLAN_CHANGE' &&
        approval.status === 'APPROVED' &&
        payload.tenantId === tenantId &&
        payload.targetPlanId === targetPlanId;
      if (!matches) {
        throw new Error('طلب الموافقة غير صالح أو غير معتمد لتغيير الباقة هذا.');
      }
      return;
    }

    const pendingRows = this.db.query<any>(
      `SELECT id, op_payload FROM platform_op_approvals WHERE op_type = 'PLAN_CHANGE' AND status = 'PENDING'`
    );
    const pending = pendingRows.find((row) => {
      try {
        const payload = JSON.parse(row.op_payload ?? '{}');
        return payload.tenantId === tenantId && payload.targetPlanId === targetPlanId;
      } catch {
        return false;
      }
    });

    const approvalId = String(pending?.id ?? `opa_${uuidv4().replace(/-/g, '').slice(0, 12)}`);
    if (!pending) {
      const actor = AuthService.getCurrentUser();
      const now = nowIso();
      this.db.run(
        `INSERT INTO platform_op_approvals (id, op_type, op_payload, requested_by, status, created_at, updated_at)
         VALUES (?, 'PLAN_CHANGE', ?, ?, 'PENDING', ?, ?)`,
        [
          approvalId,
          JSON.stringify({ tenantId, targetPlanId, reason: options.reason ?? null }),
          actor?.id ?? 'system',
          now,
          now,
        ]
      );
    }

    this.audit('طلب موافقة لتغيير باقة', 'OP_APPROVAL', approvalId, { tenantId, targetPlanId });
    throw new Error(
      `تغيير الباقة يتطلب موافقة. تم تسجيل طلب موافقة (${approvalId}). بعد اعتماده أعد تنفيذ العملية مع approvalId.`
    );
  }

  private getOpApproval(id: string): { id: string; opType: string; opPayload: Record<string, unknown>; status: string } | null {
    const row = this.db.query<any>('SELECT * FROM platform_op_approvals WHERE id = ?', [id])[0];
    if (!row) return null;
    let payload: Record<string, unknown> = {};
    try {
      payload = row.op_payload ? JSON.parse(row.op_payload) : {};
    } catch {
      payload = {};
    }
    return {
      id: String(row.id),
      opType: String(row.op_type),
      opPayload: payload,
      status: String(row.status),
    };
  }

  private getTenant(id: string): PlatformTenant | null {
    const row = this.db.query<any>('SELECT * FROM platform_tenants WHERE id = ?', [id])[0];
    if (!row) return null;
    return {
      id: String(row.id),
      code: String(row.code),
      name: String(row.name),
      contactName: row.contact_name ?? null,
      email: row.email ?? null,
      phone: row.phone ?? null,
      country: row.country ?? null,
      city: row.city ?? null,
      address: row.address ?? null,
      businessType: row.business_type ?? null,
      status: row.status,
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
      price: row.price != null ? Number(row.price) / 100 : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private getPlan(id: string): PlatformPlan | null {
    const row = this.db.query<any>('SELECT * FROM platform_plans WHERE id = ?', [id])[0];
    if (!row) return null;
    return {
      id: String(row.id),
      code: String(row.code),
      name: String(row.name),
      description: row.description ?? null,
      billingCycle: row.billing_cycle,
      price: toNumber(row.price, 0) / 100,
      monthlyPrice: toNumber(row.monthly_price, 0) / 100,
      yearlyPrice: toNumber(row.yearly_price, 0) / 100,
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

  private getUpgradeRule(fromPlanId: string, toPlanId: string): PlatformPlanUpgradeRule | null {
    const row = this.db.query<any>('SELECT * FROM platform_plan_upgrade_rules WHERE from_plan_id = ? AND to_plan_id = ?', [fromPlanId, toPlanId])[0];
    if (!row) return null;
    return {
      id: String(row.id),
      fromPlanId: String(row.from_plan_id),
      toPlanId: String(row.to_plan_id),
      allowed: Boolean(row.allowed),
      requiresApproval: Boolean(row.requires_approval),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private validateCoupon(code: string, subtotal: number): { coupon: PlatformCoupon; discount: number } | null {
    const row = this.db.query<any>('SELECT * FROM platform_coupons WHERE code = ?', [code])[0];
    if (!row) return null;
    if (!row.is_active) return null;
    if (row.expires_at && new Date(row.expires_at) < new Date()) return null;
    if (row.starts_at && new Date(row.starts_at) > new Date()) return null;
    if (row.max_uses && toNumber(row.used_count) >= toNumber(row.max_uses)) return null;
    if (toNumber(row.min_subtotal, 0) / 100 > 0 && subtotal < toNumber(row.min_subtotal, 0) / 100) return null;

    const coupon: PlatformCoupon = {
      id: String(row.id),
      code: String(row.code),
      name: String(row.name),
      type: row.type,
      value: toNumber(row.value, 0),
      minSubtotal: toNumber(row.min_subtotal, 0) / 100,
      maxUses: row.max_uses ?? null,
      usedCount: toNumber(row.used_count, 0),
      startsAt: row.starts_at ?? null,
      expiresAt: row.expires_at ?? null,
      applicablePlans: safeJsonArray(row.applicable_plans),
      isActive: Boolean(row.is_active),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };

    let discount = 0;
    if (coupon.type === 'PERCENT') discount = round2(subtotal * coupon.value / 100);
    else if (coupon.type === 'FIXED') discount = Math.min(coupon.value, subtotal);

    return { coupon, discount };
  }

  private generateLicenseKey(): string {
    // 128-bit key. randomBytes works in both Node (Buffer) and the browser
    // bundle (Uint8Array from the crypto shim), so index bytes directly.
    const bytes = randomBytes(16);
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    return `CS-${hex.slice(0, 8)}-${hex.slice(8, 16)}-${hex.slice(16, 24)}-${hex.slice(24, 32)}`;
  }

  private recordSubscriptionChange(
    subscriptionId: string,
    changeType: 'CREATE' | 'RENEW' | 'SUSPEND' | 'CANCEL' | 'EXPIRE' | 'PLAN_CHANGE' | 'LIMIT_CHANGE' | 'SEATS_CHANGE' | 'BRANCHES_CHANGE',
    oldValues: unknown,
    newValues: unknown,
    reason?: string
  ): void {
    try {
      const actor = AuthService.getCurrentUser();
      this.db.run(
        `INSERT INTO platform_subscription_changes
          (id, subscription_id, change_type, old_values, new_values, actor_id, actor_name, reason, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          `sch_${uuidv4().replace(/-/g, '').slice(0, 12)}`,
          subscriptionId,
          changeType,
          JSON.stringify(oldValues ?? null),
          JSON.stringify(newValues ?? null),
          actor?.id ?? 'system',
          actor?.fullName ?? null,
          reason ?? null,
          nowIso(),
        ]
      );
    } catch {
      // Change log is best-effort; never block the business operation.
    }
  }

  public listSubscriptionChanges(tenantId: string, limit = 50): Array<Record<string, unknown>> {
    PlatformSubscriptionService.requirePlatformAccess('subscriptions', 'platform.subscriptions.view');

    return this.db.query<any>(
      `SELECT c.*, s.tenant_id FROM platform_subscription_changes c
       JOIN platform_subscriptions s ON s.id = c.subscription_id
       WHERE s.tenant_id = ?
       ORDER BY c.created_at DESC LIMIT ?`,
      [tenantId, Math.max(1, Math.min(200, limit))]
    ).map((row) => ({
      id: String(row.id),
      subscriptionId: String(row.subscription_id),
      changeType: String(row.change_type),
      oldValues: row.old_values ?? null,
      newValues: row.new_values ?? null,
      actorName: row.actor_name ?? null,
      reason: row.reason ?? null,
      createdAt: String(row.created_at),
    }));
  }

  private enqueueTenantOutboxEvent(tenantId: string, eventType: string, payload: unknown): void {
    const id = `evt_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    this.db.run(
      `INSERT INTO platform_outbox (id, entity_type, entity_id, event_type, payload, created_at)
       VALUES (?, 'TENANT', ?, ?, ?, ?)`,
      [id, tenantId, eventType, JSON.stringify(payload), nowIso()]
    );
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
      price: toNumber(row.price, 0) / 100,
      billingCycle: row.billing_cycle,
      autoRenew: Boolean(row.auto_renew),
      branchesLimit: toNumber(row.branches_limit, 1),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export const platformSubscriptionService = new PlatformSubscriptionService();