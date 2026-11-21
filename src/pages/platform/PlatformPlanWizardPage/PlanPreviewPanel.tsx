import React from 'react';
import { Eye, EyeOff, Layers, Lock, Sparkles } from 'lucide-react';
import type { TenantPage, TenantPageGroup } from '../../../config/tenantPageCatalog';
import type { CentralFeaturePermission } from '../../../services/domains/licensing/CentralFeaturePermissionService';
import { computePageVisibility, expandPermissionCodes, permissionsForPagePath, type PageVisibilityStatus } from '../components/access/pageAccessRules';

export interface PlanPreviewPanelProps {
  pageGroups: TenantPageGroup[];
  hiddenDraft: ReadonlySet<string>;
  /** Paths hidden because their owning feature is not in the plan (featureHiddenPathsForPlan). */
  featureHiddenPaths: ReadonlySet<string>;
  /** registry module id → platform module codes owning it. */
  registryToPlatformCodes: ReadonlyMap<string, string[]>;
  moduleDraft: ReadonlySet<string>;
  /** path → featurePermissions entry (view-only / action toggles). */
  featurePermsDraft: ReadonlyMap<string, CentralFeaturePermission>;
  /** granular permission codes disabled for the plan. */
  disabledPermsDraft: ReadonlySet<string>;
}

const STATUS_META: Record<PageVisibilityStatus, { label: string; chip: string; icon: React.ReactNode }> = {
  visible: { label: 'ظاهرة', chip: 'bg-success-soft text-success', icon: <Eye className="h-3 w-3" /> },
  'hidden-manual': { label: 'مخفية يدويًا', chip: 'bg-danger-soft text-danger', icon: <EyeOff className="h-3 w-3" /> },
  'hidden-feature': { label: 'مخفية — ميزة غير مشمولة', chip: 'bg-warning-soft text-warning', icon: <Sparkles className="h-3 w-3" /> },
  'hidden-permission': { label: 'مخفية — صلاحية الصفحة', chip: 'bg-danger-soft text-danger', icon: <EyeOff className="h-3 w-3" /> },
  'module-excluded': { label: 'مخفية — وحدة غير مشمولة', chip: 'bg-surface-sunken text-ink-secondary', icon: <Layers className="h-3 w-3" /> },
};

export const PlanPreviewPanel: React.FC<PlanPreviewPanelProps> = ({
  pageGroups,
  hiddenDraft,
  featureHiddenPaths,
  registryToPlatformCodes,
  moduleDraft,
  featurePermsDraft,
  disabledPermsDraft,
}) => {
  const hasRestrictions = React.useCallback(
    (path: string) => {
      const fp = featurePermsDraft.get(path);
      const fpRestricted = Boolean(
        fp && (fp.allowViewOnly || fp.canEdit === false || fp.canDelete === false || fp.canExportPrint === false)
      );
      // Scoped: only permissions bound to this page's route count — a disabled
      // code elsewhere must not mark every page as restricted.
      const permRestricted = permissionsForPagePath(path).some((perm) =>
        expandPermissionCodes(perm.code).some((code) => disabledPermsDraft.has(code))
      );
      return fpRestricted || permRestricted;
    },
    [featurePermsDraft, disabledPermsDraft]
  );

  // Pages hidden through featurePermissions (pageVisible/featureEnabled = false)
  // — the tenant consumer treats them exactly like hiddenMenus entries.
  const permissionHiddenPaths = React.useMemo(() => {
    const set = new Set<string>();
    for (const [path, fp] of featurePermsDraft) {
      if (fp.pageVisible === false || fp.featureEnabled === false) set.add(path);
    }
    return set;
  }, [featurePermsDraft]);

  const visibility = React.useMemo(() => {
    const map = new Map<string, ReturnType<typeof computePageVisibility>>();
    for (const group of pageGroups) {
      for (const page of group.pages) {
        map.set(
          page.path,
          computePageVisibility({
            page,
            hiddenDraft,
            featureHiddenPaths,
            permissionHiddenPaths,
            registryToPlatformCodes,
            moduleDraft,
            hasRestrictions,
          })
        );
      }
    }
    return map;
  }, [pageGroups, hiddenDraft, featureHiddenPaths, permissionHiddenPaths, registryToPlatformCodes, moduleDraft, hasRestrictions]);

  const counts = React.useMemo(() => {
    const result = { visible: 0, restricted: 0, hiddenManual: 0, hiddenFeature: 0, hiddenPermission: 0, moduleExcluded: 0 };
    for (const v of visibility.values()) {
      if (v.status === 'visible') {
        result.visible += 1;
        if (v.restricted) result.restricted += 1;
      } else if (v.status === 'hidden-manual') result.hiddenManual += 1;
      else if (v.status === 'hidden-feature') result.hiddenFeature += 1;
      else if (v.status === 'hidden-permission') result.hiddenPermission += 1;
      else result.moduleExcluded += 1;
    }
    return result;
  }, [visibility]);

  const total = visibility.size;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 shadow-sm">
        <p className="text-[12px] font-semibold text-ink-secondary">
          هكذا ستظهر الصفحات لمشتركي الباقة — يشمل الصفحات المخفية بسبب مميزات أو وحدات غير مشمولة، وليس الإخفاء اليدوي فقط.
        </p>
        <div className="flex flex-wrap items-center gap-1.5 text-[10.5px] font-bold">
          <span className="rounded-full bg-success-soft px-2.5 py-1 text-success">{counts.visible} ظاهرة</span>
          {counts.restricted > 0 && (
            <span className="rounded-full bg-accent-soft px-2.5 py-1 text-primary">{counts.restricted} بقيود</span>
          )}
          {counts.hiddenManual > 0 && (
            <span className="rounded-full bg-danger-soft px-2.5 py-1 text-danger">{counts.hiddenManual} مخفية يدويًا</span>
          )}
          {counts.hiddenFeature > 0 && (
            <span className="rounded-full bg-warning-soft px-2.5 py-1 text-warning">{counts.hiddenFeature} مميزات غير مشمولة</span>
          )}
          {counts.hiddenPermission > 0 && (
            <span className="rounded-full bg-danger-soft px-2.5 py-1 text-danger">{counts.hiddenPermission} مخفية بصلاحيات</span>
          )}
          {counts.moduleExcluded > 0 && (
            <span className="rounded-full bg-surface-sunken px-2.5 py-1 text-ink-secondary">{counts.moduleExcluded} وحدات غير مشمولة</span>
          )}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {pageGroups.map((group) => {
          const visibleInGroup = group.pages.filter((page: TenantPage) => visibility.get(page.path)?.status === 'visible').length;
          return (
            <div key={group.id} className="rounded-xl border border-line bg-surface shadow-sm">
              <div className="flex items-center justify-between border-b border-line bg-surface-muted px-3 py-2">
                <p className="text-[12px] font-black text-ink">{group.label}</p>
                <span className="text-[10px] font-semibold text-muted">
                  {visibleInGroup}/{group.pages.length} متاحة
                </span>
              </div>
              <div className="flex max-h-56 flex-wrap gap-1 overflow-y-auto p-2">
                {group.pages.map((page: TenantPage) => {
                  const v = visibility.get(page.path);
                  const meta = STATUS_META[v?.status ?? 'visible'];
                  return (
                    <span
                      key={page.path}
                      title={`${page.path}${v?.restricted ? ' — عليها قيود صلاحيات' : ''}`}
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-semibold ${meta.chip} ${
                        v?.status !== 'visible' ? 'line-through opacity-80' : ''
                      }`}
                    >
                      {meta.icon}
                      {page.label}
                      {v?.restricted && <Lock className="h-2.5 w-2.5" />}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] font-semibold text-muted">
        المعاينة حسابية من إعدادات المسودة الحالية ({total} صفحة) — التطبيق الفعلي يحدث بعد «تطبيق على الباقة» ويصل للمشتركين عبر التكوين الموقّع.
      </p>
    </div>
  );
};

export default PlanPreviewPanel;
