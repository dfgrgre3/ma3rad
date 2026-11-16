import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PlatformStaffAuthService } from './PlatformStaffAuthService';
import { PlatformAuthorizationService } from './PlatformAuthorizationService';
import { centralAuditService } from './CentralAuditService';
import {
  PlatformPlan,
  PlatformPlanInput,
  PlatformPlanVersion,
  PlatformPlanVersionInput,
  PlatformPriceHistoryEntry,
  PlatformPlanUpgradeRule,
  PlatformPlanUpgradeRuleInput,
  PlatformPlanCopyResult,
  PlatformPlanImpactPreview,
} from './platformTypes';
import { nowIso, toNumber, safeJsonArray, safeJsonObject, addMonths } from './platformUtils';

export class PlatformPlanService {
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

  // ─── Plan CRUD ────────────────────────────────────────────────────────────────

  public listPlans(includeInactive = true): PlatformPlan[] {
    PlatformPlanService.requirePlatformAccess('plans', 'platform.plans.view');

    const where = includeInactive ? '' : 'WHERE is_active = 1';
    const rows = this.db.query<any>(
      `SELECT * FROM platform_plans ${where} ORDER BY sort_order, name`
    );

    return rows.map(this.mapPlan);
  }

  public createPlan(input: PlatformPlanInput): PlatformPlan {
    PlatformPlanService.requirePlatformAccess('plans', 'platform.plans.create');

    const code = input.code.trim().toUpperCase();
    if (code.length < 2) throw new Error('رمز الخطة يجب أن يكون حرفين على الأقل.');
    if (!input.name?.trim()) throw new Error('اسم الخطة مطلوب.');
    if (this.db.query('SELECT 1 FROM platform_plans WHERE code = ?', [code]).length) {
      throw new Error('رمز الخطة مستخدم بالفعل.');
    }

    const id = `plan_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = nowIso();

    this.db.run(
      `INSERT INTO platform_plans
        (id, code, name, description, billing_cycle, price, monthly_price, yearly_price, currency,
         seats_limit, branches_limit, devices_limit, storage_limit_mb, max_products, max_warehouses,
         trial_days, included_modules, features, permissions, is_active, is_default, sort_order,
         subscriber_count, offline_grace_period_days, versioned, current_version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, code, input.name.trim(), input.description?.trim() ?? null,
        input.billingCycle ?? 'MONTHLY',
        toNumber(input.price ?? input.yearlyPrice ?? 0),
        toNumber(input.monthlyPrice ?? 0),
        toNumber(input.yearlyPrice ?? input.price ?? 0),
        input.currency ?? 'EGP',
        toNumber(input.seatsLimit, 1),
        toNumber(input.branchesLimit, 1),
        toNumber(input.devicesLimit, 1),
        toNumber(input.storageLimitMb, 500),
        toNumber(input.maxProducts, 1000),
        toNumber(input.maxWarehouses, 2),
        toNumber(input.trialDays, 14),
        input.includedModules ?? [],
        input.features ?? [],
        input.permissions ?? [],
        input.isActive !== false ? 1 : 0,
        0,
        0,
        0,
        toNumber(input.offlineGracePeriodDays, 14),
        input.versioned ? 1 : 0,
        input.versioned ? 1 : null,
        now, now,
      ]
    );

    this.audit('إنشاء خطة', 'PLAN', id, { name: input.name, code });

    const plan = this.getPlan(id);
    if (!plan) throw new Error('فشل إنشاء الخطة.');
    return plan;
  }

  public updatePlan(id: string, input: PlatformPlanInput): PlatformPlan {
    PlatformPlanService.requirePlatformAccess('plans', 'platform.plans.update');

    const existing = this.getPlan(id);
    if (!existing) throw new Error('الخطة غير موجودة.');

    if (input.code && input.code !== existing.code) {
      if (input.code.length < 2) throw new Error('رمز الخطة يجب أن يكون حرفين على الأقل.');
      if (this.db.query('SELECT 1 FROM platform_plans WHERE code = ? AND id <> ?', [input.code.trim().toUpperCase(), id]).length) {
        throw new Error('رمز الخطة مستخدم بالفعل.');
      }
    }

    const code = (input.code ?? existing.code).trim().toUpperCase();
    const now = nowIso();

    // Handle versioning
    if (existing.versioned) {
      this.createPlanVersion({
        planId: id,
        version: (existing.currentVersion ?? 0) + 1,
        name: input.name?.trim() ?? existing.name,
        description: (input.description?.trim() ?? existing.description) ?? undefined,
        billingCycle: input.billingCycle ?? existing.billingCycle,
        price: toNumber(input.price ?? input.yearlyPrice ?? existing.price),
        monthlyPrice: toNumber(input.monthlyPrice ?? existing.monthlyPrice),
        yearlyPrice: toNumber(input.yearlyPrice ?? input.price ?? existing.yearlyPrice),
        currency: input.currency ?? existing.currency,
        seatsLimit: toNumber(input.seatsLimit ?? existing.seatsLimit),
        branchesLimit: toNumber(input.branchesLimit ?? existing.branchesLimit),
        devicesLimit: toNumber(input.devicesLimit ?? existing.devicesLimit),
        storageLimitMb: toNumber(input.storageLimitMb ?? existing.storageLimitMb),
        maxProducts: toNumber(input.maxProducts ?? existing.maxProducts),
        maxWarehouses: toNumber(input.maxWarehouses ?? existing.maxWarehouses),
        trialDays: toNumber(input.trialDays ?? existing.trialDays),
        includedModules: input.includedModules ?? existing.includedModules,
        features: input.features ?? existing.features,
        permissions: input.permissions ?? existing.permissions,
        isActive: input.isActive ?? existing.isActive,
        isDefault: input.isDefault ?? existing.isDefault,
        sortOrder: toNumber(input.sortOrder ?? existing.sortOrder),
        offlineGracePeriodDays: toNumber(input.offlineGracePeriodDays ?? existing.offlineGracePeriodDays),
        effectiveFrom: nowIso(),
        createdBy: AuthService.getCurrentUser()?.id ?? 'system',
      });
    }

    this.db.run(
      `UPDATE platform_plans SET
         code = ?, name = ?, description = ?, billing_cycle = ?, price = ?, monthly_price = ?, yearly_price = ?, currency = ?,
         seats_limit = ?, branches_limit = ?, devices_limit = ?, storage_limit_mb = ?, max_products = ?, max_warehouses = ?,
         trial_days = ?, included_modules = ?, features = ?, permissions = ?, is_active = ?,
         offline_grace_period_days = ?, updated_at = ?
       WHERE id = ?`,
      [
        code, input.name?.trim() ?? existing.name, input.description?.trim() ?? existing.description,
        input.billingCycle ?? existing.billingCycle,
        toNumber(input.price ?? input.yearlyPrice ?? existing.price),
        toNumber(input.monthlyPrice ?? existing.monthlyPrice),
        toNumber(input.yearlyPrice ?? input.price ?? existing.yearlyPrice),
        input.currency ?? existing.currency,
        toNumber(input.seatsLimit ?? existing.seatsLimit),
        toNumber(input.branchesLimit ?? existing.branchesLimit),
        toNumber(input.devicesLimit ?? existing.devicesLimit),
        toNumber(input.storageLimitMb ?? existing.storageLimitMb),
        toNumber(input.maxProducts ?? existing.maxProducts),
        toNumber(input.maxWarehouses ?? existing.maxWarehouses),
        toNumber(input.trialDays ?? existing.trialDays),
        input.includedModules ?? existing.includedModules,
        input.features ?? existing.features,
        input.permissions ?? existing.permissions,
        input.isActive !== undefined ? (input.isActive ? 1 : 0) : (existing.isActive ? 1 : 0),
        toNumber(input.offlineGracePeriodDays ?? existing.offlineGracePeriodDays),
        now, id,
      ]
    );

    // Record price history if price changed
    const newPrice = toNumber(input.price ?? input.yearlyPrice ?? existing.price);
    if (newPrice !== existing.price) {
      this.db.run(
        `INSERT INTO platform_price_history (id, plan_id, old_price, new_price, changed_at, changed_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [`ph_${uuidv4().replace(/-/g, '').slice(0, 12)}`, id, existing.price, newPrice, now, AuthService.getCurrentUser()?.id ?? 'system']
      );
    }

    this.audit('تحديث خطة', 'PLAN', id, { name: input.name?.trim() ?? existing.name });

    const updated = this.getPlan(id);
    if (!updated) throw new Error('فشل تحديث الخطة.');
    return updated;
  }

  public setPlanActive(id: string, active: boolean): void {
    PlatformPlanService.requirePlatformAccess('plans', 'platform.plans.update');

    const existing = this.getPlan(id);
    if (!existing) throw new Error('الخطة غير موجودة.');

    if (!active && !this.canDeactivatePlan(id)) {
      throw new Error('لا يمكن تعطيل الخطة لوجود اشتراكات نشطة.');
    }

    const now = nowIso();
    this.db.run('UPDATE platform_plans SET is_active = ?, updated_at = ? WHERE id = ?', [active ? 1 : 0, now, id]);

    this.audit(active ? 'تفعيل خطة' : 'تعطيل خطة', 'PLAN', id, {});
  }

  // ─── Plan Versioning ──────────────────────────────────────────────────────────

  public listPlanVersions(planId: string): PlatformPlanVersion[] {
    PlatformPlanService.requirePlatformAccess('plans', 'platform.plans.view');
    const rows = this.db.query<any>('SELECT * FROM platform_plan_versions WHERE plan_id = ? ORDER BY version DESC', [planId]);
    return rows.map(this.mapPlanVersion);
  }

  public getPlanVersion(planId: string, version: number): PlatformPlanVersion | null {
    PlatformPlanService.requirePlatformAccess('plans', 'platform.plans.view');
    const row = this.db.query<any>('SELECT * FROM platform_plan_versions WHERE plan_id = ? AND version = ?', [planId, version])[0];
    return row ? this.mapPlanVersion(row) : null;
  }

  public listPriceHistory(planId: string): PlatformPriceHistoryEntry[] {
    PlatformPlanService.requirePlatformAccess('plans', 'platform.plans.view');
    const rows = this.db.query<any>('SELECT * FROM platform_price_history WHERE plan_id = ? ORDER BY changed_at DESC', [planId]);
    return rows.map((row) => ({
      id: String(row.id),
      planId: String(row.plan_id),
      oldPrice: toNumber(row.old_price, 0),
      newPrice: toNumber(row.new_price, 0),
      changedAt: String(row.changed_at),
      changedBy: String(row.changed_by),
    }));
  }

  // ─── Plan Copy ────────────────────────────────────────────────────────────────

  public copyPlan(sourcePlanId: string, newCode: string, newName: string, effectiveFrom?: string): PlatformPlanCopyResult {
    PlatformPlanService.requirePlatformAccess('plans', 'platform.plans.create');

    const source = this.getPlan(sourcePlanId);
    if (!source) throw new Error('الخطة المصدر غير موجودة.');

    const code = newCode.trim().toUpperCase();
    if (code.length < 2) throw new Error('رمز الخطة الجديدة يجب أن يكون حرفين على الأقل.');
    if (!newName?.trim()) throw new Error('اسم الخطة الجديدة مطلوب.');
    if (this.db.query('SELECT 1 FROM platform_plans WHERE code = ?', [code]).length) {
      throw new Error('رمز الخطة الجديدة مستخدم بالفعل.');
    }

    const id = `plan_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = nowIso();
    const effective = effectiveFrom ?? now;

    this.db.run(
      `INSERT INTO platform_plans
        (id, code, name, description, billing_cycle, price, monthly_price, yearly_price, currency,
         seats_limit, branches_limit, devices_limit, storage_limit_mb, max_products, max_warehouses,
         trial_days, included_modules, features, permissions, is_active, is_default, sort_order,
         subscriber_count, offline_grace_period_days, versioned, current_version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, code, newName.trim(), source.description,
        source.billingCycle, source.price, source.monthlyPrice, source.yearlyPrice, source.currency,
        source.seatsLimit, source.branchesLimit, source.devicesLimit,
        source.storageLimitMb, source.maxProducts, source.maxWarehouses,
        source.trialDays, source.includedModules, source.features, source.permissions,
        0, 0, source.sortOrder + 1,
        0, source.offlineGracePeriodDays, source.versioned, source.versioned ? 1 : null,
        effective, effective,
      ]
    );

    // Copy upgrade rules
    const rules = this.listPlanUpgradeRules().filter(r => r.fromPlanId === sourcePlanId);
    for (const rule of rules) {
      this.db.run(
        `INSERT INTO platform_plan_upgrade_rules (id, from_plan_id, to_plan_id, allowed, requires_approval, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [`pur_${uuidv4().replace(/-/g, '').slice(0, 12)}`, id, rule.toPlanId, rule.allowed, rule.requiresApproval ? 1 : 0, now, now]
      );
    }

    this.audit('نسخ خطة', 'PLAN', id, { sourcePlanId, newCode, newName });

    const newPlan = this.getPlan(id);
    if (!newPlan) throw new Error('فشل نسخ الخطة.');

    return {
      plan: newPlan,
      copiedRules: rules.length,
    };
  }

  // ─── Upgrade Rules ────────────────────────────────────────────────────────────

  public listPlanUpgradeRules(): PlatformPlanUpgradeRule[] {
    PlatformPlanService.requirePlatformAccess('plans', 'platform.plans.view');
    const rows = this.db.query<any>('SELECT * FROM platform_plan_upgrade_rules ORDER BY from_plan_id, to_plan_id');
    return rows.map((row) => ({
      id: String(row.id),
      fromPlanId: String(row.from_plan_id),
      toPlanId: String(row.to_plan_id),
      allowed: Boolean(row.allowed),
      requiresApproval: Boolean(row.requires_approval),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    }));
  }

  public setPlanUpgradeRule(input: PlatformPlanUpgradeRuleInput): PlatformPlanUpgradeRule {
    PlatformPlanService.requirePlatformAccess('plans', 'platform.plans.update');

    if (input.fromPlanId === input.toPlanId) throw new Error('لا يمكن إنشاء قاعدة من الخطة لنفسها.');

    const existing = this.db.query<any>('SELECT * FROM platform_plan_upgrade_rules WHERE from_plan_id = ? AND to_plan_id = ?', [input.fromPlanId, input.toPlanId])[0];
    const now = nowIso();

    if (existing) {
      this.db.run(
        'UPDATE platform_plan_upgrade_rules SET allowed = ?, requires_approval = ?, updated_at = ? WHERE id = ?',
        [input.allowed ? 1 : 0, input.requiresApproval ? 1 : 0, now, existing.id]
      );
    } else {
      this.db.run(
        `INSERT INTO platform_plan_upgrade_rules (id, from_plan_id, to_plan_id, allowed, requires_approval, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [`pur_${uuidv4().replace(/-/g, '').slice(0, 12)}`, input.fromPlanId, input.toPlanId, input.allowed ? 1 : 0, input.requiresApproval ? 1 : 0, now, now]
      );
    }

    this.audit('تعيين قاعدة ترقية خطة', 'PLAN_UPGRADE_RULE', existing?.id ?? null, { fromPlanId: input.fromPlanId, toPlanId: input.toPlanId });

    const row = this.db.query<any>('SELECT * FROM platform_plan_upgrade_rules WHERE from_plan_id = ? AND to_plan_id = ?', [input.fromPlanId, input.toPlanId])[0];
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

  // ─── Plan Change Impact ───────────────────────────────────────────────────────

  public previewPlanChangeImpact(planId: string, newPlanData: PlatformPlanInput): PlatformPlanImpactPreview {
    PlatformPlanService.requirePlatformAccess('plans', 'platform.plans.view');

    const plan = this.getPlan(planId);
    if (!plan) throw new Error('الخطة غير موجودة.');

    const affectedTenants = this.db.query<any>(
      `SELECT t.id, t.name, t.seats_limit, t.branches_limit, t.devices_limit
       FROM platform_tenants t
       WHERE t.plan_id = ? AND t.status IN ('ACTIVE','TRIAL')`,
      [planId]
    );

    const newSeatsLimit = toNumber(newPlanData.seatsLimit ?? plan.seatsLimit);
    const newBranchesLimit = toNumber(newPlanData.branchesLimit ?? plan.branchesLimit);
    const newDevicesLimit = toNumber(newPlanData.devicesLimit ?? plan.devicesLimit);

    const limitViolations: Array<{ tenantId: string; tenantName: string; type: string; current: number; newLimit: number }> = [];
    for (const tenant of affectedTenants) {
      if (newSeatsLimit !== undefined && toNumber(tenant.seats_limit) > newSeatsLimit) {
        limitViolations.push({ tenantId: tenant.id, tenantName: tenant.name, type: 'seats', current: toNumber(tenant.seats_limit), newLimit: newSeatsLimit });
      }
      if (newBranchesLimit !== undefined && toNumber(tenant.branches_limit) > newBranchesLimit) {
        limitViolations.push({ tenantId: tenant.id, tenantName: tenant.name, type: 'branches', current: toNumber(tenant.branches_limit), newLimit: newBranchesLimit });
      }
      if (newDevicesLimit !== undefined && toNumber(tenant.devices_limit) > newDevicesLimit) {
        limitViolations.push({ tenantId: tenant.id, tenantName: tenant.name, type: 'devices', current: toNumber(tenant.devices_limit), newLimit: newDevicesLimit });
      }
    }

    const riskLevel = limitViolations.length > 0 ? 'CRITICAL' : 'LOW';
    const recommendation = riskLevel === 'CRITICAL'
      ? 'يوجد عملاء سيتجاوزون الحدود الجديدة. يجب زيادة الحدود أو نقل العملاء قبل الاعتماد.'
      : 'التغيير آمن. لا يوجد تجاوز للحدود الحالية.';

    return {
      planId,
      planName: plan.name,
      affectedTenants: affectedTenants.length,
      limitViolations,
      riskLevel: riskLevel as 'LOW' | 'MEDIUM' | 'CRITICAL',
      recommendation,
    };
  }

  public validatePlanDeactivation(planId: string): { canDeactivate: boolean; activeSubscriptions: number; message: string } {
    PlatformPlanService.requirePlatformAccess('plans', 'platform.plans.view');

    const activeSubs = this.db.query<any>(
      `SELECT COUNT(*) AS count FROM platform_subscriptions WHERE plan_id = ? AND status IN ('ACTIVE','TRIAL')`,
      [planId]
    )[0]?.count ?? 0;

    const count = toNumber(activeSubs, 0);
    if (count > 0) {
      return { canDeactivate: false, activeSubscriptions: count, message: `لا يمكن تعطيل الخطة: يوجد ${count} اشتراك نشط.` };
    }
    return { canDeactivate: true, activeSubscriptions: 0, message: 'يمكن تعطيل الخطة بأمان.' };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private getPlan(id: string): PlatformPlan | null {
    const row = this.db.query<any>('SELECT * FROM platform_plans WHERE id = ?', [id])[0];
    return row ? this.mapPlan(row) : null;
  }

  private canDeactivatePlan(id: string): boolean {
    const count = this.db.query<any>('SELECT COUNT(*) AS c FROM platform_subscriptions WHERE plan_id = ? AND status IN (\'ACTIVE\',\'TRIAL\')', [id])[0]?.c ?? 0;
    return toNumber(count, 0) === 0;
  }

  private createPlanVersion(input: PlatformPlanVersionInput): void {
    const id = `pv_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = nowIso();
    this.db.run(
      `INSERT INTO platform_plan_versions
        (id, plan_id, version, name, description, billing_cycle, price, monthly_price, yearly_price, currency,
         seats_limit, branches_limit, devices_limit, storage_limit_mb, max_products, max_warehouses,
         trial_days, included_modules, features, permissions, is_active, is_default, sort_order,
         offline_grace_period_days, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, input.planId, input.version, input.name, input.description ?? null,
        input.billingCycle, input.price, input.monthlyPrice, input.yearlyPrice, input.currency,
        input.seatsLimit, input.branchesLimit, input.devicesLimit,
        input.storageLimitMb, input.maxProducts, input.maxWarehouses,
        input.trialDays, input.includedModules, input.features, input.permissions,
        input.isActive ? 1 : 0, input.isDefault ? 1 : 0, input.sortOrder,
        input.offlineGracePeriodDays, input.createdBy, now,
      ]
    );

    this.db.run('UPDATE platform_plans SET current_version = ? WHERE id = ?', [input.version, input.planId]);
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

  private mapPlanVersion(row: any): PlatformPlanVersion {
    return {
      id: String(row.id),
      planId: String(row.plan_id),
      version: toNumber(row.version, 1),
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
      offlineGracePeriodDays: toNumber(row.offline_grace_period_days, 14),
      effectiveFrom: String(row.created_at),
      isCurrent: Boolean(row.is_current),
      createdBy: String(row.created_by),
      createdAt: String(row.created_at),
    };
  }
}

export const platformPlanService = new PlatformPlanService();