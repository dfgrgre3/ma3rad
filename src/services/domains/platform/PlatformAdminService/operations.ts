// Operations delegations → PlatformHealthService (health, backups, ops jobs,
// maintenance windows, approvals, sync), PlatformAnalyticsService
// (metrics/overview) and PlatformAuditService (audit queries).
import { platformHealthService } from '../PlatformHealthService';
import { platformAnalyticsService } from '../PlatformAnalyticsService';
import { platformAuditService } from '../PlatformAuditService';
import type {
  PlatformComprehensiveHealth,
  PlatformCentralBackup,
  PlatformServiceIncident,
  PlatformHealthDashboardData,
  PlatformOpsJob,
  PlatformMaintenanceWindow,
  PlatformOpApproval,
  PlatformSyncLogEntry,
  PlatformSyncStatus,
  PlatformPeriod,
  PlatformBusinessPerformance,
  PlatformCustomerMetrics,
  PlatformSubscriptionMetrics,
  PlatformLicenseMetrics,
  PlatformOperationsMetrics,
  PlatformOverview,
  PlatformAlertDetail,
  PlatformAuditEntry,
  PlatformAuditFilters,
  PlatformAuditPaginatedResult,
} from '../platformTypes';

export interface OperationsApi {
  // Health - Delegate to PlatformHealthService
  getPlatformComprehensiveHealth(): PlatformComprehensiveHealth;
  listCentralBackups(): PlatformCentralBackup[];
  triggerCentralBackup(): Promise<PlatformCentralBackup>;
  deleteCentralBackup(id: string): void;
  listServiceIncidents(status?: 'OPEN' | 'RESOLVED'): PlatformServiceIncident[];
  resolveServiceIncident(id: string): void;
  getPlatformHealthDashboard(): PlatformHealthDashboardData;
  // Operations - Delegate to PlatformHealthService (Ops Jobs, Maintenance, Approvals, Sync)
  listOpsJobs(filters?: { status?: string; tenantId?: string; type?: string; limit?: number; offset?: number }): { jobs: PlatformOpsJob[]; total: number };
  createOpsJob(input: { type: string; tenantId?: string; payload?: Record<string, unknown>; priority?: number; scheduledAt?: string }): PlatformOpsJob;
  cancelOpsJob(id: string): void;
  retryOpsJob(id: string): void;
  listMaintenanceWindows(filters?: { status?: string }): PlatformMaintenanceWindow[];
  createMaintenanceWindow(input: { title: string; description?: string; startsAt: string; endsAt: string; affectedServices?: string[] }): PlatformMaintenanceWindow;
  cancelMaintenanceWindow(id: string): void;
  listOpApprovals(filters?: { status?: string }): PlatformOpApproval[];
  requestOpApproval(input: { opType: string; opPayload?: Record<string, unknown> }): PlatformOpApproval;
  approveOp(id: string, notes?: string): void;
  rejectOp(id: string, notes?: string): void;
  listSyncStatus(filters?: { tenantId?: string; deviceId?: string; status?: string; limit?: number }): PlatformSyncLogEntry[];
  logSyncEvent(input: { tenantId?: string; deviceId?: string; syncType: string; status: PlatformSyncStatus; recordsSynced?: number; errorDetail?: string }): PlatformSyncLogEntry;
  // Analytics - Delegate to PlatformAnalyticsService
  getBusinessPerformance(period?: PlatformPeriod, planId?: string): PlatformBusinessPerformance;
  getCustomerMetrics(period?: PlatformPeriod, planId?: string): PlatformCustomerMetrics;
  getSubscriptionMetrics(period?: PlatformPeriod, planId?: string): PlatformSubscriptionMetrics;
  getLicenseMetrics(period?: PlatformPeriod, planId?: string): PlatformLicenseMetrics;
  getOperationsMetrics(period?: PlatformPeriod): PlatformOperationsMetrics;
  getOverview(): PlatformOverview;
  getOverviewWithPeriod(period?: PlatformPeriod, planId?: string): PlatformOverview;
  getAlertDetails(): PlatformAlertDetail[];
  // Audit - Delegate to PlatformAuditService
  listAudit(limit?: number, search?: string): PlatformAuditEntry[];
  queryAuditPaginated(filters?: PlatformAuditFilters): PlatformAuditPaginatedResult;
  queryAuditForExport(filters?: PlatformAuditFilters): PlatformAuditEntry[];
  verifyAuditIntegrity(): { isValid: boolean; checkedCount: number; brokenAtId?: string };
}

export function createOperationsApi(): OperationsApi {
  return {
    // Health - Delegate to PlatformHealthService
    getPlatformComprehensiveHealth() {
      return platformHealthService.getPlatformComprehensiveHealth();
    },

    listCentralBackups() {
      return platformHealthService.listCentralBackups();
    },

    async triggerCentralBackup() {
      return platformHealthService.triggerCentralBackup();
    },

    deleteCentralBackup(id: string) {
      platformHealthService.deleteCentralBackup(id);
    },

    listServiceIncidents(status?: 'OPEN' | 'RESOLVED') {
      return platformHealthService.listServiceIncidents(status);
    },

    resolveServiceIncident(id: string) {
      platformHealthService.resolveServiceIncident(id);
    },

    getPlatformHealthDashboard() {
      return platformHealthService.getPlatformHealthDashboard();
    },

    // Operations - Delegate to PlatformHealthService (Ops Jobs, Maintenance, Approvals, Sync)
    listOpsJobs(filters?: { status?: string; tenantId?: string; type?: string; limit?: number; offset?: number }) {
      return platformHealthService.listOpsJobs ? platformHealthService.listOpsJobs(filters) : { jobs: [], total: 0 };
    },

    createOpsJob(input: { type: string; tenantId?: string; payload?: Record<string, unknown>; priority?: number; scheduledAt?: string }) {
      return platformHealthService.createOpsJob ? platformHealthService.createOpsJob(input) : null as any;
    },

    cancelOpsJob(id: string) {
      if (platformHealthService.cancelOpsJob) platformHealthService.cancelOpsJob(id);
    },

    retryOpsJob(id: string) {
      if (platformHealthService.retryOpsJob) platformHealthService.retryOpsJob(id);
    },

    listMaintenanceWindows(filters?: { status?: string }) {
      return platformHealthService.listMaintenanceWindows ? platformHealthService.listMaintenanceWindows(filters) : [];
    },

    createMaintenanceWindow(input: { title: string; description?: string; startsAt: string; endsAt: string; affectedServices?: string[] }) {
      return platformHealthService.createMaintenanceWindow ? platformHealthService.createMaintenanceWindow(input) : null as any;
    },

    cancelMaintenanceWindow(id: string) {
      if (platformHealthService.cancelMaintenanceWindow) platformHealthService.cancelMaintenanceWindow(id);
    },

    listOpApprovals(filters?: { status?: string }) {
      return platformHealthService.listOpApprovals ? platformHealthService.listOpApprovals(filters) : [];
    },

    requestOpApproval(input: { opType: string; opPayload?: Record<string, unknown> }) {
      return platformHealthService.requestOpApproval ? platformHealthService.requestOpApproval(input) : null as any;
    },

    approveOp(id: string, notes?: string) {
      if (platformHealthService.approveOp) platformHealthService.approveOp(id, notes);
    },

    rejectOp(id: string, notes?: string) {
      if (platformHealthService.rejectOp) platformHealthService.rejectOp(id, notes);
    },

    listSyncStatus(filters?: { tenantId?: string; deviceId?: string; status?: string; limit?: number }) {
      return platformHealthService.listSyncStatus ? platformHealthService.listSyncStatus(filters) : [];
    },

    logSyncEvent(input: { tenantId?: string; deviceId?: string; syncType: string; status: PlatformSyncStatus; recordsSynced?: number; errorDetail?: string }) {
      return platformHealthService.logSyncEvent ? platformHealthService.logSyncEvent(input) : null as any;
    },

    // Analytics - Delegate to PlatformAnalyticsService
    getBusinessPerformance(period: PlatformPeriod = '30d', planId?: string) {
      return platformAnalyticsService.getBusinessPerformance(period, planId);
    },

    getCustomerMetrics(period: PlatformPeriod = '30d', planId?: string) {
      return platformAnalyticsService.getCustomerMetrics(planId);
    },

    getSubscriptionMetrics(period: PlatformPeriod = '30d', planId?: string) {
      return platformAnalyticsService.getSubscriptionMetrics();
    },

    getLicenseMetrics(period: PlatformPeriod = '30d', planId?: string) {
      return platformAnalyticsService.getLicenseMetrics();
    },

    getOperationsMetrics(period: PlatformPeriod = '30d') {
      return platformAnalyticsService.getOperationsMetrics();
    },

    getOverview() {
      return platformAnalyticsService.getOverviewWithPeriod('30d', undefined);
    },

    getOverviewWithPeriod(period: PlatformPeriod = '30d', planId?: string) {
      return platformAnalyticsService.getOverviewWithPeriod(period, planId);
    },

    getAlertDetails() {
      return platformAnalyticsService.getAlertDetails();
    },

    // Audit - Delegate to PlatformAuditService
    listAudit(limit = 200, search = '') {
      return platformAuditService.listAudit(limit, search);
    },

    queryAuditPaginated(filters: PlatformAuditFilters = {}) {
      return platformAuditService.queryAuditPaginated(filters);
    },

    queryAuditForExport(filters: PlatformAuditFilters = {}) {
      return platformAuditService.queryAuditForExport(filters);
    },

    verifyAuditIntegrity() {
      return platformAuditService.verifyAuditIntegrity();
    },
  };
}
