import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { PlatformLayout } from './PlatformLayout';
import type { User } from '../../types';

// Each platform page is lazy-loaded so the platform shell stays light and
// only the visited page's chunk is downloaded.
const PlatformDashboardPage = React.lazy(() => import('./PlatformDashboardPage').then(m => ({ default: m.PlatformDashboardPage })));
const PlatformTenantsPage = React.lazy(() => import('./PlatformTenantsPage').then(m => ({ default: m.PlatformTenantsPage })));
const PlatformLicensesPage = React.lazy(() => import('./PlatformLicensesPage').then(m => ({ default: m.PlatformLicensesPage })));
const PlatformBillingPage = React.lazy(() => import('./PlatformBillingPage').then(m => ({ default: m.PlatformBillingPage })));
const PlatformPlansPage = React.lazy(() => import('./PlatformPlansPage').then(m => ({ default: m.PlatformPlansPage })));
const PlatformProductPage = React.lazy(() => import('./PlatformProductPage').then(m => ({ default: m.PlatformProductPage })));
const PlatformAuditPage = React.lazy(() => import('./PlatformAuditPage').then(m => ({ default: m.PlatformAuditPage })));
const PlatformSettingsPage = React.lazy(() => import('./PlatformSettingsPage').then(m => ({ default: m.PlatformSettingsPage })));
const PlatformActivitySettingsPage = React.lazy(() => import('./PlatformActivitySettingsPage').then(m => ({ default: m.PlatformActivitySettingsPage })));
const PlatformOperationsSettingsPage = React.lazy(() => import('./PlatformOperationsSettingsPage').then(m => ({ default: m.PlatformOperationsSettingsPage })));
const PlatformBrandingSettingsPage = React.lazy(() => import('./PlatformBrandingSettingsPage').then(m => ({ default: m.PlatformBrandingSettingsPage })));
const PlatformCustomizationSettingsPage = React.lazy(() => import('./PlatformCustomizationSettingsPage').then(m => ({ default: m.PlatformCustomizationSettingsPage })));
const PlatformAppConfigurationPage = React.lazy(() => import('./PlatformAppConfigurationPage').then(m => ({ default: m.PlatformAppConfigurationPage })));
const PlatformSystemHealthPage = React.lazy(() => import('./PlatformSystemHealthPage').then(m => ({ default: m.PlatformSystemHealthPage })));
const PlatformHealthPage = React.lazy(() => import('./PlatformHealthPage').then(m => ({ default: m.PlatformHealthPage })));
const PlatformSupportPage = React.lazy(() => import('./PlatformSupportPage').then(m => ({ default: m.PlatformSupportPage })));
const PlatformDevicesPage = React.lazy(() => import('./PlatformDevicesPage').then(m => ({ default: m.PlatformDevicesPage })));
const PlatformAdminControlPage = React.lazy(() => import('./PlatformAdminControlPage').then(m => ({ default: m.PlatformAdminControlPage })));
const PlatformSecurityCenterPage = React.lazy(() => import('./PlatformSecurityCenterPage').then(m => ({ default: m.PlatformSecurityCenterPage })));
const PlatformStaffPage = React.lazy(() => import('./PlatformStaffPage').then(m => ({ default: m.PlatformStaffPage })));
const PlatformRolesPage = React.lazy(() => import('./PlatformRolesPage').then(m => ({ default: m.PlatformRolesPage })));
const PlatformReleasesPage = React.lazy(() => import('./PlatformReleasesPage').then(m => ({ default: m.PlatformReleasesPage })));
const PlatformSubscriptionsPage = React.lazy(() => import('./PlatformSubscriptionsPage').then(m => ({ default: m.PlatformSubscriptionsPage })));
const PlatformAnalyticsPage = React.lazy(() => import('./PlatformAnalyticsPage').then(m => ({ default: m.PlatformAnalyticsPage })));
const PlatformSyncMonitorPage = React.lazy(() => import('./PlatformSyncMonitorPage').then(m => ({ default: m.PlatformSyncMonitorPage })));
const PlatformBackupsPage = React.lazy(() => import('./PlatformBackupsPage').then(m => ({ default: m.PlatformBackupsPage })));
const PlatformIntegrationsPage = React.lazy(() => import('./PlatformIntegrationsPage').then(m => ({ default: m.PlatformIntegrationsPage })));
const PlatformNotificationsHubPage = React.lazy(() => import('./PlatformNotificationsHubPage').then(m => ({ default: m.PlatformNotificationsHubPage })));
const PlatformPoliciesPage = React.lazy(() => import('./PlatformPoliciesPage').then(m => ({ default: m.PlatformPoliciesPage })));
const PlatformEmergencyCenterPage = React.lazy(() => import('./PlatformEmergencyCenterPage').then(m => ({ default: m.PlatformEmergencyCenterPage })));
const PlatformCustomerPortalSimulatorPage = React.lazy(() => import('./PlatformCustomerPortalSimulatorPage').then(m => ({ default: m.PlatformCustomerPortalSimulatorPage })));
import { PlatformSuperAdminDashboard, PlatformUserPlatformPermissionsPage } from '../../router/lazyPages';
import { PlatformAuthorizationService } from '../../services/domains/platform/PlatformAuthorizationService';
import { PlatformStaffAuthService } from '../../services/domains/platform/PlatformStaffAuthService';

export interface PlatformRoutesProps {
  currentUser: User;
  onLogout: () => void;
  onSwitchUser: (userId: string) => void;
}

const PlatformRouteGuard: React.FC<{
  currentUser: User;
  targetModule: string;
  children: React.ReactElement;
}> = ({ currentUser, targetModule, children }) => {
  const permissionsOverride = PlatformStaffAuthService.getCurrentPermissionsOverride();
  // Granular page-level guard: every platform page declares its permission code.
  const allowed = PlatformAuthorizationService.canAccessRouteGranular(
    currentUser.role,
    `/platform/${targetModule}`,
    permissionsOverride,
  );
  if (!allowed) {
    return <Navigate to="/platform" replace />;
  }
  return children;
};

export const PlatformRoutes: React.FC<PlatformRoutesProps> = ({ currentUser, onLogout }) => {
  const isPlatformUser =
    currentUser.role === 'SUPER_ADMIN' ||
    ['PLATFORM_ADMIN', 'SUPPORT_AGENT', 'OPERATIONS_ENGINEER', 'BILLING_SPECIALIST', 'LICENSE_MANAGER'].includes(currentUser.role);

  if (!isPlatformUser) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <Routes>
      <Route
        path="/"
        element={<PlatformLayout currentUser={currentUser} onLogout={onLogout} />}
      >
        <Route index element={<PlatformDashboardPage />} />
        <Route
          path="super-admin"
          element={
            <PlatformRouteGuard currentUser={currentUser} targetModule="super-admin">
              <PlatformSuperAdminDashboard />
            </PlatformRouteGuard>
          }
        />
        <Route
          path="user-platform-permissions"
          element={
            <PlatformRouteGuard currentUser={currentUser} targetModule="super-admin">
              <PlatformUserPlatformPermissionsPage />
            </PlatformRouteGuard>
          }
        />
        <Route
          path="tenants"
          element={
            <PlatformRouteGuard currentUser={currentUser} targetModule="tenants">
              <PlatformTenantsPage />
            </PlatformRouteGuard>
          }
        />
        <Route
          path="licenses"
          element={
            <PlatformRouteGuard currentUser={currentUser} targetModule="licenses">
              <PlatformLicensesPage />
            </PlatformRouteGuard>
          }
        />
        <Route
          path="billing"
          element={
            <PlatformRouteGuard currentUser={currentUser} targetModule="billing">
              <PlatformBillingPage />
            </PlatformRouteGuard>
          }
        />
        <Route
          path="plans"
          element={
            <PlatformRouteGuard currentUser={currentUser} targetModule="plans">
              <PlatformPlansPage />
            </PlatformRouteGuard>
          }
        />
        <Route
          path="product"
          element={
            <PlatformRouteGuard currentUser={currentUser} targetModule="product">
              <PlatformProductPage />
            </PlatformRouteGuard>
          }
        />
        <Route
          path="audit"
          element={
            <PlatformRouteGuard currentUser={currentUser} targetModule="audit">
              <PlatformAuditPage />
            </PlatformRouteGuard>
          }
        />
        <Route
          path="settings"
          element={
            <PlatformRouteGuard currentUser={currentUser} targetModule="settings">
              <PlatformSettingsPage currentUser={currentUser} />
            </PlatformRouteGuard>
          }
        />
        <Route
          path="activity"
          element={
            <PlatformRouteGuard currentUser={currentUser} targetModule="activity">
              <PlatformActivitySettingsPage />
            </PlatformRouteGuard>
          }
        />
        <Route
          path="operations"
          element={
            <PlatformRouteGuard currentUser={currentUser} targetModule="operations">
              <PlatformOperationsSettingsPage />
            </PlatformRouteGuard>
          }
        />
        <Route
          path="branding"
          element={
            <PlatformRouteGuard currentUser={currentUser} targetModule="branding">
              <PlatformBrandingSettingsPage />
            </PlatformRouteGuard>
          }
        />
        <Route
          path="customization"
          element={
            <PlatformRouteGuard currentUser={currentUser} targetModule="customization">
              <PlatformCustomizationSettingsPage />
            </PlatformRouteGuard>
          }
        />
        <Route
          path="app-configuration"
          element={
            <PlatformRouteGuard currentUser={currentUser} targetModule="app-configuration">
              <PlatformAppConfigurationPage />
            </PlatformRouteGuard>
          }
        />
        <Route
          path="system-health"
          element={
            <PlatformRouteGuard currentUser={currentUser} targetModule="system-health">
              <PlatformSystemHealthPage />
            </PlatformRouteGuard>
          }
        />
        <Route
          path="platform-health"
          element={
            <PlatformRouteGuard currentUser={currentUser} targetModule="platform-health">
              <PlatformHealthPage />
            </PlatformRouteGuard>
          }
        />
        <Route
          path="support"
          element={
            <PlatformRouteGuard currentUser={currentUser} targetModule="support">
              <PlatformSupportPage />
            </PlatformRouteGuard>
          }
        />
        <Route
          path="devices"
          element={
            <PlatformRouteGuard currentUser={currentUser} targetModule="devices">
              <PlatformDevicesPage />
            </PlatformRouteGuard>
          }
        />
        <Route
          path="admin-control"
          element={
            <PlatformRouteGuard currentUser={currentUser} targetModule="admin-control">
              <PlatformAdminControlPage />
            </PlatformRouteGuard>
          }
        />
        <Route
          path="security-center"
          element={
            <PlatformRouteGuard currentUser={currentUser} targetModule="security-center">
              <PlatformSecurityCenterPage />
            </PlatformRouteGuard>
          }
        />
        <Route
          path="staff"
          element={
            <PlatformRouteGuard currentUser={currentUser} targetModule="staff">
              <PlatformStaffPage />
            </PlatformRouteGuard>
          }
        />
        <Route
          path="roles"
          element={
            <PlatformRouteGuard currentUser={currentUser} targetModule="roles">
              <PlatformRolesPage />
            </PlatformRouteGuard>
          }
        />
        <Route
          path="releases"
          element={
            <PlatformRouteGuard currentUser={currentUser} targetModule="releases">
              <PlatformReleasesPage />
            </PlatformRouteGuard>
          }
        />
        <Route
          path="subscriptions"
          element={
            <PlatformRouteGuard currentUser={currentUser} targetModule="subscriptions">
              <PlatformSubscriptionsPage />
            </PlatformRouteGuard>
          }
        />
        <Route
          path="analytics"
          element={
            <PlatformRouteGuard currentUser={currentUser} targetModule="analytics">
              <PlatformAnalyticsPage />
            </PlatformRouteGuard>
          }
        />
        <Route
          path="sync"
          element={
            <PlatformRouteGuard currentUser={currentUser} targetModule="sync">
              <PlatformSyncMonitorPage />
            </PlatformRouteGuard>
          }
        />
        <Route
          path="backups"
          element={
            <PlatformRouteGuard currentUser={currentUser} targetModule="backups">
              <PlatformBackupsPage />
            </PlatformRouteGuard>
          }
        />
        <Route
          path="integrations"
          element={
            <PlatformRouteGuard currentUser={currentUser} targetModule="integrations">
              <PlatformIntegrationsPage />
            </PlatformRouteGuard>
          }
        />
        <Route
          path="notifications"
          element={
            <PlatformRouteGuard currentUser={currentUser} targetModule="notifications">
              <PlatformNotificationsHubPage />
            </PlatformRouteGuard>
          }
        />
        <Route
          path="policies"
          element={
            <PlatformRouteGuard currentUser={currentUser} targetModule="policies">
              <PlatformPoliciesPage />
            </PlatformRouteGuard>
          }
        />
        <Route
          path="emergency"
          element={
            <PlatformRouteGuard currentUser={currentUser} targetModule="emergency">
              <PlatformEmergencyCenterPage />
            </PlatformRouteGuard>
          }
        />
        <Route
          path="customer-portal"
          element={
            <PlatformRouteGuard currentUser={currentUser} targetModule="customer-portal">
              <PlatformCustomerPortalSimulatorPage />
            </PlatformRouteGuard>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/platform" replace />} />
    </Routes>
  );
};

export default PlatformRoutes;
