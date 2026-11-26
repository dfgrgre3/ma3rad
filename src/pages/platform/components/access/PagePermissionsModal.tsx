import React from 'react';
import { Eye, EyeOff, MonitorSmartphone, ShieldOff } from 'lucide-react';
import type { TenantPage } from '../../../../config/tenantPageCatalog';
import type { CentralFeaturePermission } from '../../../../services/domains/licensing/CentralFeaturePermissionService';
import { Button } from '../../../../components/ui/Button';
import { Modal } from '../../../../components/ui/Modal';
import { EmptyState, Toggle, inputClass } from '../PlatformUI';
import { permissionsForPagePath } from './pageAccessRules';

/** Draft produced by the per-page permissions editor. */
export interface PagePermissionDraft {
  /** Page path hidden via hiddenMenus. */
  hidden: boolean;
  /** featurePermissions entry for this pageUrl — null removes any existing entry. */
  featurePerm: CentralFeaturePermission | null;
  /** Granular permission codes (ui.*) disabled for this page. */
  disabledCodes: string[];
}

interface FeaturePermForm {
  pageVisible: boolean;
  featureEnabled: boolean;
  allowViewOnly: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canExportPrint: boolean;
}

const DEFAULT_FP: FeaturePermForm = {
  pageVisible: true,
  featureEnabled: true,
  allowViewOnly: false,
  canEdit: true,
  canDelete: true,
  canExportPrint: true,
};

const fpFromEntry = (entry: CentralFeaturePermission | undefined): FeaturePermForm => ({
  pageVisible: entry?.pageVisible !== false,
  featureEnabled: entry?.featureEnabled !== false,
  allowViewOnly: entry?.allowViewOnly === true,
  canEdit: entry?.canEdit !== false,
  canDelete: entry?.canDelete !== false,
  canExportPrint: entry?.canExportPrint !== false,
});

const isDefaultFp = (fp: FeaturePermForm): boolean =>
  fp.pageVisible === DEFAULT_FP.pageVisible &&
  fp.featureEnabled === DEFAULT_FP.featureEnabled &&
  fp.allowViewOnly === DEFAULT_FP.allowViewOnly &&
  fp.canEdit === DEFAULT_FP.canEdit &&
  fp.canDelete === DEFAULT_FP.canDelete &&
  fp.canExportPrint === DEFAULT_FP.canExportPrint;

export interface PagePermissionsModalProps {
  open: boolean;
  onClose: () => void;
  page: TenantPage | null;
  /** Current hiddenMenus membership for this page. */
  initiallyHidden: boolean;
  /** Current featurePermissions entry for this pageUrl (if any). */
  initialFeaturePerm?: CentralFeaturePermission;
  /** Granular codes currently disabled that belong to this page. */
  initialDisabledCodes?: string[];
  canManage: boolean;
  onSave: (draft: PagePermissionDraft) => void;
}

export const PagePermissionsModal: React.FC<PagePermissionsModalProps> = ({
  open,
  onClose,
  page,
  initiallyHidden,
  initialFeaturePerm,
  initialDisabledCodes = [],
  canManage,
  onSave,
}) => {
  const [hidden, setHidden] = React.useState(initiallyHidden);
  const [fp, setFp] = React.useState<FeaturePermForm>(DEFAULT_FP);
  const [disabled, setDisabled] = React.useState<Set<string>>(new Set());
  const [permFilter, setPermFilter] = React.useState('');

  React.useEffect(() => {
    if (!open || !page) return;
    setHidden(initiallyHidden);
    setFp(fpFromEntry(initialFeaturePerm));
    setDisabled(new Set(initialDisabledCodes));
    setPermFilter('');
  }, [open, page, initiallyHidden, initialFeaturePerm, initialDisabledCodes]);

  const allPagePerms = React.useMemo(() => (page ? permissionsForPagePath(page.path) : []), [page]);

  const pagePerms = React.useMemo(() => {
    const term = permFilter.trim().toLowerCase();
    if (!term) return allPagePerms;
    return allPagePerms.filter(
      (p) => p.code.toLowerCase().includes(term) || p.name.toLowerCase().includes(term) || p.group.toLowerCase().includes(term)
    );
  }, [allPagePerms, permFilter]);

  const save = () => {
    if (!page) return;
    const featurePerm: CentralFeaturePermission | null = isDefaultFp(fp)
      ? null
      : {
          // Preserve fields this form does not edit (id, section, featureName...).
          ...(initialFeaturePerm ?? {}),
          pageUrl: page.path,
          pageVisible: fp.pageVisible,
          featureEnabled: fp.featureEnabled,
          allowViewOnly: fp.allowViewOnly,
          canEdit: fp.canEdit,
          canDelete: fp.canDelete,
          canExportPrint: fp.canExportPrint,
        };
    onSave({ hidden, featurePerm, disabledCodes: [...disabled] });
    onClose();
  };

  const fpToggles: Array<{ key: keyof FeaturePermForm; label: string; hint: string }> = [
    { key: 'pageVisible', label: 'الصفحة ظاهرة', hint: 'إيقافها يخفي الصفحة حتى لو لم تكن في القائمة المخفية' },
    { key: 'featureEnabled', label: 'الميزة المالك مفعّلة', hint: 'إيقافها يخفي الصفحة كأن ميزتها معطلة' },
    { key: 'allowViewOnly', label: 'عرض فقط', hint: 'يسمح بالعرض ويمنع التعديل والحذف والتصدير' },
    { key: 'canEdit', label: 'السماح بالتعديل', hint: 'أزرار وإجراءات التعديل داخل الصفحة' },
    { key: 'canDelete', label: 'السماح بالحذف', hint: 'أزرار وإجراءات الحذف داخل الصفحة' },
    { key: 'canExportPrint', label: 'السماح بالتصدير والطباعة', hint: 'أزرار التصدير والطباعة داخل الصفحة' },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={page ? `صلاحيات الصفحة — ${page.label}` : 'صلاحيات الصفحة'}
      description={page ? `المسار: ${page.path} — تُحفظ هذه الإعدادات ضمن تكوين الباقة في tenant_feature_config.` : undefined}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={!canManage}>إلغاء</Button>
          <Button variant="primary" onClick={save} disabled={!canManage}>حفظ صلاحيات الصفحة</Button>
        </div>
      }
    >
      {page && (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-xl border border-line px-3 py-2">
            <span className="flex items-center gap-2 text-[12px] font-bold text-ink">
              {hidden ? <EyeOff className="h-4 w-4 text-danger" /> : <Eye className="h-4 w-4 text-success" />}
              {hidden ? 'الصفحة مخفية عن مشتركي الباقة' : 'الصفحة ظاهرة لمشتركي الباقة'}
            </span>
            <Toggle checked={!hidden} onChange={(next) => setHidden(!next)} disabled={!canManage} label="إظهار الصفحة" />
          </div>

          <div className="rounded-xl border border-line p-3">
            <p className="mb-2 text-[12px] font-black text-ink">قدرات الصفحة لمشتركي الباقة</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {fpToggles.map((item) => (
                <div key={item.key} className="flex items-center justify-between gap-2 rounded-lg border border-line px-2.5 py-2">
                  <span className="min-w-0">
                    <span className="block text-[11.5px] font-semibold text-ink">{item.label}</span>
                    <span className="block text-[9.5px] text-muted">{item.hint}</span>
                  </span>
                  <Toggle
                    checked={fp[item.key]}
                    disabled={!canManage}
                    onChange={(next) => setFp((current) => ({ ...current, [item.key]: next }))}
                    label={item.label}
                  />
                </div>
              ))}
            </div>
            <p className="mt-2 text-[10.5px] text-muted">
              القيمة الافتراضية (الكل متاح) لا تُخزَّن — يُنشأ سجل في featurePermissions فقط عند وجود قيود.
            </p>
          </div>

          <div className="rounded-xl border border-line p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-[12px] font-black text-ink">
                <ShieldOff className="h-4 w-4 text-warning" />
                الصلاحيات المعطلة في هذه الصفحة ({allPagePerms.length})
              </p>
              <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[10px] font-bold text-danger">
                {disabled.size} معطلة
              </span>
            </div>
            {allPagePerms.length === 0 ? (
              <EmptyState icon={<MonitorSmartphone className="h-5 w-5" />} title="لا توجد صلاحيات دقيقة مرتبطة بهذا المسار" description="صفحات dynamically routed أو pages بدون أقسام في مصفوفة الصلاحيات." />
            ) : (
              <>
                <input
                  className={`${inputClass} mb-2 py-1.5 text-[11.5px]`}
                  placeholder="تصفية الصلاحيات بالاسم أو الكود أو القسم..."
                  value={permFilter}
                  onChange={(event) => setPermFilter(event.target.value)}
                />
                <div className="max-h-56 space-y-1 overflow-y-auto pl-1">
                  {pagePerms.map((perm) => {
                    const isDisabled = disabled.has(perm.code);
                    return (
                      <label
                        key={perm.code}
                        className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 transition ${
                          isDisabled ? 'border-danger-border bg-danger-soft/40' : 'border-line hover:bg-surface-muted'
                        }`}
                      >
                        <span className="min-w-0">
                          <span className={`block truncate text-[11px] font-semibold ${isDisabled ? 'text-danger line-through' : 'text-ink'}`}>
                            {perm.name}
                          </span>
                          <span className="block truncate font-mono text-[9px] text-muted" dir="ltr">{perm.code}</span>
                        </span>
                        <input
                          type="checkbox"
                          checked={isDisabled}
                          disabled={!canManage}
                          onChange={(event) =>
                            setDisabled((current) => {
                              const next = new Set(current);
                              if (event.target.checked) next.add(perm.code);
                              else next.delete(perm.code);
                              return next;
                            })
                          }
                          className="h-3.5 w-3.5 shrink-0 accent-danger disabled:opacity-40"
                          aria-label={`تعطيل ${perm.name}`}
                        />
                      </label>
                    );
                  })}
                  {pagePerms.length === 0 && permFilter && (
                    <p className="py-3 text-center text-[11px] text-muted">لا توجد صلاحيات مطابقة للتصفية.</p>
                  )}
                </div>
              </>
            )}
            <p className="mt-2 text-[10.5px] text-muted">
              تعطيل صلاحية دقيقة يضيف كودها وأكوادها القديمة المكافئة إلى disabledPermissions في التكوين الموقّع — وهذا قيد مفروض على كل أدوار المشتركين.
            </p>
          </div>

          <div className="rounded-xl border border-line p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[12px] font-black text-ink">
                التحكم في الأزرار المحددة داخل الصفحة
              </p>
              <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[10px] font-bold text-ink-secondary">
                {[...disabled].filter((c) => c.startsWith(`btn:${page.path.toLowerCase()}:`)).length} زر معطل
              </span>
            </div>
            {canManage && (
              <form
                className="mb-2 flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const input = form.elements.namedItem('buttonKey') as HTMLInputElement | null;
                  const rawKey = String(input?.value || '').trim().toLowerCase();
                  if (!rawKey) return;
                  const code = `btn:${page.path.toLowerCase().replace(/\/+$/, '') || '/'}:${rawKey}`;
                  setDisabled((current) => {
                    const next = new Set(current);
                    next.add(code);
                    return next;
                  });
                  if (input) input.value = '';
                }}
              >
                <input
                  name="buttonKey"
                  className={`${inputClass} flex-1 py-1.5 text-[11.5px]`}
                  placeholder="مفتاح الزر (مثال: create-invoice أو export-excel أو delete-row)"
                  dir="ltr"
                />
                <Button type="submit" size="sm" variant="secondary">
                  تعطيل الزر
                </Button>
              </form>
            )}
            <div className="flex flex-wrap gap-1.5">
              {[...disabled]
                .filter((c) => c.startsWith(`btn:${page.path.toLowerCase().replace(/\/+$/, '') || '/'}:`))
                .map((code) => {
                  const key = code.split(':').slice(2).join(':');
                  return (
                    <span
                      key={code}
                      className="inline-flex items-center gap-1.5 rounded-full border border-danger-border bg-danger-soft/50 px-2.5 py-0.5 font-mono text-[10px] text-danger"
                      dir="ltr"
                    >
                      {key}
                      {canManage && (
                        <button
                          type="button"
                          onClick={() =>
                            setDisabled((current) => {
                              const next = new Set(current);
                              next.delete(code);
                              return next;
                            })
                          }
                          className="font-bold hover:text-ink"
                          aria-label={`إعادة تفعيل ${key}`}
                        >
                          ×
                        </button>
                      )}
                    </span>
                  );
                })}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default PagePermissionsModal;
