import React from 'react';
import {
  Users,
  Search,
  CheckCircle2,
  XCircle,
  Edit2,
  Trash2,
  Lock,
  Unlock,
  Shield,
  ShieldCheck,
  ShieldOff,
  ArrowLeftRight,
  KeyRound,
} from 'lucide-react';
import { DataTable } from '../../../components/ui/DataTable';
import type { PlatformStaff, PlatformStaffRoleDefinition } from '../../../services/domains/platform/platformTypes';
import { EmptyState, formatDateTime, inputClass } from '../components/PlatformUI';
import { RoleBadge } from './RoleBadge';

interface AccountsTabProps {
  roles: PlatformStaffRoleDefinition[];
  staffList: PlatformStaff[];
  search: string;
  onSearchChange: (v: string) => void;
  roleFilter: string;
  onRoleFilterChange: (v: string) => void;
  loading: boolean;
  error: string | null;
  mfaMissingIds: Set<string>;
  isSuperAdminUser: boolean;
  canUpdate: boolean;
  canResetPassword: boolean;
  canManagePermissions: boolean;
  canDeactivate: boolean;
  canDelete: boolean;
  onEdit: (staff: PlatformStaff) => void;
  onRequestResetPassword: (staff: PlatformStaff) => void;
  onForcePasswordChange: (staff: PlatformStaff) => void;
  onRequestTransfer: (staff: PlatformStaff) => void;
  onOpenScope: (staff: PlatformStaff) => void;
  onToggleActive: (staff: PlatformStaff) => void;
  onDelete: (staff: PlatformStaff) => void;
}

export const AccountsTab: React.FC<AccountsTabProps> = ({
  roles,
  staffList,
  search,
  onSearchChange,
  roleFilter,
  onRoleFilterChange,
  loading,
  error,
  mfaMissingIds,
  isSuperAdminUser,
  canUpdate,
  canResetPassword,
  canManagePermissions,
  canDeactivate,
  canDelete,
  onEdit,
  onRequestResetPassword,
  onForcePasswordChange,
  onRequestTransfer,
  onOpenScope,
  onToggleActive,
  onDelete,
}) => (
  <>
    {/* Roles overview */}
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
      {roles.map((role) => {
        const count = staffList.filter((s) => s.role === role.role).length;
        return (
          <button
            key={role.role}
            onClick={() => onRoleFilterChange(roleFilter === role.role ? '' : role.role)}
            className={`p-3 rounded-xl border text-right transition-all ${
              roleFilter === role.role
                ? 'border-primary bg-primary/30'
                : 'border-line-strong bg-primary/60 hover:border-line-strong'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-lg font-black text-muted">{count}</span>
              <Shield className="h-4 w-4 text-muted" />
            </div>
            <p className="text-[11px] font-bold text-muted mt-1 truncate">{role.title.split('(')[0]}</p>
            <p className="text-[9.5px] text-muted mt-0.5 line-clamp-1">{role.description}</p>
          </button>
        );
      })}
    </div>

    {/* Search + filter */}
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line-strong bg-primary/60 p-3">
      <div className="relative min-w-[240px] flex-1">
        <Search className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="البحث بالاسم، البريد أو الهاتف..."
          className={`${inputClass} pr-9`}
        />
      </div>
      <select value={roleFilter} onChange={(e) => onRoleFilterChange(e.target.value)} className={`${inputClass} max-w-[200px]`}>
        <option value="">جميع الأدوار</option>
        {roles.map((role) => (
          <option key={role.role} value={role.role}>{role.title}</option>
        ))}
      </select>
      <span className="rounded-full bg-primary px-3 py-1 text-xs font-bold text-muted">{staffList.length} موظف</span>
    </div>

    {error && (
      <div className="p-3 bg-danger/10 border border-danger/20 rounded-lg text-xs font-bold text-danger">{error}</div>
    )}

    {/* Staff table */}
    <div className="overflow-hidden rounded-xl border border-line-strong bg-primary/70 shadow-sm">
      {loading ? (
        <div className="py-16 text-center text-sm font-semibold text-muted">جارٍ تحميل طاقم المنصة...</div>
      ) : staffList.length === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6 text-muted" />}
          title="لا يوجد موظفون مطابقون"
          description="أضف موظفي الدعم أو الفوترة أو العمليات، أو عدّل البحث الحالي."
        />
      ) : (
        <DataTable
          ariaLabel="طاقم المنصة"
          rows={staffList}
          rowKey={(staff) => staff.id}
          minWidth={980}
          columns={[
            {
              key: 'staff', header: 'الموظف',
              render: (staff) => (
                <div>
                  <div className="font-bold text-muted">{staff.fullName}</div>
                  <div className="text-[10px] font-mono text-muted">{staff.email}</div>
                  {staff.phone && <div className="text-[10px] text-muted" dir="ltr">{staff.phone}</div>}
                </div>
              ),
            },
            { key: 'role', header: 'الدور', render: (staff) => <RoleBadge role={staff.role} /> },
            {
              key: 'mfa', header: 'MFA',
              render: (staff) => mfaMissingIds.has(staff.id) ? (
                <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-warning"><ShieldOff className="h-3 w-3" /> غير مفعّلة</span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-success"><ShieldCheck className="h-3 w-3" /> مفعّلة</span>
              ),
            },
            {
              key: 'scope', header: 'نطاق البيانات',
              render: (staff) => <span className={`text-[10.5px] font-bold ${staff.dataScope === 'LIMITED' ? 'text-warning' : 'text-muted'}`}>{staff.dataScope === 'LIMITED' ? 'عملاء محددون' : 'كل العملاء'}</span>,
            },
            {
              key: 'status', header: 'الحالة',
              render: (staff) => (
                <span className={`font-bold inline-flex items-center gap-1 ${staff.isActive ? 'text-success' : 'text-danger'}`}>
                  {staff.isActive ? <><CheckCircle2 className="h-3 w-3" /> نشط{staff.mustChangePassword ? ' · رهن التفعيل' : ''}</> : <><XCircle className="h-3 w-3" /> موقوف</>}
                </span>
              ),
            },
            { key: 'last', header: 'آخر دخول', render: (staff) => <span className="text-muted">{staff.lastLoginAt ? formatDateTime(staff.lastLoginAt) : 'لم يسجل دخول بعد'}</span> },
            {
              key: 'actions', header: 'إجراءات', align: 'center',
              render: (staff) => {
                const isSuperAdmin = staff.role === 'SUPER_ADMIN';
                return (
                  <div className="flex items-center justify-center gap-1.5">
                    {canUpdate && (
                      <button onClick={() => onEdit(staff)} className="text-primary hover:text-primary p-1" title="تعديل البيانات"><Edit2 className="h-3.5 w-3.5" /></button>
                    )}
                    {canResetPassword && (!isSuperAdmin || isSuperAdminUser) && (
                      <button onClick={() => onRequestResetPassword(staff)} className="text-primary hover:text-primary p-1" title="إعادة تعيين كلمة المرور"><KeyRound className="h-3.5 w-3.5" /></button>
                    )}
                    {canResetPassword && (!isSuperAdmin || isSuperAdminUser) && (
                      <button onClick={() => onForcePasswordChange(staff)} className={`p-1 ${staff.mustChangePassword ? 'text-warning hover:text-warning' : 'text-muted hover:text-muted'}`} title={staff.mustChangePassword ? 'إلغاء فرض تغيير كلمة المرور' : 'فرض تغيير كلمة المرور'}><Lock className="h-3.5 w-3.5" /></button>
                    )}
                    {canManagePermissions && !isSuperAdmin && (
                      <>
                        <button onClick={() => onRequestTransfer(staff)} className="text-success hover:text-success p-1" title="نقل الصلاحيات إلى موظف آخر"><ArrowLeftRight className="h-3.5 w-3.5" /></button>
                        <button onClick={() => onOpenScope(staff)} className="text-warning hover:text-warning p-1" title="نطاق البيانات (العملاء المرئيون)"><Shield className="h-3.5 w-3.5" /></button>
                      </>
                    )}
                    {!isSuperAdmin && canDeactivate && (
                      <button onClick={() => onToggleActive(staff)} className={`p-1 ${staff.isActive ? 'text-warning hover:text-warning' : 'text-success hover:text-success'}`} title={staff.isActive ? 'تجميد الحساب + إنهاء جلساته' : 'تفعيل الحساب'}>
                        {staff.isActive ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                      </button>
                    )}
                    {!isSuperAdmin && canDelete && (
                      <button onClick={() => onDelete(staff)} className="text-danger hover:text-danger p-1" title="حذف منطقي (يبقى سجل التدقيق)"><Trash2 className="h-3.5 w-3.5" /></button>
                    )}
                  </div>
                );
              },
            },
          ]}
        />
      )}
    </div>
  </>
);
