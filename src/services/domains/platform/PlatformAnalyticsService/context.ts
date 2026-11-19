import type { DatabaseManager } from '../../../../database/repositories/databaseManager';
import type {
  PlatformPeriod,
  PlatformBusinessPerformance,
  PlatformCustomerMetrics,
  PlatformSubscriptionMetrics,
  PlatformLicenseMetrics,
  PlatformOperationsMetrics,
  PlatformAlertDetail,
} from '../platformTypes';

export type RequirePlatformAccessFn = (modules: string | string[], action?: string) => any;

export interface AnalyticsServiceContext {
  db: DatabaseManager;
  requirePlatformAccess: RequirePlatformAccessFn;
  getBusinessPerformance: (period?: PlatformPeriod, planId?: string) => PlatformBusinessPerformance;
  getCustomerMetrics: (planId?: string) => PlatformCustomerMetrics;
  getSubscriptionMetrics: () => PlatformSubscriptionMetrics;
  getLicenseMetrics: () => PlatformLicenseMetrics;
  getOperationsMetrics: () => PlatformOperationsMetrics;
  getAlertDetails: () => PlatformAlertDetail[];
}
