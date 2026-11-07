import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from '../layouts/MainLayout';
import type { User } from '../types';
import { S } from './RouteGuard';
import { getPersistedLocation } from './navigationPersistence';
import { appRoutes } from './routesList';

export interface AppRouterProps {
  currentUser: User;
  onLogout: () => void;
  onSwitchUser: (userId: string) => void;
}

export const AppRouter: React.FC<AppRouterProps> = ({ currentUser, onLogout, onSwitchUser }) => (
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

export default AppRouter;
