import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ShieldCheck,
  Users,
  Building2,
  UserPlus,
  Shield,
  Key,
  Lock,
  Unlock,
  Trash2,
  Pencil,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  UserCheck,
  RefreshCw,
  Plus,
  Layers,
  ChevronRight,
  Sliders,
  BadgeCheck,
} from 'lucide-react';
import { platformAdminService } from '../../services/domains/platform/PlatformAdminService';
import { CentralUnsupportedNotice } from './components/CentralUnsupportedNotice';
import { centralPlatformClient } from '../../services/domains/platform/CentralPlatformClient';
import { getCentralDataSourceState } from '../../hooks/platform/useCentralDataSource'; 
import { canPlatform } from '../../hooks/platform/usePlatformPermission';
import type {
  PlatformStaff,
  PlatformStaffInput,
  PlatformStaffRole,
  PlatformStaffRoleDefinition,
  PlatformTenant,
  PlatformTenantUser,
  PlatformTenantUserInput,
} from '../../services/domains/platform/platformTypes';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import {
  EmptyState,
  StatusBadge,
  formatDateTime,
  inputClass,
} from './components/PlatformUI';

type ActiveTab = 'STAFF' | 'TENANTS';

const ROLE_BADGE_STYLE: Record<PlatformStaffRole, { bg: string; text: string; label: string }> = {
  SUPER_ADMIN: { bg: 'bg-purple-500/20 border-purple-500/40', text: 'text-purple-300', label: 'مالك المنصة' },
  PLATFORM_ADMIN: { bg: 'bg-indigo-500/20 border-indigo-500/40', text: 'text-indigo-300', label: 'مدير منصة عام' },
  SUPPORT_AGENT: { bg: 'bg-emerald-500/20 border-emerald-500/40', text: 'text-emerald-300', label: 'دعم فني' },
  OPERATIONS_ENGINEER: { bg: 'bg-sky-500/20 border-sky-500/40', text: 'text-sky-300', label: 'عمليات وبنية تحتية' },
  BILLING_SPECIALIST: { bg: 'bg-amber-500/20 border-amber-500/40', text: 'text-amber-300', label: 'فواتير واشتراكات' },
  LICENSE_MANAGER: { bg: 'bg-pink-500/20 border-pink-500/40', text: 'text-pink-300', label: 'إدارة التراخيص' },
};

export const PlatformAdminControlPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('STAFF');

  // Staff State
  const [staffList, setStaffList] = useState<PlatformStaff[]>([]);
  const [staffRoles, setStaffRoles] = useState<PlatformStaffRoleDefinition[]>([]);
  const [staffSearch, setStaffSearch] = useState('');
  const [staffRoleFilter, setStaffRoleFilter] = useState('');
  const [staffLoading, setStaffLoading] = useState(true);

  // Tenant Users State
  const [tenants, setTenants] = useState<PlatformTenant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [tenantUsers, setTenantUsers] = useState<PlatformTenantUser[]>([]);
  const [tenantUsersLoading, setTenantUsersLoading] = useState(false);
  const [tenantSearch, setTenantSearch] = useState('');

  // Modals & Forms
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<PlatformStaff | null>(null);
  const [staffForm, setStaffForm] = useState<PlatformStaffInput>({
    fullName: '',
    email: '',
    phone: '',
    role: 'SUPPORT_AGENT',
    password: '',
    isActive: true,
  });

  const [isTenantUserModalOpen, setIsTenantUserModalOpen] = useState(false);
  const [editingTenantUser, setEditingTenantUser] = useState<PlatformTenantUser | null>(null);
  const [tenantUserForm, setTenantUserForm] = useState<PlatformTenantUserInput>({
    fullName: '',
    username: '',
    email: '',
    phone: '',
    role: 'ADMIN',
    status: 'ACTIVE',
  });

  const [error, setError] = useState<string | null>(null);

  // Load staff
  const loadStaff = useCallback(async () => {
    setStaffLoading(true);
    const centralState = getCentralDataSourceState();
    try {
      if (centralState.active) {
        const [staff, roles] = await Promise.all([
          centralPlatformClient.listAdminControlStaff({ search: staffSearch, role: staffRoleFilter }),
          centralPlatformClient.listAdminControlStaffRoles(),
        ]);
        setStaffList(staff);
        setStaffRoles(roles);
      } else {
        setStaffList(platformAdminService.listPlatformStaff(staffSearch, staffRoleFilter));
        setStaffRoles(platformAdminService.listPlatformStaffRoles());
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل موظفي المنصة.');
    } finally {
      setStaffLoading(false);
    }
  }, [staffSearch, staffRoleFilter]);

  // Load tenants
  const loadTenants = useCallback(async () => {
    const centralState = getCentralDataSourceState();
    try {
      const list = centralState.active
        ? await centralPlatformClient.listTenants()
        : platformAdminService.listTenants();
      setTenants(list);
      if (list.length > 0 && !selectedTenantId) {
        setSelectedTenantId(list[0].id);
      }
    } catch (err) {
      console.error(err);
    }
  }, [selectedTenantId]);

  // Load tenant users
  const loadTenantUsers = useCallback(async (tenantId: string) => {
    if (!tenantId) return;
    setTenantUsersLoading(true);
    const centralState = getCentralDataSourceState();
    try {
      const users = centralState.active
        ? await centralPlatformClient.listTenantUsers(tenantId)
        : platformAdminService.listTenantUsers(tenantId);
      setTenantUsers(users);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل مستخدمي العميل.');
    } finally {
      setTenantUsersLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStaff();
    loadTenants();
  }, [loadStaff, loadTenants]);

  useEffect(() => {
    if (selectedTenantId) {
      loadTenantUsers(selectedTenantId);
    }
  }, [selectedTenantId, loadTenantUsers]);

  // Open Staff Modal
  const openStaffModal = (staff?: PlatformStaff) => {
    if (staff) {
      setEditingStaff(staff);
      setStaffForm({
        fullName: staff.fullName,
        email: staff.email,
        phone: staff.phone || '',
        role: staff.role,
        password: '',
        isActive: staff.isActive,
      });
    } else {
      setEditingStaff(null);
      setStaffForm({
        fullName: '',
        email: '',
        phone: '',
        role: 'SUPPORT_AGENT',
        password: '',
        isActive: true,
      });
    }
    setIsStaffModalOpen(true);
  };

  const canManageStaff = canPlatform('staff');
  const canDeleteStaff = canPlatform('staff', 'staff.delete_owner');
  const canManageTenantUsers = canPlatform('admin-control');

  // Save Staff
  const handleSaveStaff = async () => {
    if (!canManageStaff) {
      alert('لا تملك صلاحية إدارة موظفي المنصة.');
      return;
    }
    if (!editingStaff && (!staffForm.password || staffForm.password.length < 8)) {
      alert('كلمة مرور موظف المنصة مطلوبة ويجب أن تكون 8 أحرف على الأقل.');
      return;
    }
    if (editingStaff && staffForm.password && staffForm.password.length > 0 && staffForm.password.length < 8) {
      alert('كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل.');
      return;
    }
    const centralState = getCentralDataSourceState();
    try {
      const payload = { ...staffForm };
      if (editingStaff && !payload.password) {
        delete payload.password;
      }
      if (centralState.active) {
        if (editingStaff) {
          await centralPlatformClient.updateAdminControlStaff(editingStaff.id, payload);
        } else {
          await centralPlatformClient.createAdminControlStaff(payload);
        }
      } else {
        if (editingStaff) {
          platformAdminService.updatePlatformStaff(editingStaff.id, payload);
        } else {
          platformAdminService.createPlatformStaff(payload);
        }
      }
      setIsStaffModalOpen(false);
      loadStaff();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'فشلت العملية.');
    }
  };

  // Toggle Staff Active
  const handleToggleStaffActive = async (staff: PlatformStaff) => {
    if (!canManageStaff) {
      alert('لا تملك صلاحية إدارة موظفي المنصة.');
      return;
    }
    const centralState = getCentralDataSourceState();
    try {
      if (centralState.active) {
        await centralPlatformClient.updateAdminControlStaff(staff.id, { isActive: !staff.isActive });
      } else {
        platformAdminService.setPlatformStaffActive(staff.id, !staff.isActive);
      }
      loadStaff();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'تعذر تغيير حالة الموظف.');
    }
  };

  // Delete Staff
  const handleDeleteStaff = async (staff: PlatformStaff) => {
    if (!canDeleteStaff) {
      alert('لا تملك صلاحية حذف موظفي المنصة.');
      return;
    }
    if (!confirm(`هل أنت متأكد من حذف موظف المنصة (${staff.fullName})؟`)) return;
    const centralState = getCentralDataSourceState();
    try {
      if (centralState.active) {
        await centralPlatformClient.deleteAdminControlStaff(staff.id);
      } else {
        platformAdminService.deletePlatformStaff(staff.id);
      }
      loadStaff();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'تعذر حذف الموظف.');
    }
  };

  // Open Tenant User Modal
  const openTenantUserModal = (user?: PlatformTenantUser) => {
    if (user) {
      setEditingTenantUser(user);
      setTenantUserForm({
        fullName: user.fullName,
        username: user.username || '',
        email: user.email || '',
        phone: user.phone || '',
        role: user.role,
        status: user.status,
      });
    } else {
      setEditingTenantUser(null);
      setTenantUserForm({
        fullName: '',
        username: '',
        email: '',
        phone: '',
        role: 'ADMIN',
        status: 'ACTIVE',
      });
    }
    setIsTenantUserModalOpen(true);
  };

  // Save Tenant User
  const handleSaveTenantUser = async () => {
    if (!selectedTenantId) return;
    if (!canManageTenantUsers) {
      alert('لا تملك صلاحية إدارة مستخدمي العملاء.');
      return;
    }
    try {
      if (editingTenantUser) {
        platformAdminService.updateTenantUser(editingTenantUser.id, tenantUserForm);
      } else {
        const result = platformAdminService.createTenantUser(selectedTenantId, {
          ...tenantUserForm,
          provisionIdentity: true,
          provisioningMode: 'INVITE',
        });
        const parts = [result.message];
        if (result.inviteCode) parts.push(`كود الدعوة: ${result.inviteCode}`);
        if (result.temporaryPassword) parts.push(`كلمة المرور المؤقتة: ${result.temporaryPassword}`);
        if (result.user.identityUserId) parts.push(`معرّف الهوية: ${result.user.identityUserId}`);
        alert(parts.join('\n'));
      }
      setIsTenantUserModalOpen(false);
      loadTenantUsers(selectedTenantId);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'فشلت العملية.');
    }
  };

  // Toggle Tenant User Active
  const handleToggleTenantUserActive = async (user: PlatformTenantUser) => {
    if (!canManageTenantUsers) {
      alert('لا تملك صلاحية إدارة مستخدمي العملاء.');
      return;
    }
    const centralState = getCentralDataSourceState();
    try {
      if (centralState.active && selectedTenantId) {
        await centralPlatformClient.setTenantUserActive(selectedTenantId, user.id, user.status !== 'ACTIVE');
      } else {
        platformAdminService.setTenantUserActive(user.id, user.status !== 'ACTIVE');
      }
      if (selectedTenantId) loadTenantUsers(selectedTenantId);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'تعذر تغيير حالة المستخدم.');
    }
  };

  // Delete Tenant User
  const handleDeleteTenantUser = async (user: PlatformTenantUser) => {
    if (!canManageTenantUsers) {
      alert('لا تملك صلاحية إدارة مستخدمي العملاء.');
      return;
    }
    if (!confirm(`هل أنت متأكد من حذف مستخدم العميل (${user.fullName})؟`)) return;
    const centralState = getCentralDataSourceState();
    try {
      if (centralState.active && selectedTenantId) {
        await centralPlatformClient.deleteTenantUser(selectedTenantId, user.id);
      } else {
        platformAdminService.deleteTenantUser(user.id);
      }
      if (selectedTenantId) loadTenantUsers(selectedTenantId);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'تعذر حذف المستخدم.');
    }
  };

  return (
    <div className="space-y-5">
      <CentralUnsupportedNotice feature="التحكم الإداري (Admin Control)" />
      {/* Page Header */}
      <PageHeader
        title="مركز التحكم الإداري (RBAC & Staff Console)"
        description="فصل كامل بين إدارة موظفي الشركة المالكة للمنصة (Platform Staff) وإدارة مستخدمي الشركات العميلة (Tenant Users)."
        icon={<ShieldCheck className="h-6 w-6 text-emerald-400" />}
      />

      {error && (
        <div role="alert" className="rounded-xl border border-rose-800 bg-rose-950/40 p-4 text-rose-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-rose-400" />
            <span className="font-bold">{error}</span>
          </div>
        </div>
      )}

      {/* Main Mode Tabs Switcher */}
      <div className="flex border-b border-slate-800 pb-0">
        <button
          onClick={() => setActiveTab('STAFF')}
          className={`flex items-center gap-2 px-6 py-3 text-sm font-bold border-b-2 transition-all ${
            activeTab === 'STAFF'
              ? 'border-emerald-500 text-emerald-400 bg-slate-900/60'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Shield className="h-4 w-4" />
          <span>إدارة موظفي المنصة (Platform Staff Management)</span>
        </button>

        <button
          onClick={() => setActiveTab('TENANTS')}
          className={`flex items-center gap-2 px-6 py-3 text-sm font-bold border-b-2 transition-all ${
            activeTab === 'TENANTS'
              ? 'border-emerald-500 text-emerald-400 bg-slate-900/60'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Building2 className="h-4 w-4" />
          <span>إدارة مستخدمي الشركات العميلة (Tenant Admin & Users)</span>
        </button>
      </div>

      {/* TAB 1: PLATFORM STAFF MANAGEMENT */}
      {activeTab === 'STAFF' && (
        <div className="space-y-5">
          {/* Top Bar: Search, Role Filter, Add Staff Button */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/80 p-3.5 shadow-sm">
            <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
              <div className="relative min-w-[220px]">
                <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={staffSearch}
                  onChange={(e) => setStaffSearch(e.target.value)}
                  placeholder="ابحث بالاسم أو البريد أو الهاتف..."
                  className={`${inputClass} pr-9 text-xs`}
                />
              </div>

              <select
                value={staffRoleFilter}
                onChange={(e) => setStaffRoleFilter(e.target.value)}
                className={`${inputClass} text-xs max-w-[190px]`}
              >
                <option value="">جميع الأدوار الوظيفية</option>
                <option value="SUPER_ADMIN">مالك المنصة (Super Admin)</option>
                <option value="PLATFORM_ADMIN">مدير منصة (Platform Admin)</option>
                <option value="SUPPORT_AGENT">دعم فني (Support Specialist)</option>
                <option value="OPERATIONS_ENGINEER">مهندس عمليات (Operations)</option>
                <option value="BILLING_SPECIALIST">أخصائي فواتير (Billing)</option>
                <option value="LICENSE_MANAGER">إدارة التراخيص (Licensing)</option>
              </select>
            </div>

            {canManageStaff && (
              <Button
                size="sm"
                onClick={() => openStaffModal()}
                leadingIcon={<UserPlus className="h-4 w-4" />}
              >
                إضافة موظف منصة جديد
              </Button>
            )}
          </div>

          {/* Platform Staff Table */}
          <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70 shadow-sm">
            {staffLoading ? (
              <div className="py-16 text-center text-sm font-semibold text-slate-500">
                <RefreshCw className="inline-block h-5 w-5 animate-spin mb-2" />
                <p>جارٍ تحميل موظفي المنصة...</p>
              </div>
            ) : staffList.length === 0 ? (
              <EmptyState
                icon={<Users className="h-6 w-6 text-slate-500" />}
                title="لا يوجد موظفون مسجلون"
                description="قم بإضافة موظفين للمنصة وتعيين أدوارهم وصلاحياتهم."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[850px] text-right">
                  <thead className="border-b border-slate-800 bg-slate-950/50 text-[11px] font-bold text-slate-400">
                    <tr>
                      <th className="px-4 py-3">الموظف والبريد الإلكتروني</th>
                      <th className="px-4 py-3">الدور الوظيفي بالمنصة</th>
                      <th className="px-4 py-3">الصلاحيات المتاحة والمقيدة</th>
                      <th className="px-4 py-3">الحالة</th>
                      <th className="px-4 py-3">تاريخ الإضافة</th>
                      <th className="px-4 py-3 text-center">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {staffList.map((staff) => {
                      const badge = ROLE_BADGE_STYLE[staff.role] || {
                        bg: 'bg-slate-800',
                        text: 'text-slate-300',
                        label: staff.role,
                      };
                      const isOwner = staff.role === 'SUPER_ADMIN';

                      return (
                        <tr key={staff.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2.5">
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-slate-300 font-bold text-xs">
                                {staff.fullName.charAt(0)}
                              </div>
                              <div>
                                <p className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                                  {staff.fullName}
                                  {isOwner && (
                                    <span title="مالك المنصة" className="inline-flex items-center"><BadgeCheck className="h-3.5 w-3.5 text-purple-400" /></span>
                                  )}
                                </p>
                                <p className="text-[11px] text-slate-400">{staff.email}</p>
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-3.5">
                            <span
                              className={`inline-flex items-center rounded-md border px-2.5 py-1 text-[11px] font-bold ${badge.bg} ${badge.text}`}
                            >
                              {badge.label}
                            </span>
                          </td>

                          <td className="px-4 py-3.5 text-xs text-slate-400">
                            {isOwner ? (
                              <span className="text-purple-300 font-semibold">وصول كامل لكافة الأنظمة (*)</span>
                            ) : staff.role === 'SUPPORT_AGENT' ? (
                              <span>تذاكر الدعم · جلسات Remote · التشخيص (مقيد الفواتير والأسعار)</span>
                            ) : staff.role === 'OPERATIONS_ENGINEER' ? (
                              <span>العمليات · النسخ الاحتياطي · المزامنة (مقيد الفواتير والتراخيص)</span>
                            ) : staff.role === 'BILLING_SPECIALIST' ? (
                              <span>الفوترة والمدفوعات · الاشتراكات (مقيد البنية والتراخيص)</span>
                            ) : staff.role === 'LICENSE_MANAGER' ? (
                              <span>إصدار التراخيص · الأجهزة والربط (مقيد الفواتير والعمليات)</span>
                            ) : (
                              <span>إدارة منصة عامة</span>
                            )}
                          </td>

                          <td className="px-4 py-3.5">
                            <span
                              className={`inline-flex items-center gap-1 text-[11px] font-bold ${
                                staff.isActive ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {staff.isActive ? (
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              ) : (
                                <XCircle className="h-3.5 w-3.5" />
                              )}
                              {staff.isActive ? 'نشط' : 'معطل'}
                            </span>
                          </td>

                          <td className="px-4 py-3.5 text-xs text-slate-400">
                            {formatDateTime(staff.createdAt)}
                          </td>

                          <td className="px-4 py-3.5">
                            <div className="flex items-center justify-center gap-1.5">
                              {canManageStaff && (
                                <button
                                  onClick={() => openStaffModal(staff)}
                                  title="تعديل الموظف"
                                  className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                              )}

                              {!isOwner && canManageStaff && (
                                <>
                                  <button
                                    onClick={() => handleToggleStaffActive(staff)}
                                    title={staff.isActive ? 'تعطيل الحساب' : 'تنشيط الحساب'}
                                    className={`rounded p-1 transition-colors ${
                                      staff.isActive
                                        ? 'text-amber-400 hover:bg-amber-950/40'
                                        : 'text-emerald-400 hover:bg-emerald-950/40'
                                    }`}
                                  >
                                    {staff.isActive ? (
                                      <Lock className="h-3.5 w-3.5" />
                                    ) : (
                                      <Unlock className="h-3.5 w-3.5" />
                                    )}
                                  </button>

                                  {canDeleteStaff && (
                                    <button
                                      onClick={() => handleDeleteStaff(staff)}
                                      title="حذف الموظف"
                                      className="rounded p-1 text-rose-400 hover:bg-rose-950/40 transition-colors"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Staff Roles & Permissions Matrix Overview */}
          <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm">
            <h3 className="text-xs font-bold text-slate-200 mb-3 flex items-center gap-2">
              <Shield className="h-4 w-4 text-emerald-400" />
              مصفوفة الأدوار الوظيفية وعزل الصلاحيات في المنصة (Platform RBAC Rules)
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {staffRoles.map((roleDef) => (
                <div key={roleDef.role} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-slate-200">{roleDef.title}</span>
                    <span className="text-[10px] text-slate-500 font-mono">{roleDef.role}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">{roleDef.description}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* TAB 2: TENANT ADMIN MANAGEMENT */}
      {activeTab === 'TENANTS' && (
        <div className="space-y-5">
          {/* Tenant Selector & Actions Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/80 p-3.5 shadow-sm">
            <div className="flex items-center gap-3 flex-1 min-w-[280px]">
              <Building2 className="h-5 w-5 text-emerald-400 shrink-0" />
              <div className="flex-1 max-w-md">
                <label className="block text-[11px] font-bold text-slate-400 mb-1">اختر الشركة العميلة:</label>
                <select
                  value={selectedTenantId}
                  onChange={(e) => setSelectedTenantId(e.target.value)}
                  className={`${inputClass} text-xs font-bold`}
                >
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.id}) — {t.status}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {canManageTenantUsers && (
              <Button
                size="sm"
                disabled={!selectedTenantId}
                onClick={() => openTenantUserModal()}
                leadingIcon={<UserPlus className="h-4 w-4" />}
              >
                إضافة مستخدم للعميل
              </Button>
            )}
          </div>

          {/* Tenant Users Table */}
          <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70 shadow-sm">
            <header className="border-b border-slate-800 px-4 py-3 bg-slate-950/40 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-slate-200">
                  مستخدمو نظام ERP للشركة المحددة ({tenantUsers.length} مستخدمين)
                </h3>
                <p className="text-[10.5px] text-slate-400">
                  إدارة أدوار وحسابات موظفي المتجر أو المصنع التابع للعميل.
                </p>
              </div>
            </header>

            {tenantUsersLoading ? (
              <div className="py-16 text-center text-sm font-semibold text-slate-500">
                <RefreshCw className="inline-block h-5 w-5 animate-spin mb-2" />
                <p>جارٍ تحميل مستخدمي العميل...</p>
              </div>
            ) : tenantUsers.length === 0 ? (
              <EmptyState
                icon={<Users className="h-6 w-6 text-slate-500" />}
                title="لا يوجد مستخدمون مسجلون لهذا العميل"
                description="يمكنك إنشاء مستخدم جديد وتعيين دوره (مدير، محاسب، مبيعات، كاشير، إلخ)."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px] text-right">
                  <thead className="border-b border-slate-800 bg-slate-950/50 text-[11px] font-bold text-slate-400">
                    <tr>
                      <th className="px-4 py-3">اسم المستخدم</th>
                      <th className="px-4 py-3">اسم الدخول / البريد</th>
                      <th className="px-4 py-3">رقم الهاتف</th>
                      <th className="px-4 py-3">الدور في ERP</th>
                      <th className="px-4 py-3">الحالة</th>
                      <th className="px-4 py-3 text-center">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {tenantUsers.map((user) => (
                      <tr key={user.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-3.5 text-xs font-bold text-slate-100">{user.fullName}</td>
                        <td className="px-4 py-3.5 text-xs text-slate-300">
                          {user.email || user.username || '—'}
                        </td>
                        <td className="px-4 py-3.5 text-xs text-slate-400">{user.phone || '—'}</td>
                        <td className="px-4 py-3.5">
                          <span className="inline-flex rounded-md bg-slate-800 border border-slate-700 px-2.5 py-0.5 text-xs font-bold text-slate-200">
                            {user.role}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={`inline-flex items-center gap-1 text-[11px] font-bold ${
                              user.status === 'ACTIVE'
                                ? 'text-emerald-400'
                                : user.status === 'INVITED'
                                ? 'text-amber-400'
                                : 'text-rose-400'
                            }`}
                          >
                            {user.status === 'ACTIVE'
                              ? 'نشط'
                              : user.status === 'INVITED'
                              ? 'في انتظار التفعيل'
                              : 'معطل'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center justify-center gap-1.5">
                            {canManageTenantUsers && (
                              <>
                                <button
                                  onClick={() => openTenantUserModal(user)}
                                  title="تعديل المستخدم"
                                  className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>

                                <button
                                  onClick={() => handleToggleTenantUserActive(user)}
                                  title={user.status === 'ACTIVE' ? 'تعطيل الحساب' : 'تنشيط الحساب'}
                                  className={`rounded p-1 ${
                                    user.status === 'ACTIVE'
                                      ? 'text-amber-400 hover:bg-amber-950/40'
                                      : 'text-emerald-400 hover:bg-emerald-950/40'
                                  }`}
                                >
                                  {user.status === 'ACTIVE' ? (
                                    <Lock className="h-3.5 w-3.5" />
                                  ) : (
                                    <Unlock className="h-3.5 w-3.5" />
                                  )}
                                </button>

                                <button
                                  onClick={() => handleDeleteTenantUser(user)}
                                  title="حذف المستخدم"
                                  className="rounded p-1 text-rose-400 hover:bg-rose-950/40"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* Modal: Add/Edit Staff */}
      <Modal
        open={isStaffModalOpen}
        onClose={() => setIsStaffModalOpen(false)}
        title={editingStaff ? 'تعديل موظف المنصة' : 'إضافة موظف جديد للمنصة'}
      >
        <div className="space-y-3.5 text-right">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">الاسم الكامل *</label>
            <input
              type="text"
              value={staffForm.fullName}
              onChange={(e) => setStaffForm({ ...staffForm, fullName: e.target.value })}
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">البريد الإلكتروني للعمل *</label>
            <input
              type="email"
              value={staffForm.email}
              onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })}
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">رقم الهاتف</label>
            <input
              type="text"
              value={staffForm.phone}
              onChange={(e) => setStaffForm({ ...staffForm, phone: e.target.value })}
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">الدور الوظيفي بالمنصة *</label>
            <select
              value={staffForm.role}
              disabled={editingStaff?.role === 'SUPER_ADMIN'}
              onChange={(e) => setStaffForm({ ...staffForm, role: e.target.value as any })}
              className={inputClass}
            >
              <option value="SUPPORT_AGENT">موظف دعم فني (Support Specialist)</option>
              <option value="OPERATIONS_ENGINEER">مهندس عمليات وبنية تحتية (Operations Engineer)</option>
              <option value="BILLING_SPECIALIST">أخصائي فواتير واشتراكات (Billing Specialist)</option>
              <option value="LICENSE_MANAGER">مسؤول تراخيص وأجهزة (License Administrator)</option>
              <option value="PLATFORM_ADMIN">مدير منصة عام (Platform Administrator)</option>
              {editingStaff?.role === 'SUPER_ADMIN' && (
                <option value="SUPER_ADMIN">مالك المنصة (Super Admin)</option>
              )}
            </select>
            <p className="text-[10.5px] text-slate-400 mt-1">
              ملاحظة: موظف الدعم أو العمليات لن يحصل على صلاحيات مالك المنصة أو تغيير الأسعار والتراخيص.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              {editingStaff ? 'كلمة مرور جديدة (اختياري)' : 'كلمة المرور الأولية *'}
            </label>
            <input
              type="password"
              value={staffForm.password || ''}
              onChange={(e) => setStaffForm({ ...staffForm, password: e.target.value })}
              placeholder={editingStaff ? 'اتركها فارغة للإبقاء على الحالية' : '8 أحرف على الأقل'}
              className={inputClass}
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
            <Button variant="secondary" size="sm" onClick={() => setIsStaffModalOpen(false)}>
              إلغاء
            </Button>
            <Button size="sm" onClick={handleSaveStaff} disabled={!canManageStaff}>
              حفظ الموظف
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Add/Edit Tenant User */}
      <Modal
        open={isTenantUserModalOpen}
        onClose={() => setIsTenantUserModalOpen(false)}
        title={editingTenantUser ? 'تعديل مستخدم العميل' : 'إضافة مستخدم جديد لشركة العميل'}
      >
        <div className="space-y-3.5 text-right">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">اسم الموظف الكامل *</label>
            <input
              type="text"
              value={tenantUserForm.fullName}
              onChange={(e) => setTenantUserForm({ ...tenantUserForm, fullName: e.target.value })}
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">اسم الدخول (Username)</label>
              <input
                type="text"
                value={tenantUserForm.username || ''}
                onChange={(e) => setTenantUserForm({ ...tenantUserForm, username: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">البريد الإلكتروني</label>
              <input
                type="email"
                value={tenantUserForm.email || ''}
                onChange={(e) => setTenantUserForm({ ...tenantUserForm, email: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">الدور في ERP</label>
              <select
                value={tenantUserForm.role}
                onChange={(e) => setTenantUserForm({ ...tenantUserForm, role: e.target.value })}
                className={inputClass}
              >
                <option value="ADMIN">مدير النظام (Admin)</option>
                <option value="MANAGER">مدير فرع (Manager)</option>
                <option value="ACCOUNTANT">محاسب (Accountant)</option>
                <option value="SALES">مبيعات (Sales)</option>
                <option value="CASHIER">كاشير (Cashier)</option>
                <option value="WAREHOUSE">مسؤول مستودع (Warehouse)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">رقم الهاتف</label>
              <input
                type="text"
                value={tenantUserForm.phone || ''}
                onChange={(e) => setTenantUserForm({ ...tenantUserForm, phone: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
            <Button variant="secondary" size="sm" onClick={() => setIsTenantUserModalOpen(false)}>
              إلغاء
            </Button>
            <Button size="sm" onClick={handleSaveTenantUser} disabled={!canManageTenantUsers}>
              حفظ المستخدم
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default PlatformAdminControlPage;
