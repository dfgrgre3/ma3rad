import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PlatformStaffAuthService } from './PlatformStaffAuthService';
import { PlatformAuthorizationService } from './PlatformAuthorizationService';
import { centralAuditService } from './CentralAuditService';
import { safeJsonArray, toNumber } from './platformUtils';
import type {
  PlatformTenant,
  PlatformTenantInput,
  PlatformTenantStatus,
  PlatformTenantAccount,
  PlatformTenantAccountInput,
  PlatformTenantProfile,
  PlatformTenantUser,
  PlatformTenantUserDirectoryEntry,
  PlatformTenantUserInput,
  PlatformTenantUserProvisioningResult,
  PlatformTenantOverride,
  PlatformTenantOverrideInput,
  PlatformActivationDetails,
} from './platformTypes';
import type { TenantServiceContext, TenantAuditOptions } from './PlatformTenantService/context';
import { mapTenantUser } from './PlatformTenantService/mappers';
import * as tenantCrud from './PlatformTenantService/tenantCrud';
import * as tenantProfile from './PlatformTenantService/tenantProfile';
import * as tenantAccount from './PlatformTenantService/tenantAccount';
import * as tenantUsers from './PlatformTenantService/tenantUsers';
import * as tenantOverrides from './PlatformTenantService/tenantOverrides';

export class PlatformTenantService {
  private db = DatabaseManager.getInstance();

  private readonly ctx: TenantServiceContext = {
    db: this.db,
    audit: (action, entityType, entityId, details, options) => this.audit(action, entityType, entityId, details, options),
    requirePlatformAccess: (modules, action) => PlatformTenantService.requirePlatformAccess(modules, action),
    staffTenantScope: (user) => PlatformTenantService.staffTenantScope(user),
    setting: (key, fallback) => this.setting(key, fallback),
    getTenant: (id) => this.getTenant(id),
    getTenantAccount: (tenantId) => this.getTenantAccount(tenantId),
    getTenantUser: (id) => this.getTenantUser(id),
  };

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

  private static staffTenantScope(user: any): string[] | null {
    if (!user || String(user.role) === 'SUPER_ADMIN') return null;
    const db = DatabaseManager.getInstance();
    const row = db.query<any>('SELECT data_scope, data_scope_tenant_ids FROM platform_staff WHERE id = ?', [String(user.id)])[0];
    if (!row || String(row.data_scope ?? 'ALL') !== 'LIMITED') return null;
    return safeJsonArray(row.data_scope_tenant_ids);
  }

  private audit(
    action: string,
    entityType: string,
    entityId: string | null,
    details?: unknown,
    options?: TenantAuditOptions
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
    return tenantCrud.listTenants(this.ctx, search, status, planId);
  }

  public getTenant(id: string): PlatformTenant | null {
    return tenantCrud.getTenant(this.ctx, id);
  }

  public createTenant(input: PlatformTenantInput): PlatformTenant {
    return tenantCrud.createTenant(this.ctx, input);
  }

  public updateTenant(id: string, input: PlatformTenantInput): PlatformTenant {
    return tenantCrud.updateTenant(this.ctx, id, input);
  }

  public setTenantStatus(id: string, status: PlatformTenantStatus): void {
    return tenantCrud.setTenantStatus(this.ctx, id, status);
  }

  public archiveTenant(id: string): void {
    return tenantCrud.archiveTenant(this.ctx, id);
  }

  public getTenantProfile(id: string): PlatformTenantProfile {
    return tenantProfile.getTenantProfile(this.ctx, id);
  }

  // ─── Tenant Account ───────────────────────────────────────────────────────────

  public getTenantAccount(tenantId: string): PlatformTenantAccount | null {
    return tenantAccount.getTenantAccount(this.ctx, tenantId);
  }

  public createTenantAccount(
    tenantId: string,
    input: PlatformTenantAccountInput
  ): PlatformActivationDetails {
    return tenantAccount.createTenantAccount(this.ctx, tenantId, input);
  }

  public resetTenantAccountPassword(tenantId: string, temporaryPassword?: string): PlatformActivationDetails {
    return tenantAccount.resetTenantAccountPassword(this.ctx, tenantId, temporaryPassword);
  }

  public updateTenantAccount(
    tenantId: string,
    input: { username?: string; email?: string; fullName?: string; password?: string }
  ): PlatformTenantAccount {
    return tenantAccount.updateTenantAccount(this.ctx, tenantId, input);
  }

  public setTenantAccountActive(tenantId: string, active: boolean): PlatformTenantAccount {
    return tenantAccount.setTenantAccountActive(this.ctx, tenantId, active);
  }

  // ─── Tenant Users (Provisioning) ──────────────────────────────────────────────

  public listTenantUsers(tenantId: string): PlatformTenantUser[] {
    return tenantUsers.listTenantUsers(this.ctx, tenantId);
  }

  public listAllTenantUsers(filters: { tenantId?: string; provisioningStatus?: string; status?: string; search?: string } = {}): PlatformTenantUserDirectoryEntry[] {
    return tenantUsers.listAllTenantUsers(this.ctx, filters);
  }

  public createTenantUser(tenantId: string, input: PlatformTenantUserInput): PlatformTenantUserProvisioningResult {
    return tenantUsers.createTenantUser(this.ctx, tenantId, input);
  }

  public updateTenantUser(id: string, input: PlatformTenantUserInput): PlatformTenantUser {
    return tenantUsers.updateTenantUser(this.ctx, id, input);
  }

  public setTenantUserActive(id: string, active: boolean): PlatformTenantUser {
    return tenantUsers.setTenantUserActive(this.ctx, id, active);
  }

  public deleteTenantUser(id: string): void {
    return tenantUsers.deleteTenantUser(this.ctx, id);
  }

  public resendTenantUserInvite(id: string): PlatformTenantUserProvisioningResult {
    return tenantUsers.resendTenantUserInvite(this.ctx, id);
  }

  public markTenantUserProvisioned(id: string, identityUserId?: string): PlatformTenantUser {
    return tenantUsers.markTenantUserProvisioned(this.ctx, id, identityUserId);
  }

  // ─── Tenant Overrides ─────────────────────────────────────────────────────────

  public listTenantOverrides(tenantId: string): PlatformTenantOverride[] {
    return tenantOverrides.listTenantOverrides(this.ctx, tenantId);
  }

  public addTenantOverride(tenantId: string, input: PlatformTenantOverrideInput): PlatformTenantOverride {
    return tenantOverrides.addTenantOverride(this.ctx, tenantId, input);
  }

  public setTenantOverrideEnabled(id: string, enabled: boolean): PlatformTenantOverride {
    return tenantOverrides.setTenantOverrideEnabled(this.ctx, id, enabled);
  }

  public removeTenantOverride(id: string): void {
    return tenantOverrides.removeTenantOverride(this.ctx, id);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private getTenantUser(id: string): PlatformTenantUser | null {
    const row = this.db.query<any>('SELECT * FROM platform_tenant_users WHERE id = ?', [id])[0];
    return row ? mapTenantUser(row) : null;
  }
}

export const platformTenantService = new PlatformTenantService();
