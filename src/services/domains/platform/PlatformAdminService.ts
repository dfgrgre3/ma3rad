/**
 * PlatformAdminService - Facade for backward compatibility
 *
 * This class maintains the original API by delegating to specialized services.
 * All new code should use the specialized services directly:
 * - platformTenantService
 * - platformPlanService
 * - platformSubscriptionService
 * - platformLicenseService
 * - platformCouponService
 * - platformInvoiceService
 * - platformModuleFeatureService
 * - platformSupportService
 * - platformStaffService
 * - platformNotificationService
 * - platformSettingsService
 * - platformBrandingService
 * - platformConfigService
 * - platformHealthService
 * - platformAnalyticsService
 * - platformAuditService
 *
 * The pure delegation methods are grouped by responsibility under
 * ./PlatformAdminService/ and attached to the prototype below; this file keeps
 * the access-control statics, local-DB orchestration methods (bulk ops, CSV
 * import, clone detection, remote control) and the `audit`/`setting` helpers.
 */

import { platformLicenseService } from './PlatformLicenseService';
import { centralAuditService } from './CentralAuditService';
import { platformAdminApiClient } from './PlatformAdminApiClient';
import { AuthService } from '../auth/AuthService';
import { PlatformStaffAuthService } from './PlatformStaffAuthService';
import { PlatformAuthorizationService } from './PlatformAuthorizationService';
import { PlatformBootstrapService } from './PlatformBootstrapService';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import type { PlatformTenantStatus, PlatformTenantInput, PlatformDevice, PlatformPlanChangeResult, PlatformTenantConfig } from './platformTypes';
import type {
  PlatformUsersOverview,
  PlatformUsersSearchResults,
  PlatformTenantUserDetail,
  PlatformTenantUserJob,
  PlatformStaffUserDetail,
  PlatformStaffLoginEntry,
  PlatformUserAuditEvent,
  PlatformStaff,
  PlatformStaffRole,
  PlatformTenantUserDirectoryEntry,
} from './platformTypes';
import { nowIso } from './platformUtils';
import { createTenantApi, type TenantApi } from './PlatformAdminService/tenants';
import { createBillingApi, type BillingApi } from './PlatformAdminService/billing';
import { createModulesLicensesApi, type ModulesLicensesApi } from './PlatformAdminService/modulesLicenses';
import { createSupportApi, type SupportApi } from './PlatformAdminService/support';
import { createStaffApi, type StaffApi } from './PlatformAdminService/staff';
import { createConfigurationApi, type ConfigurationApi } from './PlatformAdminService/configuration';
import { createOperationsApi, type OperationsApi } from './PlatformAdminService/operations';
import { createPoliciesApi, type PoliciesApi } from './PlatformAdminService/policies';

const PLATFORM_ROLE_CODES_SET: ReadonlySet<string> = new Set([
  'SUPER_ADMIN',
  'PLATFORM_ADMIN',
  'SUPPORT_AGENT',
  'OPERATIONS_ENGINEER',
  'BILLING_SPECIALIST',
  'LICENSE_MANAGER',
]);

// Re-export constants for backward compatibility
export { PLATFORM_TENANT_STATUS_LABELS, PLATFORM_INVOICE_STATUS_LABELS } from './platformTypes';

/** Full public surface of {@link PlatformAdminService}, assembled from the domain modules. */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- intentional class/interface merge to re-attach split method groups
export interface PlatformAdminService
  extends TenantApi,
    BillingApi,
    ModulesLicensesApi,
    SupportApi,
    StaffApi,
    ConfigurationApi,
    OperationsApi,
    PoliciesApi {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- intentional class/interface merge to re-attach split method groups
export class PlatformAdminService {
  private db = DatabaseManager.getInstance();

  // ─── Static Accessors ────────────────────────────────────────────────────────

  public static isPlatformOwner(user: any): boolean {
    return Boolean(user && user.isActive && user.role === 'SUPER_ADMIN');
  }

  public static requirePlatformOwner(): any {
    const user = AuthService.getCurrentUser();
    if (!user || !user.isActive || user.role !== 'SUPER_ADMIN') {
      throw new Error('هذه العملية متاحة لمالك المنصة فقط.');
    }
    return user;
  }

  private static requirePlatformAccess(modules: string | string[], action?: string): any {
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

  // ─── Delegated Methods ──────────────────────────────────────────────────────

  // Data Source
  public getDataSource(): 'local' | 'central' {
    const value = this.setting('platform.dataSource', 'local');
    return value === 'central' ? 'central' : 'local';
  }

  public setDataSource(value: 'local' | 'central'): void {
    PlatformAdminService.requirePlatformOwner();
    const normalized: 'local' | 'central' = value === 'central' ? 'central' : 'local';
    const existing = this.db.query<{ value: string }>(
      'SELECT value FROM platform_settings WHERE key = ?',
      ['platform.dataSource']
    )[0];
    const now = nowIso();
    if (existing) {
      this.db.run(
        'UPDATE platform_settings SET value = ?, updated_at = ? WHERE key = ?',
        [normalized, now, 'platform.dataSource']
      );
    } else {
      this.db.run(
        'INSERT INTO platform_settings (key, value, updated_at) VALUES (?, ?, ?)',
        ['platform.dataSource', normalized, now]
      );
    }
    this.audit('تغيير مصدر بيانات المنصة', 'PLATFORM_SETTING', 'platform.dataSource', { value: normalized });
  }

  public auditPlatformOwnerAccounts(): any {
    PlatformAdminService.requirePlatformOwner();
    return new PlatformBootstrapService(DatabaseManager.getInstance()).auditOwnerAccounts();
  }

  // Alias for backward compatibility
  public changeTenantPlan(
    tenantId: string,
    targetPlanId: string,
    options: {
      months?: number;
      price?: number;
      seats?: number;
      branchesLimit?: number;
      couponCode?: string;
      coupling?: 'FULL' | 'EXPIRY_ONLY' | 'NONE';
      priceLockMonths?: number;
      reason?: string;
      allowLocal?: boolean;
      approvalId?: string;
    } = {}
  ): PlatformPlanChangeResult {
    return this.changeSubscriptionPlan(tenantId, targetPlanId, options);
  }

  public resetTenantDevices(tenantId: string): number {
    const now = nowIso();
    this.db.run('UPDATE platform_devices SET status = \'REVOKED\', updated_at = ? WHERE license_id IN (SELECT id FROM platform_licenses WHERE tenant_id = ?)', [now, tenantId]);
    this.db.run('UPDATE platform_licenses SET hardware_id = NULL, updated_at = ? WHERE tenant_id = ?', [now, tenantId]);
    return this.db.query<any>('SELECT changes() AS c')[0]?.c ?? 0;
  }

  public exportLicenseComplianceReport(filters: {
    tenantId?: string;
    planId?: string;
    status?: string;
    from?: string;
    to?: string;
    includeActivations?: boolean;
    includeChanges?: boolean;
  }): { licenses: any[]; summary: { totalLicenses: number; activeLicenses: number; suspendedLicenses: number; expiredLicenses: number; revokedLicenses: number } } {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filters.tenantId) { conditions.push('l.tenant_id = ?'); params.push(filters.tenantId); }
    if (filters.planId) { conditions.push('l.plan_id = ?'); params.push(filters.planId); }
    if (filters.status) { conditions.push('l.status = ?'); params.push(filters.status); }
    if (filters.from) { conditions.push('l.issued_at >= ?'); params.push(filters.from); }
    if (filters.to) { conditions.push('l.issued_at <= ?'); params.push(filters.to); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const licenses = this.db.query<any>(
      `SELECT l.*, t.name AS tenantName, p.name AS planName
       FROM platform_licenses l
       LEFT JOIN platform_tenants t ON t.id = l.tenant_id
       LEFT JOIN platform_plans p ON p.id = l.plan_id
       ${where}
       ORDER BY l.issued_at DESC`,
      params as any[]
    );

    const summary = {
      totalLicenses: licenses.length,
      activeLicenses: licenses.filter((l) => l.status === 'ACTIVE' || l.status === 'ISSUED').length,
      suspendedLicenses: licenses.filter((l) => l.status === 'SUSPENDED').length,
      expiredLicenses: licenses.filter((l) => l.status === 'EXPIRED').length,
      revokedLicenses: licenses.filter((l) => l.status === 'REVOKED').length,
    };

    return { licenses, summary };
  }

  public detectCloneDevices(): {
    suspected: PlatformDevice[];
    groups: Array<{ hardwareId: string; devices: PlatformDevice[] }>;
    alerts: Array<{ type: string; message: string; hardwareId: string; tenantName: string }>;
    duplicateHwids: Array<{ hardwareId: string; tenants: string[]; tenantCount: number }>;
    overLimitLicenses: Array<{ licenseId: string; licenseKey: string; tenantId: string; deviceCount: number; deviceLimit: number }>;
    suspiciousTransfers: Array<{ licenseId: string; tenantId: string; transferCount: number }>;
  } {
    const result = platformLicenseService.detectCloneDevices();
    const alerts = result.suspected.map(device => ({
      type: 'DEVICE_CLONE_SUSPECTED',
      message: `جهاز ${device.hardwareId} مشتبه به كاستنساخ`,
      hardwareId: device.hardwareId,
      tenantName: '', // Would need tenant lookup
    }));

    const duplicateHwids = result.groups.map((group) => {
      const tenants = Array.from(new Set(group.devices.map((d) => d.tenantId).filter(Boolean)));
      return { hardwareId: group.hardwareId, tenants, tenantCount: tenants.length };
    });

    const overLimitLicenses = this.db.query<any>(
      `SELECT l.id AS licenseId, l.license_key AS licenseKey, l.tenant_id AS tenantId,
              COUNT(d.id) AS deviceCount, l.device_limit AS deviceLimit
       FROM platform_licenses l
       LEFT JOIN platform_devices d ON d.license_id = l.id AND d.status IN ('ACTIVE','SUSPENDED')
       WHERE l.status IN ('ACTIVE','ISSUED')
       GROUP BY l.id
       HAVING COUNT(d.id) > l.device_limit`
    ).map((row) => ({
      licenseId: String(row.licenseId),
      licenseKey: String(row.licenseKey),
      tenantId: String(row.tenantId),
      deviceCount: Number(row.deviceCount) || 0,
      deviceLimit: Number(row.deviceLimit) || 0,
    }));

    const suspiciousTransfers = this.db.query<any>(
      `SELECT id AS licenseId, tenant_id AS tenantId, transfer_count AS transferCount
       FROM platform_licenses
       WHERE transfer_count >= 3`
    ).map((row) => ({
      licenseId: String(row.licenseId),
      tenantId: String(row.tenantId),
      transferCount: Number(row.transferCount) || 0,
    }));

    return { ...result, alerts, duplicateHwids, overLimitLicenses, suspiciousTransfers };
  }

  /**
   * Cross-tenant clone detection through the central admin API. Returns null
   * when this device has no platform session — tenant installs never do, and
   * the central server runs its own scheduled detection for them.
   */
  public async detectCloneDevicesCentral(): Promise<ReturnType<PlatformAdminService['detectCloneDevices']> | null> {
    if (!platformAdminApiClient.isAvailable() || !platformAdminApiClient.getAuthToken()) {
      return null;
    }
    const result = await platformAdminApiClient.detectCloneDevices();
    const groupsByHwid = new Map<string, PlatformDevice[]>();
    for (const device of result.devices) {
      const list = groupsByHwid.get(device.hardwareId) ?? [];
      list.push(device);
      groupsByHwid.set(device.hardwareId, list);
    }
    return {
      suspected: result.devices,
      groups: [...groupsByHwid.entries()].map(([hardwareId, devices]) => ({ hardwareId, devices })),
      alerts: result.alerts.map((message) => ({ type: '', message, hardwareId: '', tenantName: '' })),
      duplicateHwids: result.duplicateHwids,
      overLimitLicenses: result.overLimitLicenses,
      suspiciousTransfers: result.suspiciousTransfers,
    };
  }

  // Bulk Operations
  public bulkChangeTenantStatus(input: { tenantIds: string[]; status: PlatformTenantStatus }): { success: number; failed: Array<{ tenantId: string; error: string }> } {
    let success = 0;
    const failed: Array<{ tenantId: string; error: string }> = [];
    for (const tenantId of input.tenantIds) {
      try {
        this.setTenantStatus(tenantId, input.status);
        success++;
      } catch (e) {
        failed.push({ tenantId, error: String(e) });
      }
    }
    return { success, failed };
  }

  public async bulkChangeTenantPlan(input: { tenantIds: string[]; planId: string; months?: number; price?: number; seats?: number; coupling?: 'FULL' | 'EXPIRY_ONLY' | 'NONE'; reason?: string }): Promise<{ success: number; failed: Array<{ tenantId: string; error: string }> }> {
    let success = 0;
    const failed: Array<{ tenantId: string; error: string }> = [];
    for (const tenantId of input.tenantIds) {
      try {
        await this.changeSubscriptionPlan(tenantId, input.planId, { months: input.months, price: input.price, seats: input.seats, coupling: input.coupling, reason: input.reason });
        success++;
      } catch (e) {
        failed.push({ tenantId, error: String(e) });
      }
    }
    return { success, failed };
  }

  public bulkSendActivation(input: { tenantIds: string[] }): { success: number; failed: Array<{ tenantId: string; error: string }> } {
    let success = 0;
    const failed: Array<{ tenantId: string; error: string }> = [];
    for (const tenantId of input.tenantIds) {
      try {
        this.sendTenantActivation(tenantId);
        success++;
      } catch (e) {
        failed.push({ tenantId, error: String(e) });
      }
    }
    return { success, failed };
  }

  public bulkExportTenants(filters: { tenantIds?: string[]; status?: string; planId?: string }): string {
    let tenants = this.listTenants('', filters.status ?? '', filters.planId ?? '');
    if (filters.tenantIds && filters.tenantIds.length > 0) {
      const wanted = new Set(filters.tenantIds);
      tenants = tenants.filter((tenant) => wanted.has(tenant.id));
    }
    return JSON.stringify(tenants, null, 2);
  }

  public bulkImportTenants(input: { tenants: PlatformTenantInput[] }): { success: number; failed: Array<{ index: number; error: string }> } {
    let success = 0;
    const failed: Array<{ index: number; error: string }> = [];
    for (let i = 0; i < input.tenants.length; i++) {
      try {
        this.createTenant(input.tenants[i]);
        success++;
      } catch (e) {
        failed.push({ index: i, error: String(e) });
      }
    }
    return { success, failed };
  }

  public importTenantsCsv(content: string, options?: { skipHeader?: boolean }): { created: number; updated: number; errors: Array<{ row: number; error: string }> } {
    const headerMap: Record<string, keyof PlatformTenantInput> = {
      name: 'name', 'الاسم': 'name', tenantname: 'name',
      code: 'code', 'الكود': 'code', tenantcode: 'code',
      contactname: 'contactName', 'جهة الاتصال': 'contactName', contact: 'contactName',
      email: 'email', 'البريد': 'email',
      phone: 'phone', 'الهاتف': 'phone', mobile: 'phone',
      country: 'country', 'الدولة': 'country',
      city: 'city', 'المدينة': 'city',
      address: 'address', 'العنوان': 'address',
      businesstype: 'businessType', 'نوع النشاط': 'businessType', activity: 'businessType',
      status: 'status', 'الحالة': 'status',
      planid: 'planId', 'plan': 'planId', 'الباقة': 'planId',
      seatslimit: 'seatsLimit', 'seats': 'seatsLimit', 'المقاعد': 'seatsLimit',
      brancheslimit: 'branchesLimit', 'branches': 'branchesLimit', 'الفروع': 'branchesLimit',
      deviceslimit: 'devicesLimit', 'devices': 'devicesLimit', 'الأجهزة': 'devicesLimit',
      notes: 'notes', 'ملاحظات': 'notes',
    };

    const parseLine = (line: string): string[] => {
      const values: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let j = 0; j < line.length; j += 1) {
        const char = line[j];
        if (char === '"') {
          if (inQuotes && line[j + 1] === '"') { current += '"'; j += 1; }
          else inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim());
      return values;
    };

    const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
    const startIndex = options?.skipHeader && lines.length > 0 ? 1 : 0;
    const resolvedHeaders = lines.length > 0
      ? parseLine(lines[0]).map((h) => headerMap[h.trim().toLowerCase()] ?? null)
      : [];
    let created = 0;
    let updated = 0;
    const errors: Array<{ row: number; error: string }> = [];

    for (let i = startIndex; i < lines.length; i += 1) {
      const rowNumber = i + 1;
      try {
        const values = parseLine(lines[i]);
        const input: PlatformTenantInput = { name: '' };
        values.forEach((value, index) => {
          const field = resolvedHeaders[index];
          if (!field || value === '') return;
          if (field === 'name' || field === 'code' || field === 'contactName' || field === 'email' || field === 'phone' || field === 'country' || field === 'city' || field === 'address' || field === 'businessType' || field === 'notes') {
            (input as any)[field] = value;
          } else if (field === 'status') {
            input.status = value.toUpperCase() as PlatformTenantStatus;
          } else if (field === 'planId') {
            const plan = this.listPlans().find((p) => p.code === value || p.id === value || p.name === value);
            input.planId = plan?.id ?? value;
          } else if (field === 'seatsLimit' || field === 'branchesLimit' || field === 'devicesLimit') {
            const num = Number(value);
            if (!Number.isNaN(num)) (input as any)[field] = num;
          }
        });
        if (!input.name) throw new Error('اسم العميل مطلوب');

        const existing = this.listTenants('', '', '').find((t) =>
          (input.email && t.email === input.email) || (input.code && t.code === input.code) || t.name === input.name
        );
        if (existing) {
          this.updateTenant(existing.id, input);
          updated += 1;
        } else {
          this.createTenant(input);
          created += 1;
        }
      } catch (e) {
        errors.push({ row: rowNumber, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return { created, updated, errors };
  }

  // Remote Control
  public getTenantRemoteControl(tenantId: string): any {
    const tenant = this.getTenant(tenantId);
    if (!tenant) throw new Error('العميل غير موجود.');
    return { tenantId, tenantName: tenant.name, status: tenant.status, planId: tenant.planId, devices: this.listDevices(tenantId).length };
  }

  public pushTenantConfig(tenantId: string, config: Record<string, unknown>): PlatformTenantConfig {
    return this.saveTenantConfig({ tenantId, values: config });
  }

  public forceTenantSync(tenantId: string): void {
    this.audit('مزامنة قسرية للعميل', 'TENANT_SYNC', tenantId, {});
  }

  public getSignedClientRuntimeConfig(tenantId: string, clientVersion?: string): { payload: Record<string, unknown>; signature: string; certificate: string } {
    // This would need implementation - returning mock for compatibility
    return { payload: {}, signature: '', certificate: '' };
  }

  // ─── Unified Users Hub (local mode) ──────────────────────────────────────
  // Mirrors the central /admin/admin-control/users/* endpoints so the
  // admin-control overview tab works identically in local data-source mode.

  private mapLocalStaffRow(row: any): PlatformStaff {
    const parseArr = (v: any): string[] | null => {
      if (Array.isArray(v)) return v.map(String);
      if (typeof v === 'string' && v) {
        try {
          const p = JSON.parse(v);
          return Array.isArray(p) ? p.map(String) : null;
        } catch { return null; }
      }
      return null;
    };
    return {
      id: String(row.id),
      username: String(row.username ?? row.email ?? ''),
      fullName: String(row.full_name ?? row.fullName ?? ''),
      email: String(row.email ?? ''),
      phone: row.phone ?? null,
      role: String(row.role ?? 'SUPPORT_AGENT') as PlatformStaffRole,
      isActive: Boolean(row.is_active ?? row.isActive),
      mustChangePassword: Boolean(row.force_password_change ?? row.mustChangePassword),
      permissionsOverride: parseArr(row.permissions_override ?? row.permissionsOverride) ?? undefined,
      mfaEnabled: Boolean(row.mfa_enabled ?? row.mfaEnabled),
      mfaEnforcement: String(row.mfa_enforcement ?? 'optional') as PlatformStaff['mfaEnforcement'],
      dataScope: String(row.data_scope ?? 'ALL') === 'LIMITED' ? 'LIMITED' : 'ALL',
      dataScopeTenantIds: parseArr(row.data_scope_tenant_ids),
      lastLoginAt: row.last_login_at ?? row.lastLoginAt ?? null,
      failedLoginAttempts: Number(row.failed_login_attempts ?? 0),
      lockedUntil: row.locked_until ?? null,
      createdAt: String(row.created_at ?? row.createdAt ?? ''),
      updatedAt: String(row.updated_at ?? row.updatedAt ?? ''),
    };
  }

  private mapLocalTenantUserRow(row: any): PlatformTenantUserDirectoryEntry {
    return {
      id: String(row.id),
      tenantId: String(row.tenant_id ?? row.tenantId ?? ''),
      tenantName: String(row.tenant_name ?? row.tenantName ?? ''),
      tenantCode: row.tenant_code ?? row.tenantCode ?? null,
      fullName: String(row.full_name ?? row.fullName ?? ''),
      username: row.username ?? null,
      email: row.email ?? null,
      phone: row.phone ?? null,
      role: String(row.role ?? 'USER'),
      status: String(row.status ?? 'ACTIVE') as PlatformTenantUserDirectoryEntry['status'],
      isActive: Boolean(row.is_active ?? (row.status === 'ACTIVE')),
      notes: row.notes ?? null,
      provisioningStatus: String(row.provisioning_status ?? 'NOT_REQUESTED') as PlatformTenantUserDirectoryEntry['provisioningStatus'],
      provisioningMode: row.provisioning_mode ?? null,
      identityUserId: row.identity_user_id ?? null,
      scope: row.scope ?? null,
      inviteExpiresAt: row.invite_expires_at ?? null,
      provisionedAt: row.provisioned_at ?? null,
      lastError: row.last_error ?? null,
      origin: 'PLATFORM',
      createdAt: String(row.created_at ?? ''),
      updatedAt: String(row.updated_at ?? ''),
    };
  }

  private mapLocalAuditEvent(row: any): PlatformUserAuditEvent {
    return {
      id: String(row.id ?? ''),
      actorName: row.actor_name ?? null,
      action: String(row.action ?? ''),
      resourceType: row.entity_type ?? null,
      resourceId: row.entity_id ?? null,
      tenantId: row.tenant_id ?? null,
      createdAt: row.created_at ?? null,
    };
  }

  public getUsersOverview(): PlatformUsersOverview {
    PlatformAdminService.requirePlatformAccess('admin-control', 'platform.admincontrol.view');
    const now = new Date().toISOString();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const toMap = (rows: any[]) => Object.fromEntries(rows.map((r) => [String(r.k ?? 'UNKNOWN'), Number(r.c)]));

    const staffAgg = this.db.query<any>(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(is_active),0) AS active,
              COALESCE(SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END),0) AS inactive,
              COALESCE(SUM(CASE WHEN locked_until IS NOT NULL AND locked_until > ? THEN 1 ELSE 0 END),0) AS locked,
              COALESCE(SUM(COALESCE(force_password_change,0)),0) AS must_change
         FROM platform_staff`,
      [now]
    )[0];
    const staffRoles = this.db.query<any>('SELECT role AS k, COUNT(*) AS c FROM platform_staff GROUP BY role');
    const tuStatus = this.db.query<any>('SELECT status AS k, COUNT(*) AS c FROM platform_tenant_users GROUP BY status');
    const tuProv = this.db.query<any>('SELECT provisioning_status AS k, COUNT(*) AS c FROM platform_tenant_users GROUP BY provisioning_status');
    const tuNew = this.db.query<any>('SELECT COUNT(*) AS c FROM platform_tenant_users WHERE created_at >= ?', [sevenDaysAgo])[0];
    const provJobs = this.db.query<any>(
      `SELECT status AS k, COUNT(*) AS c FROM provisioning_queue
        WHERE status IN ('PENDING','PROCESSING','CLAIMED','FAILED') GROUP BY status`
    );
    const recentEvents = this.db.query<any>(
      `SELECT id, actor_name, action, entity_type, entity_id, tenant_id, created_at
         FROM platform_audit_logs
        WHERE entity_type IN ('TENANT_USER','STAFF','USER','platform_users','platform_tenant_users')
        ORDER BY created_at DESC LIMIT 15`
    );

    const provMap = Object.fromEntries(provJobs.map((r) => [String(r.k), Number(r.c)]));
    return {
      staff: {
        total: Number(staffAgg?.total ?? 0),
        active: Number(staffAgg?.active ?? 0),
        inactive: Number(staffAgg?.inactive ?? 0),
        locked: Number(staffAgg?.locked ?? 0),
        mustChangePassword: Number(staffAgg?.must_change ?? 0),
        byRole: Object.fromEntries(staffRoles.map((r) => [String(r.k), Number(r.c)])),
      },
      tenantUsers: {
        total: tuStatus.reduce((a, r) => a + Number(r.c), 0),
        byStatus: toMap(tuStatus),
        byProvisioning: toMap(tuProv),
        byOrigin: {},
        newLast7Days: Number(tuNew?.c ?? 0),
      },
      provisioning: {
        pending: (provMap.PENDING ?? 0) + (provMap.PROCESSING ?? 0) + (provMap.CLAIMED ?? 0),
        failed: provMap.FAILED ?? 0,
      },
      recentEvents: recentEvents.map((r) => this.mapLocalAuditEvent(r)),
    };
  }

  public searchUsers(q: string): PlatformUsersSearchResults {
    PlatformAdminService.requirePlatformAccess('admin-control', 'platform.admincontrol.view');
    const term = String(q || '').trim();
    if (term.length < 2) return { staff: [], tenantUsers: [] };
    const like = `%${term}%`;
    const staffRows = this.db.query<any>(
      `SELECT * FROM platform_staff
        WHERE full_name LIKE ? OR email LIKE ? OR username LIKE ?
        ORDER BY created_at DESC LIMIT 10`,
      [like, like, like]
    );
    const tenantRows = this.db.query<any>(
      `SELECT u.*, t.name AS tenant_name, t.code AS tenant_code
         FROM platform_tenant_users u
         JOIN platform_tenants t ON t.id = u.tenant_id
        WHERE u.full_name LIKE ? OR u.username LIKE ? OR u.email LIKE ?
        ORDER BY u.created_at DESC LIMIT 20`,
      [like, like, like]
    );
    return {
      staff: staffRows.map((r) => this.mapLocalStaffRow(r)),
      tenantUsers: tenantRows.map((r) => this.mapLocalTenantUserRow(r)),
    };
  }

  public getTenantUserDetail(userId: string): PlatformTenantUserDetail | null {
    PlatformAdminService.requirePlatformAccess('admin-control', 'platform.admincontrol.view');
    const row = this.db.query<any>('SELECT * FROM platform_tenant_users WHERE id = ?', [userId])[0];
    if (!row) return null;
    const tenant = this.db.query<any>('SELECT id, name, code, status FROM platform_tenants WHERE id = ?', [row.tenant_id])[0] ?? null;
    const jobs = this.db.query<any>(
      `SELECT id, event, status, attempts, last_error, created_at, updated_at
         FROM provisioning_queue WHERE tenant_user_id = ? ORDER BY created_at DESC LIMIT 50`,
      [userId]
    ).map((j): PlatformTenantUserJob => ({
      id: String(j.id),
      event: j.event ?? null,
      status: j.status ?? null,
      attempts: j.attempts ?? null,
      lastError: j.last_error ?? null,
      createdAt: j.created_at ?? null,
      updatedAt: j.updated_at ?? null,
    }));
    const events = this.db.query<any>(
      `SELECT id, actor_name, action, entity_type, entity_id, tenant_id, created_at
         FROM platform_audit_logs
        WHERE entity_id = ? OR (tenant_id = ? AND entity_type = 'TENANT_USER')
        ORDER BY created_at DESC LIMIT 25`,
      [userId, row.tenant_id]
    ).map((r) => this.mapLocalAuditEvent(r));
    const mapped = this.mapLocalTenantUserRow({ ...row, tenant_name: tenant?.name, tenant_code: tenant?.code });
    return {
      user: { ...mapped, tenantName: tenant?.name ?? null, tenantCode: tenant?.code ?? null, tenantStatus: tenant?.status ?? null },
      tenant: tenant ? { id: String(tenant.id), name: tenant.name ?? null, code: tenant.code ?? null, status: tenant.status ?? null } : null,
      jobs,
      events,
    };
  }

  public getStaffUserDetail(id: string): PlatformStaffUserDetail | null {
    PlatformAdminService.requirePlatformAccess('admin-control', 'platform.admincontrol.view');
    const row = this.db.query<any>('SELECT * FROM platform_staff WHERE id = ?', [id])[0];
    if (!row) return null;
    const sessions = this.db.query<any>('SELECT COUNT(*) AS c FROM platform_staff_sessions WHERE staff_id = ?', [id])[0];
    const logins = this.db.query<any>(
      `SELECT email, username, success, status, failure_reason, ip_address, attempted_at, created_at
         FROM platform_staff_logins WHERE staff_id = ? ORDER BY created_at DESC LIMIT 15`,
      [id]
    ).map((l): PlatformStaffLoginEntry => ({
      username: l.username ?? l.email ?? null,
      success: l.success === 1 || l.success === true || l.status === 'SUCCESS',
      failureReason: l.failure_reason ?? null,
      ipAddress: l.ip_address ?? null,
      createdAt: l.attempted_at ?? l.created_at ?? null,
    }));
    return {
      staff: this.mapLocalStaffRow(row),
      roles: row.role ? [String(row.role)] : [],
      grants: (this.mapLocalStaffRow(row).permissionsOverride ?? []).map((code) => ({ code })),
      denies: [],
      activeSessions: Number(sessions?.c ?? 0),
      recentLogins: logins,
    };
  }

  // Helpers
  private setting(key: string, fallback = ''): string {
    const row = this.db.query<{ value: string }>('SELECT value FROM platform_settings WHERE key = ?', [key])[0];
    return row?.value ?? fallback;
  }

  private audit(
    action: string,
    entityType: string,
    entityId: string | null,
    details?: unknown,
    options?: {
      severity?: any;
      status?: any;
      actorType?: any;
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
    if (!actor) return;
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
}

// Attach the domain delegation groups to the prototype (bodies are verbatim
// moves of the original class methods).
Object.assign(
  PlatformAdminService.prototype,
  createTenantApi(),
  createBillingApi(),
  createModulesLicensesApi(),
  createSupportApi(),
  createStaffApi(),
  createConfigurationApi(),
  createOperationsApi(),
  createPoliciesApi()
);

export const platformAdminService = new PlatformAdminService();
