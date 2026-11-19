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
                ? 'border-sky-500 bg-sky-950/30'
                : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-lg font-black text-slate-100">{count}</span>
              <Shield className="h-4 w-4 text-slate-500" />
            </div>
            <p className="text-[11px] font-bold text-slate-200 mt-1 truncate">{role.title.split('(')[0]}</p>
            <p className="text-[9.5px] text-slate-500 mt-0.5 line-clamp-1">{role.description}</p>
          </button>
        );
      })}
    </div>

    {/* Search + filter */}
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
      <div className="relative min-w-[240px] flex-1">
        <Search className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
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
      <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-bold text-slate-300">{staffList.length} موظف</span>
    </div>

    {error && (
      <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-xs font-bold text-rose-300">{error}</div>
    )}

    {/* Staff table */}
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70 shadow-sm">
      {loading ? (
        <div className="py-16 text-center text-sm font-semibold text-slate-500">جارٍ تحميل طاقم المنصة...</div>
      ) : staffList.length === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6 text-slate-500" />}
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
                  <div className="font-bold text-slate-100">{staff.fullName}</div>
                  <div className="text-[10px] font-mono text-slate-500">{staff.email}</div>
                  {staff.phone && <div className="text-[10px] text-slate-500" dir="ltr">{staff.phone}</div>}
                </div>
              ),
            },
            { key: 'role', header: 'الدور', render: (staff) => <RoleBadge role={staff.role} /> },
            {
              key: 'mfa', header: 'MFA',
              render: (staff) => mfaMissingIds.has(staff.id) ? (
                <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-amber-400"><ShieldOff className="h-3 w-3" /> غير مفعّلة</span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-emerald-400"><ShieldCheck className="h-3 w-3" /> مفعّلة</span>
              ),
            },
            {
              key: 'scope', header: 'نطاق البيانات',
              render: (staff) => <span className={`text-[10.5px] font-bold ${staff.dataScope === 'LIMITED' ? 'text-amber-400' : 'text-slate-400'}`}>{staff.dataScope === 'LIMITED' ? 'عملاء محددون' : 'كل العملاء'}</span>,
            },
            {
              key: 'status', header: 'الحالة',
              render: (staff) => (
                <span className={`font-bold inline-flex items-center gap-1 ${staff.isActive ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {staff.isActive ? <><CheckCircle2 className="h-3 w-3" /> نشط{staff.mustChangePassword ? ' · رهن التفعيل' : ''}</> : <><XCircle className="h-3 w-3" /> موقوف</>}
                </span>
              ),
            },
            { key: 'last', header: 'آخر دخول', render: (staff) => <span className="text-slate-400">{staff.lastLoginAt ? formatDateTime(staff.lastLoginAt) : 'لم يسجل دخول بعد'}</span> },
            {
              key: 'actions', header: 'إجراءات', align: 'center',
              render: (staff) => {
                const isSuperAdmin = staff.role === 'SUPER_ADMIN';
                return (
                  <div className="flex items-center justify-center gap-1.5">
                    {canUpdate && (
                      <button onClick={() => onEdit(staff)} className="text-sky-400 hover:text-sky-300 p-1" title="تعديل البيانات"><Edit2 className="h-3.5 w-3.5" /></button>
                    )}
                    {canResetPassword && (!isSuperAdmin || isSuperAdminUser) && (
                      <button onClick={() => onRequestResetPassword(staff)} className="text-violet-400 hover:text-violet-300 p-1" title="إعادة تعيين كلمة المرور"><KeyRound className="h-3.5 w-3.5" /></button>
                    )}
                    {canResetPassword && (!isSuperAdmin || isSuperAdminUser) && (
                      <button onClick={() => onForcePasswordChange(staff)} className={`p-1 ${staff.mustChangePassword ? 'text-amber-400 hover:text-amber-300' : 'text-slate-500 hover:text-slate-300'}`} title={staff.mustChangePassword ? 'إلغاء فرض تغيير كلمة المرور' : 'فرض تغيير كلمة المرور'}><Lock className="h-3.5 w-3.5" /></button>
                    )}
                    {canManagePermissions && !isSuperAdmin && (
                      <>
                        <button onClick={() => onRequestTransfer(staff)} className="text-teal-400 hover:text-teal-300 p-1" title="نقل الصلاحيات إلى موظف آخر"><ArrowLeftRight className="h-3.5 w-3.5" /></button>
                        <button onClick={() => onOpenScope(staff)} className="text-orange-400 hover:text-orange-300 p-1" title="نطاق البيانات (العملاء المرئيون)"><Shield className="h-3.5 w-3.5" /></button>
                      </>
                    )}
                    {!isSuperAdmin && canDeactivate && (
                      <button onClick={() => onToggleActive(staff)} className={`p-1 ${staff.isActive ? 'text-amber-400 hover:text-amber-300' : 'text-emerald-400 hover:text-emerald-300'}`} title={staff.isActive ? 'تجميد الحساب + إنهاء جلساته' : 'تفعيل الحساب'}>
                        {staff.isActive ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                      </button>
                    )}
                    {!isSuperAdmin && canDelete && (
                      <button onClick={() => onDelete(staff)} className="text-rose-400 hover:text-rose-300 p-1" title="حذف منطقي (يبقى سجل التدقيق)"><Trash2 className="h-3.5 w-3.5" /></button>
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
