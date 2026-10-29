import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from '../layouts/MainLayout';
import type { User } from '../types';
import { S } from './RouteGuard';
import { appRoutes } from './routesList';

export interface AppRouterProps {
  currentUser: User;
  onLogout: () => void;
}

export const AppRouter: React.FC<AppRouterProps> = ({ currentUser, onLogout }) => (
  <Routes>
    <Route
      path="/"
      element={
        <MainLayout
          currentUser={currentUser}
          onLogout={onLogout}
        />
      }
    >
      <Route index element={<Navigate to="/dashboard" replace />} />
      <Route path="finance/debts" element={<Navigate to="/finance/other-receivables" replace />} />
      <Route path="crm" element={<Navigate to="/crm/dashboard" replace />} />

      {appRoutes.map((r) => (
        <Route key={r.path} path={r.path} element={<S>{r.element}</S>} />
      ))}
    </Route>
  </Routes>
);

export default AppRouter;
