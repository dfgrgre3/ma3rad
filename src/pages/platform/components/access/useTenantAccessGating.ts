import React from 'react';
import { centralPlatformClient } from '../../../../services/domains/platform/CentralPlatformClient';
import { PLATFORM_MODULE_TO_REGISTRY_IDS } from '../../../../config/platformModuleMap';
import type { PageOwnerFeature } from './pageAccessRules';
import { featureHiddenPathsForPlan } from './pageAccessRules';
import type { AccessGatingInput } from './AccessPagesEditor';

const jsonArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
};

const normalizeFlag = (row: any): PageOwnerFeature => ({
  code: String(row?.key ?? row?.code ?? row?.id ?? ''),
  pagePaths: jsonArray(row?.pagePaths ?? row?.page_paths),
});

export const buildRegistryToPlatformCodes = (): Map<string, string[]> => {
  const map = new Map<string, string[]>();
  for (const [code, registryIds] of Object.entries(PLATFORM_MODULE_TO_REGISTRY_IDS)) {
    for (const registryId of registryIds) {
      const list = map.get(registryId) ?? [];
      list.push(code);
      map.set(registryId, list);
    }
  }
  return map;
};

/** All platform module codes — used for scopes without a concrete entitlement set. */
export const ALL_MODULE_CODES = new Set(Object.keys(PLATFORM_MODULE_TO_REGISTRY_IDS));

export interface TenantAccessGating extends AccessGatingInput {
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Computes the effective module/feature gating for a tenant (plan defaults +
 * tenant overrides + feature flags) for the access/pages editors.
 */
export function useTenantAccessGating(tenantId: string | null): TenantAccessGating {
  const [gating, setGating] = React.useState<AccessGatingInput>({
    featureHiddenPaths: new Set<string>(),
    moduleCodes: ALL_MODULE_CODES,
    registryToPlatformCodes: buildRegistryToPlatformCodes(),
  });
  const [loading, setLoading] = React.useState(Boolean(tenantId));
  const [error, setError] = React.useState<string | null>(null);
  const [nonce, setNonce] = React.useState(0);

  React.useEffect(() => {
    if (!tenantId) {
      setGating({
        featureHiddenPaths: new Set<string>(),
        moduleCodes: ALL_MODULE_CODES,
        registryToPlatformCodes: buildRegistryToPlatformCodes(),
      });
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [profile, overrides, flags] = await Promise.all([
          centralPlatformClient.getTenantProfile(tenantId),
          centralPlatformClient.listTenantOverrides(tenantId).catch(() => [] as any[]),
          centralPlatformClient.listFeatureFlags().catch(() => [] as any[]),
        ]);
        if (cancelled) return;
        const modules = new Set<string>(profile?.plan?.includedModules ?? []);
        const features = new Set<string>(profile?.plan?.features ?? []);
        for (const override of overrides || []) {
          const code = String(override?.code || '');
          if (!code) continue;
          if (override.kind === 'MODULE') {
            if (override.isEnabled) modules.add(code);
            else modules.delete(code);
          } else if (override.kind === 'FEATURE') {
            if (override.isEnabled) features.add(code);
            else features.delete(code);
          }
        }
        const featureFlags = (Array.isArray(flags) ? flags : []).map(normalizeFlag).filter((f) => f.code);
        setGating({
          featureHiddenPaths: new Set(featureHiddenPathsForPlan(featureFlags, features)),
          moduleCodes: modules,
          registryToPlatformCodes: buildRegistryToPlatformCodes(),
        });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'تعذر تحميل بيانات بوابة الوصول.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId, nonce]);

  return { ...gating, loading, error, reload: () => setNonce((n) => n + 1) };
}

export default useTenantAccessGating;
