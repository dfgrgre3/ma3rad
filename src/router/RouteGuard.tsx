import React, { Suspense } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { SettingsService } from '../services/SettingsService';
import { getBusinessModuleForPath, parseBusinessConfiguration, parseEnabledModules } from '../config/businessProfiles';
import { withModuleDependencies } from '../config/moduleRegistry';

export const PageLoader: React.FC = () => (
  <div className="flex-1 flex items-center justify-center h-full">
    <div className="flex flex-col items-center gap-3">
      <div className="w-8 h-8 rounded-xl bg-sky-600 animate-bounce shadow-lg shadow-sky-500/20" />
      <p className="text-xs text-slate-500 font-medium">جاري التحميل...</p>
    </div>
  </div>
);

interface ModuleGuardProps {
  children: React.ReactNode;
}

export const ModuleGuard: React.FC<ModuleGuardProps> = ({ children }) => {
  const { pathname } = useLocation();
  const businessType = SettingsService.getValue('businessType') || 'ceramics';
  const modules = withModuleDependencies(parseEnabledModules(SettingsService.getValue('enabledModules'), businessType));
  const businessConfig = parseBusinessConfiguration(SettingsService.getValue('businessProfileConfig'), businessType);
  const moduleId = getBusinessModuleForPath(pathname);

  if (moduleId && (!modules.includes(moduleId) || (moduleId === 'inventory' && !businessConfig.trackInventory))) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Suspense fallback={<PageLoader />}>{children}</Suspense>;
};

// Shorthand alias for concise route definitions
export const S = ModuleGuard;
