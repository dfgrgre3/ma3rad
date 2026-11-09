import React, { Suspense, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { SettingsService } from '../services/config/SettingsService';
import { getEffectiveBusinessType } from '../services/config/BusinessTypeService';
import { AppConfigService } from '../services/config/AppConfigService';
import { ConfigText } from '../components/config/ConfigText';
import { getBusinessModuleForPath, parseBusinessConfiguration, parseEnabledModules } from '../config/businessProfiles';
import { withModuleDependencies } from '../config/moduleRegistry';
import { OPEN_ALL_PAGES } from '../config/setupLifecycle';
import { CentralLicenseService } from '../services/licensing/CentralLicenseService';
import { CentralFeaturePermissionService } from '../services/licensing/CentralFeaturePermissionService';
import { PermissionService } from '../services/auth/PermissionService';
import type { User } from '../types';

export const PageLoader: React.FC = () => (
  <div className="flex-1 flex items-center justify-center h-full">
    <div className="flex flex-col items-center gap-3">
      <div className="w-7 h-7 border-2 border-slate-200 border-t-sky-600 rounded-full animate-spin" />
      <p className="text-xs text-slate-500 font-medium">
        <ConfigText k="shell.loading" fallback="جاري التحميل..." />
      </p>
    </div>
  </div>
);

interface ModuleGuardProps {
  currentUser: User;
  children: React.ReactNode;
}

export const ModuleGuard: React.FC<ModuleGuardProps> = ({ currentUser, children }) => {
  const { pathname } = useLocation();
  const businessType = getEffectiveBusinessType();
  const modules = withModuleDependencies(parseEnabledModules(SettingsService.getValue('enabledModules'), businessType));
  const businessConfig = parseBusinessConfiguration(SettingsService.getValue('businessProfileConfig'), businessType);
  const moduleId = getBusinessModuleForPath(pathname);

  // يحدّث المسار الحالي لطبقة الصلاحيات غير المرتبطة بـ React (أزرار/إجراءات).
  // يُضبط أثناء الرسم حتى تُقيَّم صلاحيات أبناء الصفحة في نفس الدورة، ويُثبَّت
  // بعد الالتزام (useEffect) ليبقى صحيحًا مع التنقل/الإعادة.
  CentralFeaturePermissionService.setCurrentPath(pathname);
  useEffect(() => {
    CentralFeaturePermissionService.setCurrentPath(pathname);
  }, [pathname]);

  if (!PermissionService.canAccessPage(currentUser, pathname)) {
    return (
      <div role="alert" className="flex h-full items-center justify-center p-6 text-sm font-semibold text-slate-600">
        ليس لديك صلاحية للوصول إلى هذه الصفحة.
      </div>
    );
  }

  // وضع التشغيل المحلي: فتح كل الصفحات دون أي بوابة (وحدات/مظهر/قيود مركزية).
  if (OPEN_ALL_PAGES) {
    return <Suspense fallback={<PageLoader />}><div key={pathname} className="page-transition-wrapper min-h-full w-full">{children}</div></Suspense>;
  }

  // Central license/config gating (best-effort, cached)
  const centralCfg = CentralLicenseService.getCachedConfig();
  const allowedModules = centralCfg?.config?.allowedModules;

  if (!CentralFeaturePermissionService.isPageVisible(pathname)) {
    return <Navigate to="/dashboard" replace />;
  }
  if (allowedModules && Array.isArray(allowedModules) && moduleId && !allowedModules.includes(moduleId)) {
    return <Navigate to="/dashboard" replace />;
  }

  if (!AppConfigService.isPageEnabled(pathname)) {
    return <Navigate to="/dashboard" replace />;
  }
  if (moduleId && (!modules.includes(moduleId) || (moduleId === 'inventory' && !businessConfig.trackInventory))) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Suspense fallback={<PageLoader />}><div key={pathname} className="page-transition-wrapper min-h-full w-full">{children}</div></Suspense>;
};

// Shorthand alias for concise route definitions
export const S = ModuleGuard;
