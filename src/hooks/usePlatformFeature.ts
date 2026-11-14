import { useEffect, useState } from 'react';
import { platformAdminService } from '../services/domains/platform/PlatformAdminService';

/**
 * Lightweight client-side guard for platform feature flags.
 * Returns true when the flag is enabled (and, when a rollout percentage is
 * set, the current session falls inside the rollout).
 *
 * Usage:
 *   const canExport = usePlatformFeature('sales.export');
 *   {canExport && <Button ... />}
 *
 * NOTE: hiding a button is only the first layer. For real enforcement the same
 * check must also gate the underlying service/action.
 */
export function usePlatformFeature(code: string): boolean {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    try {
      const flag = platformAdminService.listFeatureFlagsForRuntime().find((item) => item.code === code);
      if (!flag) {
        setEnabled(true);
        return;
      }
      if (!flag.isEnabled) {
        setEnabled(false);
        return;
      }
      if (flag.rolloutPercent >= 100) {
        setEnabled(true);
        return;
      }
      // Deterministic rollout based on the current user id (falls back to "on").
      const user = (window as any)?.__ceramisysUser?.id ?? 'anonymous';
      let hash = 0;
      for (let index = 0; index < user.length; index += 1) {
        hash = (hash * 31 + user.charCodeAt(index)) >>> 0;
      }
      setEnabled(hash % 100 < flag.rolloutPercent);
    } catch {
      setEnabled(true);
    }
  }, [code]);

  return enabled;
}

export function usePlatformModule(code: string): boolean {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    try {
      const module = platformAdminService.listModulesForRuntime().find((item) => item.code === code);
      setEnabled(module ? module.isEnabled : true);
    } catch {
      setEnabled(true);
    }
  }, [code]);

  return enabled;
}
