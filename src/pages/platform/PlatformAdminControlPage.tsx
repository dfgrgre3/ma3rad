import React, { useState, useEffect, useCallback } from 'react';
import { DataTable } from '../../components/ui/DataTable';
import {
  ShieldCheck,
  Users,
  Building2,
  UserPlus,
  Shield,
  Lock,
  Unlock,
  Trash2,
  Pencil,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Layers,
  BadgeCheck,
  Eye,
  Clock,
  KeyRound,
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
  PlatformTenantUserDirectoryEntry,
  PlatformTenantUserInput,
  PlatformUsersOverview,
  PlatformUsersSearchResults,
  PlatformTenantUserDetail,
  PlatformStaffUserDetail,
} from '../../services/domains/platform/platformTypes';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import {
  EmptyState,
  formatDateTime,
  inputClass,
} from './components/PlatformUI';

import { useToast } from '../../components/ui/Toast';
type ActiveTab = 'OVERVIEW' | 'STAFF' | 'TENANTS' | 'ALL_USERS';

const PROVISIONING_STATUS_META: Record<string, { label: string; className: string }> = {
  PROVISIONED: { label: 'تم التوفير', className: 'text-success' },
  PENDING: { label: 'قيد الانتظار', className: 'text-warning' },
  PROCESSING: { label: 'قيد المعالجة', className: 'text-warning' },
  RETRYING: { label: 'إعادة محاولة', className: 'text-warning' },
  INVITED: { label: 'دعوة مُرسلة', className: 'text-warning' },
  FAILED: { label: 'فشل', className: 'text-danger' },
  CANCELLED: { label: 'ملغي', className: 'text-muted' },
  DIRECTORY_ONLY: { label: 'دليل فقط', className: 'text-muted' },
  NOT_REQUESTED: { label: 'بدون توفير', className: 'text-muted' },
};

function provisioningBadge(status?: string | null) {
  const meta = PROVISIONING_STATUS_META[String(status || 'NOT_REQUESTED')] || PROVISIONING_STATUS_META.NOT_REQUESTED;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-bold ${meta.className}`}>
      {meta.label}
    </span>
  );
}

const ROLE_BADGE_STYLE: Record<PlatformStaffRole, { bg: string; text: string; label: string }> = {
  SUPER_ADMIN: { bg: 'bg-primary/20 border-primary/40', text: 'text-primary', label: 'مالك المنصة' },
  PLATFORM_ADMIN: { bg: 'bg-primary/20 border-primary/40', text: 'text-primary', label: 'مدير منصة عام' },
  SUPPORT_AGENT: { bg: 'bg-success/20 border-success/40', text: 'text-success', label: 'دعم فني' },
  OPERATIONS_ENGINEER: { bg: 'bg-primary/20 border-primary/40', text: 'text-primary', label: 'عمليات وبنية تحتية' },
  BILLING_SPECIALIST: { bg: 'bg-warning/20 border-warning/40', text: 'text-warning', label: 'فواتير واشتراكات' },
  LICENSE_MANAGER: { bg: 'bg-primary/20 border-primary/40', text: 'text-primary', label: 'إدارة التراخيص' },
};

export const PlatformAdminControlPage: React.FC = () => {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<ActiveTab>('OVERVIEW');

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

  // All-Tenants Users Monitoring State
  const [allUsers, setAllUsers] = useState<PlatformTenantUserDirectoryEntry[]>([]);
  const [allUsersLoading, setAllUsersLoading] = useState(false);
  const [allUsersSearch, setAllUsersSearch] = useState('');
  const [allUsersProvFilter, setAllUsersProvFilter] = useState('');

  // Unified Users Hub State (overview tab)
  const [overview, setOverview] = useState<PlatformUsersOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [hubSearch, setHubSearch] = useState('');
  const [hubResults, setHubResults] = useState<PlatformUsersSearchResults | null>(null);
  const [hubSearching, setHubSearching] = useState(false);
  const [detailTarget, setDetailTarget] = useState<{ type: 'tenant' | 'staff'; id: string } | null>(null);
  const [detail, setDetail] = useState<PlatformTenantUserDetail | PlatformStaffUserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

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

  // Load cross-tenant user directory
  const loadAllUsers = useCallback(async () => {
    setAllUsersLoading(true);
    const centralState = getCentralDataSourceState();
    try {
      const filters = {
        search: allUsersSearch || undefined,
        provisioningStatus: allUsersProvFilter || undefined,
      };
      const rows = centralState.active
        ? await centralPlatformClient.listAllTenantUsers(filters)
        : platformAdminService.listAllTenantUsers(filters);
      setAllUsers(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل دليل مستخدمي الشركات.');
    } finally {
      setAllUsersLoading(false);
    }
  }, [allUsersSearch, allUsersProvFilter]);

  useEffect(() => {
    if (selectedTenantId) {
      loadTenantUsers(selectedTenantId);
    }
  }, [selectedTenantId, loadTenantUsers]);

  useEffect(() => {
    if (activeTab === 'ALL_USERS') {
      void loadAllUsers();
    }
  }, [activeTab, loadAllUsers]);

  // ── Unified Users Hub ────────────────────────────────────────────────────
  const loadOverview = useCallback(async () => {
    setOverviewLoading(true);
    const centralState = getCentralDataSourceState();
    try {
      setOverview(
        centralState.active
          ? await centralPlatformClient.getUsersOverview()
          : platformAdminService.getUsersOverview()
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل نظرة المستخدمين الشاملة.');
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'OVERVIEW') {
      void loadOverview();
    }
  }, [activeTab, loadOverview]);

  // Debounced unified search across staff + tenant users
  useEffect(() => {
    const q = hubSearch.trim();
    if (q.length < 2) {
      setHubResults(null);
      setHubSearching(false);
      return;
    }
    setHubSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const centralState = getCentralDataSourceState();
        setHubResults(
          centralState.active
            ? await centralPlatformClient.searchUsers(q)
            : platformAdminService.searchUsers(q)
        );
      } catch {
        setHubResults(null);
      } finally {
        setHubSearching(false);
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [hubSearch]);

  const openUserDetail = useCallback(async (type: 'tenant' | 'staff', id: string) => {
    setDetailTarget({ type, id });
    setDetail(null);
    setDetailLoading(true);
    try {
      const centralState = getCentralDataSourceState();
      const result = centralState.active
        ? (type === 'tenant'
            ? await centralPlatformClient.getTenantUserDetail(id)
            : await centralPlatformClient.getStaffUserDetail(id))
        : (type === 'tenant'
            ? platformAdminService.getTenantUserDetail(id)
            : platformAdminService.getStaffUserDetail(id));
      setDetail(result ?? null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذر تحميل تفاصيل المستخدم.');
      setDetailTarget(null);
    } finally {
      setDetailLoading(false);
    }
  }, [toast]);

  const closeUserDetail = () => {
    setDetailTarget(null);
    setDetail(null);
  };

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
      toast.warning('لا تملك صلاحية إدارة موظفي المنصة.');
      return;
    }
    if (!editingStaff && (!staffForm.password || staffForm.password.length < 8)) {
      toast.warning('كلمة مرور موظف المنصة مطلوبة ويجب أن تكون 8 أحرف على الأقل.');
      return;
    }
    if (editingStaff && staffForm.password && staffForm.password.length > 0 && staffForm.password.length < 8) {
      toast.warning('كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل.');
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
          const created = await centralPlatformClient.createAdminControlStaff(payload);
          const tempPassword = (created as any)?.temporaryPassword;
          if (tempPassword) {
            toast.warning(`تم إنشاء الموظف. كلمة المرور المؤقتة: ${tempPassword} — سيُطلب تغييرها عند أول دخول.`);
            setIsStaffModalOpen(false);
            loadStaff();
            return;
          }
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
      toast.error(err instanceof Error ? err.message : 'فشلت العملية.');
    }
  };

  // Toggle Staff Active
  const handleToggleStaffActive = async (staff: PlatformStaff) => {
    if (!canManageStaff) {
      toast.warning('لا تملك صلاحية إدارة موظفي المنصة.');
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
      toast.error(err instanceof Error ? err.message : 'تعذر تغيير حالة الموظف.');
    }
  };

  // Delete Staff
  const handleDeleteStaff = async (staff: PlatformStaff) => {
    if (!canDeleteStaff) {
      toast.warning('لا تملك صلاحية حذف موظفي المنصة.');
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
      toast.error(err instanceof Error ? err.message : 'تعذر حذف الموظف.');
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
      toast.warning('لا تملك صلاحية إدارة مستخدمي العملاء.');
      return;
    }
    const centralState = getCentralDataSourceState();
    try {
      if (editingTenantUser) {
        if (centralState.active && selectedTenantId) {
          await centralPlatformClient.updateTenantUser(selectedTenantId, editingTenantUser.id, tenantUserForm);
        } else {
          platformAdminService.updateTenantUser(editingTenantUser.id, tenantUserForm);
        }
      } else {
        const result = centralState.active && selectedTenantId
          ? await centralPlatformClient.createTenantUser(selectedTenantId, {
              ...tenantUserForm,
              provisionIdentity: true,
              provisioningMode: 'INVITE',
            })
          : platformAdminService.createTenantUser(selectedTenantId, {
              ...tenantUserForm,
              provisionIdentity: true,
              provisioningMode: 'INVITE',
            });
        const parts = [result.message || 'تم إنشاء طلب التوفير.'];
        if (result.inviteCode) parts.push(`كود الدعوة: ${result.inviteCode}`);
        if (result.temporaryPassword) parts.push(`كلمة المرور المؤقتة: ${result.temporaryPassword}`);
        if (result.user?.identityUserId) parts.push(`معرّف الهوية: ${result.user.identityUserId}`);
        toast.warning(parts.join('\n'));
      }
      setIsTenantUserModalOpen(false);
      loadTenantUsers(selectedTenantId);
      if (activeTab === 'ALL_USERS') void loadAllUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشلت العملية.');
    }
  };

  // Toggle Tenant User Active
  const handleToggleTenantUserActive = async (user: PlatformTenantUser) => {
    if (!canManageTenantUsers) {
      toast.warning('لا تملك صلاحية إدارة مستخدمي العملاء.');
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
      toast.error(err instanceof Error ? err.message : 'تعذر تغيير حالة المستخدم.');
    }
  };

  // Delete Tenant User
  const handleDeleteTenantUser = async (user: PlatformTenantUser) => {
    if (!canManageTenantUsers) {
      toast.warning('لا تملك صلاحية إدارة مستخدمي العملاء.');
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
      toast.error(err instanceof Error ? err.message : 'تعذر حذف المستخدم.');
    }
  };

  // Cross-tenant directory actions (operate on the row's own tenant)
  const handleAllUserToggleActive = async (entry: PlatformTenantUserDirectoryEntry) => {
    if (!canManageTenantUsers) {
      toast.warning('لا تملك صلاحية إدارة مستخدمي العملاء.');
      return;
    }
    const centralState = getCentralDataSourceState();
    try {
      if (centralState.active) {
        await centralPlatformClient.setTenantUserActive(entry.tenantId, entry.id, entry.status !== 'ACTIVE');
      } else {
        platformAdminService.setTenantUserActive(entry.id, entry.status !== 'ACTIVE');
      }
      void loadAllUsers();
      if (entry.tenantId === selectedTenantId) loadTenantUsers(selectedTenantId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذر تغيير حالة المستخدم.');
    }
  };

  const handleAllUserDelete = async (entry: PlatformTenantUserDirectoryEntry) => {
    if (!canManageTenantUsers) {
      toast.warning('لا تملك صلاحية إدارة مستخدمي العملاء.');
      return;
    }
    if (!confirm(`هل أنت متأكد من حذف المستخدم (${entry.fullName}) من ${entry.tenantName}؟`)) return;
    const centralState = getCentralDataSourceState();
    try {
      if (centralState.active) {
        await centralPlatformClient.deleteTenantUser(entry.tenantId, entry.id);
      } else {
        platformAdminService.deleteTenantUser(entry.id);
      }
      void loadAllUsers();
      if (entry.tenantId === selectedTenantId) loadTenantUsers(selectedTenantId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذر حذف المستخدم.');
    }
  };

  return (
    <div className="space-y-5">
      <CentralUnsupportedNotice feature="التحكم الإداري (Admin Control)" />
      {/* Page Header */}
      <PageHeader
        title="مركز التحكم الإداري (RBAC & Staff Console)"
        description="فصل كامل بين إدارة موظفي الشركة المالكة للمنصة (Platform Staff) وإدارة مستخدمي الشركات العميلة (Tenant Users)."
        icon={<ShieldCheck className="h-6 w-6 text-success" />}
      />

      {error && (
        <div role="alert" className="rounded-xl border border-danger bg-danger/40 p-4 text-danger">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-danger" />
            <span className="font-bold">{error}</span>
          </div>
        </div>
      )}

      {/* Main Mode Tabs Switcher */}
      <div className="flex border-b border-line-strong pb-0">
        <button
          onClick={() => setActiveTab('OVERVIEW')}
          className={`flex items-center gap-2 px-6 py-3 text-sm font-bold border-b-2 transition-all ${
            activeTab === 'OVERVIEW'
              ? 'border-success text-success bg-primary/60'
              : 'border-transparent text-muted hover:text-muted'
          }`}
        >
          <Layers className="h-4 w-4" />
          <span>نظرة شاملة على المستخدمين (All Users Hub)</span>
        </button>

        <button
          onClick={() => setActiveTab('STAFF')}
          className={`flex items-center gap-2 px-6 py-3 text-sm font-bold border-b-2 transition-all ${
            activeTab === 'STAFF'
              ? 'border-success text-success bg-primary/60'
              : 'border-transparent text-muted hover:text-muted'
          }`}
        >
          <Shield className="h-4 w-4" />
          <span>إدارة موظفي المنصة (Platform Staff Management)</span>
        </button>

        <button
          onClick={() => setActiveTab('TENANTS')}
          className={`flex items-center gap-2 px-6 py-3 text-sm font-bold border-b-2 transition-all ${
            activeTab === 'TENANTS'
              ? 'border-success text-success bg-primary/60'
              : 'border-transparent text-muted hover:text-muted'
          }`}
        >
          <Building2 className="h-4 w-4" />
          <span>إدارة مستخدمي الشركات العميلة (Tenant Admin & Users)</span>
        </button>

        <button
          onClick={() => setActiveTab('ALL_USERS')}
          className={`flex items-center gap-2 px-6 py-3 text-sm font-bold border-b-2 transition-all ${
            activeTab === 'ALL_USERS'
              ? 'border-success text-success bg-primary/60'
              : 'border-transparent text-muted hover:text-muted'
          }`}
        >
          <Layers className="h-4 w-4" />
          <span>مراقبة كل المستخدمين عبر الشركات (All Tenant Users)</span>
        </button>
      </div>

      {/* TAB 0: UNIFIED USERS OVERVIEW */}
      {activeTab === 'OVERVIEW' && (
        <div className="space-y-5">
          {/* Actions bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line-strong bg-primary/80 p-3.5 shadow-sm">
            <p className="text-[11.5px] font-semibold text-muted">
              نظرة موحدة على كل هويات المستخدمين: موظفو المنصة + مستخدمو العملاء + حالة التوفير والمزامنة.
            </p>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => void loadOverview()} leadingIcon={<RefreshCw className="h-4 w-4" />}>
                تحديث
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setActiveTab('STAFF')} leadingIcon={<Shield className="h-4 w-4" />}>
                موظفو المنصة
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setActiveTab('ALL_USERS')} leadingIcon={<Layers className="h-4 w-4" />}>
                دليل كل المستخدمين
              </Button>
            </div>
          </div>

          {overviewLoading && !overview ? (
            <div className="py-16 text-center text-sm font-semibold text-muted">
              <RefreshCw className="inline-block h-5 w-5 animate-spin mb-2" />
              <p>جارٍ تحميل نظرة المستخدمين...</p>
            </div>
          ) : overview ? (
            <>
              {/* KPI cards */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { label: 'موظفو المنصة', value: overview.staff.total, sub: `${overview.staff.active} نشط`, icon: <Shield className="h-4 w-4" />, tone: 'text-primary' },
                  { label: 'مستخدمو العملاء', value: overview.tenantUsers.total, sub: `${overview.tenantUsers.newLast7Days} جديد آخر 7 أيام`, icon: <Users className="h-4 w-4" />, tone: 'text-success' },
                  { label: 'دعوات بانتظار التفعيل', value: overview.tenantUsers.byStatus.INVITED ?? 0, sub: 'INVITED', icon: <Clock className="h-4 w-4" />, tone: 'text-warning' },
                  { label: 'حسابات مقفلة / بانتظار تغيير كلمة المرور', value: overview.staff.locked + overview.staff.mustChangePassword, sub: `${overview.staff.locked} مقفل · ${overview.staff.mustChangePassword} كلمة مرور`, icon: <KeyRound className="h-4 w-4" />, tone: 'text-warning' },
                  { label: 'قيد التوفير / المزامنة', value: overview.provisioning.pending, sub: 'PENDING + CLAIMED', icon: <RefreshCw className="h-4 w-4" />, tone: 'text-info' },
                  { label: 'فشل التوفير', value: overview.provisioning.failed, sub: 'FAILED jobs', icon: <AlertTriangle className="h-4 w-4" />, tone: overview.provisioning.failed > 0 ? 'text-danger' : 'text-muted' },
                  { label: 'مستخدمون موقوفون', value: overview.tenantUsers.byStatus.SUSPENDED ?? 0, sub: 'SUSPENDED', icon: <Lock className="h-4 w-4" />, tone: 'text-danger' },
                  { label: 'حسابات معطلة (موظفون)', value: overview.staff.inactive, sub: 'inactive staff', icon: <XCircle className="h-4 w-4" />, tone: 'text-muted' },
                ].map((card) => (
                  <div key={card.label} className="rounded-xl border border-line-strong bg-primary/70 p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-muted">{card.label}</span>
                      <span className={card.tone}>{card.icon}</span>
                    </div>
                    <p className="mt-2 text-2xl font-black text-ink">{card.value}</p>
                    <p className="mt-0.5 text-[10.5px] text-muted">{card.sub}</p>
                  </div>
                ))}
              </div>

              {/* Breakdowns */}
              <div className="grid gap-3 lg:grid-cols-2">
                <section className="rounded-xl border border-line-strong bg-primary/70 p-4 shadow-sm">
                  <h3 className="mb-3 flex items-center gap-2 text-xs font-bold text-muted">
                    <Shield className="h-4 w-4 text-success" /> موظفو المنصة حسب الدور
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(overview.staff.byRole).length === 0 && <span className="text-[11px] text-muted">لا يوجد موظفون.</span>}
                    {Object.entries(overview.staff.byRole).map(([role, count]) => (
                      <button
                        key={role}
                        type="button"
                        onClick={() => { setStaffRoleFilter(role); setActiveTab('STAFF'); }}
                        className="rounded-lg border border-line-strong bg-primary px-3 py-1.5 text-[11px] font-bold text-muted hover:border-success hover:text-success"
                        title="عرض في تبويب الموظفين"
                      >
                        {ROLE_BADGE_STYLE[role as PlatformStaffRole]?.label ?? role}: <span className="text-ink">{count}</span>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="rounded-xl border border-line-strong bg-primary/70 p-4 shadow-sm">
                  <h3 className="mb-3 flex items-center gap-2 text-xs font-bold text-muted">
                    <Users className="h-4 w-4 text-success" /> مستخدمو العملاء — الحالة والتوفير
                  </h3>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    {(['ACTIVE', 'INVITED', 'SUSPENDED'] as const).map((s) => (
                      <div key={s} className="flex items-center justify-between rounded-lg bg-primary px-3 py-2">
                        <span className="font-semibold text-muted">{s === 'ACTIVE' ? 'نشط' : s === 'INVITED' ? 'مدعو' : 'موقوف'}</span>
                        <span className="font-black text-ink">{overview.tenantUsers.byStatus[s] ?? 0}</span>
                      </div>
                    ))}
                    {(['PROVISIONED', 'PENDING', 'INVITED', 'FAILED', 'DIRECTORY_ONLY', 'NOT_REQUESTED'] as const).map((p) => (
                      <div key={p} className="flex items-center justify-between rounded-lg bg-primary px-3 py-2">
                        <span className="font-semibold text-muted">{PROVISIONING_STATUS_META[p]?.label ?? p}</span>
                        <span className="font-black text-ink">{overview.tenantUsers.byProvisioning[p] ?? 0}</span>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              {/* Unified search */}
              <section className="rounded-xl border border-line-strong bg-primary/70 p-4 shadow-sm">
                <h3 className="mb-3 flex items-center gap-2 text-xs font-bold text-muted">
                  <Search className="h-4 w-4 text-success" /> بحث موحد عبر موظفي المنصة ومستخدمي العملاء
                </h3>
                <div className="relative max-w-xl">
                  <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <input
                    type="text"
                    value={hubSearch}
                    onChange={(e) => setHubSearch(e.target.value)}
                    placeholder="ابحث بالاسم أو اسم الدخول أو البريد (موظف أو مستخدم عميل)..."
                    className={`${inputClass} pr-9 text-xs`}
                  />
                </div>

                {hubSearching && <p className="mt-3 text-[11px] font-semibold text-muted">جارٍ البحث...</p>}

                {hubResults && !hubSearching && (
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    <div>
                      <p className="mb-1.5 text-[11px] font-bold text-muted">موظفو المنصة ({hubResults.staff.length})</p>
                      {hubResults.staff.length === 0 ? (
                        <p className="rounded-lg bg-primary p-3 text-[11px] text-muted">لا نتائج.</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {hubResults.staff.map((s) => (
                            <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-line-strong bg-primary px-3 py-2">
                              <span className="min-w-0">
                                <span className="block truncate text-[11.5px] font-bold text-ink">{s.fullName}</span>
                                <span className="block truncate text-[10.5px] text-muted" dir="ltr">{s.email || s.username} · {s.role}</span>
                              </span>
                              <Button variant="secondary" size="sm" onClick={() => void openUserDetail('staff', s.id)} leadingIcon={<Eye className="h-3.5 w-3.5" />}>
                                تفاصيل
                              </Button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div>
                      <p className="mb-1.5 text-[11px] font-bold text-muted">مستخدمو العملاء ({hubResults.tenantUsers.length})</p>
                      {hubResults.tenantUsers.length === 0 ? (
                        <p className="rounded-lg bg-primary p-3 text-[11px] text-muted">لا نتائج.</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {hubResults.tenantUsers.map((u) => (
                            <li key={`${u.tenantId}:${u.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-line-strong bg-primary px-3 py-2">
                              <span className="min-w-0">
                                <span className="block truncate text-[11.5px] font-bold text-ink">{u.fullName}</span>
                                <span className="block truncate text-[10.5px] text-muted">{u.tenantName} · {u.username || u.email || '—'}</span>
                              </span>
                              <Button variant="secondary" size="sm" onClick={() => void openUserDetail('tenant', u.id)} leadingIcon={<Eye className="h-3.5 w-3.5" />}>
                                تفاصيل
                              </Button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </section>

              {/* Recent user activity */}
              <section className="rounded-xl border border-line-strong bg-primary/70 p-4 shadow-sm">
                <h3 className="mb-3 flex items-center gap-2 text-xs font-bold text-muted">
                  <Clock className="h-4 w-4 text-success" /> آخر نشاطات المستخدمين
                </h3>
                {overview.recentEvents.length === 0 ? (
                  <EmptyState icon={<Clock className="h-5 w-5" />} title="لا توجد أحداث حديثة" />
                ) : (
                  <ul className="divide-y divide-line">
                    {overview.recentEvents.map((ev) => (
                      <li key={ev.id} className="flex items-center justify-between gap-3 py-2 text-[11.5px]">
                        <span className="min-w-0">
                          <span className="font-bold text-ink">{ev.action}</span>
                          <span className="mr-2 text-muted">{ev.actorName ? `بواسطة ${ev.actorName}` : ''}</span>
                          {ev.resourceId && <span className="mr-1 font-mono text-[10px] text-muted" dir="ltr">#{String(ev.resourceId).slice(0, 14)}</span>}
                        </span>
                        <span className="shrink-0 text-[10.5px] text-muted">{ev.createdAt ? formatDateTime(ev.createdAt) : '—'}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          ) : null}
        </div>
      )}

      {/* TAB 1: PLATFORM STAFF MANAGEMENT */}
      {activeTab === 'STAFF' && (
        <div className="space-y-5">
          {/* Top Bar: Search, Role Filter, Add Staff Button */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line-strong bg-primary/80 p-3.5 shadow-sm">
            <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
              <div className="relative min-w-[220px]">
                <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
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
          <section className="overflow-hidden rounded-xl border border-line-strong bg-primary/70 shadow-sm">
            {staffLoading ? (
              <div className="py-16 text-center text-sm font-semibold text-muted">
                <RefreshCw className="inline-block h-5 w-5 animate-spin mb-2" />
                <p>جارٍ تحميل موظفي المنصة...</p>
              </div>
            ) : staffList.length === 0 ? (
              <EmptyState
                icon={<Users className="h-6 w-6 text-muted" />}
                title="لا يوجد موظفون مسجلون"
                description="قم بإضافة موظفين للمنصة وتعيين أدوارهم وصلاحياتهم."
              />
            ) : (
              <div className="overflow-x-auto">
                <DataTable
                  ariaLabel="موظفو المنصة"
                  rows={staffList}
                  rowKey={(staff) => staff.id}
                  minWidth={850}
                  columns={[
                    {
                      key: 'staff', header: 'الموظف والبريد الإلكتروني',
                      render: (staff) => {
                        const isOwner = staff.role === 'SUPER_ADMIN';
                        return (
                          <span className="flex items-center gap-2.5">
                            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-muted font-bold text-xs">
                              {staff.fullName.charAt(0)}
                            </span>
                            <span>
                              <span className="block text-xs font-bold text-muted flex items-center gap-1.5">
                                {staff.fullName}
                                {isOwner && (
                                  <span title="مالك المنصة" className="inline-flex items-center"><BadgeCheck className="h-3.5 w-3.5 text-primary" /></span>
                                )}
                              </span>
                              <span className="block text-[11px] text-muted">{staff.email}</span>
                            </span>
                          </span>
                        );
                      },
                    },
                    {
                      key: 'role', header: 'الدور الوظيفي بالمنصة',
                      render: (staff) => {
                        const badge = ROLE_BADGE_STYLE[staff.role] || { bg: 'bg-primary', text: 'text-muted', label: staff.role };
                        return (
                          <span className={`inline-flex items-center rounded-md border px-2.5 py-1 text-[11px] font-bold ${badge.bg} ${badge.text}`}>
                            {badge.label}
                          </span>
                        );
                      },
                    },
                    {
                      key: 'perms', header: 'الصلاحيات المتاحة والمقيدة',
                      render: (staff) => {
                        if (staff.role === 'SUPER_ADMIN') return <span className="text-xs text-muted">وصول كامل لكافة الأنظمة (*)</span>;
                        if (staff.role === 'SUPPORT_AGENT') return <span className="text-xs text-muted">تذاكر الدعم · جلسات Remote · التشخيص (مقيد الفواتير والأسعار)</span>;
                        if (staff.role === 'OPERATIONS_ENGINEER') return <span className="text-xs text-muted">العمليات · النسخ الاحتياطي · المزامنة (مقيد الفواتير والتراخيص)</span>;
                        if (staff.role === 'BILLING_SPECIALIST') return <span className="text-xs text-muted">الفوترة والمدفوعات · الاشتراكات (مقيد البنية والتراخيص)</span>;
                        if (staff.role === 'LICENSE_MANAGER') return <span className="text-xs text-muted">إصدار التراخيص · الأجهزة والربط (مقيد الفواتير والعمليات)</span>;
                        return <span className="text-xs text-muted">إدارة منصة عامة</span>;
                      },
                    },
                    {
                      key: 'status', header: 'الحالة',
                      render: (staff) => (
                        <span className={`inline-flex items-center gap-1 text-[11px] font-bold ${staff.isActive ? 'text-success' : 'text-danger'}`}>
                          {staff.isActive ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                          {staff.isActive ? 'نشط' : 'معطل'}
                        </span>
                      ),
                    },
                    { key: 'created', header: 'تاريخ الإضافة', render: (staff) => <span className="text-xs text-muted">{formatDateTime(staff.createdAt)}</span> },
                    {
                      key: 'actions', header: 'الإجراءات', align: 'center',
                      render: (staff) => {
                        const isOwner = staff.role === 'SUPER_ADMIN';
                        return (
                          <div className="flex items-center justify-center gap-1.5">
                            {canManageStaff && (
                              <button
                                onClick={() => openStaffModal(staff)}
                                title="تعديل الموظف"
                                className="rounded p-1 text-muted hover:bg-primary hover:text-muted transition-colors"
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
                                      ? 'text-warning hover:bg-warning/40'
                                      : 'text-success hover:bg-success/40'
                                  }`}
                                >
                                  {staff.isActive ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                                </button>
                                {canDeleteStaff && (
                                  <button
                                    onClick={() => handleDeleteStaff(staff)}
                                    title="حذف الموظف"
                                    className="rounded p-1 text-danger hover:bg-danger/40 transition-colors"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        );
                      },
                    },
                  ]}
                />
              </div>
            )}
          </section>

          {/* Staff Roles & Permissions Matrix Overview */}
          <section className="rounded-xl border border-line-strong bg-primary/60 p-4 shadow-sm">
            <h3 className="text-xs font-bold text-muted mb-3 flex items-center gap-2">
              <Shield className="h-4 w-4 text-success" />
              مصفوفة الأدوار الوظيفية وعزل الصلاحيات في المنصة (Platform RBAC Rules)
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {staffRoles.map((roleDef) => (
                <div key={roleDef.role} className="rounded-lg border border-line-strong bg-primary/50 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-muted">{roleDef.title}</span>
                    <span className="text-[10px] text-muted font-mono">{roleDef.role}</span>
                  </div>
                  <p className="text-[11px] text-muted leading-relaxed">{roleDef.description}</p>
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
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line-strong bg-primary/80 p-3.5 shadow-sm">
            <div className="flex items-center gap-3 flex-1 min-w-[280px]">
              <Building2 className="h-5 w-5 text-success shrink-0" />
              <div className="flex-1 max-w-md">
                <label className="block text-[11px] font-bold text-muted mb-1">اختر الشركة العميلة:</label>
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
          <section className="overflow-hidden rounded-xl border border-line-strong bg-primary/70 shadow-sm">
            <header className="border-b border-line-strong px-4 py-3 bg-primary/40 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-muted">
                  مستخدمو نظام ERP للشركة المحددة ({tenantUsers.length} مستخدمين)
                </h3>
                <p className="text-[10.5px] text-muted">
                  إدارة أدوار وحسابات موظفي المتجر أو المصنع التابع للعميل.
                </p>
              </div>
            </header>

            {tenantUsersLoading ? (
              <div className="py-16 text-center text-sm font-semibold text-muted">
                <RefreshCw className="inline-block h-5 w-5 animate-spin mb-2" />
                <p>جارٍ تحميل مستخدمي العميل...</p>
              </div>
            ) : tenantUsers.length === 0 ? (
              <EmptyState
                icon={<Users className="h-6 w-6 text-muted" />}
                title="لا يوجد مستخدمون مسجلون لهذا العميل"
                description="يمكنك إنشاء مستخدم جديد وتعيين دوره (مدير، محاسب، مبيعات، كاشير، إلخ)."
              />
            ) : (
              <div className="overflow-x-auto">
                <DataTable
                  ariaLabel="مستخدمو العميل"
                  rows={tenantUsers}
                  rowKey={(user) => user.id}
                  minWidth={800}
                  columns={[
                    { key: 'name', header: 'اسم المستخدم', render: (user) => <span className="text-xs font-bold text-muted">{user.fullName}</span> },
                    { key: 'login', header: 'اسم الدخول / البريد', render: (user) => <span className="text-xs text-muted">{user.email || user.username || '—'}</span> },
                    { key: 'phone', header: 'رقم الهاتف', render: (user) => <span className="text-xs text-muted">{user.phone || '—'}</span> },
                    { key: 'role', header: 'الدور في ERP', render: (user) => <span className="inline-flex rounded-md bg-primary border border-line-strong px-2.5 py-0.5 text-xs font-bold text-muted">{user.role}</span> },
                    {
                      key: 'prov', header: 'حالة التوفير',
                      render: (user) => (
                        <span title={user.lastError || user.identityUserId || ''}>
                          {provisioningBadge(user.provisioningStatus)}
                        </span>
                      ),
                    },
                    {
                      key: 'status', header: 'الحالة',
                      render: (user) => (
                        <span className={`inline-flex items-center gap-1 text-[11px] font-bold ${
                          user.status === 'ACTIVE' ? 'text-success' : user.status === 'INVITED' ? 'text-warning' : 'text-danger'
                        }`}>
                          {user.status === 'ACTIVE' ? 'نشط' : user.status === 'INVITED' ? 'في انتظار التفعيل' : 'معطل'}
                        </span>
                      ),
                    },
                    {
                      key: 'actions', header: 'الإجراءات', align: 'center',
                      render: (user) => (
                        <div className="flex items-center justify-center gap-1.5">
                          {canManageTenantUsers && (
                            <>
                              <button
                                onClick={() => openTenantUserModal(user)}
                                title="تعديل المستخدم"
                                className="rounded p-1 text-muted hover:bg-primary hover:text-muted"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleToggleTenantUserActive(user)}
                                title={user.status === 'ACTIVE' ? 'تعطيل الحساب' : 'تنشيط الحساب'}
                                className={`rounded p-1 ${
                                  user.status === 'ACTIVE' ? 'text-warning hover:bg-warning/40' : 'text-success hover:bg-success/40'
                                }`}
                              >
                                {user.status === 'ACTIVE' ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                              </button>
                              <button
                                onClick={() => handleDeleteTenantUser(user)}
                                title="حذف المستخدم"
                                className="rounded p-1 text-danger hover:bg-danger/40"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      ),
                    },
                  ]}
                />
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 3: ALL TENANT USERS MONITORING */}
      {activeTab === 'ALL_USERS' && (
        <div className="space-y-5">
          {/* Filters Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line-strong bg-primary/80 p-3.5 shadow-sm">
            <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
              <div className="relative min-w-[220px]">
                <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  type="text"
                  value={allUsersSearch}
                  onChange={(e) => setAllUsersSearch(e.target.value)}
                  placeholder="ابحث بالاسم أو اسم الدخول أو البريد..."
                  className={`${inputClass} pr-9 text-xs`}
                />
              </div>

              <select
                value={allUsersProvFilter}
                onChange={(e) => setAllUsersProvFilter(e.target.value)}
                className={`${inputClass} text-xs max-w-[200px]`}
              >
                <option value="">جميع حالات التوفير</option>
                <option value="PROVISIONED">تم التوفير</option>
                <option value="PENDING">قيد الانتظار</option>
                <option value="PROCESSING">قيد المعالجة</option>
                <option value="RETRYING">إعادة محاولة</option>
                <option value="INVITED">دعوة مُرسلة</option>
                <option value="FAILED">فشل</option>
                <option value="DIRECTORY_ONLY">دليل فقط</option>
                <option value="NOT_REQUESTED">بدون توفير</option>
              </select>

              <Button variant="secondary" size="sm" onClick={() => void loadAllUsers()} leadingIcon={<RefreshCw className="h-4 w-4" />}>
                تحديث
              </Button>
            </div>

            <span className="text-[11px] font-bold text-muted">
              {allUsers.length} مستخدم عبر {new Set(allUsers.map((u) => u.tenantId)).size} شركة
            </span>
          </div>

          {/* All Users Table */}
          <section className="overflow-hidden rounded-xl border border-line-strong bg-primary/70 shadow-sm">
            <header className="border-b border-line-strong px-4 py-3 bg-primary/40">
              <h3 className="text-xs font-bold text-muted">
                دليل مستخدمي كل الشركات وحالة مزامنتهم مع أنظمة ERP ({allUsers.length})
              </h3>
              <p className="text-[10.5px] text-muted">
                يعرض هذا الدليل حالة وصول كل مستخدم إلى حساب الدخول الفعلي داخل تطبيق الشركة (PROVISIONED = حساب جاهز للدخول).
              </p>
            </header>

            {allUsersLoading ? (
              <div className="py-16 text-center text-sm font-semibold text-muted">
                <RefreshCw className="inline-block h-5 w-5 animate-spin mb-2" />
                <p>جارٍ تحميل دليل المستخدمين...</p>
              </div>
            ) : allUsers.length === 0 ? (
              <EmptyState
                icon={<Users className="h-6 w-6 text-muted" />}
                title="لا يوجد مستخدمون مطابقون"
                description="جرّب تعديل عوامل التصفية أو إنشاء مستخدم جديد من تبويب إدارة مستخدمي العميلة."
              />
            ) : (
              <div className="overflow-x-auto">
                <DataTable
                  ariaLabel="مستخدمو كل الشركات"
                  rows={allUsers}
                  rowKey={(user) => `${user.tenantId}:${user.id}`}
                  minWidth={1050}
                  columns={[
                    {
                      key: 'tenant', header: 'الشركة العميلة',
                      render: (user) => (
                        <span>
                          <span className="block text-xs font-bold text-muted">{user.tenantName}</span>
                          <span className="block text-[10px] text-muted font-mono">{user.tenantCode || user.tenantId}</span>
                        </span>
                      ),
                    },
                    { key: 'name', header: 'اسم المستخدم', render: (user) => <span className="text-xs font-bold text-muted">{user.fullName}</span> },
                    { key: 'login', header: 'اسم الدخول', render: (user) => <span className="text-xs text-muted">{user.username || '—'}</span> },
                    { key: 'role', header: 'الدور في ERP', render: (user) => <span className="inline-flex rounded-md bg-primary border border-line-strong px-2.5 py-0.5 text-xs font-bold text-muted">{user.role}</span> },
                    {
                      key: 'prov', header: 'حالة المزامنة',
                      render: (user) => (
                        <span title={user.lastError || (user.identityUserId ? `ERP ID: ${user.identityUserId}` : '')}>
                          {provisioningBadge(user.provisioningStatus)}
                          {user.lastError && <span className="block text-[10px] text-danger max-w-[220px] truncate">{user.lastError}</span>}
                        </span>
                      ),
                    },
                    {
                      key: 'status', header: 'الحالة',
                      render: (user) => (
                        <span className={`inline-flex items-center gap-1 text-[11px] font-bold ${
                          user.status === 'ACTIVE' ? 'text-success' : user.status === 'INVITED' ? 'text-warning' : 'text-danger'
                        }`}>
                          {user.status === 'ACTIVE' ? 'نشط' : user.status === 'INVITED' ? 'في انتظار التفعيل' : 'معطل'}
                        </span>
                      ),
                    },
                    { key: 'provisionedAt', header: 'تاريخ التوفير', render: (user) => <span className="text-xs text-muted">{user.provisionedAt ? formatDateTime(user.provisionedAt) : '—'}</span> },
                    {
                      key: 'actions', header: 'الإجراءات', align: 'center',
                      render: (user) => (
                        <div className="flex items-center justify-center gap-1.5">
                          {canManageTenantUsers && (
                            <>
                              <button
                                onClick={() => handleAllUserToggleActive(user)}
                                title={user.status === 'ACTIVE' ? 'تعطيل الحساب' : 'تنشيط الحساب'}
                                className={`rounded p-1 ${
                                  user.status === 'ACTIVE' ? 'text-warning hover:bg-warning/40' : 'text-success hover:bg-success/40'
                                }`}
                              >
                                {user.status === 'ACTIVE' ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                              </button>
                              <button
                                onClick={() => handleAllUserDelete(user)}
                                title="حذف المستخدم"
                                className="rounded p-1 text-danger hover:bg-danger/40"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      ),
                    },
                  ]}
                />
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
            <label className="block text-xs font-semibold text-muted mb-1">الاسم الكامل *</label>
            <input
              type="text"
              value={staffForm.fullName}
              onChange={(e) => setStaffForm({ ...staffForm, fullName: e.target.value })}
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted mb-1">البريد الإلكتروني للعمل *</label>
            <input
              type="email"
              value={staffForm.email}
              onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })}
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted mb-1">رقم الهاتف</label>
            <input
              type="text"
              value={staffForm.phone}
              onChange={(e) => setStaffForm({ ...staffForm, phone: e.target.value })}
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted mb-1">الدور الوظيفي بالمنصة *</label>
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
            <p className="text-[10.5px] text-muted mt-1">
              ملاحظة: موظف الدعم أو العمليات لن يحصل على صلاحيات مالك المنصة أو تغيير الأسعار والتراخيص.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted mb-1">
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

          <div className="flex justify-end gap-2 pt-3 border-t border-line-strong">
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
            <label className="block text-xs font-semibold text-muted mb-1">اسم الموظف الكامل *</label>
            <input
              type="text"
              value={tenantUserForm.fullName}
              onChange={(e) => setTenantUserForm({ ...tenantUserForm, fullName: e.target.value })}
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">اسم الدخول (Username)</label>
              <input
                type="text"
                value={tenantUserForm.username || ''}
                onChange={(e) => setTenantUserForm({ ...tenantUserForm, username: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">البريد الإلكتروني</label>
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
              <label className="block text-xs font-semibold text-muted mb-1">الدور في ERP</label>
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
              <label className="block text-xs font-semibold text-muted mb-1">رقم الهاتف</label>
              <input
                type="text"
                value={tenantUserForm.phone || ''}
                onChange={(e) => setTenantUserForm({ ...tenantUserForm, phone: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-line-strong">
            <Button variant="secondary" size="sm" onClick={() => setIsTenantUserModalOpen(false)}>
              إلغاء
            </Button>
            <Button size="sm" onClick={handleSaveTenantUser} disabled={!canManageTenantUsers}>
              حفظ المستخدم
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Unified User Detail */}
      <Modal
        open={detailTarget !== null}
        onClose={closeUserDetail}
        title={detailTarget?.type === 'tenant' ? 'تفاصيل مستخدم العميل' : 'تفاصيل موظف المنصة'}
      >
        {detailLoading ? (
          <div className="py-10 text-center text-sm font-semibold text-muted">
            <RefreshCw className="inline-block h-5 w-5 animate-spin mb-2" />
            <p>جارٍ تحميل التفاصيل...</p>
          </div>
        ) : detail ? (
          <div className="space-y-4 text-right">
            {detailTarget?.type === 'tenant' && (() => {
              const d = detail as PlatformTenantUserDetail;
              const u = d.user;
              return (
                <>
                  <div className="grid grid-cols-2 gap-2 rounded-lg border border-line-strong bg-primary p-3 text-[11.5px]">
                    <div><span className="text-muted">الاسم:</span> <b className="text-ink">{u.fullName}</b></div>
                    <div><span className="text-muted">العميل:</span> <b className="text-ink">{d.tenant?.name ?? u.tenantName ?? '—'}</b></div>
                    <div><span className="text-muted">اسم الدخول:</span> <b className="text-ink font-mono" dir="ltr">{u.username || '—'}</b></div>
                    <div><span className="text-muted">البريد:</span> <b className="text-ink font-mono" dir="ltr">{u.email || '—'}</b></div>
                    <div><span className="text-muted">الدور:</span> <b className="text-ink">{u.role}</b></div>
                    <div><span className="text-muted">الحالة:</span> <b className="text-ink">{u.status}</b></div>
                    <div><span className="text-muted">التوفير:</span> {provisioningBadge(u.provisioningStatus)}</div>
                    <div><span className="text-muted">المصدر:</span> <b className="text-ink">{u.origin ?? 'PLATFORM'}</b></div>
                    <div><span className="text-muted">هوية ERP:</span> <b className="text-ink font-mono" dir="ltr">{u.identityUserId || '—'}</b></div>
                    <div><span className="text-muted">آخر خطأ:</span> <b className="text-danger">{u.lastError || '—'}</b></div>
                  </div>

                  <div>
                    <h4 className="mb-2 text-xs font-bold text-muted">سجل مهام التوفير ({d.jobs.length})</h4>
                    {d.jobs.length === 0 ? (
                      <p className="text-[11px] text-muted">لا توجد مهام توفير مسجلة.</p>
                    ) : (
                      <ul className="max-h-48 space-y-1.5 overflow-y-auto">
                        {d.jobs.map((j) => (
                          <li key={j.id} className="flex items-center justify-between gap-2 rounded-lg border border-line-strong bg-primary px-3 py-1.5 text-[11px]">
                            <span className="font-semibold text-ink">{j.event} <span className="text-muted">({j.status}{j.attempts ? ` · ${j.attempts} محاولات` : ''})</span></span>
                            <span className="text-muted">{j.createdAt ? formatDateTime(j.createdAt) : ''}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div>
                    <h4 className="mb-2 text-xs font-bold text-muted">أحداث التدقيق ({d.events.length})</h4>
                    {d.events.length === 0 ? (
                      <p className="text-[11px] text-muted">لا توجد أحداث مسجلة.</p>
                    ) : (
                      <ul className="max-h-40 space-y-1.5 overflow-y-auto">
                        {d.events.map((ev) => (
                          <li key={ev.id} className="flex items-center justify-between gap-2 text-[11px]">
                            <span className="font-semibold text-ink">{ev.action}</span>
                            <span className="text-muted">{ev.actorName ?? ''} · {ev.createdAt ? formatDateTime(ev.createdAt) : ''}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              );
            })()}

            {detailTarget?.type === 'staff' && (() => {
              const d = detail as PlatformStaffUserDetail;
              const s = d.staff;
              return (
                <>
                  <div className="grid grid-cols-2 gap-2 rounded-lg border border-line-strong bg-primary p-3 text-[11.5px]">
                    <div><span className="text-muted">الاسم:</span> <b className="text-ink">{s.fullName}</b></div>
                    <div><span className="text-muted">البريد:</span> <b className="text-ink font-mono" dir="ltr">{s.email}</b></div>
                    <div><span className="text-muted">اسم الدخول:</span> <b className="text-ink font-mono" dir="ltr">{s.username || '—'}</b></div>
                    <div><span className="text-muted">الدور:</span> <b className="text-ink">{ROLE_BADGE_STYLE[s.role]?.label ?? s.role}</b></div>
                    <div><span className="text-muted">الحالة:</span> <b className="text-ink">{s.isActive ? 'نشط' : 'معطل'}</b></div>
                    <div><span className="text-muted">MFA:</span> <b className="text-ink">{s.mfaEnabled ? 'مفعّل' : 'غير مفعّل'}</b></div>
                    <div><span className="text-muted">جلسات نشطة:</span> <b className="text-ink">{d.activeSessions}</b></div>
                    <div><span className="text-muted">آخر دخول:</span> <b className="text-ink">{s.lastLoginAt ? formatDateTime(s.lastLoginAt) : '—'}</b></div>
                  </div>

                  <div>
                    <h4 className="mb-2 text-xs font-bold text-muted">الأدوار ({d.roles.length})</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {d.roles.length === 0 && <span className="text-[11px] text-muted">لا أدوار مسندة.</span>}
                      {d.roles.map((r) => (
                        <span key={r} className="rounded-md border border-line-strong bg-primary px-2.5 py-1 text-[11px] font-bold text-muted">{ROLE_BADGE_STYLE[r as PlatformStaffRole]?.label ?? r}</span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="mb-2 text-xs font-bold text-muted">الصلاحيات الممنوحة ({d.grants.length}) / المرفوضة ({d.denies.length})</h4>
                    {d.grants.length === 0 && d.denies.length === 0 ? (
                      <p className="text-[11px] text-muted">لا صلاحيات استثنائية — الصلاحيات تأتي من الدور.</p>
                    ) : (
                      <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto">
                        {d.grants.map((g) => (
                          <span key={`g-${g.code}`} className="rounded bg-success/15 px-2 py-0.5 text-[10.5px] font-bold text-success" title={g.name ?? g.code}>{g.code}</span>
                        ))}
                        {d.denies.map((g) => (
                          <span key={`d-${g.code}`} className="rounded bg-danger/15 px-2 py-0.5 text-[10.5px] font-bold text-danger" title={g.name ?? g.code}>{g.code}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <h4 className="mb-2 text-xs font-bold text-muted">محاولات الدخول الأخيرة ({d.recentLogins.length})</h4>
                    {d.recentLogins.length === 0 ? (
                      <p className="text-[11px] text-muted">لا توجد محاولات مسجلة.</p>
                    ) : (
                      <ul className="max-h-40 space-y-1.5 overflow-y-auto">
                        {d.recentLogins.map((l, i) => (
                          <li key={i} className="flex items-center justify-between gap-2 text-[11px]">
                            <span className={l.success ? 'font-semibold text-success' : 'font-semibold text-danger'}>{l.success ? 'نجاح' : 'فشل'}</span>
                            <span className="text-muted" dir="ltr">{l.ipAddress || '—'}</span>
                            <span className="text-muted">{l.createdAt ? formatDateTime(l.createdAt) : ''}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        ) : (
          <EmptyState icon={<Users className="h-5 w-5" />} title="تعذر تحميل التفاصيل" />
        )}
      </Modal>
    </div>
  );
};

export default PlatformAdminControlPage;
