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
 */

import { platformTenantService } from './PlatformTenantService';
import { platformPlanService } from './PlatformPlanService';
import { platformSubscriptionService } from './PlatformSubscriptionService';
import { platformLicenseService } from './PlatformLicenseService';
import { platformCouponService } from './PlatformCouponService';
import { platformInvoiceService } from './PlatformInvoiceService';
import { platformModuleFeatureService } from './PlatformModuleFeatureService';
import { platformSupportService } from './PlatformSupportService';
import { platformStaffService } from './PlatformStaffService';
import { platformNotificationService } from './PlatformNotificationService';
import { platformSettingsService } from './PlatformSettingsService';
import { platformBrandingService } from './PlatformBrandingService';
import { platformConfigService } from './PlatformConfigService';
import { platformHealthService } from './PlatformHealthService';
import { platformAnalyticsService } from './PlatformAnalyticsService';
import { platformAuditService } from './PlatformAuditService';
import { centralAuditService } from './CentralAuditService';
import { AuthService } from '../auth/AuthService';
import { PlatformStaffAuthService } from './PlatformStaffAuthService';
import { PlatformAuthorizationService } from './PlatformAuthorizationService';
import { PlatformBootstrapService } from './PlatformBootstrapService';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import {
  PlatformTenant,
  PlatformTenantInput,
  PlatformTenantStatus,
  PLATFORM_TENANT_STATUS_LABELS,
  PLATFORM_INVOICE_STATUS_LABELS,
  PlatformTenantAccount,
  PlatformTenantAccountInput,
  PlatformTenantProfile,
  PlatformTenantUser,
  PlatformTenantUserInput,
  PlatformTenantUserProvisioningResult,
  PlatformTenantOverride,
  PlatformTenantOverrideInput,
  PlatformPlan,
  PlatformPlanInput,
  PlatformPlanVersion,
  PlatformPlanVersionInput,
  PlatformPriceHistoryEntry,
  PlatformPlanUpgradeRule,
  PlatformPlanUpgradeRuleInput,
  PlatformPlanCopyResult,
  PlatformPlanImpactPreview,
  PlatformSubscription,
  PlatformSubscriptionCreateInput,
  PlatformTrialCreateInput,
  PlatformLicense,
  PlatformLicenseStatus,
  PlatformLicenseActivation,
  PlatformDevice,
  PlatformCoupon,
  PlatformCouponInput,
  PlatformInvoice,
  PlatformInvoiceInput,
  PlatformInvoiceStatus,
  PlatformPayment,
  PlatformPaymentInput,
  PlatformSupportTicket,
  PlatformSupportMessage,
  PlatformCannedReply,
  PlatformRemoteSession,
  PlatformSupportTicketDetails,
  PlatformStaff,
  PlatformStaffInput,
  PlatformStaffRoleDefinition,
  PlatformStaffInvite,
  PlatformStaffInviteInput,
  PlatformStaffInviteCreated,
  PlatformStaffInviteStatus,
  PlatformTrustedDevice,
  PlatformStaffSession,
  PlatformStaffLogin,
  PlatformCentralSecurityIncident,
  PlatformSigningKey,
  PlatformCentralSecurityOverview,
  PlatformStaffDataScopeState,
  PlatformRoleMatrix,
  PlatformSettingsMap,
  PlatformPolicyDocument,
  PlatformPolicyRetention,
  PlatformTenantActivityConfig,
  PlatformTenantActivityInput,
  PlatformTenantActivityVersion,
  PlatformBrandingConfig,
  PlatformBrandingInput,
  PlatformBrandingVersion,
  PlatformUiProfile,
  PlatformTenantUiCustomization,
  PlatformTenantUiInput,
  PlatformTenantUiVersion,
  PlatformConfigTemplate,
  PlatformTenantConfig,
  PlatformTenantConfigInput,
  PlatformTenantConfigVersion,
  PlatformConfigRollout,
  PlatformConfigRolloutInput,
  PlatformConfigAck,
  RolloutTargetType,
  RolloutStatus,
  PlatformComprehensiveHealth,
  PlatformTechnicalHealthMetrics,
  PlatformHealthDashboardData,
  PlatformCentralBackup,
  PlatformServiceIncident,
  PlatformOverview,
  PlatformBusinessPerformance,
  PlatformCustomerMetrics,
  PlatformSubscriptionMetrics,
  PlatformLicenseMetrics,
  PlatformOperationsMetrics,
  PlatformPeriod,
  PlatformAlertDetail,
  PlatformAuditEntry,
  PlatformAuditFilters,
  PlatformAuditPaginatedResult,
  PlatformModule,
  PlatformFeatureFlag,
  PlatformFeatureOverride,
  PlatformRelease,
  PlatformReleaseTarget,
  PlatformPlanChangeRequest,
  PlatformPlanChangeResult,
  PlatformPlanChangeType,
  PlatformPlanVersioningInput,
  PlatformSubscriptionStatus,
  PlatformPaymentMethod,
  PlatformBillingCycle,
  PlatformCouplingMode,
  PlatformModuleUsage,
  PlatformMetricComparison,
  PlatformTimeSeriesPoint,
  PlatformTenantUsage,
  PlatformActivationDetails,
  PlatformOpsJob,
  PlatformOpsJobStatus,
  PlatformOpsJobType,
  PlatformMaintenanceWindow,
  PlatformMaintenanceStatus,
  PlatformOpApproval,
  PlatformOpApprovalStatus,
  PlatformSyncLogEntry,
  PlatformSyncStatus,
} from './platformTypes';
import { nowIso, toNumber, formatDate, addDays, addMonths, randomToken, generateTemporaryPassword, generateActivationCode, generateLicenseActivationCode, safeJsonArray, signCertificate, mapTenantAccount, mapTenantOverride } from './platformUtils';

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

  // Tenant Management - Delegate to PlatformTenantService
  public listTenants(search = '', status = '', planId = ''): PlatformTenant[] {
    return platformTenantService.listTenants(search, status, planId);
  }

  public getTenant(id: string): PlatformTenant | null {
    return platformTenantService.getTenant(id);
  }

  public createTenant(input: PlatformTenantInput): PlatformTenant {
    return platformTenantService.createTenant(input);
  }

  public updateTenant(id: string, input: PlatformTenantInput): PlatformTenant {
    return platformTenantService.updateTenant(id, input);
  }

  public setTenantStatus(id: string, status: PlatformTenantStatus): void {
    platformTenantService.setTenantStatus(id, status);
  }

  public archiveTenant(id: string): void {
    platformTenantService.archiveTenant(id);
  }

  public getTenantProfile(id: string): PlatformTenantProfile {
    return platformTenantService.getTenantProfile(id);
  }

  public getTenantAccount(tenantId: string): PlatformTenantAccount | null {
    return platformTenantService.getTenantAccount(tenantId);
  }

  public createTenantAccount(tenantId: string, input: PlatformTenantAccountInput): PlatformActivationDetails {
    return platformTenantService.createTenantAccount(tenantId, input);
  }

  public resetTenantAccountPassword(tenantId: string, temporaryPassword?: string): PlatformActivationDetails {
    return platformTenantService.resetTenantAccountPassword(tenantId, temporaryPassword);
  }

  public setTenantAccountActive(tenantId: string, active: boolean): PlatformTenantAccount {
    return platformTenantService.setTenantAccountActive(tenantId, active);
  }

  public listTenantUsers(tenantId: string): PlatformTenantUser[] {
    return platformTenantService.listTenantUsers(tenantId);
  }

  public createTenantUser(tenantId: string, input: PlatformTenantUserInput): PlatformTenantUserProvisioningResult {
    return platformTenantService.createTenantUser(tenantId, input);
  }

  public updateTenantUser(id: string, input: PlatformTenantUserInput): PlatformTenantUser {
    return platformTenantService.updateTenantUser(id, input);
  }

  public setTenantUserActive(id: string, active: boolean): PlatformTenantUser {
    return platformTenantService.setTenantUserActive(id, active);
  }

  public deleteTenantUser(id: string): void {
    platformTenantService.deleteTenantUser(id);
  }

  public resendTenantUserInvite(id: string): PlatformTenantUserProvisioningResult {
    return platformTenantService.resendTenantUserInvite(id);
  }

  public markTenantUserProvisioned(id: string, identityUserId?: string): PlatformTenantUser {
    return platformTenantService.markTenantUserProvisioned(id, identityUserId);
  }

  public listTenantOverrides(tenantId: string): PlatformTenantOverride[] {
    return platformTenantService.listTenantOverrides(tenantId);
  }

  public addTenantOverride(tenantId: string, input: PlatformTenantOverrideInput): PlatformTenantOverride {
    return platformTenantService.addTenantOverride(tenantId, input);
  }

  public setTenantOverrideEnabled(id: string, enabled: boolean): PlatformTenantOverride {
    return platformTenantService.setTenantOverrideEnabled(id, enabled);
  }

  public removeTenantOverride(id: string): void {
    platformTenantService.removeTenantOverride(id);
  }

  // Plan Management - Delegate to PlatformPlanService
  public listPlans(includeInactive = true): PlatformPlan[] {
    return platformPlanService.listPlans(includeInactive);
  }

  public createPlan(input: PlatformPlanInput): PlatformPlan {
    return platformPlanService.createPlan(input);
  }

  public updatePlan(id: string, input: PlatformPlanInput): PlatformPlan {
    return platformPlanService.updatePlan(id, input);
  }

  public setPlanActive(id: string, active: boolean): void {
    platformPlanService.setPlanActive(id, active);
  }

  public listPlanVersions(planId: string): PlatformPlanVersion[] {
    return platformPlanService.listPlanVersions(planId);
  }

  public getPlanVersion(planId: string, version: number): PlatformPlanVersion | null {
    return platformPlanService.getPlanVersion(planId, version);
  }

  public listPriceHistory(planId: string): PlatformPriceHistoryEntry[] {
    return platformPlanService.listPriceHistory(planId);
  }

  public copyPlan(sourcePlanId: string, newCode: string, newName: string, effectiveFrom?: string): PlatformPlanCopyResult {
    return platformPlanService.copyPlan(sourcePlanId, newCode, newName, effectiveFrom);
  }

  public listPlanUpgradeRules(): PlatformPlanUpgradeRule[] {
    return platformPlanService.listPlanUpgradeRules();
  }

  public setPlanUpgradeRule(input: PlatformPlanUpgradeRuleInput): PlatformPlanUpgradeRule {
    return platformPlanService.setPlanUpgradeRule(input);
  }

  public changeSubscriptionPlan(
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
    } = {}
  ): PlatformPlanChangeResult {
    return platformSubscriptionService.changeSubscriptionPlan(tenantId, targetPlanId, options);
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
    } = {}
  ): PlatformPlanChangeResult {
    return this.changeSubscriptionPlan(tenantId, targetPlanId, options);
  }

  public previewPlanChangeImpact(planId: string, newPlanData: PlatformPlanInput): PlatformPlanImpactPreview {
    return platformPlanService.previewPlanChangeImpact(planId, newPlanData);
  }

  public validatePlanDeactivation(planId: string): { canDeactivate: boolean; activeSubscriptions: number; message: string } {
    return platformPlanService.validatePlanDeactivation(planId);
  }

  // Subscription Management - Delegate to PlatformSubscriptionService
  public listSubscriptions(filters?: { status?: string; planId?: string; search?: string }): PlatformSubscription[] {
    return platformSubscriptionService.listSubscriptions(filters);
  }

  public createTrialSubscription(input: PlatformTrialCreateInput): PlatformSubscription {
    return platformSubscriptionService.createTrialSubscription(input);
  }

  public renewTenantSubscription(tenantId: string, months = 12): PlatformTenant {
    return platformSubscriptionService.renewTenantSubscription(tenantId, months);
  }

  public cancelTenantSubscription(tenantId: string, reason?: string): PlatformTenant {
    return platformSubscriptionService.cancelTenantSubscription(tenantId, reason);
  }

  public resetTenantDevices(tenantId: string): number {
    const now = nowIso();
    this.db.run('UPDATE platform_devices SET status = \'RELEASED\', updated_at = ? WHERE license_id IN (SELECT id FROM platform_licenses WHERE tenant_id = ?)', [now, tenantId]);
    return this.db.query<any>('SELECT changes() AS c')[0]?.c ?? 0;
  }

  public sendTenantActivation(tenantId: string): PlatformActivationDetails {
    return platformTenantService.resetTenantAccountPassword(tenantId);
  }

  // Coupon Management - Delegate to PlatformCouponService
  public listCoupons(): PlatformCoupon[] {
    return platformCouponService.listCoupons();
  }

  public createCoupon(input: PlatformCouponInput): PlatformCoupon {
    return platformCouponService.createCoupon(input);
  }

  public validateCoupon(code: string, subtotal: number): { coupon: PlatformCoupon; discount: number } {
    return platformCouponService.validateCoupon(code, subtotal);
  }

  public applyCoupon(code: string): PlatformCoupon {
    return platformCouponService.applyCoupon(code);
  }

  // Invoice & Payment Management - Delegate to PlatformInvoiceService
  public listInvoices(search = '', status = ''): PlatformInvoice[] {
    return platformInvoiceService.listInvoices(search, status);
  }

  public getInvoice(id: string): PlatformInvoice | null {
    return platformInvoiceService.getInvoice(id);
  }

  public createInvoice(input: PlatformInvoiceInput): PlatformInvoice {
    return platformInvoiceService.createInvoice(input);
  }

  public setInvoiceStatus(id: string, status: PlatformInvoiceStatus): void {
    platformInvoiceService.setInvoiceStatus(id, status);
  }

  public voidInvoice(id: string): void {
    platformInvoiceService.voidInvoice(id);
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

  public listPayments(limit = 200): PlatformPayment[] {
    return platformInvoiceService.listPayments(limit);
  }

  public addPayment(input: PlatformPaymentInput): PlatformPayment {
    return platformInvoiceService.addPayment(input);
  }

  public voidPayment(id: string, reason?: string): void {
    platformInvoiceService.voidPayment(id, reason);
  }

  // Module & Feature Management - Delegate to PlatformModuleFeatureService
  public listModules(): PlatformModule[] {
    return platformModuleFeatureService.listModules();
  }

  public listModulesForRuntime(): PlatformModule[] {
    return platformModuleFeatureService.listModulesForRuntime();
  }

  public listFeatureFlags(): PlatformFeatureFlag[] {
    return platformModuleFeatureService.listFeatureFlags();
  }

  public listFeatureFlagsForRuntime(): PlatformFeatureFlag[] {
    return platformModuleFeatureService.listFeatureFlagsForRuntime();
  }

  public listFeatureOverrides(featureId: string): PlatformFeatureOverride[] {
    return platformModuleFeatureService.listFeatureOverrides(featureId);
  }

  public setFeatureOverride(input: {
    featureId: string;
    targetType?: 'TENANT' | 'PLAN' | 'STAGING_GROUP';
    targetId?: string | null;
    tenantId?: string | null;
    isEnabled?: boolean;
    enabled?: boolean;
    customRolloutPercent?: number | null;
    rolloutPercentage?: number;
  }): PlatformFeatureOverride {
    return platformModuleFeatureService.setFeatureOverride(input);
  }

  public removeFeatureOverride(id: string): void {
    platformModuleFeatureService.removeFeatureOverride(id);
  }

  public setModuleEnabled(id: string, enabled: boolean): void {
    platformModuleFeatureService.setModuleEnabled(id, enabled);
  }

  public upsertFeatureFlag(input: {
    id?: string;
    key?: string;
    code?: string;
    name: string;
    description?: string;
    category?: string;
    isEnabled?: boolean;
    isActive?: boolean;
    defaultEnabled?: boolean;
    rolloutPercent?: number;
    rolloutPercentage?: number;
    isStagingOnly?: boolean;
    minPlanTier?: string | null;
  }): PlatformFeatureFlag {
    return platformModuleFeatureService.upsertFeatureFlag(input);
  }

  public setFeatureEnabled(id: string, enabled: boolean): void {
    platformModuleFeatureService.setFeatureEnabled(id, enabled);
  }

  public listReleases(): PlatformRelease[] {
    return platformModuleFeatureService.listReleases();
  }

  public listReleaseTargets(releaseId: string): PlatformReleaseTarget[] {
    return platformModuleFeatureService.listReleaseTargets(releaseId);
  }

  public setReleaseTargets(releaseId: string, tenantIds: string[]): PlatformReleaseTarget[] {
    return platformModuleFeatureService.setReleaseTargets(releaseId, tenantIds);
  }

  public updateReleaseTargetStatus(releaseId: string, tenantId: string, status: PlatformReleaseTarget['status'], error?: string): void {
    platformModuleFeatureService.updateReleaseTargetStatus(releaseId, tenantId, status, error);
  }

  public disableRelease(id: string): PlatformRelease {
    return platformModuleFeatureService.disableRelease(id);
  }

  public rollbackRelease(releaseId: string, safeRollbackVersion: string): PlatformRelease {
    return platformModuleFeatureService.rollbackRelease(releaseId, safeRollbackVersion);
  }

  public upsertRelease(input: {
    id?: string;
    version: string;
    channel?: string;
    status?: string | null;
    isMandatory?: boolean | null;
    minVersion?: string | null;
    rolloutGroup?: string | null;
    notes?: string | null;
    releasedAt?: string | null;
    fileUrl?: string | null;
    fileName?: string | null;
    fileSize?: number | null;
    checksumSha256?: string | null;
    packageSignature?: string | null;
    changelog?: string | null;
    rollbackVersion?: string | null;
    stagingGroup?: string | null;
    name?: string;
    description?: string;
    releaseDate?: string;
    isActive?: boolean;
    minClientVersion?: string;
    maxClientVersion?: string;
    artifactUrl?: string;
    artifactHash?: string;
  }): PlatformRelease {
    return platformModuleFeatureService.upsertRelease(input);
  }

  public getSignedClientRuntimeConfig(tenantId: string, clientVersion?: string): { payload: Record<string, unknown>; signature: string; certificate: string } {
    // This would need implementation - returning mock for compatibility
    return { payload: {}, signature: '', certificate: '' };
  }

  // License Management - Delegate to PlatformLicenseService
  public listLicenses(search = '', status = ''): PlatformLicense[] {
    return platformLicenseService.listLicenses(search, status);
  }

  public getLicense(id: string): PlatformLicense | null {
    return platformLicenseService.getLicense(id);
  }

  public issueLicense(tenantId: string, planId: string, options: any = {}): PlatformLicense {
    // Synchronous wrapper for backward compatibility
    return platformLicenseService.issueLicense({ tenantId, planId, ...options }) as any;
  }

  public async renewLicense(id: string, months = 12): Promise<PlatformLicense> {
    return platformLicenseService.renewLicense(id, months);
  }

  public setLicenseStatus(id: string, status: PlatformLicenseStatus): void {
    platformLicenseService.setLicenseStatus(id, status);
  }

  public setLicenseCouplingMode(id: string, couplingMode: PlatformLicense['couplingMode']): PlatformLicense {
    return platformLicenseService.setLicenseCouplingMode(id, couplingMode);
  }

  public bindLicenseHardware(id: string, hardwareId: string): void {
    platformLicenseService.bindLicenseHardware(id, hardwareId);
  }

  public deactivateLicenseDevice(id: string, notes?: string): void {
    platformLicenseService.deactivateLicenseDevice(id, notes);
  }

  public listLicenseActivations(licenseId: string): PlatformLicenseActivation[] {
    return platformLicenseService.listLicenseActivations(licenseId);
  }

  public listDevices(tenantId?: string): PlatformDevice[] {
    return platformLicenseService.listDevices(tenantId);
  }

  public registerDevice(input: {
    licenseId: string;
    hardwareId: string;
    deviceName?: string;
    deviceType?: string;
    os?: string;
    appVersion?: string;
  }): PlatformDevice {
    return platformLicenseService.registerDevice(input);
  }

  public setDeviceStatus(id: string, status: PlatformDevice['status']): PlatformDevice {
    return platformLicenseService.setDeviceStatus(id, status);
  }

  public deleteDevice(id: string): void {
    platformLicenseService.deleteDevice(id);
  }

  public markDeviceCloneSuspected(id: string, suspected: boolean): PlatformDevice {
    return platformLicenseService.markDeviceCloneSuspected(id, suspected);
  }

  public reassignDeviceSeat(deviceId: string, licenseId: string): PlatformDevice {
    return platformLicenseService.reassignDeviceSeat(deviceId, licenseId);
  }

  public suspendDevice(deviceId: string, reason?: string): PlatformDevice {
    return platformLicenseService.suspendDevice(deviceId, reason);
  }

  public releaseDevice(deviceId: string, reason?: string): PlatformDevice {
    return platformLicenseService.releaseDevice(deviceId, reason);
  }

  public revokeDevice(deviceId: string, reason?: string): PlatformDevice {
    return platformLicenseService.revokeDevice(deviceId, reason);
  }

  public getDevice(deviceId: string): PlatformDevice | null {
    return platformLicenseService.getDevice(deviceId);
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

  public detectCloneDevicesCentral() {
    return this.detectCloneDevices();
  }

  // Support - Delegate to PlatformSupportService
  public listSupportTickets(search = '', status = ''): PlatformSupportTicket[] {
    return platformSupportService.listSupportTickets(search, status);
  }

  public createSupportTicket(input: {
    tenantId: string;
    subject: string;
    description?: string;
    category?: string;
    priority?: PlatformSupportTicket['priority'];
    assignedTo?: string | null;
  }): PlatformSupportTicket {
    return platformSupportService.createSupportTicket(input);
  }

  public setSupportTicketStatus(id: string, status: PlatformSupportTicket['status']): PlatformSupportTicket {
    return platformSupportService.setSupportTicketStatus(id, status);
  }

  public assignSupportTicket(id: string, assignedTo: string | null): PlatformSupportTicket {
    return platformSupportService.assignSupportTicket(id, assignedTo);
  }

  public setSupportTicketPriority(id: string, priority: PlatformSupportTicket['priority']): PlatformSupportTicket {
    return platformSupportService.setSupportTicketPriority(id, priority);
  }

  public rateSupportTicket(id: string, rating: number, feedback?: string): PlatformSupportTicket {
    return platformSupportService.rateSupportTicket(id, rating, feedback);
  }

  public requestRemoteAccess(id: string, requested: boolean, durationMinutes = 60): PlatformSupportTicket {
    return platformSupportService.requestRemoteAccess(id, requested, durationMinutes);
  }

  public approveRemoteAccess(id: string, approved: boolean): PlatformSupportTicket {
    return platformSupportService.approveRemoteAccess(id, approved);
  }

  public addSupportMessage(input: {
    ticketId: string;
    authorId?: string;
    authorType?: 'STAFF' | 'TENANT';
    authorName?: string;
    authorRole?: 'CUSTOMER' | 'SUPPORT' | 'SYSTEM';
    body: string;
    internal?: boolean;
    isInternal?: boolean;
    attachmentUrl?: string | null;
    attachmentName?: string | null;
    attachmentSize?: string | null;
  }): PlatformSupportMessage {
    return platformSupportService.addSupportMessage(input);
  }

  public listSupportMessages(ticketId: string): PlatformSupportMessage[] {
    return platformSupportService.listSupportMessages(ticketId);
  }

  public getSupportTicketDetails(ticketId: string): PlatformSupportTicketDetails {
    return platformSupportService.getSupportTicketDetails(ticketId);
  }

  public listCannedReplies(): PlatformCannedReply[] {
    return platformSupportService.listCannedReplies();
  }

  public createCannedReply(input: { title: string; category?: string; body: string }): PlatformCannedReply {
    return platformSupportService.createCannedReply(input);
  }

  public startRemoteSession(input: {
    ticketId: string;
    staffId?: string;
    tenantId?: string;
    technicianName?: string;
    durationMinutes?: number;
  }): PlatformRemoteSession {
    return platformSupportService.startRemoteSession(input);
  }

  public endRemoteSession(sessionId: string, actionsSummary?: string): PlatformRemoteSession {
    return platformSupportService.endRemoteSession(sessionId, actionsSummary);
  }

  public listRemoteSessions(ticketId: string): PlatformRemoteSession[] {
    return platformSupportService.listRemoteSessions(ticketId);
  }

  // Staff Management - Delegate to PlatformStaffService
  public listApiKeys(tenantId?: string): any[] {
    return platformStaffService.listApiKeys ? platformStaffService.listApiKeys(tenantId) : [];
  }

  public createApiKey(input: { tenantId: string; name: string; scopes?: string[]; expiresAt?: string }): any {
    return platformStaffService.createApiKey ? platformStaffService.createApiKey(input) : null;
  }

  public revokeApiKey(id: string): void {
    if (platformStaffService.revokeApiKey) platformStaffService.revokeApiKey(id);
  }

  public rotateApiKey(id: string): any {
    return platformStaffService.rotateApiKey ? platformStaffService.rotateApiKey(id) : null;
  }

  public validateApiKey(plainTextKey: string): any {
    return platformStaffService.validateApiKey ? platformStaffService.validateApiKey(plainTextKey) : null;
  }

  public listPlatformStaffRoles(): PlatformStaffRoleDefinition[] {
    return platformStaffService.listPlatformStaffRoles();
  }

  public listPlatformStaff(search = '', role = '', includeDeleted = false): PlatformStaff[] {
    return platformStaffService.listPlatformStaff(search, role, includeDeleted);
  }

  public getPlatformStaff(id: string): PlatformStaff | null {
    return platformStaffService.getPlatformStaff(id);
  }

  public createPlatformStaff(input: PlatformStaffInput): PlatformStaff {
    return platformStaffService.createPlatformStaff(input);
  }

  public updatePlatformStaff(id: string, input: Partial<PlatformStaffInput>): PlatformStaff {
    return platformStaffService.updatePlatformStaff(id, input);
  }

  public setPlatformStaffActive(id: string, isActive: boolean): PlatformStaff {
    return platformStaffService.setPlatformStaffActive(id, isActive);
  }

  public deletePlatformStaff(id: string): void {
    platformStaffService.deletePlatformStaff(id);
  }

  public createStaffInvite(input: PlatformStaffInviteInput): PlatformStaffInviteCreated {
    return platformStaffService.createStaffInvite(input);
  }

  public listStaffInvites(status: 'all' | PlatformStaffInviteStatus = 'all'): PlatformStaffInvite[] {
    return platformStaffService.listStaffInvites(status);
  }

  public revokeStaffInvite(id: string): void {
    platformStaffService.revokeStaffInvite(id);
  }

  public getStaffInviteByToken(token: string): PlatformStaffInvite {
    return platformStaffService.getStaffInviteByToken(token);
  }

  public acceptStaffInvite(token: string, fullName: string, password: string): PlatformStaff {
    return platformStaffService.acceptStaffInvite(token, fullName, password);
  }

  public resetPlatformStaffPassword(id: string, newPassword: string): void {
    platformStaffService.resetPlatformStaffPassword(id, newPassword);
  }

  public forcePlatformStaffPasswordChange(id: string, flag = true): void {
    platformStaffService.forcePlatformStaffPasswordChange(id, flag);
  }

  public changeOwnStaffPassword(currentPassword: string, newPassword: string, fullName?: string): void {
    platformStaffService.changeOwnStaffPassword(currentPassword, newPassword, fullName);
  }

  public listTrustedDevices(staffId?: string): PlatformTrustedDevice[] {
    return platformStaffService.listTrustedDevices(staffId);
  }

  public revokeTrustedDevice(id: string): void {
    platformStaffService.revokeTrustedDevice(id);
  }

  public getOwnStaffMfaStatus(): { enabled: boolean; enforcement: 'off' | 'optional' | 'required' } {
    return platformStaffService.getOwnStaffMfaStatus();
  }

  public revokeStaffSessionsForStaff(staffId: string): void {
    if (platformStaffService.revokeStaffSessionsForStaff) platformStaffService.revokeStaffSessionsForStaff(staffId);
  }

  public trustCurrentStaffDevice(deviceName?: string): void {
    platformStaffService.trustCurrentStaffDevice(deviceName);
  }

  public getStaffMfaEnforcement(): 'off' | 'optional' | 'required' {
    return platformStaffService.getStaffMfaEnforcement();
  }

  public setStaffMfaEnforcement(policy: 'off' | 'optional' | 'required'): void {
    platformStaffService.setStaffMfaEnforcement(policy);
  }

  public getStaffMfaCompliance(): any {
    return platformStaffService.getStaffMfaCompliance();
  }

  public startMfaEnrollmentForStaffSelf(): any {
    return platformStaffService.startMfaEnrollmentForStaffSelf();
  }

  public async confirmMfaForStaffSelf(code: string): Promise<void> {
    return platformStaffService.confirmMfaForStaffSelf(code);
  }

  public async disableMfaForStaffSelf(code: string): Promise<void> {
    return platformStaffService.disableMfaForStaffSelf(code);
  }

  public resetStaffMfa(id: string): void {
    platformStaffService.resetStaffMfa(id);
  }

  public transferStaffPermissions(fromStaffId: string, toStaffId: string, note?: string): PlatformStaff {
    return platformStaffService.transferStaffPermissions(fromStaffId, toStaffId, note);
  }

  public getStaffDataScope(id: string): PlatformStaffDataScopeState {
    return platformStaffService.getStaffDataScope(id);
  }

  public setStaffDataScope(id: string, scope: 'ALL' | 'LIMITED', tenantIds: string[] = []): void {
    platformStaffService.setStaffDataScope(id, scope, tenantIds);
  }

  public getRolePermissionMatrix(): PlatformRoleMatrix {
    return platformStaffService.getRolePermissionMatrix();
  }

  public setRolePermissions(role: string, permissionCodes: string[]): void {
    platformStaffService.setRolePermissions(role, permissionCodes);
  }

  public getPlatformSecurityOverview(): PlatformCentralSecurityOverview {
    const overview = platformStaffService.getPlatformSecurityOverview ? platformStaffService.getPlatformSecurityOverview() : null;
    if (overview) return overview;
    return {
      securityScore: 100,
      twoFactorEnforcement: { enabled: false, compliantStaffCount: 0, totalStaffCount: 0 },
      activeStaffSessionsCount: 0,
      failedLogins24hCount: 0,
      activeIncidentsCount: 0,
      signingKeysCount: 0,
      trustedDevicesCount: 0,
      sessions: [],
      recentLogins: [],
      incidents: [],
      signingKeys: [],
    };
  }

  public listStaffSessions(staffId?: string): PlatformStaffSession[] {
    return platformStaffService.listStaffSessions(staffId);
  }

  public revokeStaffSession(sessionId: string): void {
    platformStaffService.revokeStaffSession(sessionId);
  }

  public revokeAllOtherStaffSessions(): void {
    platformStaffService.revokeAllOtherStaffSessions();
  }

  public listStaffLogins(limit = 100, failedOnly = false, staffId?: string): PlatformStaffLogin[] {
    return platformStaffService.listStaffLogins(limit, failedOnly, staffId);
  }

  public recordStaffLoginAttempt(input: {
    staffId?: string;
    username?: string;
    ipAddress?: string;
    userAgent?: string;
    success: boolean;
    failureReason?: string;
    mfaUsed?: boolean;
  }): void {
    platformStaffService.recordStaffLoginAttempt(input);
  }

  public listPlatformSecurityIncidents(): PlatformCentralSecurityIncident[] {
    return platformStaffService.listPlatformSecurityIncidents();
  }

  public recordSecurityIncident(input: {
    type: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    title: string;
    description?: string;
    tenantId?: string;
    staffId?: string;
    deviceId?: string;
    ipAddress?: string;
    metadata?: Record<string, unknown>;
  }): PlatformCentralSecurityIncident {
    return platformStaffService.recordSecurityIncident(input);
  }

  public respondToSecurityIncident(id: string, action: string, resolve = false): PlatformCentralSecurityIncident {
    return platformStaffService.respondToSecurityIncident(id, action, resolve);
  }

  public listPlatformSigningKeys(): PlatformSigningKey[] {
    return platformStaffService.listPlatformSigningKeys();
  }

  public rotatePlatformSigningKey(keyAlias: string): PlatformSigningKey {
    return platformStaffService.rotatePlatformSigningKey(keyAlias);
  }

  // Notifications - Delegate to PlatformNotificationService
  public checkExpiringLicensesAndSubscriptions(): { licenseNotifications: number; subscriptionNotifications: number; offlineLeaseWarnings: number } {
    return platformNotificationService.checkExpiringLicensesAndSubscriptions();
  }

  public handleNotificationAction(notificationId: string, action: string): void {
    platformNotificationService.handleNotificationAction(notificationId, action);
  }

  // Settings - Delegate to PlatformSettingsService
  public getSettings(): PlatformSettingsMap {
    return platformSettingsService.getSettings();
  }

  public updateSettings(input: Partial<PlatformSettingsMap>): PlatformSettingsMap {
    return platformSettingsService.updateSettings(input);
  }

  public getPlatformPolicies(): PlatformPolicyDocument {
    return platformSettingsService.getPlatformPolicies();
  }

  public savePlatformPolicies(input: {
    terms?: string;
    privacy?: string;
    retention?: Partial<PlatformPolicyRetention>;
  }): PlatformPolicyDocument {
    return platformSettingsService.savePlatformPolicies(input);
  }

  public rotatePlatformEncryptionKeys(): { rotatedAt: string; status: string; newKeyFingerprint: string } {
    return platformSettingsService.rotatePlatformEncryptionKeys();
  }

  public getTenantActivity(tenantId: string): PlatformTenantActivityConfig | null {
    return platformSettingsService.getTenantActivity(tenantId);
  }

  public saveTenantActivity(input: PlatformTenantActivityInput): PlatformTenantActivityConfig {
    return platformSettingsService.saveTenantActivity(input);
  }

  public listTenantActivityVersions(tenantId: string): PlatformTenantActivityVersion[] {
    return platformSettingsService.listTenantActivityVersions(tenantId);
  }

  public rollbackTenantActivity(tenantId: string, targetVersion: number): PlatformTenantActivityConfig {
    return platformSettingsService.rollbackTenantActivity(tenantId, targetVersion);
  }

  // Branding - Delegate to PlatformBrandingService
  public getPlatformBranding(): PlatformBrandingConfig {
    return platformBrandingService.getPlatformBranding();
  }

  public getTenantBranding(tenantId?: string | null): PlatformBrandingConfig {
    return platformBrandingService.getTenantBranding(tenantId);
  }

  public saveTenantBranding(input: PlatformBrandingInput): PlatformBrandingConfig {
    return platformBrandingService.saveTenantBranding(input);
  }

  public listTenantBrandingVersions(tenantId?: string | null): PlatformBrandingVersion[] {
    return platformBrandingService.listTenantBrandingVersions(tenantId);
  }

  public rollbackTenantBranding(tenantId: string | null | undefined, targetVersion: number): PlatformBrandingConfig {
    return platformBrandingService.rollbackTenantBranding(tenantId, targetVersion);
  }

  public listUiProfiles(): PlatformUiProfile[] {
    return platformBrandingService.listUiProfiles();
  }

  public getTenantUiCustomization(tenantId: string): PlatformTenantUiCustomization {
    return platformBrandingService.getTenantUiCustomization(tenantId);
  }

  public saveTenantUiCustomization(input: PlatformTenantUiInput): PlatformTenantUiCustomization {
    return platformBrandingService.saveTenantUiCustomization(input);
  }

  public listTenantUiVersions(tenantId: string): PlatformTenantUiVersion[] {
    return platformBrandingService.listTenantUiVersions(tenantId);
  }

  public rollbackTenantUi(tenantId: string, targetVersion: number): PlatformTenantUiCustomization {
    return platformBrandingService.rollbackTenantUi(tenantId, targetVersion);
  }

  // Config - Delegate to PlatformConfigService
  public listConfigTemplates(): PlatformConfigTemplate[] {
    return platformConfigService.listConfigTemplates();
  }

  public getTenantConfig(tenantId: string): PlatformTenantConfig {
    return platformConfigService.getTenantConfig(tenantId);
  }

  public saveTenantConfig(input: PlatformTenantConfigInput): PlatformTenantConfig {
    return platformConfigService.saveTenantConfig(input);
  }

  public listTenantConfigVersions(tenantId: string): PlatformTenantConfigVersion[] {
    return platformConfigService.listTenantConfigVersions(tenantId);
  }

  public rollbackTenantConfig(tenantId: string, targetVersion: number): PlatformTenantConfig {
    return platformConfigService.rollbackTenantConfig(tenantId, targetVersion);
  }

  public createConfigRollout(input: PlatformConfigRolloutInput): PlatformConfigRollout {
    return platformConfigService.createConfigRollout(input);
  }

  public startConfigRollout(id: string): PlatformConfigRollout {
    return platformConfigService.startConfigRollout(id);
  }

  public listConfigRollouts(): PlatformConfigRollout[] {
    return platformConfigService.listConfigRollouts();
  }

  public listConfigAcks(tenantId?: string): PlatformConfigAck[] {
    return platformConfigService.listConfigAcks(tenantId);
  }

  // Health - Delegate to PlatformHealthService
  public getPlatformComprehensiveHealth(): PlatformComprehensiveHealth {
    return platformHealthService.getPlatformComprehensiveHealth();
  }

  public listCentralBackups(): PlatformCentralBackup[] {
    return platformHealthService.listCentralBackups();
  }

  public async triggerCentralBackup(): Promise<PlatformCentralBackup> {
    return platformHealthService.triggerCentralBackup();
  }

  public deleteCentralBackup(id: string): void {
    platformHealthService.deleteCentralBackup(id);
  }

  public listServiceIncidents(status?: 'OPEN' | 'RESOLVED'): PlatformServiceIncident[] {
    return platformHealthService.listServiceIncidents(status);
  }

  public resolveServiceIncident(id: string): void {
    platformHealthService.resolveServiceIncident(id);
  }

  public getPlatformHealthDashboard(): PlatformHealthDashboardData {
    return platformHealthService.getPlatformHealthDashboard();
  }

  // Operations - Delegate to PlatformHealthService (Ops Jobs, Maintenance, Approvals, Sync)
  public listOpsJobs(filters?: { status?: string; tenantId?: string; type?: string; limit?: number; offset?: number }): { jobs: PlatformOpsJob[]; total: number } {
    return platformHealthService.listOpsJobs ? platformHealthService.listOpsJobs(filters) : { jobs: [], total: 0 };
  }

  public createOpsJob(input: { type: string; tenantId?: string; payload?: Record<string, unknown>; priority?: number; scheduledAt?: string }): PlatformOpsJob {
    return platformHealthService.createOpsJob ? platformHealthService.createOpsJob(input) : null as any;
  }

  public cancelOpsJob(id: string): void {
    if (platformHealthService.cancelOpsJob) platformHealthService.cancelOpsJob(id);
  }

  public retryOpsJob(id: string): void {
    if (platformHealthService.retryOpsJob) platformHealthService.retryOpsJob(id);
  }

  public listMaintenanceWindows(filters?: { status?: string }): PlatformMaintenanceWindow[] {
    return platformHealthService.listMaintenanceWindows ? platformHealthService.listMaintenanceWindows(filters) : [];
  }

  public createMaintenanceWindow(input: { title: string; description?: string; startsAt: string; endsAt: string; affectedServices?: string[] }): PlatformMaintenanceWindow {
    return platformHealthService.createMaintenanceWindow ? platformHealthService.createMaintenanceWindow(input) : null as any;
  }

  public cancelMaintenanceWindow(id: string): void {
    if (platformHealthService.cancelMaintenanceWindow) platformHealthService.cancelMaintenanceWindow(id);
  }

  public listOpApprovals(filters?: { status?: string }): PlatformOpApproval[] {
    return platformHealthService.listOpApprovals ? platformHealthService.listOpApprovals(filters) : [];
  }

  public requestOpApproval(input: { opType: string; opPayload?: Record<string, unknown> }): PlatformOpApproval {
    return platformHealthService.requestOpApproval ? platformHealthService.requestOpApproval(input) : null as any;
  }

  public approveOp(id: string, notes?: string): void {
    if (platformHealthService.approveOp) platformHealthService.approveOp(id, notes);
  }

  public rejectOp(id: string, notes?: string): void {
    if (platformHealthService.rejectOp) platformHealthService.rejectOp(id, notes);
  }

  public listSyncStatus(filters?: { tenantId?: string; deviceId?: string; status?: string; limit?: number }): PlatformSyncLogEntry[] {
    return platformHealthService.listSyncStatus ? platformHealthService.listSyncStatus(filters) : [];
  }

  public logSyncEvent(input: { tenantId?: string; deviceId?: string; syncType: string; status: PlatformSyncStatus; recordsSynced?: number; errorDetail?: string }): PlatformSyncLogEntry {
    return platformHealthService.logSyncEvent ? platformHealthService.logSyncEvent(input) : null as any;
  }

  // Analytics - Delegate to PlatformAnalyticsService
  public getBusinessPerformance(period: PlatformPeriod = '30d', planId?: string): PlatformBusinessPerformance {
    return platformAnalyticsService.getBusinessPerformance(period, planId);
  }

  public getCustomerMetrics(period: PlatformPeriod = '30d', planId?: string): PlatformCustomerMetrics {
    return platformAnalyticsService.getCustomerMetrics(planId);
  }

  public getSubscriptionMetrics(period: PlatformPeriod = '30d', planId?: string): PlatformSubscriptionMetrics {
    return platformAnalyticsService.getSubscriptionMetrics();
  }

  public getLicenseMetrics(period: PlatformPeriod = '30d', planId?: string): PlatformLicenseMetrics {
    return platformAnalyticsService.getLicenseMetrics();
  }

  public getOperationsMetrics(period: PlatformPeriod = '30d'): PlatformOperationsMetrics {
    return platformAnalyticsService.getOperationsMetrics();
  }

  public getOverview(): PlatformOverview {
    return platformAnalyticsService.getOverviewWithPeriod('30d', undefined);
  }

  public getOverviewWithPeriod(period: PlatformPeriod = '30d', planId?: string): PlatformOverview {
    return platformAnalyticsService.getOverviewWithPeriod(period, planId);
  }

  public getAlertDetails(): PlatformAlertDetail[] {
    return platformAnalyticsService.getAlertDetails();
  }

  // Audit - Delegate to PlatformAuditService
  public listAudit(limit = 200, search = ''): PlatformAuditEntry[] {
    return platformAuditService.listAudit(limit, search);
  }

  public queryAuditPaginated(filters: PlatformAuditFilters = {}): PlatformAuditPaginatedResult {
    return platformAuditService.queryAuditPaginated(filters);
  }

  public queryAuditForExport(filters: PlatformAuditFilters = {}): PlatformAuditEntry[] {
    return platformAuditService.queryAuditForExport(filters);
  }

  public verifyAuditIntegrity(): { isValid: boolean; checkedCount: number; brokenAtId?: string } {
    return platformAuditService.verifyAuditIntegrity();
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

  public listDevicesCentral(filters: { tenantId?: string; status?: string; hardwareId?: string; limit?: number }): PlatformDevice[] {
    return platformLicenseService.listDevices(filters.tenantId);
  }

  public suspendDeviceCentral(deviceId: string, reason?: string): PlatformDevice {
    return platformLicenseService.suspendDevice(deviceId, reason);
  }

  public releaseDeviceCentral(deviceId: string): PlatformDevice {
    return platformLicenseService.releaseDevice(deviceId);
  }

  public revokeDeviceCentral(deviceId: string, reason?: string): PlatformDevice {
    return platformLicenseService.revokeDevice(deviceId, reason);
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

export const platformAdminService = new PlatformAdminService();