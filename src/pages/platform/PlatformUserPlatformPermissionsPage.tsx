import React from 'react';
import { GRANULAR_PERMISSIONS, PAGE_VIEW_PERMISSIONS } from '../../config/permissionMatrix';
import { ROUTE_PERMISSIONS } from '../../config/routePermissions';
import { readCachedCentralConfig } from '../../services/domains/licensing/centralConfigStore';

function setHiddenMenus(menus: string[]) {
  try {
    const cfg = readCachedCentralConfig() || {};
    cfg.config = cfg.config || {};
    cfg.config.hiddenMenus = menus;
    localStorage.setItem('central_cached_config', JSON.stringify(cfg));
  } catch {}
}

export const PlatformUserPlatformPermissionsPage: React.FC = () => {
  const [tenantKey, setTenantKey] = React.useState<string>('global');
  const storageKey = `hiddenMenus:${tenantKey}`;
  const [hidden, setHidden] = React.useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch { return []; }
  });
  React.useEffect(() => {
    try { setHidden(JSON.parse(localStorage.getItem(storageKey) || '[]')); } catch { setHidden([]); }
  }, [storageKey]);
  const toggleHide = (path: string) => {
    const next = hidden.includes(path) ? hidden.filter((p) => p !== path) : [...hidden, path];
    setHidden(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
    if (tenantKey === 'global') setHiddenMenus(next);
  };

  // Group granular permissions by their route/page.
  const byRoute = React.useMemo(() => {
    const map = new Map<string, { module: string; label: string; perms: typeof GRANULAR_PERMISSIONS[number][] }>();
    for (const p of GRANULAR_PERMISSIONS) {
      const key = p.route || '(بدون مسار)';
      if (!map.has(key)) map.set(key, { module: p.module, label: key, perms: [] });
      map.get(key)!.perms.push(p);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], 'ar'));
  }, []);

  const routeRules = React.useMemo(() => ROUTE_PERMISSIONS, []);

  return (
    <div className="space-y-6" dir="rtl">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-bold text-slate-900">منصة المستخدمين — صفحات وصلاحيات</h1>
        <p className="mt-1 text-sm text-slate-600">
          عرض كامل لجميع صفحات منصة المستخدمين وكل الصلاحيات (صفحة/إجراء/قسم/حقل) على كل صفحة. متاح لمالك المنصة فقط.
        </p>
        <div className="mt-3 flex items-center gap-2 text-sm">
          <label className="font-semibold text-slate-700">مفتاح عميل/خطة:</label>
          <input
            value={tenantKey}
            onChange={(e) => setTenantKey(e.target.value || 'global')}
            className="rounded border border-slate-300 px-2 py-1 text-xs"
            placeholder="global أو tenantId أو planId"
          />
          <span className="text-xs text-slate-500">(تجريبي: يُخزَّن محليًا؛ للمركزي لازم backend)</span>
        </div>
        <div className="mt-3 flex gap-4 text-xs text-slate-500">
          <span>صفحات (مسارات): {byRoute.length}</span>
          <span>صلاحيات: {GRANULAR_PERMISSIONS.length}</span>
          <span>قواعد مسار: {routeRules.length}</span>
        </div>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">خريطة صلاحيات المسارات</h2>
        <div className="overflow-auto max-h-72 rounded-lg border border-slate-100">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-right">إظهار</th>
                <th className="px-3 py-2 text-right">المسار</th>
                <th className="px-3 py-2 text-right">all</th>
                <th className="px-3 py-2 text-right">any</th>
              </tr>
            </thead>
            <tbody>
              {routeRules.map((r, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-3 py-1 text-center">
                    <input type="checkbox" checked={!hidden.includes(r.path)} onChange={() => toggleHide(r.path)} />
                  </td>
                  <td className="px-3 py-1 font-mono">{r.path}</td>
                  <td className="px-3 py-1">{(r.all || []).join(', ')}</td>
                  <td className="px-3 py-1">{(r.any || []).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-right">الكود</th>
                    <th className="px-3 py-2 text-right">الاسم</th>
                    <th className="px-3 py-2 text-right">النوع</th>
                    <th className="px-3 py-2 text-right">القسم</th>
                  </tr>
                </thead>
                <tbody>
                  {info.perms.map((p) => (
                    <tr key={p.code} className="border-t border-slate-100">
                      <td className="px-3 py-1 font-mono">{p.code}</td>
                      <td className="px-3 py-1">{p.name}</td>
                      <td className="px-3 py-1">{p.kind}</td>
                      <td className="px-3 py-1">{p.group}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
};

export default PlatformUserPlatformPermissionsPage;