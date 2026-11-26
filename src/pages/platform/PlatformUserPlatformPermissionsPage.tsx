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
  const [scopeMode, setScopeMode] = React.useState<'global' | 'tenant' | 'multi' | 'plan'>('global');
  const [selectedTenantId, setSelectedTenantId] = React.useState<string>('');
  const [selectedTenantIds, setSelectedTenantIds] = React.useState<string[]>([]);
  const [selectedPlanId, setSelectedPlanId] = React.useState<string>('');
  const [tenantSearch, setTenantSearch] = React.useState<string>('');
  const [tenants, setTenants] = React.useState<Array<{ id: string; name?: string; companyName?: string }>>([]);
  const [plans, setPlans] = React.useState<Array<{ id: string; name?: string }>>([]);
  const [config, setConfig] = React.useState<FeatureConfigData>(EMPTY_CONFIG);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    Promise.all([
      centralPlatformClient.listTenants().catch(() => []),
      centralPlatformClient.listPlans().catch(() => []),
    ]).then(([tenantRows, planRows]) => {
      if (Array.isArray(tenantRows)) setTenants(tenantRows as Array<{ id: string; name?: string; companyName?: string }>);
      if (Array.isArray(planRows)) setPlans(planRows as Array<{ id: string; name?: string }>);
    });
  }, []);

  const scope = React.useMemo(() => {
    if (scopeMode === 'tenant' && selectedTenantId) {
      return { tenantId: selectedTenantId, planId: null as string | null };
    }
    if (scopeMode === 'multi' && selectedTenantIds.length > 0) {
      // Load effective config from the first selected tenant as a starting template
      return { tenantId: selectedTenantIds[0], planId: null as string | null };
    }
    if (scopeMode === 'plan' && selectedPlanId) {
      return { tenantId: null as string | null, planId: selectedPlanId };
    }
    return { tenantId: null as string | null, planId: null as string | null };
  }, [scopeMode, selectedTenantId, selectedTenantIds, selectedPlanId]);

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
      if (scopeMode === 'multi') {
        if (selectedTenantIds.length === 0) {
          throw new Error('يرجى تحديد عميل واحد على الأقل للتطبيق.');
        }
        await Promise.all(
          selectedTenantIds.map((tid) =>
            centralPlatformClient.setFeaturePermissions({
              tenantId: tid,
              planId: null,
              ...payload,
            })
          )
        );
        toast.success(`تم حفظ إعدادات الصلاحيات لـ ${selectedTenantIds.length} عملاء على السيرفر المركزي`);
      } else {
        await centralPlatformClient.setFeaturePermissions({
          tenantId: scope.tenantId,
          planId: scope.planId,
          ...payload,
        });
        toast.success('تم حفظ إعدادات الصلاحيات على السيرفر المركزي');
      }
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'تعذر حفظ الإعدادات على السيرفر المركزي.');
      throw saveError;
    } finally {
      setLoading(false);
    }
  };

  const scopeLabel =
    scopeMode === 'multi'
      ? `عدة عملاء (${selectedTenantIds.length})`
      : scope.tenantId
        ? `عميل ${scope.tenantId}`
        : scope.planId
          ? `باقة ${scope.planId}`
          : 'النطاق العام (كل العملاء)';

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
                <select
                  value={scopeMode}
                  onChange={(e) => setScopeMode(e.target.value as 'global' | 'tenant' | 'multi' | 'plan')}
                  className="rounded border border-line-strong bg-surface px-2 py-1 text-xs text-ink"
                >
                  <option value="global">النطاق العام (كل العملاء)</option>
                  <option value="tenant">عميل محدد</option>
                  <option value="multi">عدة عملاء معاً</option>
                  <option value="plan">باقة محددة</option>
                </select>

                {scopeMode === 'tenant' && (
                  <select
                    value={selectedTenantId}
                    onChange={(e) => setSelectedTenantId(e.target.value)}
                    className="w-64 rounded border border-line-strong bg-surface px-2 py-1 text-xs text-ink"
                  >
                    <option value="">-- اختر العميل --</option>
                    {tenants.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.companyName || t.name || t.id} ({t.id})
                      </option>
                    ))}
                  </select>
                )}

                {scopeMode === 'plan' && (
                  <select
                    value={selectedPlanId}
                    onChange={(e) => setSelectedPlanId(e.target.value)}
                    className="w-64 rounded border border-line-strong bg-surface px-2 py-1 text-xs text-ink"
                  >
                    <option value="">-- اختر الباقة --</option>
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name || p.id} ({p.id})
                      </option>
                    ))}
                  </select>
                )}

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
              {scopeMode === 'multi' && (
                <div className="mt-3 rounded-xl border border-line bg-surface-muted/40 p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-ink">
                      اختر العملاء المراد تطبيق الإعدادات عليهم ({selectedTenantIds.length} محدد):
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        value={tenantSearch}
                        onChange={(e) => setTenantSearch(e.target.value)}
                        placeholder="بحث عن عميل..."
                        className="w-48 rounded border border-line-strong bg-surface px-2 py-1 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => setSelectedTenantIds(tenants.map((t) => t.id))}
                        className="rounded border border-line px-2 py-0.5 text-[11px] text-ink hover:bg-surface"
                      >
                        تحديد الكل
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedTenantIds([])}
                        className="rounded border border-line px-2 py-0.5 text-[11px] text-ink hover:bg-surface"
                      >
                        إلغاء التحديد
                      </button>
                    </div>
                  </div>
                  <div className="grid max-h-36 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2 md:grid-cols-3">
                    {tenants
                      .filter((t) => {
                        const q = tenantSearch.trim().toLowerCase();
                        if (!q) return true;
                        return (
                          t.id.toLowerCase().includes(q) ||
                          (t.name || '').toLowerCase().includes(q) ||
                          (t.companyName || '').toLowerCase().includes(q)
                        );
                      })
                      .map((t) => {
                        const checked = selectedTenantIds.includes(t.id);
                        return (
                          <label
                            key={t.id}
                            className="flex cursor-pointer items-center gap-2 rounded border border-line bg-surface px-2 py-1 text-xs hover:bg-surface-muted"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) =>
                                setSelectedTenantIds((prev) =>
                                  e.target.checked ? [...prev, t.id] : prev.filter((id) => id !== t.id)
                                )
                              }
                            />
                            <span className="truncate">{t.companyName || t.name || t.id}</span>
                          </label>
                        );
                      })}
                  </div>
                </div>
              )}
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
