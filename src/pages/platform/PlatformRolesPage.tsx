import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { DataTable } from '../../components/ui/DataTable';
import {
  ShieldCheck,
  Save,
  RotateCcw,
  CheckCircle2,
  Lock,
  Users,
  Info,
} from 'lucide-react';
import { platformAdminService } from '../../services/domains/platform/PlatformAdminService';
import { centralPlatformClient } from '../../services/domains/platform/CentralPlatformClient';
import { getCentralDataSourceState } from '../../hooks/platform/useCentralDataSource';
import { canPlatformPermission } from '../../hooks/platform/usePlatformPermission';
import type { PlatformRoleMatrix, PlatformStaffRole } from '../../services/domains/platform/platformTypes';
import { PLATFORM_ROLE_DEFINITIONS } from '../../services/domains/platform/PlatformAuthorizationService';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { EmptyState } from './components/PlatformUI';

import { useToast } from '../../components/ui/Toast';
const ROLE_ORDER: PlatformStaffRole[] = [
  'SUPER_ADMIN',
  'PLATFORM_ADMIN',
  'SUPPORT_AGENT',
  'OPERATIONS_ENGINEER',
  'BILLING_SPECIALIST',
  'LICENSE_MANAGER',
];

const ACTION_ORDER = ['view', 'create', 'update', 'delete', 'approve', 'export'] as const;

const CENTRAL_ACTION_LABELS: Record<string, string> = {
  view: 'عرض',
  create: 'إنشاء',
  update: 'تعديل',
  delete: 'حذف',
  approve: 'اعتماد',
  export: 'تصدير',
};

/** Build the local matrix shape from the central permission catalog endpoint. */
async function loadCentralMatrix(): Promise<PlatformRoleMatrix> {
  const catalog = await centralPlatformClient.getPermissionCatalog();
  const sections = ((catalog.sections as any[]) || []).map((section) => ({
    module: String(section.module),
    title: String(section.title ?? section.module),
    standardActions: Array.isArray(section.standardActions) ? section.standardActions.map(String) : [],
    permissions: (Array.isArray(section.permissions) ? section.permissions : []).map((permission: any) => ({
      code: String(permission.code),
      action: String(permission.action ?? ''),
      name: String(permission.name ?? permission.code),
      special: Boolean(permission.special),
    })),
  }));
  const matrix: Record<string, string[]> = {};
  for (const role of (catalog.roles as any[]) || []) {
    matrix[String(role.code)] = Array.isArray(role.permissions) ? role.permissions.map(String) : [];
  }
  return { matrix, sections, standardActionLabels: CENTRAL_ACTION_LABELS, fetchedAt: new Date().toISOString() };
}

/**
 * مصفوفة الأدوار والصلاحيات — النموذج الكامل:
 *  - مصفوفة أساسية: الأقسام × الأفعال الستة (عرض/إنشاء/تعديل/حذف/اعتماد/تصدير).
 *  - عمليات خاصة: كل صلاحية عملية على حدة (تعليق، أرشفة، إعادة تعيين، ...).
 * كل خانة يقابلها رمز صلاحية مستقل — لا توجد صلاحية "افتح الصفحة" فقط.
 */
export const PlatformRolesPage: React.FC = () => {
  const toast = useToast();
  const canManage = canPlatformPermission('platform.staff.manage_permissions');

  const [matrix, setMatrix] = useState<PlatformRoleMatrix | null>(null);
  const [draft, setDraft] = useState<Record<string, string[]>>({});
  const [dirtyRoles, setDirtyRoles] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const central = getCentralDataSourceState();
      if (central.misconfigured) {
        throw new Error('مصدر البيانات مضبوط على «المركزي» لكن جسر الاتصال بالسيرفر غير متاح في هذا الإصدار.');
      }
      const data = central.active ? await loadCentralMatrix() : platformAdminService.getRolePermissionMatrix();
      setMatrix(data);
      setDraft(Object.fromEntries(Object.entries(data.matrix).map(([role, codes]) => [role, [...codes]])));
      setDirtyRoles(new Set());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذر تحميل مصفوفة الصلاحيات.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const actionLabel = useCallback((action: string) => matrix?.standardActionLabels[action] ?? action, [matrix]);

  const permissionByModuleAction = useMemo(() => {
    const map = new Map<string, { code: string; name: string }>();
    for (const section of matrix?.sections ?? []) {
      for (const permission of section.permissions) {
        map.set(`${section.module}.${permission.action}`, { code: permission.code, name: permission.name });
      }
    }
    return map;
  }, [matrix]);

  const specialPermissions = useMemo(() => {
    const list: Array<{ code: string; module: string; sectionTitle: string; name: string }> = [];
    for (const section of matrix?.sections ?? []) {
      for (const permission of section.permissions) {
        if (permission.special) {
          list.push({ code: permission.code, module: section.module, sectionTitle: section.title, name: permission.name });
        }
      }
    }
    return list;
  }, [matrix]);

  const grantedSets = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const [role, codes] of Object.entries(draft)) {
      map.set(role, new Set(codes));
    }
    return map;
  }, [draft]);

  const togglePermission = useCallback((role: string, code: string) => {
    if (role === 'SUPER_ADMIN' || !canManage) return;
    setDraft((prev) => {
      const current = new Set(prev[role] ?? []);
      if (current.has(code)) current.delete(code);
      else current.add(code);
      return { ...prev, [role]: [...current] };
    });
    setDirtyRoles((prev) => new Set(prev).add(role));
  }, [canManage]);

  const handleSave = async () => {
    if (!canManage || dirtyRoles.size === 0) return;
    setSaving(true);
    try {
      const central = getCentralDataSourceState();
      if (central.misconfigured) {
        throw new Error('مصدر البيانات مضبوط على «المركزي» لكن جسر الاتصال بالسيرفر غير متاح في هذا الإصدار.');
      }
      if (central.active) {
        for (const role of dirtyRoles) {
          if (role === 'SUPER_ADMIN') continue;
          await centralPlatformClient.updateRolePermissions(role, draft[role] ?? []);
        }
      } else {
        for (const role of dirtyRoles) {
          platformAdminService.setRolePermissions(role, draft[role] ?? []);
        }
      }
      toast.success(`تم حفظ مصفوفة الصلاحيات لـ ${dirtyRoles.size} دور/أدوار. تُطبق التغييرات فوراً على جميع الموظفين بذلك الدور.`);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذر حفظ المصفوفة.');
    } finally {
      setSaving(false);
    }
  };

  const toggleAllForRole = (role: string, codes: string[], grant: boolean) => {
    if (role === 'SUPER_ADMIN' || !canManage) return;
    setDraft((prev) => {
      const current = new Set(prev[role] ?? []);
      for (const code of codes) {
        if (grant) current.add(code);
        else current.delete(code);
      }
      return { ...prev, [role]: [...current] };
    });
    setDirtyRoles((prev) => new Set(prev).add(role));
  };

  const standardCodesForRole = () =>
    (matrix?.sections ?? []).flatMap((section) =>
      section.permissions.filter((permission) => !permission.special).map((permission) => permission.code),
    );

  if (loading) {
    return <div className="py-20 text-center text-sm font-semibold text-slate-500">جارٍ تحميل مصفوفة الصلاحيات...</div>;
  }

  if (!matrix) {
    return (
      <EmptyState
        icon={<ShieldCheck className="h-6 w-6 text-slate-500" />}
        title="تعذر تحميل المصفوفة"
        description="تأكد من تشغيل النظام على أحدث نسخة (ترقية قاعدة البيانات 200_platform_rbac_v2 مطلوبة)."
      />
    );
  }

  const roleTitle = (role: string) => PLATFORM_ROLE_DEFINITIONS[role as PlatformStaffRole]?.title ?? role;

  const renderCheckbox = (role: string, code: string | undefined, label?: string) => {
    if (!code) {
      return <span className="text-slate-700 select-none">—</span>;
    }
    const checked = grantedSets.get(role)?.has(code) ?? (role === 'SUPER_ADMIN');
    const disabled = role === 'SUPER_ADMIN' || !canManage;
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={label ?? code}
        disabled={disabled}
        onClick={() => togglePermission(role, code)}
        className={`mx-auto flex h-5 w-5 items-center justify-center rounded border transition-all ${
          checked
            ? 'border-sky-500 bg-sky-500 text-white'
            : 'border-slate-700 bg-slate-900 hover:border-slate-500'
        } ${disabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}
      >
        {checked && (
          <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 6.5 4.8 9 10 3.5" />
          </svg>
        )}
      </button>
    );
  };

  return (
    <div className="space-y-4 text-right">
      <PageHeader
        title="مصفوفة الأدوار والصلاحيات"
        description="كل خانة = صلاحية مستقلة تُطبق فوراً في الواجهة والـ API ونطاق البيانات. مالك المنصة يملك كل الصلاحيات دائماً ولا يمكن تعديلها."
        icon={<ShieldCheck className="h-5 w-5" />}
        actions={(
          <div className="flex items-center gap-2">
            {dirtyRoles.size > 0 && (
              <Button size="sm" variant="ghost" onClick={() => void load()} leadingIcon={<RotateCcw className="h-4 w-4" />}>
                تجاهل ({dirtyRoles.size})
              </Button>
            )}
            {canManage && (
              <Button size="sm" onClick={handleSave} loading={saving} disabled={dirtyRoles.size === 0} leadingIcon={<Save className="h-4 w-4" />}>
                حفظ التغييرات
              </Button>
            )}
          </div>
        )}
      />

      {/* Role summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
        {ROLE_ORDER.map((role) => {
          const count = role === 'SUPER_ADMIN' ? matrix.sections.flatMap((s) => s.permissions).length : (draft[role]?.length ?? 0);
          const isDirty = dirtyRoles.has(role);
          return (
            <div key={role} className={`rounded-xl border p-3 ${isDirty ? 'border-amber-500/50 bg-amber-500/5' : 'border-slate-800 bg-slate-900/60'}`}>
              <div className="flex items-center justify-between">
                <span className="text-lg font-black text-slate-100">{count}</span>
                {role === 'SUPER_ADMIN' ? <Lock className="h-4 w-4 text-purple-400" /> : isDirty ? <span className="text-[10px] font-black text-amber-400">معدّلة</span> : <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
              </div>
              <p className="mt-1 text-[10.5px] font-bold text-slate-200 leading-tight">{roleTitle(role)}</p>
              <p className="mt-0.5 text-[9px] text-slate-500">صلاحية ممنوحة</p>
            </div>
          );
        })}
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-sky-500/20 bg-sky-500/5 p-3 text-[10.5px] leading-5 text-sky-200/80">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>التغييرات تسري فوراً على كل طلبات الـ API. الأعمدة الفارغة (—) تعني أن العملية غير متاحة لهذا القسم وليست قابلة للتفعيل. الأزرار في الواجهة تخفي ما لا تملكه — لكن الحماية الحقيقية تحدث في طبقة الخدمة.</p>
      </div>

      {/* ─── Matrix 1: standard actions × sections ─────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/50 px-4 py-2.5">
          <p className="text-xs font-black text-slate-200">المصفوفة الأساسية — القسم × العملية</p>
          {canManage && (
            <div className="flex items-center gap-3 text-[10px] font-bold text-slate-500">
              {ROLE_ORDER.filter((r) => r !== 'SUPER_ADMIN').map((role) => (
                <span key={role} className="hidden xl:flex items-center gap-1.5">
                  <button className="text-sky-400 hover:underline" onClick={() => toggleAllForRole(role, standardCodesForRole(), true)}>الكل+</button>
                  <button className="text-rose-400/80 hover:underline" onClick={() => toggleAllForRole(role, standardCodesForRole(), false)}>الكل−</button>
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="overflow-x-auto">
          <DataTable
            ariaLabel="مصفوفة الصلاحيات"
            rows={matrix.sections.filter((section) => section.standardActions.length > 0)}
            rowKey={(section) => section.module}
            minWidth={980}
            dense
            tableClassName="text-xs"
            rowClassName={() => 'hover:bg-slate-800/20'}
            columns={[
              {
                key: 'section', header: 'القسم / العملية',
                render: (section) => <span className="font-bold text-slate-200">{section.title}</span>,
              },
              ...ROLE_ORDER.map((role) => ({
                key: `role-${role}`, header: roleTitle(role).split('(')[0], align: 'center' as const,
                render: (section: (typeof matrix.sections)[number]) => (
                  <div className="grid grid-cols-6 gap-1">
                    {ACTION_ORDER.map((action) => {
                      if (!section.standardActions.includes(action)) {
                        return <span key={action} className="text-center text-slate-800 select-none">—</span>;
                      }
                      const code = permissionByModuleAction.get(`${section.module}.${action}`)?.code;
                      return (
                        <div key={action} className="flex flex-col items-center">
                          {renderCheckbox(role, code, `${section.title} — ${actionLabel(action)} (${roleTitle(role)})`)}
                          <span className="mt-0.5 text-[8px] font-bold text-slate-600">{actionLabel(action)}</span>
                        </div>
                      );
                    })}
                  </div>
                ),
              })),
              {
                key: 'code', header: 'الرموز',
                render: (section) => <code className="block max-w-[190px] truncate text-[8px] text-slate-600" dir="ltr">platform.{section.module}.*</code>,
              },
            ]}
          />
        </div>
      </div>

      {/* ─── Matrix 2: special operations ───────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70 shadow-sm">
        <div className="border-b border-slate-800 bg-slate-950/50 px-4 py-2.5">
          <p className="text-xs font-black text-slate-200">العمليات الخاصة — كل عملية على حدة</p>
          <p className="text-[9.5px] text-slate-500">تعليق عميل، إعادة تعيين كلمة المرور، نقل الصلاحيات، تغيير السياسة... لا يمكن منحها عبر المصفوفة الأساسية.</p>
        </div>
        <div className="overflow-x-auto">
          <DataTable
            ariaLabel="العمليات الخاصة"
            rows={specialPermissions}
            rowKey={(permission) => permission.code}
            minWidth={880}
            dense
            tableClassName="text-xs"
            rowClassName={() => 'hover:bg-slate-800/20'}
            columns={[
              {
                key: 'perm', header: 'العملية الخاصة',
                render: (permission) => (
                  <span>
                    <span className="font-semibold text-slate-300">{permission.name}</span>
                    <span className="mr-2 text-[9px] text-slate-600">({permission.sectionTitle})</span>
                  </span>
                ),
              },
              ...ROLE_ORDER.map((role) => ({
                key: `role-${role}`, header: roleTitle(role).split('(')[0], align: 'center' as const,
                render: (permission: (typeof specialPermissions)[number]) => renderCheckbox(role, permission.code, `${permission.name} (${roleTitle(role)})`),
              })),
              {
                key: 'code', header: 'الرمز',
                render: (permission) => <code className="block max-w-[220px] truncate text-[8.5px] text-slate-600" dir="ltr">{permission.code}</code>,
              },
            ]}
          />
        </div>
      </div>

      {!canManage && (
        <p className="flex items-center gap-2 text-[10.5px] text-slate-600">
          <Lock className="h-3.5 w-3.5" /> وضع العرض فقط — تعديل المصفوفة يتطلب صلاحية platform.staff.manage_permissions.
        </p>
      )}

      <p className="flex items-center gap-2 text-[10px] text-slate-600">
        <Users className="h-3.5 w-3.5" /> الصلاحيات الفعلية لأي موظف = مصفوفة دوره ∪ التجاوزات الفردية (permissions_override) — الأولوية دائماً لمنع ما ليس ممنوحاً صراحة.
      </p>
    </div>
  );
};

export default PlatformRolesPage;
