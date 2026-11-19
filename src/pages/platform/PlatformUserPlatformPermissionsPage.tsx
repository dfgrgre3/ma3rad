import React from 'react';
import { DataTable } from '../../components/ui/DataTable';
import { GRANULAR_PERMISSIONS } from '../../config/permissionMatrix';
import { ROUTE_PERMISSIONS } from '../../config/routePermissions';
import { centralPlatformClient } from '../../services/domains/platform/CentralPlatformClient';
import type { TenantFeaturePermissions } from '../../services/domains/platform/PlatformAdminApiClient';

/**
 * منصة المستخدمين — الصفحات والصلاحيات.
 *
 * The hide/show rules configured here are persisted on the **central server**
 * (tenant_feature_config) through the Electron bridge — never in localStorage.
 * Enforcement does not stop at hiding a menu entry:
 *   - Tenant ERPs consume hiddenMenus / disabledPermissions / featurePermissions
 *     from the cached central licence config at activation/validation time.
 *   - The platform console enforces its own RBAC on the central server
 *     (requirePlatformPermission / requireTenantScope) and locally in
 *     PlatformAdminService (granular permission matrix, deny-by-default).
 *   - Per-user grants/denies are stored on the staff account
 *     (permissionsOverride) and enforced by PlatformAuthorizationService.
 */
export const PlatformUserPlatformPermissionsPage: React.FC = () => {
  const [tenantKey, setTenantKey] = React.useState<string>('global');
  const [featurePermissions, setFeaturePermissions] = React.useState<TenantFeaturePermissions>({
    hiddenMenus: [],
    disabledPermissions: [],
    featurePermissions: [],
  });
  const [disabledPermissionsText, setDisabledPermissionsText] = React.useState('');
  const [featurePermissionsText, setFeaturePermissionsText] = React.useState('[]');
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const scope = React.useMemo(() => {
    const value = tenantKey.trim();
    if (!value || value === 'global') return { tenantId: null as string | null, planId: null as string | null };
    if (value.startsWith('plan:')) return { tenantId: null, planId: value.slice(5) };
    return { tenantId: value, planId: null };
  }, [tenantKey]);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const data = await centralPlatformClient.getFeaturePermissions(scope);
      setFeaturePermissions(data);
      setDisabledPermissionsText(data.disabledPermissions.join('\n'));
      setFeaturePermissionsText(JSON.stringify(data.featurePermissions, null, 2));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'تعذر قراءة إعدادات الصلاحيات من السيرفر المركزي.');
    } finally {
      setLoading(false);
    }
  }, [scope]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const toggleHidden = (path: string) => {
    setFeaturePermissions((prev) => {
      const next = prev.hiddenMenus.includes(path)
        ? prev.hiddenMenus.filter((p) => p !== path)
        : [...prev.hiddenMenus, path];
      return { ...prev, hiddenMenus: next };
    });
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const parsedFeature = (() => {
        try {
          const parsed = JSON.parse(featurePermissionsText || '[]');
          return Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          throw new Error('صيغة featurePermissions ليست JSON صالحة.');
        }
      })();
      const disabledPermissions = disabledPermissionsText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      await centralPlatformClient.setFeaturePermissions({
        ...scope,
        hiddenMenus: featurePermissions.hiddenMenus,
        disabledPermissions,
        featurePermissions: parsedFeature,
      });
      setNotice('تم حفظ إعدادات صلاحيات العميل/الخطة على السيرفر المركزي.');
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'تعذر حفظ الإعدادات على السيرفر المركزي.');
    } finally {
      setSaving(false);
    }
  };

  const hiddenRouteRules = React.useMemo(
    () => ROUTE_PERMISSIONS.map((rule) => ({ rule, hidden: featurePermissions.hiddenMenus.includes(rule.path) })),
    [featurePermissions.hiddenMenus],
  );

  const byRoute = React.useMemo(() => {
    const map = new Map<string, { module: string; perms: typeof GRANULAR_PERMISSIONS[number][] }>();
    for (const p of GRANULAR_PERMISSIONS) {
      const key = p.route || '(بدون مسار)';
      if (!map.has(key)) map.set(key, { module: p.module, perms: [] });
      map.get(key)!.perms.push(p);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], 'ar'));
  }, []);

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-bold text-slate-900">منصة المستخدمين — صفحات وصلاحيات</h1>
        <p className="mt-1 text-sm text-slate-600">
          عرض كامل لجميع صفحات المنصة وكل الصلاحيات على كل صفحة، مع التحكم الفعلي في ظهور القوائم
          وتعطيل الصلاحيات على مستوى العميل أو الخطة — محفوظ على السيرفر المركزي، وليس على هذا الجهاز.
        </p>
        <p className="mt-1 text-xs text-slate-500">
          الصلاحيات على مستوى الموظف تُدار من صفحة «حسابات الموظفين» (grant/deny لكل حساب)، وعلى مستوى
          الدور من مصفوفة الصلاحيات. الحماية الحقيقية تنفذها واجهات الـ API في الخادم المركزي
          (requirePlatformPermission / requireTenantScope) وفي خدمة التفويض المحلية.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <label className="font-semibold text-slate-700">مفتاح عميل/خطة:</label>
          <input
            value={tenantKey}
            onChange={(e) => setTenantKey(e.target.value || 'global')}
            className="rounded border border-slate-300 px-2 py-1 text-xs"
            placeholder="global أو tenantId أو plan:<planId>"
          />
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {loading ? 'جارٍ التحميل…' : 'إعادة التحميل'}
          </button>
        </div>
        {error && <div role="alert" className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">{error}</div>}
        {notice && <div role="status" className="mt-3 rounded border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-700">{notice}</div>}
        <div className="mt-3 flex gap-4 text-xs text-slate-500">
          <span>مسارات مخفية لهذا النطاق: {featurePermissions.hiddenMenus.length}</span>
          <span>صلاحيات معطلة: {featurePermissions.disabledPermissions.length}</span>
          <span>صلاحيات (featurePermissions): {featurePermissions.featurePermissions.length}</span>
        </div>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">خريطة صلاحيات المسارات</h2>
        <div className="overflow-auto max-h-72 rounded-lg border border-slate-100">
          <DataTable
            ariaLabel="خريطة صلاحيات المسارات"
            rows={hiddenRouteRules.map(({ rule, hidden }, i) => ({ rule, hidden, __i: i }))}
            rowKey={(row) => `${row.rule.path}-${row.__i}`}
            dense
            stickyHeader
            columns={[
              {
                key: 'show', header: 'إظهار', align: 'center',
                render: ({ rule, hidden }) => (
                  <input type="checkbox" checked={!hidden} onChange={() => toggleHidden(rule.path)} aria-label={`إظهار ${rule.path}`} />
                ),
              },
              { key: 'path', header: 'المسار', render: ({ rule }) => <span className="font-mono">{rule.path}</span> },
              { key: 'all', header: 'all', render: ({ rule }) => (rule.all || []).join(', ') },
              { key: 'any', header: 'any', render: ({ rule }) => (rule.any || []).join(', ') },
            ]}
          />
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="disabled-permissions" className="mb-1 block text-xs font-semibold text-slate-700">
              الصلاحيات المعطلة (كود صلاحية في كل سطر)
            </label>
            <textarea
              id="disabled-permissions"
              value={disabledPermissionsText}
              onChange={(e) => setDisabledPermissionsText(e.target.value)}
              rows={6}
              dir="ltr"
              className="w-full rounded border border-slate-300 p-2 font-mono text-xs"
              placeholder={'sales.create\ninventory.view'}
            />
          </div>
          <div>
            <label htmlFor="feature-permissions" className="mb-1 block text-xs font-semibold text-slate-700">
              featurePermissions (JSON)
            </label>
            <textarea
              id="feature-permissions"
              value={featurePermissionsText}
              onChange={(e) => setFeaturePermissionsText(e.target.value)}
              rows={6}
              dir="ltr"
              className="w-full rounded border border-slate-300 p-2 font-mono text-xs"
            />
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-[11px] text-slate-500">
            يحفظ إلى tenant_feature_config على السيرفر المركزي (PUT /api/v1/admin/config/feature-permissions).
            يتطلب صلاحية platform.app-configuration.update — إخفاء القائمة وحده ليس حماية للـ API.
          </p>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || loading}
            className="shrink-0 rounded bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? 'جارٍ الحفظ…' : 'حفظ على السيرفر المركزي'}
          </button>
        </div>
      </section>

      <section className="space-y-4">
        {byRoute.map(([route, info]) => (
          <div key={route} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-slate-900">{route}</h3>
              <span className="text-xs text-slate-500">{info.module} · {info.perms.length} صلاحية</span>
            </div>
            <div className="overflow-auto max-h-96 rounded-lg border border-slate-100">
              <DataTable
                ariaLabel="صلاحيات المسار"
                rows={info.perms}
                rowKey={(p) => p.code}
                dense
                stickyHeader
                columns={[
                  { key: 'code', header: 'الكود', render: (p) => <span className="font-mono">{p.code}</span> },
                  { key: 'name', header: 'الاسم', render: (p) => p.name },
                  { key: 'kind', header: 'النوع', render: (p) => p.kind },
                  { key: 'group', header: 'القسم', render: (p) => p.group },
                ]}
              />
            </div>
          </div>
        ))}
      </section>
    </div>
  );
};

export default PlatformUserPlatformPermissionsPage;
