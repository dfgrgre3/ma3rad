import React from 'react';
import { Eye, EyeOff, Layers, Lock, MonitorSmartphone, RotateCcw, Save, Search, Sparkles } from 'lucide-react';
import type { TenantPage, TenantPageGroup } from '../../../../config/tenantPageCatalog';
import { listTenantPageGroups, listTenantPages } from '../../../../config/tenantPageCatalog';
import type { FeatureConfigData } from './featureConfigDraft';
import {
  computePageVisibility,
  expandPermissionCodes,
  permissionsForPagePath,
  type PageVisibilityStatus,
} from './pageAccessRules';
import {
  emptyFeatureConfigDraft,
  featureConfigSignature,
  serializeFeatureConfig,
  splitFeatureConfig,
  type TenantFeatureConfigDraft,
} from './featureConfigDraft';
import { PagePermissionsModal, type PagePermissionDraft } from './PagePermissionsModal';
import { Button } from '../../../../components/ui/Button';
import { EmptyState, StatusBadge, inputClass } from '../PlatformUI';
import { useToast } from '../../../../components/ui/Toast';

export interface AccessGatingInput {
  /** Page paths hidden because their owning feature is disabled for the scope. */
  featureHiddenPaths: ReadonlySet<string>;
  /** Effective platform module codes included for the scope. */
  moduleCodes: ReadonlySet<string>;
  /** registry module id → platform module codes that own it. */
  registryToPlatformCodes: ReadonlyMap<string, string[]>;
}

export interface AccessPagesEditorProps {
  /** Effective (layer-merged) config used to seed the editable draft. */
  initialConfig: FeatureConfigData;
  gating: AccessGatingInput;
  onSave: (payload: {
    hiddenMenus: string[];
    disabledPermissions: string[];
    featurePermissions: Array<Record<string, unknown>>;
  }) => Promise<void> | void;
  canManage: boolean;
  /** Heading context, e.g. tenant or plan name. */
  scopeLabel?: string;
  description?: string;
}

const STATUS_META: Record<PageVisibilityStatus, { label: string; chip: string; icon: React.ReactNode }> = {
  visible: { label: 'ظاهرة', chip: 'bg-success-soft text-success', icon: <Eye className="h-3 w-3" /> },
  'hidden-manual': { label: 'مخفية', chip: 'bg-danger-soft text-danger', icon: <EyeOff className="h-3 w-3" /> },
  'hidden-feature': { label: 'ميزة غير مفعّلة', chip: 'bg-warning-soft text-warning', icon: <Sparkles className="h-3 w-3" /> },
  'hidden-permission': { label: 'مخفية بصلاحية', chip: 'bg-danger-soft text-danger', icon: <EyeOff className="h-3 w-3" /> },
  'module-excluded': { label: 'وحدة غير مشمولة', chip: 'bg-surface-sunken text-ink-secondary', icon: <Layers className="h-3 w-3" /> },
};

const defaultPageGroups = (): TenantPageGroup[] => listTenantPageGroups();

export const AccessPagesEditor: React.FC<AccessPagesEditorProps> = ({
  initialConfig,
  gating,
  onSave,
  canManage,
  scopeLabel,
  description,
}) => {
  const toast = useToast();
  const [draft, setDraft] = React.useState<TenantFeatureConfigDraft>(emptyFeatureConfigDraft);
  const [baseline, setBaseline] = React.useState('');
  const [loaded, setLoaded] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [pagePermTarget, setPagePermTarget] = React.useState<TenantPage | null>(null);

  const pageGroups = React.useMemo(defaultPageGroups, []);
  const catalogPaths = React.useMemo(() => new Set(listTenantPages().map((page) => page.path)), []);

  // Seed the draft whenever the effective config (re)loads.
  React.useEffect(() => {
    const next = splitFeatureConfig(initialConfig, catalogPaths);
    setDraft(next);
    setBaseline(featureConfigSignature(next));
    setLoaded(true);
  }, [initialConfig, catalogPaths]);

  const dirty = loaded && featureConfigSignature(draft) !== baseline;

  const hasRestrictions = React.useCallback(
    (path: string) => {
      const fp = draft.featurePerms.get(path);
      const fpRestricted = Boolean(
        fp && (fp.allowViewOnly || fp.canEdit === false || fp.canDelete === false || fp.canExportPrint === false)
      );
      const permRestricted = permissionsForPagePath(path).some((perm) =>
        expandPermissionCodes(perm.code).some((code) => draft.disabledPermissions.has(code))
      );
      return fpRestricted || permRestricted;
    },
    [draft]
  );

  const permissionHiddenPaths = React.useMemo(() => {
    const set = new Set<string>();
    for (const [path, fp] of draft.featurePerms) {
      if (fp.pageVisible === false || fp.featureEnabled === false) set.add(path);
    }
    return set;
  }, [draft]);

  const visibility = React.useMemo(() => {
    const map = new Map<string, ReturnType<typeof computePageVisibility>>();
    for (const group of pageGroups) {
      for (const page of group.pages) {
        map.set(
          page.path,
          computePageVisibility({
            page,
            hiddenDraft: draft.hiddenMenus,
            featureHiddenPaths: gating.featureHiddenPaths,
            permissionHiddenPaths,
            registryToPlatformCodes: gating.registryToPlatformCodes,
            moduleDraft: gating.moduleCodes,
            hasRestrictions,
          })
        );
      }
    }
    return map;
  }, [pageGroups, draft.hiddenMenus, gating, permissionHiddenPaths, hasRestrictions]);

  const term = search.trim().toLowerCase();
  const filteredGroups = React.useMemo(() => {
    if (!term) return pageGroups;
    return pageGroups
      .map((group) => ({
        ...group,
        pages: group.pages.filter(
          (page) => page.path.toLowerCase().includes(term) || page.label.toLowerCase().includes(term)
        ),
      }))
      .filter((group) => group.pages.length > 0);
  }, [pageGroups, term]);

  const pagePermCodes = React.useCallback(
    (path: string) => new Set(permissionsForPagePath(path).map((perm) => perm.code)),
    []
  );

  const savePagePermissions = (page: TenantPage, pageDraft: PagePermissionDraft) => {
    setDraft((current) => {
      const hiddenMenus = new Set(current.hiddenMenus);
      if (pageDraft.hidden) hiddenMenus.add(page.path);
      else hiddenMenus.delete(page.path);

      const featurePerms = new Map(current.featurePerms);
      if (pageDraft.featurePerm) featurePerms.set(page.path, pageDraft.featurePerm);
      else featurePerms.delete(page.path);

      const disabledPermissions = new Set(current.disabledPermissions);
      for (const code of pagePermCodes(page.path)) {
        for (const expanded of expandPermissionCodes(code)) disabledPermissions.delete(expanded);
      }
      for (const code of pageDraft.disabledCodes) disabledPermissions.add(code);

      return { ...current, hiddenMenus, featurePerms, disabledPermissions };
    });
    toast.success('حُفظت صلاحيات الصفحة في المسودة', page.label);
  };

  const pagePermInitialDisabled = React.useMemo(
    () =>
      pagePermTarget
        ? permissionsForPagePath(pagePermTarget.path)
            .filter((perm) => expandPermissionCodes(perm.code).some((code) => draft.disabledPermissions.has(code)))
            .map((perm) => perm.code)
        : [],
    [pagePermTarget, draft.disabledPermissions]
  );

  const save = async () => {
    setSaving(true);
    try {
      const serialized = serializeFeatureConfig(draft);
      await onSave({
        hiddenMenus: serialized.hiddenMenus,
        disabledPermissions: [...new Set(serialized.disabledPermissions.flatMap(expandPermissionCodes))],
        featurePermissions: serialized.featurePermissions,
      });
      setBaseline(featureConfigSignature(draft));
    } catch (err) {
      toast.error('تعذر حفظ إعدادات الوصول', err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    const next = splitFeatureConfig(initialConfig, catalogPaths);
    setDraft(next);
    setBaseline(featureConfigSignature(next));
  };

  const counts = React.useMemo(() => {
    let visible = 0;
    let restricted = 0;
    let hidden = 0;
    for (const v of visibility.values()) {
      if (v.status === 'visible') {
        visible += 1;
        if (v.restricted) restricted += 1;
      } else {
        hidden += 1;
      }
    }
    return { visible, restricted, hidden };
  }, [visibility]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4 shadow-sm">
        <div className="min-w-0">
          <p className="text-[13px] font-black text-ink">
            صفحات وأقسام التطبيق {scopeLabel ? `— ${scopeLabel}` : ''}
          </p>
          <p className="mt-0.5 text-[11px] text-muted">
            {description ??
              'الإعدادات تُحفظ على السيرفر المركزي وتصل للعميل عبر التكوين الموقّع — الإخفاء يخفي القائمة والمسار معًا، وقيود القدرات تعطّل التعديل/الحذف/التصدير داخل الصفحة.'}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10.5px] font-bold">
            <span className="rounded-full bg-success-soft px-2.5 py-1 text-success">{counts.visible} ظاهرة</span>
            {counts.restricted > 0 && (
              <span className="rounded-full bg-accent-soft px-2.5 py-1 text-primary">{counts.restricted} بقيود</span>
            )}
            {counts.hidden > 0 && (
              <span className="rounded-full bg-danger-soft px-2.5 py-1 text-danger">{counts.hidden} مخفية</span>
            )}
            {dirty && <span className="rounded-full bg-warning-soft px-2.5 py-1 text-warning">تغييرات غير محفوظة</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="بحث في الصفحات..."
              className={`${inputClass} w-56 py-1.5 pl-3 pr-8 text-[11.5px]`}
            />
          </div>
          <Button variant="ghost" size="sm" onClick={reset} disabled={!dirty || saving} leadingIcon={<RotateCcw className="h-3.5 w-3.5" />}>
            تراجع
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={save}
            loading={saving}
            disabled={!canManage || !dirty}
            leadingIcon={<Save className="h-3.5 w-3.5" />}
          >
            حفظ الإعدادات
          </Button>
        </div>
      </div>

      {!loaded ? (
        <div className="flex flex-col items-center gap-3 py-16 text-sm font-semibold text-muted">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-success" />
          جارٍ تحميل الصفحات...
        </div>
      ) : filteredGroups.length === 0 ? (
        <EmptyState icon={<MonitorSmartphone className="h-5 w-5" />} title="لا توجد صفحات مطابقة" />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {filteredGroups.map((group) => {
            const visibleInGroup = group.pages.filter((page) => visibility.get(page.path)?.status === 'visible').length;
            return (
              <div key={group.id} className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
                <div className="flex items-center justify-between border-b border-line bg-surface-muted px-3.5 py-2.5">
                  <p className="text-[12px] font-black text-ink">{group.label}</p>
                  <span className="text-[10px] font-semibold text-muted">
                    {visibleInGroup}/{group.pages.length} متاحة
                  </span>
                </div>
                <div className="divide-y divide-line/60">
                  {group.pages.map((page) => {
                    const v = visibility.get(page.path);
                    const meta = STATUS_META[v?.status ?? 'visible'];
                    const hasPagePerms = draft.featurePerms.has(page.path) || v?.restricted;
                    return (
                      <button
                        key={page.path}
                        type="button"
                        onClick={() => setPagePermTarget(page)}
                        className="flex w-full items-center justify-between gap-2 px-3.5 py-2 text-right transition hover:bg-surface-muted/70"
                      >
                        <span className="min-w-0">
                          <span className={`block truncate text-[11.5px] font-semibold ${v?.status === 'visible' ? 'text-ink' : 'text-muted line-through'}`}>
                            {page.label}
                          </span>
                          <span className="block truncate font-mono text-[9px] text-muted" dir="ltr">{page.path}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          {hasPagePerms && <Lock className="h-3 w-3 text-warning" />}
                          <StatusBadge value={v?.status ?? 'visible'} label={meta.label} />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <PagePermissionsModal
        open={Boolean(pagePermTarget)}
        onClose={() => setPagePermTarget(null)}
        page={pagePermTarget}
        initiallyHidden={pagePermTarget ? draft.hiddenMenus.has(pagePermTarget.path) : false}
        initialFeaturePerm={pagePermTarget ? draft.featurePerms.get(pagePermTarget.path) : undefined}
        initialDisabledCodes={pagePermInitialDisabled}
        canManage={canManage}
        onSave={(pageDraft) => {
          if (pagePermTarget) savePagePermissions(pagePermTarget, pageDraft);
        }}
      />
    </div>
  );
};

export default AccessPagesEditor;
