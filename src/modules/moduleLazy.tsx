import React, { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { Navigate } from 'react-router-dom';
import { DEPLOYMENT_MODULES } from './featureModuleLoader';
import { ensureModuleInstalled } from './moduleInstaller';

type AnyComponent = ComponentType<any>;

const ModuleNotDeployed: React.FC = () => <Navigate to="/dashboard" replace />;

const ModuleUnavailable: React.FC<{ moduleId: string; reason: string }> = ({ moduleId, reason }) => (
  <div role="alert" dir="rtl" style={{ padding: 24 }}>
    <h2>تعذّر تحميل الوحدة</h2>
    <p>لم يتم تنزيل الوحدة «{moduleId}» أو التحقق منها: {reason}</p>
    <p>تأكد من الاتصال بالإنترنت وأن اشتراكك يتضمن هذه الوحدة، ثم أعد المحاولة.</p>
    <a href="#/dashboard">العودة للوحة التحكم</a>
  </div>
);

/**
 * `React.lazy` for a page owned by a feature module.
 *
 * - Module not in this deployment: resolves to a redirect and imports nothing.
 *   The `ceramisys-feature-modules` Vite plugin also nulls the importer at
 *   build time so the chunk is never emitted (`stripExcludedModuleImports`).
 * - Downloadable-module build (`CERAMISYS_MODULE_PACKAGES=1`): the module's
 *   signed package is installed by the desktop shell before the import runs.
 */
export function moduleLazy<T extends AnyComponent>(
  moduleId: string,
  importer: (() => Promise<{ default: T }>) | null,
): LazyExoticComponent<T> {
  if (!importer || !DEPLOYMENT_MODULES.enabled.includes(moduleId)) {
    return lazy(async () => ({ default: ModuleNotDeployed as unknown as T }));
  }
  if (typeof __CERAMISYS_MODULE_PACKAGES__ === 'boolean' && __CERAMISYS_MODULE_PACKAGES__) {
    return lazy(async () => {
      const result = await ensureModuleInstalled(moduleId);
      if (!result.ok) {
        const Unavailable: React.FC = () => <ModuleUnavailable moduleId={moduleId} reason={result.reason} />;
        return { default: Unavailable as unknown as T };
      }
      return importer();
    });
  }
  return lazy(importer);
}
