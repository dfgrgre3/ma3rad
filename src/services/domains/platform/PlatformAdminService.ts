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
import { nowIso } from './platformUtils';
import { createTenantApi, type TenantApi } from './PlatformAdminService/tenants';
import { createBillingApi, type BillingApi } from './PlatformAdminService/billing';
import { createModulesLicensesApi, type ModulesLicensesApi } from './PlatformAdminService/modulesLicenses';
import { createSupportApi, type SupportApi } from './PlatformAdminService/support';
import { createStaffApi, type StaffApi } from './PlatformAdminService/staff';
import { createConfigurationApi, type ConfigurationApi } from './PlatformAdminService/configuration';
import { createOperationsApi, type OperationsApi } from './PlatformAdminService/operations';

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
    OperationsApi {}

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
  createOperationsApi()
);

export const platformAdminService = new PlatformAdminService();
