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

export interface AppRouterProps {
  currentUser: User;
  onLogout: () => void;
  onSwitchUser: (userId: string) => void;
}

const PlatformRoutes: React.FC<AppRouterProps> = ({ currentUser, onLogout }) => (
  <Routes>
    <Route
      path="/platform"
      element={<PlatformLayout currentUser={currentUser} onLogout={onLogout} />}
    >
      <Route index element={<PlatformDashboardPage />} />
      <Route path="tenants" element={<PlatformTenantsPage />} />
      <Route path="licenses" element={<PlatformLicensesPage />} />
      <Route path="billing" element={<PlatformBillingPage />} />
      <Route path="plans" element={<PlatformPlansPage />} />
      <Route path="product" element={<PlatformProductPage />} />
      <Route path="audit" element={<PlatformAuditPage />} />
      <Route path="settings" element={<PlatformSettingsPage currentUser={currentUser} />} />
      <Route path="activity" element={<PlatformActivitySettingsPage />} />
      <Route path="operations" element={<PlatformOperationsSettingsPage />} />
      <Route path="branding" element={<PlatformBrandingSettingsPage />} />
      <Route path="customization" element={<PlatformCustomizationSettingsPage />} />
      <Route path="app-configuration" element={<PlatformAppConfigurationPage />} />
      <Route path="system-health" element={<PlatformSystemHealthPage />} />
      <Route path="platform-health" element={<PlatformHealthPage />} />
      <Route path="support" element={<PlatformSupportPage />} />
      <Route path="devices" element={<PlatformDevicesPage />} />
      <Route path="admin-control" element={<PlatformAdminControlPage />} />
      <Route path="security-center" element={<PlatformSecurityCenterPage />} />
    </Route>
    {/* The platform owner has no tenant workspace: send every other path home. */}
    <Route path="*" element={<Navigate to="/platform" replace />} />
  </Routes>
);

export const AppRouter: React.FC<AppRouterProps> = ({ currentUser, onLogout, onSwitchUser }) => {
  if (currentUser.role === 'SUPER_ADMIN') {
    return <PlatformRoutes currentUser={currentUser} onLogout={onLogout} onSwitchUser={onSwitchUser} />;
  }

  return (
    <Routes>
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
