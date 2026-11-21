import React from 'react';
import { CloudOff } from 'lucide-react';
import { centralPlatformClient } from '../../../services/domains/platform/CentralPlatformClient';
import { PLATFORM_MODULE_TO_REGISTRY_IDS } from '../../../config/platformModuleMap';
import type {
  PlatformTenant,
  PlatformTenantOverride,
  PlatformTenantProfile,
} from '../../../services/domains/platform/platformTypes';
import type { FeatureConfigData } from '../components/access/featureConfigDraft';
import { featureHiddenPathsForPlan, type PageOwnerFeature } from '../components/access/pageAccessRules';
import { AccessPagesEditor } from '../components/access/AccessPagesEditor';
import { PermissionLimitsEditor } from '../components/access/PermissionLimitsEditor';
import { useToast } from '../../../components/ui/Toast';

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

interface AccessTabProps {
  tenant: PlatformTenant;
  profile: PlatformTenantProfile | null;
  overrides: PlatformTenantOverride[];
  canManageTenants: boolean;
}

/**
 * «الوصول والصفحات» — per-tenant editor for the signed tenant configuration:
 * hidden menus, per-page capability flags, disabled granular permissions and
 * platform permission limits. Everything persists in tenant_feature_config /
 * tenant_permission_limits on the central server.
 */
export const AccessTab: React.FC<AccessTabProps> = ({ tenant, profile, overrides, canManageTenants }) => {
  const toast = useToast();
  const [effectiveConfig, setEffectiveConfig] = React.useState<FeatureConfigData>({
    hiddenMenus: [],
    disabledPermissions: [],
    featurePermissions: [],
  });
  const [featureFlags, setFeatureFlags] = React.useState<PageOwnerFeature[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [effective, flags] = await Promise.all([
        centralPlatformClient.getEffectiveFeaturePermissions(tenant.id),
        centralPlatformClient.listFeatureFlags().catch(() => [] as any[]),
      ]);
      setEffectiveConfig(effective.effective);
      setFeatureFlags((Array.isArray(flags) ? flags : []).map(normalizeFlag).filter((f) => f.code));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'تعذر تحميل إعدادات الوصول.');
    } finally {
      setLoading(false);
    }
  }, [tenant.id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  // ─── Effective gating inputs (plan defaults + tenant overrides) ──────────

  const registryToPlatformCodes = React.useMemo(() => {
    const map = new Map<string, string[]>();
    for (const [code, registryIds] of Object.entries(PLATFORM_MODULE_TO_REGISTRY_IDS)) {
      for (const registryId of registryIds) {
        const list = map.get(registryId) ?? [];
        list.push(code);
        map.set(registryId, list);
      }
    }
    return map;
  }, []);

  const { moduleCodes, featureCodes } = React.useMemo(() => {
    const modules = new Set<string>(profile?.plan?.includedModules ?? []);
    const features = new Set<string>(profile?.plan?.features ?? []);
    for (const override of overrides) {
      const code = String(override.code || '');
      if (!code) continue;
      if (override.kind === 'MODULE') {
        if (override.isEnabled) modules.add(code);
        else modules.delete(code);
      } else if (override.kind === 'FEATURE') {
        if (override.isEnabled) features.add(code);
        else features.delete(code);
      }
    }
    return { moduleCodes: modules, featureCodes: features };
  }, [profile?.plan, overrides]);

  const featureHiddenPaths = React.useMemo(
    () => new Set(featureHiddenPathsForPlan(featureFlags, featureCodes)),
    [featureFlags, featureCodes]
  );

  const gating = React.useMemo(
    () => ({ featureHiddenPaths, moduleCodes, registryToPlatformCodes }),
    [featureHiddenPaths, moduleCodes, registryToPlatformCodes]
  );

  const saveAccessConfig = async (payload: {
    hiddenMenus: string[];
    disabledPermissions: string[];
    featurePermissions: Array<Record<string, unknown>>;
  }) => {
    await centralPlatformClient.setFeaturePermissions({
      tenantId: tenant.id,
      planId: null,
      ...payload,
    });
    toast.success('تم حفظ إعدادات وصول الصفحات', tenant.name);
    await load();
  };

  if (loading && !loadError) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-sm font-semibold text-muted">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-success" />
        جارٍ تحميل إعدادات الوصول...
      </div>
    );
  }

  if (loadError) {
    return (
      <div role="alert" className="rounded-xl border border-danger-border bg-danger-soft px-4 py-3 text-[12px] font-semibold text-danger">
        {loadError}
        <button type="button" onClick={() => void load()} className="mr-3 text-success hover:underline">
          إعادة المحاولة
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-xl border border-line bg-surface-muted/60 px-4 py-3 text-[11.5px] font-semibold text-ink-secondary">
        <CloudOff className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
        <span>
          تُحفظ التعديلات في <code className="font-mono">tenant_feature_config</code> بنطاق هذا العميل فقط، وتُدمج
          مع الإعدادات العامة وإعدادات الباقة (إعداد العميل يتقدم). يصل التغيير لتطبيق العميل عبر التكوين الموقّع عند
          أول مزامنة/إقلاع.
        </span>
      </div>

      <AccessPagesEditor
        key={tenant.id}
        initialConfig={effectiveConfig}
        gating={gating}
        onSave={saveAccessConfig}
        canManage={canManageTenants}
        scopeLabel={tenant.name}
      />

      <PermissionLimitsEditor tenantId={tenant.id} scopeLabel={tenant.name} canManage={canManageTenants} />
    </div>
  );
};

export default AccessTab;
