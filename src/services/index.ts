/**
 * مركز تجميع الخدمات الأمنية والأداء
 */

export { auditLogger } from './domains/security/auditLogger';
export type { AuditLog, SecurityEvent } from './domains/security/auditLogger';
export { localCache } from './shared/localCacheService';
export type { CacheOptions } from './shared/localCacheService';
export { twoFactorAuth } from './domains/auth/twoFactorAuth';
export type { TwoFactorSetup, TwoFactorConfig } from './domains/auth/twoFactorAuth';
export { SecurityService, securityService } from './domains/security/SecurityService';
export { performanceMonitor } from './shared/performanceMonitor';
export type { PerformanceMetrics, Alert } from './shared/performanceMonitor';
export { systemHealth } from './shared/systemHealthService';
export type { HealthScore, HealthAlert, HealthMetrics, SystemHealthReport } from './shared/systemHealthService';
export { CentralLicenseService } from './domains/licensing/CentralLicenseService';
export { CentralTelemetryService } from './domains/licensing/CentralTelemetryService';
export type { ReleaseInfo } from './domains/licensing/CentralTelemetryService';
export { getLatestNewerRelease, isNewerVersion } from './domains/licensing/CentralTelemetryService';
