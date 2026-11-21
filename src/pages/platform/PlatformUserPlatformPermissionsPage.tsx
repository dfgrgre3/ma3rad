import React from 'react';
import { PageHeader } from '../../components/ui/PageHeader';
import { centralPlatformClient } from '../../services/domains/platform/CentralPlatformClient';
import { AccessPagesEditor } from './components/access/AccessPagesEditor';
import { PermissionLimitsEditor } from './components/access/PermissionLimitsEditor';
import { useTenantAccessGating, ALL_MODULE_CODES, buildRegistryToPlatformCodes } from './components/access/useTenantAccessGating';
import type { FeatureConfigData } from './components/access/featureConfigDraft';
import { useToast } from '../../components/ui/Toast';

const EMPTY_CONFIG: FeatureConfigData = {
  hiddenMenus: [],
  disabledPermissions: [],
  featurePermissions: [],
};

/**
 * منصة المستخدمين — الصفحات والصلاحيات.
 *
 * Visual per-scope editor backed by the shared access module: it lists every
 * tenant-facing page, shows effective visibility (manual hide, feature gate,
 * module exclusion, permission restriction) and opens the per-page permission
 * editor. Persists to tenant_feature_config on the central server — never in
 * localStorage. Non-page permission codes are preserved automatically.
 */
export const PlatformUserPlatformPermissionsPage: React.FC = () => {
  const toast = useToast();
  const [tenantKey, setTenantKey] = React.useState<string>('global');
  const [config, setConfig] = React.useState<FeatureConfigData>(EMPTY_CONFIG);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const scope = React.useMemo(() => {
    const value = tenantKey.trim();
    if (!value || value === 'global') return { tenantId: null as string | null, planId: null as string | null };
    if (value.startsWith('plan:')) return { tenantId: null, planId: value.slice(5) };
    return { tenantId: value, planId: null };
  }, [tenantKey]);

  const tenantGating = useTenantAccessGating(scope.tenantId);
  const gating = React.useMemo(
    () =>
      scope.tenantId
        ? tenantGating
        : {
            featureHiddenPaths: new Set<string>(),
            moduleCodes: ALL_MODULE_CODES,
            registryToPlatformCodes: buildRegistryToPlatformCodes(),
          },
    [scope.tenantId, tenantGating]
  );

  const [configVersion, setConfigVersion] = React.useState(0);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (scope.tenantId) {
        const effective = await centralPlatformClient.getEffectiveFeaturePermissions(scope.tenantId);
        setConfig(effective.effective);
      } else {
        setConfig(await centralPlatformClient.getFeaturePermissions(scope));
      }
      setConfigVersion((v) => v + 1);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'تعذر قراءة إعدادات الصلاحيات من السيرفر المركزي.');
    } finally {
      setLoading(false);
    }
  }, [scope]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const save = async (payload: {
    hiddenMenus: string[];
    disabledPermissions: string[];
    featurePermissions: Array<Record<string, unknown>>;
  }) => {
    setLoading(true);
    setError(null);
    try {
      await centralPlatformClient.setFeaturePermissions({
        tenantId: scope.tenantId,
        planId: scope.planId,
        ...payload,
      });
      toast.success('تم حفظ إعدادات الصلاحيات على السيرفر المركزي');
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'تعذر حفظ الإعدادات على السيرفر المركزي.');
      throw saveError;
    } finally {
      setLoading(false);
    }
  };

  const scopeLabel = scope.tenantId ? `عميل ${scope.tenantId}` : scope.planId ? `باقة ${scope.planId}` : 'النطاق العام';

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
        <PageHeader
          bordered={false}
          title="منصة المستخدمين — الصفحات والصلاحيات"
          description="تحكم مرئي في صفحات وميزات كل عميل أو باقة أو النطاق العام: إظهار/إخفاء الصفحات، تقييد التعديل والحذف والتصدير داخل كل صفحة، وتعطيل صلاحيات دقيقة — محفوظ على السيرفر المركزي عبر التكوين الموقّع."
          meta={
            <>
              <p className="mt-1 text-xs text-muted">
                الصلاحيات على مستوى الموظف تُدار من صفحة «حسابات الموظفين»، وعلى مستوى الدور من مصفوفة الصلاحيات.
                الحماية الحقيقية تنفذها واجهات الـ API في الخادم المركزي (requirePlatformPermission / requireTenantScope)
                وفي خدمة التفويض المحلية — إخفاء القائمة وحده ليس حماية.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <label className="font-semibold text-ink">نطاق الإعدادات:</label>
                <input
                  value={tenantKey}
                  onChange={(e) => setTenantKey(e.target.value || 'global')}
                  className="w-64 rounded border border-line-strong px-2 py-1 text-xs"
                  placeholder="global أو tenantId أو plan:<planId>"
                  dir="ltr"
                />
                <span className="text-[11px] text-muted">{scopeLabel}</span>
                <button
                  type="button"
                  onClick={() => void load()}
                  disabled={loading}
                  className="rounded border border-line-strong px-2 py-1 text-xs text-ink hover:bg-surface-muted disabled:opacity-50"
                >
                  {loading ? 'جارٍ التحميل…' : 'إعادة التحميل'}
                </button>
              </div>
              {error && <div role="alert" className="mt-3 rounded border border-danger-border bg-danger-soft p-2 text-xs text-danger">{error}</div>}
              <div className="mt-2 text-[11px] text-muted">
                مسارات مخفية: {config.hiddenMenus?.length ?? 0} · صلاحيات معطلة: {config.disabledPermissions?.length ?? 0} · قيود صفحات: {config.featurePermissions?.length ?? 0}
              </div>
            </>
          }
        />
      </header>

      {loading && !(config.hiddenMenus?.length || config.disabledPermissions?.length || config.featurePermissions?.length) ? (
        <div className="flex flex-col items-center gap-3 py-16 text-sm font-semibold text-muted">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-success" />
          جارٍ تحميل الصفحات...
        </div>
      ) : (
        <>
          <AccessPagesEditor
            key={`${scope.tenantId ?? 'global'}:${scope.planId ?? ''}:${configVersion}`}
            initialConfig={config}
            gating={gating}
            onSave={save}
            canManage
            scopeLabel={scopeLabel}
          />
          {scope.tenantId && (
            <PermissionLimitsEditor tenantId={scope.tenantId} scopeLabel={scopeLabel} canManage />
          )}
        </>
      )}
    </div>
  );
};

export default PlatformUserPlatformPermissionsPage;
