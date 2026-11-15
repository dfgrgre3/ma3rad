import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from '../layouts/MainLayout';
import type { User } from '../types';
import { S } from './RouteGuard';
import { getPersistedLocation } from './navigationPersistence';
import { appRoutes } from './routesList';
import { PlatformLayout } from '../pages/platform/PlatformLayout';
import { PlatformDashboardPage } from '../pages/platform/PlatformDashboardPage';
import { PlatformTenantsPage } from '../pages/platform/PlatformTenantsPage';
import { PlatformLicensesPage } from '../pages/platform/PlatformLicensesPage';
import { PlatformBillingPage } from '../pages/platform/PlatformBillingPage';
import { PlatformPlansPage } from '../pages/platform/PlatformPlansPage';
import { PlatformProductPage } from '../pages/platform/PlatformProductPage';
import { PlatformAuditPage } from '../pages/platform/PlatformAuditPage';
import { PlatformSettingsPage } from '../pages/platform/PlatformSettingsPage';
import { PlatformActivitySettingsPage } from '../pages/platform/PlatformActivitySettingsPage';
import { PlatformOperationsSettingsPage } from '../pages/platform/PlatformOperationsSettingsPage';
import { PlatformBrandingSettingsPage } from '../pages/platform/PlatformBrandingSettingsPage';
import { PlatformCustomizationSettingsPage } from '../pages/platform/PlatformCustomizationSettingsPage';
import { PlatformAppConfigurationPage } from '../pages/platform/PlatformAppConfigurationPage';
import { PlatformSystemHealthPage } from '../pages/platform/PlatformSystemHealthPage';
import { PlatformHealthPage } from '../pages/platform/PlatformHealthPage';
import { PlatformSupportPage } from '../pages/platform/PlatformSupportPage';
import { PlatformDevicesPage } from '../pages/platform/PlatformDevicesPage';
import { PlatformAdminControlPage } from '../pages/platform/PlatformAdminControlPage';
import { PlatformSecurityCenterPage } from '../pages/platform/PlatformSecurityCenterPage';
import { PlatformStaffPage } from '../pages/platform/PlatformStaffPage';
import { PlatformRolesPage } from '../pages/platform/PlatformRolesPage';
import { PlatformReleasesPage } from '../pages/platform/PlatformReleasesPage';
import { PlatformSubscriptionsPage } from '../pages/platform/PlatformSubscriptionsPage';
import { PlatformAnalyticsPage } from '../pages/platform/PlatformAnalyticsPage';
import { PlatformSyncMonitorPage } from '../pages/platform/PlatformSyncMonitorPage';
import { PlatformBackupsPage } from '../pages/platform/PlatformBackupsPage';
import { PlatformIntegrationsPage } from '../pages/platform/PlatformIntegrationsPage';
import { PlatformNotificationsHubPage } from '../pages/platform/PlatformNotificationsHubPage';
import { PlatformPoliciesPage } from '../pages/platform/PlatformPoliciesPage';
import { PlatformEmergencyCenterPage } from '../pages/platform/PlatformEmergencyCenterPage';
import { PlatformCustomerPortalSimulatorPage } from '../pages/platform/PlatformCustomerPortalSimulatorPage';
import { PlatformSuperAdminDashboard } from './lazyPages';
import { PlatformAuthorizationService } from '../services/domains/platform/PlatformAuthorizationService';
import { PlatformStaffAuthService } from '../services/domains/platform/PlatformStaffAuthService';

export interface AppRouterProps {
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

const PlatformRoutes: React.FC<AppRouterProps> = ({ currentUser, onLogout }) => {
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

export const AppRouter: React.FC<AppRouterProps> = ({ currentUser, onLogout, onSwitchUser }) => {
  return (
    <Routes>
      <Route
        path="/platform/*"
        element={<PlatformRoutes currentUser={currentUser} onLogout={onLogout} onSwitchUser={onSwitchUser} />}
      />
      <Route
        path="/"
        element={
          <MainLayout
            currentUser={currentUser}
            onLogout={onLogout}
            onSwitchUser={onSwitchUser}
          />
        }
      >
        <Route
          index
          element={<Navigate to={getPersistedLocation(currentUser.id) ?? '/dashboard'} replace />}
        />
        <Route path="crm" element={<Navigate to="/crm/dashboard" replace />} />

        {appRoutes.map((r) => (
          <Route key={r.path} path={r.path} element={<S currentUser={currentUser}>{r.element}</S>} />
        ))}
      </Route>
    </Routes>
  );
};

export default AppRouter;
