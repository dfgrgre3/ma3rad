import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PlatformStaffAuthService } from './PlatformStaffAuthService';
import { PlatformAuthorizationService } from './PlatformAuthorizationService';
import { centralAuditService } from './CentralAuditService';
import type {
  PlatformPeriod,
  PlatformBusinessPerformance,
  PlatformCustomerMetrics,
  PlatformSubscriptionMetrics,
  PlatformLicenseMetrics,
  PlatformOperationsMetrics,
  PlatformOverview,
  PlatformAlertDetail,
} from './platformTypes';
import type { AnalyticsServiceContext } from './PlatformAnalyticsService/context';
import * as business from './PlatformAnalyticsService/business';
import * as customers from './PlatformAnalyticsService/customers';
import * as subscriptions from './PlatformAnalyticsService/subscriptions';
import * as licenses from './PlatformAnalyticsService/licenses';
import * as operations from './PlatformAnalyticsService/operations';
import * as overview from './PlatformAnalyticsService/overview';
import * as alerts from './PlatformAnalyticsService/alerts';

export class PlatformAnalyticsService {
  private db = DatabaseManager.getInstance();

  private readonly ctx: AnalyticsServiceContext = {
    db: this.db,
    requirePlatformAccess: (modules, action) => PlatformAnalyticsService.requirePlatformAccess(modules, action),
    getBusinessPerformance: (period, planId) => this.getBusinessPerformance(period, planId),
    getCustomerMetrics: (planId) => this.getCustomerMetrics(planId),
    getSubscriptionMetrics: () => this.getSubscriptionMetrics(),
    getLicenseMetrics: () => this.getLicenseMetrics(),
    getOperationsMetrics: () => this.getOperationsMetrics(),
    getAlertDetails: () => this.getAlertDetails(),
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

  // ─── Business Performance ─────────────────────────────────────────────────────

  public getBusinessPerformance(period: PlatformPeriod = '30d', planId?: string): PlatformBusinessPerformance {
    return business.getBusinessPerformance(this.ctx, period, planId);
  }

  // ─── Customer Metrics ─────────────────────────────────────────────────────────

  public getCustomerMetrics(planId?: string): PlatformCustomerMetrics {
    return customers.getCustomerMetrics(this.ctx, planId);
  }

  // ─── Subscription Metrics ─────────────────────────────────────────────────────

  public getSubscriptionMetrics(): PlatformSubscriptionMetrics {
    return subscriptions.getSubscriptionMetrics(this.ctx);
  }

  // ─── License Metrics ──────────────────────────────────────────────────────────

  public getLicenseMetrics(): PlatformLicenseMetrics {
    return licenses.getLicenseMetrics(this.ctx);
  }

  // ─── Operations Metrics ───────────────────────────────────────────────────────

  public getOperationsMetrics(): PlatformOperationsMetrics {
    return operations.getOperationsMetrics(this.ctx);
  }

  // ─── Overview ─────────────────────────────────────────────────────────────────

  public getOverviewWithPeriod(period: PlatformPeriod = '30d', planId?: string): PlatformOverview {
    return overview.getOverviewWithPeriod(this.ctx, period, planId);
  }

  // ─── Alerts ───────────────────────────────────────────────────────────────────

  public getAlertDetails(): PlatformAlertDetail[] {
    return alerts.getAlertDetails(this.ctx);
  }
}

export const platformAnalyticsService = new PlatformAnalyticsService();
