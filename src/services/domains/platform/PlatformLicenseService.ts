import { randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PlatformStaffAuthService } from './PlatformStaffAuthService';
import { PlatformAuthorizationService } from './PlatformAuthorizationService';
import { centralAuditService } from './CentralAuditService';
import type {
  PlatformLicense,
  PlatformLicenseStatus,
  PlatformLicenseActivation,
  PlatformLicenseChange,
  PlatformLicenseChangeType,
  PlatformDevice,
  PlatformTenant,
  PlatformPlan,
} from './platformTypes';
import { nowIso, toNumber, safeJsonArray, safeJsonObject, signCertificate, generateLicenseActivationCode } from './platformUtils';

export class PlatformLicenseService {
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

  // ─── License Management ───────────────────────────────────────────────────────

  /** Append an immutable row to platform_license_changes (parity with central). */
  private recordLicenseChange(
    license: { id: string; subscriptionId?: string | null },
    changeType: PlatformLicenseChangeType,
    oldValues: Record<string, unknown> | null,
    newValues: Record<string, unknown> | null,
    reason?: string | null
  ): void {
    const actor = AuthService.getCurrentUser();
    this.db.run(
      `INSERT INTO platform_license_changes
        (id, license_id, subscription_id, change_type, old_values, new_values, actor_id, actor_name, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `lchg_${uuidv4().replace(/-/g, '').slice(0, 12)}`,
        license.id,
        license.subscriptionId ?? null,
        changeType,
        oldValues ? JSON.stringify(oldValues) : null,
        newValues ? JSON.stringify(newValues) : null,
        actor?.id ?? null,
        actor?.fullName ?? actor?.username ?? null,
        reason ?? null,
      ]
    );
  }

  public listLicenseChanges(licenseId: string): PlatformLicenseChange[] {
    PlatformLicenseService.requirePlatformAccess('licenses', 'platform.licenses.view');
    const rows = this.db.query<any>(
      'SELECT * FROM platform_license_changes WHERE license_id = ? ORDER BY created_at DESC, id DESC',
      [licenseId]
    );
    return rows.map((row) => ({
      id: String(row.id),
      licenseId: String(row.license_id),
      subscriptionId: row.subscription_id ?? null,
      changeType: String(row.change_type) as PlatformLicenseChangeType,
      oldValues: row.old_values ? safeJsonObject(row.old_values) : null,
      newValues: row.new_values ? safeJsonObject(row.new_values) : null,
      actorId: row.actor_id ?? null,
      actorName: row.actor_name ?? null,
      reason: row.reason ?? null,
      createdAt: String(row.created_at),
    }));
  }

  public listLicenses(search = '', status = ''): PlatformLicense[] {
    PlatformLicenseService.requirePlatformAccess('licenses', 'platform.licenses.view');

    const where: string[] = [];
    const params: (string | number)[] = [];

    if (search) {
      where.push('(l.license_key LIKE ? OR t.name LIKE ? OR t.code LIKE ?)');
      const term = `%${search}%`;
      params.push(term, term, term);
    }
    if (status) {
      where.push('l.status = ?');
      params.push(status);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const rows = this.db.query<any>(
      `SELECT l.*, t.name AS tenantName, t.code AS tenantCode, p.name AS planName
       FROM platform_licenses l
       JOIN platform_tenants t ON t.id = l.tenant_id
       LEFT JOIN platform_plans p ON p.id = l.plan_id
       ${whereSql}
       ORDER BY l.created_at DESC`,
      params
    );

    return rows.map(this.mapLicense);
  }

  public getLicense(id: string): PlatformLicense | null {
    PlatformLicenseService.requirePlatformAccess('licenses', 'platform.licenses.view');
    const row = this.db.query<any>('SELECT * FROM platform_licenses WHERE id = ?', [id])[0];
    return row ? this.mapLicense(row) : null;
  }

  public issueLicense(input: {
    tenantId: string;
    planId: string;
    months?: number;
    seats?: number;
    branchesLimit?: number;
    deviceLimit?: number;
    couplingMode?: PlatformLicense['couplingMode'];
    modules?: string[];
    features?: string[];
    hardwareId?: string | null;
    notes?: string;
    allowLocal?: boolean;
  }): PlatformLicense {
    PlatformLicenseService.requirePlatformAccess('licenses', 'platform.licenses.create');

    const tenant = this.getTenant(input.tenantId);
    if (!tenant) throw new Error('العميل غير موجود.');

    const plan = this.getPlan(input.planId);
    if (!plan) throw new Error('الخطة غير موجودة.');
    if (!plan.isActive) throw new Error('هذه الخطة غير مفعّلة.');

    const allowLocal = input.allowLocal ?? this.setting('platform.localIssuance', 'true') === 'true';
    const months = input.months ?? 12;
    const seats = input.seats ?? tenant.seatsLimit;
    const branchesLimit = input.branchesLimit ?? tenant.branchesLimit;
    const deviceLimit = input.deviceLimit ?? plan.devicesLimit;
    const couplingMode = input.couplingMode ?? 'FULL';
    const modules = input.modules ?? plan.includedModules;
    const features = input.features ?? plan.features;

    const now = nowIso();
    const start = new Date();
    const expires = addMonths(start, months);

    const subscriptionId = `sub_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const licenseId = `lic_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    this.db.executeTransaction(() => {
      this.db.run(
        `INSERT INTO platform_subscriptions
          (id, tenant_id, plan_id, status, start_date, end_date, seats, price, billing_cycle, auto_renew, branches_limit)
         VALUES (?, ?, ?, ?, ?, ?, ?, ROUND(?*100), ?, 1, ?)`,
        [subscriptionId, input.tenantId, input.planId, allowLocal ? 'ACTIVE' : 'ACTIVE', start.toISOString(), expires.toISOString(),
         seats, plan.price, plan.billingCycle, branchesLimit]
      );

      const licenseKey = this.generateLicenseKey();
      const activationCode = generateLicenseActivationCode();
      const certificate = signCertificate({ licenseKey, tenantId: input.tenantId, planId: input.planId, issuedAt: start.toISOString(), expiresAt: expires.toISOString(), deviceLimit, seats });

      this.db.run(
        `INSERT INTO platform_licenses
          (id, tenant_id, subscription_id, plan_id, license_key, status, issued_at, starts_at, expires_at,
           seats, device_limit, branches_limit, modules, features, activation_code, certificate, offline_grace_period_days, coupling_mode, notes, hardware_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [licenseId, input.tenantId, subscriptionId, input.planId, licenseKey,
         allowLocal ? 'ACTIVE' : 'ISSUED', start.toISOString(), start.toISOString(), expires.toISOString(),
         seats, deviceLimit, branchesLimit, JSON.stringify(modules), JSON.stringify(features), activationCode, JSON.stringify(certificate),
         plan.offlineGracePeriodDays, couplingMode, input.notes ?? 'ترخيص جديد', input.hardwareId ?? null]
      );

      if (allowLocal) {
        this.db.run(
          `UPDATE platform_tenants SET status = 'ACTIVE', plan_id = ?, subscription_started_at = ?,
             subscription_expires_at = ?, seats_limit = ?, branches_limit = ?, devices_limit = ?, updated_at = ?
           WHERE id = ?`,
          [input.planId, start.toISOString(), expires.toISOString(), seats, branchesLimit, deviceLimit, now, input.tenantId]
        );
      }

      this.recordLicenseChange(
        { id: licenseId, subscriptionId },
        'ISSUE',
        null,
        {
          licenseKey: '[REDACTED]', tenantId: input.tenantId, planId: input.planId,
          startsAt: start.toISOString(), expiresAt: expires.toISOString(),
          seats, deviceLimit, branchesLimit, offlineGracePeriodDays: plan.offlineGracePeriodDays, couplingMode,
        },
        'إصدار ترخيص جديد'
      );
    });



    this.audit('إصدار ترخيص', 'LICENSE', licenseId, { tenantId: input.tenantId, planId: input.planId });

    const license = this.getLicense(licenseId);
    if (!license) throw new Error('فشل إصدار الترخيص.');
    return license;
  }

  public renewLicense(id: string, months = 12): PlatformLicense {
    PlatformLicenseService.requirePlatformAccess('licenses', 'platform.licenses.update');

    const license = this.getLicense(id);
    if (!license) throw new Error('الترخيص غير موجود.');

    if (license.status !== 'ACTIVE' && license.status !== 'ISSUED' && license.status !== 'SUSPENDED') {
      throw new Error('لا يمكن تجديد ترخيص بحالة: ' + license.status);
    }

    if (!license.planId) throw new Error('الترخيص غير مرتبط بخطة.');
    const plan = this.getPlan(license.planId);
    if (!plan) throw new Error('الخطة غير موجودة.');

    const now = nowIso();
    const currentExpires = license.expiresAt ? new Date(license.expiresAt) : new Date();
    const newExpires = addMonths(currentExpires > new Date() ? currentExpires : new Date(), months);

    this.db.executeTransaction(() => {
      this.db.run(
        `UPDATE platform_licenses SET expires_at = ?, updated_at = ? WHERE id = ?`,
        [newExpires.toISOString(), now, id]
      );

      this.db.run(
        `UPDATE platform_subscriptions SET end_date = ?, updated_at = ? WHERE id = ?`,
        [newExpires.toISOString(), now, license.subscriptionId]
      );

      this.db.run(
        `UPDATE platform_tenants SET subscription_expires_at = ?, updated_at = ? WHERE id = ?`,
        [newExpires.toISOString(), now, license.tenantId]
      );

      this.recordLicenseChange(
        license,
        'RENEW',
        { expiresAt: license.expiresAt },
        { expiresAt: newExpires.toISOString() },
        `تجديد ${months} شهر`
      );
    });

    this.audit('تجديد ترخيص', 'LICENSE', id, { months, newExpiresAt: newExpires.toISOString() });

    const updated = this.getLicense(id);
    if (!updated) throw new Error('فشل تجديد الترخيص.');
    return updated;
  }

  public updateLicense(id: string, fields: {
    seats?: number;
    deviceLimit?: number;
    branchesLimit?: number;
    offlineGracePeriodDays?: number;
    notes?: string | null;
    couplingMode?: PlatformLicense['couplingMode'];
  }): PlatformLicense {
    PlatformLicenseService.requirePlatformAccess('licenses', 'platform.licenses.update');

    const license = this.getLicense(id);
    if (!license) throw new Error('الترخيص غير موجود.');

    const updates: string[] = [];
    const params: (string | number | null)[] = [];
    const push = (column: string, value: string | number | null | undefined) => {
      if (value === undefined) return;
      updates.push(`${column} = ?`);
      params.push(value);
    };

    push('seats', fields.seats);
    push('device_limit', fields.deviceLimit);
    push('branches_limit', fields.branchesLimit);
    push('offline_grace_period_days', fields.offlineGracePeriodDays);
    push('notes', fields.notes);
    push('coupling_mode', fields.couplingMode);

    if (updates.length === 0) return license;

    const now = nowIso();
    const oldValues: Record<string, unknown> = {};
    const newValues: Record<string, unknown> = {};
    const oldByColumn: Record<string, unknown> = {
      seats: license.seats,
      device_limit: license.deviceLimit,
      branches_limit: license.branchesLimit,
      offline_grace_period_days: license.offlineGracePeriodDays ?? null,
      notes: license.notes ?? null,
      coupling_mode: license.couplingMode ?? null,
    };
    const columnNames = ['seats', 'device_limit', 'branches_limit', 'offline_grace_period_days', 'notes', 'coupling_mode'];
    for (const column of columnNames) {
      const idx = updates.findIndex((u) => u.startsWith(`${column} =`));
      if (idx === -1) continue;
      oldValues[column] = oldByColumn[column];
      newValues[column] = params[idx];
    }
    const hasLimitChange = ['seats', 'device_limit', 'branches_limit', 'offline_grace_period_days']
      .some((column) => column in newValues);
    const changeType: PlatformLicenseChangeType = fields.couplingMode !== undefined && !hasLimitChange
      ? 'COUPLING_CHANGE'
      : hasLimitChange
        ? 'LIMIT_CHANGE'
        : 'UPDATE';

    this.db.executeTransaction(() => {
      this.db.run(`UPDATE platform_licenses SET ${updates.join(', ')}, updated_at = ? WHERE id = ?`, [...params, now, id]);

      const tenantUpdates: string[] = [];
      const tenantParams: (string | number)[] = [];
      if (fields.seats !== undefined) { tenantUpdates.push('seats_limit = ?'); tenantParams.push(fields.seats); }
      if (fields.branchesLimit !== undefined) { tenantUpdates.push('branches_limit = ?'); tenantParams.push(fields.branchesLimit); }
      if (fields.deviceLimit !== undefined) { tenantUpdates.push('devices_limit = ?'); tenantParams.push(fields.deviceLimit); }
      if (tenantUpdates.length > 0) {
        this.db.run(`UPDATE platform_tenants SET ${tenantUpdates.join(', ')}, updated_at = ? WHERE id = ?`, [...tenantParams, now, license.tenantId]);
      }

      this.recordLicenseChange(license, changeType, oldValues, newValues, 'تعديل بيانات الترخيص');
    });

    this.audit('تعديل الترخيص', 'LICENSE', id, { fields });

    const updated = this.getLicense(id);
    if (!updated) throw new Error('فشل تحديث الترخيص.');
    return updated;
  }

  public setLicenseStatus(id: string, status: PlatformLicenseStatus): void {
    PlatformLicenseService.requirePlatformAccess('licenses', 'platform.licenses.update');

    const license = this.getLicense(id);
    if (!license) throw new Error('الترخيص غير موجود.');

    const now = nowIso();
    this.db.executeTransaction(() => {
      this.db.run('UPDATE platform_licenses SET status = ?, updated_at = ? WHERE id = ?', [status, now, id]);
      this.recordLicenseChange(
        license,
        'STATUS_CHANGE',
        { status: license.status },
        { status },
        `تغيير حالة الترخيص إلى ${status}`
      );
    });

    this.audit('تغيير حالة الترخيص', 'LICENSE', id, { status });
  }

  public setLicenseCouplingMode(id: string, couplingMode: PlatformLicense['couplingMode']): PlatformLicense {
    PlatformLicenseService.requirePlatformAccess('licenses', 'platform.licenses.update');

    const license = this.getLicense(id);
    if (!license) throw new Error('الترخيص غير موجود.');

    const now = nowIso();
    this.db.executeTransaction(() => {
      this.db.run('UPDATE platform_licenses SET coupling_mode = ?, updated_at = ? WHERE id = ?', [couplingMode, now, id]);
      this.recordLicenseChange(
        license,
        'COUPLING_CHANGE',
        { couplingMode: license.couplingMode ?? 'FULL' },
        { couplingMode },
        'تغيير وضع ربط الترخيص'
      );
    });

    this.audit('تغيير وضع ربط الترخيص', 'LICENSE', id, { couplingMode });

    const updated = this.getLicense(id);
    if (!updated) throw new Error('فشل تحديث الترخيص.');
    return updated;
  }

  public bindLicenseHardware(id: string, hardwareId: string): void {
    PlatformLicenseService.requirePlatformAccess('licenses', 'platform.licenses.update');

    const license = this.getLicense(id);
    if (!license) throw new Error('الترخيص غير موجود.');

    const trimmed = hardwareId.trim();
    if (!trimmed) {
      // Unbind: clear the hardware id and detach any linked device seat.
      const now = nowIso();
      this.db.executeTransaction(() => {
        this.db.run('UPDATE platform_licenses SET hardware_id = NULL, updated_at = ? WHERE id = ?', [now, id]);
        if (license.hardwareId) {
          this.db.run(
            `UPDATE platform_devices SET license_id = NULL, status = 'OFFLINE', updated_at = ? WHERE license_id = ? AND hardware_id = ?`,
            [now, id, license.hardwareId]
          );
        }
        this.recordLicenseChange(
          license,
          'UNBIND',
          { hardwareId: license.hardwareId ?? null },
          { hardwareId: null },
          'فك ربط الترخيص من الجهاز'
        );
      });
      this.audit('فك ربط الترخيص من الجهاز', 'LICENSE', id, { previousHardwareId: license.hardwareId });
      return;
    }

    // Check if hardware ID is already bound to another active license
    const existing = this.db.query<any>(
      'SELECT id FROM platform_licenses WHERE hardware_id = ? AND id <> ? AND status IN (\'ACTIVE\',\'ISSUED\')',
      [trimmed, id]
    )[0];
    if (existing) throw new Error('هذا المعرف العتادي مرتبط بترخيص نشط آخر.');

    const now = nowIso();
    this.db.executeTransaction(() => {
      this.db.run('UPDATE platform_licenses SET hardware_id = ?, updated_at = ? WHERE id = ?', [trimmed, now, id]);

      const existingDevice = this.db.query<any>('SELECT id FROM platform_devices WHERE hardware_id = ?', [trimmed])[0];
      if (existingDevice) {
        this.db.run(
          `UPDATE platform_devices SET license_id = ?, status = 'ACTIVE', last_seen_at = ?, updated_at = ? WHERE hardware_id = ?`,
          [id, now, now, trimmed]
        );
      } else {
        this.db.run(
          `INSERT INTO platform_devices
            (id, tenant_id, license_id, hardware_id, status, last_seen_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, ?)`,
          [`dev_${uuidv4().replace(/-/g, '').slice(0, 12)}`, license.tenantId, id, trimmed, now, now, now]
        );
      }

      this.recordLicenseChange(
        license,
        'TRANSFER',
        { hardwareId: license.hardwareId ?? null },
        { hardwareId: trimmed },
        'ربط/نقل الترخيص إلى جهاز'
      );
    });

    this.audit('ربط ترخيص بمعرف عتادي', 'LICENSE', id, { hardwareId: trimmed });
  }

  public deactivateLicenseDevice(id: string, notes?: string): void {
    PlatformLicenseService.requirePlatformAccess('licenses', 'platform.licenses.update');

    const license = this.getLicense(id);
    if (!license) throw new Error('الترخيص غير موجود.');

    const now = nowIso();
    this.db.run(
      `UPDATE platform_devices SET status = 'INACTIVE', updated_at = ?, notes = COALESCE(notes, '') || ?
       WHERE license_id = ? AND status = 'ACTIVE'`,
      [now, notes ? `\n${notes}` : '', id]
    );

    this.audit('إلغاء تفعيل أجهزة الترخيص', 'LICENSE', id, { notes });
  }

  public listLicenseActivations(licenseId: string): PlatformLicenseActivation[] {
    PlatformLicenseService.requirePlatformAccess('licenses', 'platform.licenses.view');
    const rows = this.db.query<any>('SELECT * FROM platform_license_activations WHERE license_id = ? ORDER BY activated_at DESC', [licenseId]);
    return rows.map((row) => ({
      id: String(row.id),
      licenseId: String(row.license_id),
      tenantId: row.tenant_id ?? '',
      tenantName: row.tenantName ?? '',
      licenseKey: row.license_key ?? '',
      deviceId: row.device_id ?? null,
      activationCode: row.activation_code ?? null,
      mode: row.is_online ? 'ONLINE' : 'OFFLINE',
      action: 'ACTIVATE',
      status: row.is_online ? 'SUCCESS' : 'FAILED',
      ipAddress: row.ip_address ?? null,
      notes: null,
      createdAt: String(row.activated_at),
    }));
  }

  // ─── Device Management ────────────────────────────────────────────────────────

  public listDevices(tenantId?: string): PlatformDevice[] {
    PlatformLicenseService.requirePlatformAccess('devices', 'platform.devices.view');

    const where = tenantId ? 'WHERE d.tenant_id = ?' : '';
    const params = tenantId ? [tenantId] : [];

    // LEFT JOIN: released/unbound devices (license_id NULL) must stay visible.
    // Tenant comes from the device row itself so unlicensed devices still
    // resolve their customer name.
    const rows = this.db.query<any>(
      `SELECT d.*, l.license_key, t.name AS tenantName, t.code AS tenantCode
       FROM platform_devices d
       LEFT JOIN platform_licenses l ON l.id = d.license_id
       JOIN platform_tenants t ON t.id = d.tenant_id
       ${where}
       ORDER BY d.created_at DESC`,
      params
    );

    return rows.map(this.mapDevice);
  }

  public registerDevice(input: {
    licenseId: string;
    hardwareId: string;
    deviceName?: string;
    deviceType?: string;
    os?: string;
    appVersion?: string;
  }): PlatformDevice {
    PlatformLicenseService.requirePlatformAccess('devices', 'platform.devices.create');

    const license = this.getLicense(input.licenseId);
    if (!license) throw new Error('الترخيص غير موجود.');

    // Check device limit
    const activeDevices = this.db.query<any>(
      'SELECT COUNT(*) AS c FROM platform_devices WHERE license_id = ? AND status = \'ACTIVE\'',
      [input.licenseId]
    )[0]?.c ?? 0;
    if (toNumber(activeDevices, 0) >= license.deviceLimit) {
      throw new Error('تم الوصول للحد الأقصى للأجهزة المسموح بها لهذا الترخيص.');
    }

    // Check if hardware ID already registered
    const existing = this.db.query<any>('SELECT * FROM platform_devices WHERE hardware_id = ?', [input.hardwareId])[0];
    if (existing) {
      // Update existing device
      const now = nowIso();
      this.db.run(
        `UPDATE platform_devices SET license_id = ?, name = ?, os = ?, app_version = ?, status = 'ACTIVE', last_seen_at = ?, updated_at = ?
         WHERE hardware_id = ?`,
        [input.licenseId, input.deviceName ?? null, input.os ?? null, input.appVersion ?? null, now, now, input.hardwareId]
      );
      this.audit('تحديث جهاز مسجل', 'DEVICE', existing.id, { licenseId: input.licenseId });
      return this.getDevice(existing.id)!;
    }

    const id = `dev_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = nowIso();

    this.db.run(
      `INSERT INTO platform_devices
        (id, tenant_id, license_id, hardware_id, name, os, app_version, status, first_activated_at, last_seen_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?)`,
      [id, license.tenantId, input.licenseId, input.hardwareId, input.deviceName ?? null, input.os ?? null, input.appVersion ?? null, now, now, now, now]
    );

    this.audit('تسجيل جهاز جديد', 'DEVICE', id, { licenseId: input.licenseId, hardwareId: input.hardwareId });

    const device = this.getDevice(id);
    if (!device) throw new Error('فشل تسجيل الجهاز.');
    return device;
  }

  public setDeviceStatus(id: string, status: PlatformDevice['status']): PlatformDevice {
    PlatformLicenseService.requirePlatformAccess('devices', 'platform.devices.update');

    const device = this.getDevice(id);
    if (!device) throw new Error('الجهاز غير موجود.');

    const now = nowIso();
    this.db.run('UPDATE platform_devices SET status = ?, updated_at = ? WHERE id = ?', [status, now, id]);

    this.audit('تغيير حالة الجهاز', 'DEVICE', id, { status });

    const updated = this.getDevice(id);
    if (!updated) throw new Error('فشل تحديث الجهاز.');
    return updated;
  }

  public deleteDevice(id: string): void {
    PlatformLicenseService.requirePlatformAccess('devices', 'platform.devices.delete');

    const device = this.getDevice(id);
    if (!device) throw new Error('الجهاز غير موجود.');

    this.db.run('DELETE FROM platform_devices WHERE id = ?', [id]);
    this.audit('حذف جهاز', 'DEVICE', id, {});
  }

  public markDeviceCloneSuspected(id: string, suspected: boolean): PlatformDevice {
    PlatformLicenseService.requirePlatformAccess('devices', 'platform.devices.update');

    const device = this.getDevice(id);
    if (!device) throw new Error('الجهاز غير موجود.');

    const now = nowIso();
    this.db.run('UPDATE platform_devices SET clone_suspected = ?, updated_at = ? WHERE id = ?', [suspected ? 1 : 0, now, id]);

    this.audit(suspected ? 'تمييز الجهاز كمشبوه' : 'إزالة الاشتباه عن الجهاز', 'DEVICE', id, {});

    const updated = this.getDevice(id);
    if (!updated) throw new Error('فشل تحديث الجهاز.');
    return updated;
  }

  public reassignDeviceSeat(deviceId: string, licenseId: string): PlatformDevice {
    PlatformLicenseService.requirePlatformAccess('devices', 'platform.devices.update');

    const device = this.getDevice(deviceId);
    if (!device) throw new Error('الجهاز غير موجود.');

    const license = this.getLicense(licenseId);
    if (!license) throw new Error('الترخيص الهدف غير موجود.');

    // Get the license this device currently belongs to
    if (!device.licenseId) throw new Error('الجهاز غير مرتبط بترخيص.');
    const deviceLicense = this.getLicense(device.licenseId);
    if (deviceLicense?.tenantId !== license.tenantId) {
      throw new Error('لا يمكن نقل الجهاز بين تراخيص عملاء مختلفين.');
    }

    const now = nowIso();
    this.db.run('UPDATE platform_devices SET license_id = ?, updated_at = ? WHERE id = ?', [licenseId, now, deviceId]);

    this.audit('نقل جهاز إلى ترخيص آخر', 'DEVICE', deviceId, { newLicenseId: licenseId });

    const updated = this.getDevice(deviceId);
    if (!updated) throw new Error('فشل نقل الجهاز.');
    return updated;
  }

  public suspendDevice(deviceId: string, reason?: string): PlatformDevice {
    PlatformLicenseService.requirePlatformAccess('devices', 'platform.devices.update');

    const device = this.getDevice(deviceId);
    if (!device) throw new Error('الجهاز غير موجود.');

    const now = nowIso();
    this.db.run(
      `UPDATE platform_devices SET status = 'SUSPENDED', updated_at = ?, notes = COALESCE(notes, '') || ?
       WHERE id = ?`,
      [now, reason ? `\n${reason}` : '', deviceId]
    );

    this.audit('إيقاف جهاز', 'DEVICE', deviceId, { reason });

    const updated = this.getDevice(deviceId);
    if (!updated) throw new Error('فشل إيقاف الجهاز.');
    return updated;
  }

  public releaseDevice(deviceId: string, reason?: string): PlatformDevice {
    PlatformLicenseService.requirePlatformAccess('devices', 'platform.devices.update');

    const device = this.getDevice(deviceId);
    if (!device) throw new Error('الجهاز غير موجود.');

    const now = nowIso();
    this.db.run(
      `UPDATE platform_devices SET status = 'RELEASED', updated_at = ?, notes = COALESCE(notes, '') || ?
       WHERE id = ?`,
      [now, reason ? `\n${reason}` : '', deviceId]
    );

    this.audit('إخلاء جهاز', 'DEVICE', deviceId, { reason });

    const updated = this.getDevice(deviceId);
    if (!updated) throw new Error('فشل إخلاء الجهاز.');
    return updated;
  }

  public revokeDevice(deviceId: string, reason?: string): PlatformDevice {
    PlatformLicenseService.requirePlatformAccess('devices', 'platform.devices.delete');

    const device = this.getDevice(deviceId);
    if (!device) throw new Error('الجهاز غير موجود.');

    const now = nowIso();
    this.db.run(
      `UPDATE platform_devices SET status = 'REVOKED', updated_at = ?, notes = COALESCE(notes, '') || ?
       WHERE id = ?`,
      [now, reason ? `\n${reason}` : '', deviceId]
    );

    this.audit('إلغاء جهاز', 'DEVICE', deviceId, { reason });

    const updated = this.getDevice(deviceId);
    if (!updated) throw new Error('فشل إلغاء الجهاز.');
    return updated;
  }

  public getDevice(deviceId: string): PlatformDevice | null {
    PlatformLicenseService.requirePlatformAccess('devices', 'platform.devices.view');
    const row = this.db.query<any>('SELECT * FROM platform_devices WHERE id = ?', [deviceId])[0];
    return row ? this.mapDevice(row) : null;
  }

  public detectCloneDevices(): { suspected: PlatformDevice[]; groups: Array<{ hardwareId: string; devices: PlatformDevice[] }> } {
    PlatformLicenseService.requirePlatformAccess('devices', 'platform.devices.view');

    const rows = this.db.query<any>(
      `SELECT hardware_id, COUNT(*) as count, GROUP_CONCAT(id) as ids
       FROM platform_devices
       WHERE status IN ('ACTIVE','SUSPENDED')
       GROUP BY hardware_id
       HAVING COUNT(*) > 1`
    );

    const groups: Array<{ hardwareId: string; devices: PlatformDevice[] }> = [];
    const suspected: PlatformDevice[] = [];

    for (const row of rows) {
      const deviceIds = row.ids.split(',');
      const devices = deviceIds.map((id: string) => this.getDevice(id)!).filter(Boolean);
      groups.push({ hardwareId: row.hardware_id, devices });
      suspected.push(...devices);
    }

    return { suspected, groups };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

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

  private setting(key: string, fallback = ''): string {
    const row = this.db.query<{ value: string }>(
      'SELECT value FROM platform_settings WHERE key = ?',
      [key]
    )[0];
    return row?.value ?? fallback;
  }

  private generateLicenseKey(): string {
    // 128-bit key. randomBytes works in both Node (Buffer) and the browser
    // bundle (Uint8Array from the crypto shim), so index bytes directly.
    const bytes = randomBytes(16);
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    return `CS-${hex.slice(0, 8)}-${hex.slice(8, 16)}-${hex.slice(16, 24)}-${hex.slice(24, 32)}`;
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
      hardwareId: row.hardware_id ?? null,
      notes: row.notes ?? null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapDevice(row: any): PlatformDevice {
    return {
      id: String(row.id),
      tenantId: String(row.tenant_id),
      licenseId: row.license_id != null ? String(row.license_id) : null,
      hardwareId: String(row.hardware_id),
      name: row.name ?? row.device_name ?? null,
      os: row.os ?? null,
      appVersion: row.app_version ?? null,
      ipAddress: row.ip_address ?? null,
      status: row.status,
      cloneSuspected: Boolean(row.clone_suspected),
      firstActivatedAt: row.first_activated_at ?? String(row.created_at),
      lastSeenAt: row.last_seen_at ?? null,
      notes: row.notes ?? null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const targetMonth = result.getMonth() + months;
  const day = result.getDate();
  result.setMonth(targetMonth);
  if (result.getDate() < day) result.setDate(0);
  return result;
}

export const platformLicenseService = new PlatformLicenseService();