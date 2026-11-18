import React, { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from '../layouts/MainLayout';
import type { User } from '../types';
import { S } from './RouteGuard';
import { getPersistedLocation } from './navigationPersistence';
import { resolveUserLandingPath } from './userLanding';
import { appRoutes } from './routesList';

// Platform admin pages are only needed by platform staff; loading them lazily
// keeps ~30 heavy pages out of the main entry chunk for regular ERP users.
const PlatformRoutes = React.lazy(() => import('../pages/platform/PlatformRoutes'));

export interface AppRouterProps {
  currentUser: User;
  onLogout: () => void;
  onSwitchUser: (userId: string) => void;
}

export const AppRouter: React.FC<AppRouterProps> = ({ currentUser, onLogout, onSwitchUser }) => {
  return (
    <Routes>
      <Route
        path="/platform/*"
        element={
          <Suspense fallback={null}>
            <PlatformRoutes currentUser={currentUser} onLogout={onLogout} onSwitchUser={onSwitchUser} />
          </Suspense>
        }
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
          element={
            <Navigate
              to={resolveUserLandingPath(currentUser, getPersistedLocation(currentUser.id))}
              replace
            />
          }
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
