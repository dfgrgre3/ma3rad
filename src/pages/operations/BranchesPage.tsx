import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2, Check, ChevronDown, Loader2, MapPin, Pencil,
  Phone, Plus, Power, RefreshCw, Search, ShieldCheck, Smartphone, Star,
  UserRound, Users, Warehouse, X,
} from 'lucide-react';
import { OperationsService, type Branch, type WarehouseRow } from '../../services/OperationsService';
import { BranchService } from '../../services/BranchService';
import { CompanyService } from '../../services/CompanyService';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';
import { BranchAccessService } from '../../services/BranchAccessService';
import { useToast } from '../../components/ui/Toast';
import type { Company, User } from '../../types';

type BranchStatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';
type ManagementTab = 'overview' | 'warehouses' | 'users';

interface BranchForm {
  name: string;
  code: string;
  phone: string;
  address: string;
  city: string;
  companyId: string;
  managerId: string;
  deviceType: string;
  deviceName: string;
  isDefault: boolean;
}

const emptyForm: BranchForm = {
  name: '',
  code: '',
  phone: '',
  address: '',
  city: '',
  companyId: '',
  managerId: '',
  deviceType: 'WINDOWS',
  deviceName: '',
  isDefault: false,
};

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100';

export const BranchesPage: React.FC = () => {
  const operations = useMemo(() => new OperationsService(), []);
  const branchService = useMemo(() => new BranchService(), []);
  const branchAccess = useMemo(() => new BranchAccessService(), []);
  const toast = useToast();
  const currentUser = AuthService.getCurrentUser();
  const canCreate = PermissionService.can(currentUser, 'branches.create')
    && PermissionService.can(currentUser, 'branches.manage')
    && PermissionService.can(currentUser, 'branches.access_all');
  const canUpdate = PermissionService.can(currentUser, 'branches.update');
  const canManageUsers = PermissionService.can(currentUser, 'branches.manage_users');
  const canViewWarehouses = PermissionService.can(currentUser, 'warehouses.view');
  const canViewCompanies = PermissionService.can(currentUser, 'companies.view');

  const [branches, setBranches] = useState<Branch[]>([]);
  const [activeBranchId, setActiveBranchId] = useState('');
  const [branchStats, setBranchStats] = useState<ReturnType<BranchService['getBranchStats']>>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [managers, setManagers] = useState<User[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<BranchStatusFilter>('ALL');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [form, setForm] = useState<BranchForm>(emptyForm);
  const [createdActivation, setCreatedActivation] = useState<{
    branchName: string;
    activationCode: string;
    deviceType: string;
  } | null>(null);
  const [managedBranch, setManagedBranch] = useState<Branch | null>(null);
  const [managementTab, setManagementTab] = useState<ManagementTab>('overview');
  const [branchWarehouses, setBranchWarehouses] = useState<Array<{
    id: string;
    warehouseId: string;
    warehouseName?: string | null;
    isPrimary: boolean;
    direct: boolean;
  }>>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [primaryWarehouse, setPrimaryWarehouse] = useState(false);
  const [branchUsers, setBranchUsers] = useState<ReturnType<BranchService['getBranchUserAssignments']>>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

  const load = () => {
    setLoading(true);
    try {
      const nextBranches = operations.getBranches('', true);
      setBranches(nextBranches);
      setActiveBranchId(branchAccess.getCurrentBranchId());
      setBranchStats(branchService.getBranchStats());
      if (canViewWarehouses) setWarehouses(operations.getWarehouses());
      if (canViewCompanies) setCompanies(new CompanyService().getAllCompanies(false));
      if (PermissionService.can(currentUser, 'users.view')) {
        setManagers(new AuthService().getAllUsers().filter((user) => user.role !== 'ADMIN'));
      }
      setError(null);
    } catch (loadError: unknown) {
      const message = loadError instanceof Error ? loadError.message : 'تعذر تحميل بيانات الفروع.';
      setError(message);
      toast.error('تعذر تحميل الفروع', message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // Load once at mount; searches are submitted explicitly to avoid repeated database reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const searchTerm = search.trim().toLocaleLowerCase();
  const visibleBranches = branches.filter((branch) => {
    const matchesSearch = !searchTerm || [
      branch.name, branch.code, branch.address || '', branch.city || '',
      branch.phone || '', branch.companyName || '', branch.managerName || '',
    ].some((value) => value.toLocaleLowerCase().includes(searchTerm));
    const matchesStatus = statusFilter === 'ALL'
      || (statusFilter === 'ACTIVE' ? branch.isActive : !branch.isActive);
    return matchesSearch && matchesStatus;
  });
  const activeCount = branches.filter((branch) => branch.isActive).length;
  const totalOrders = branchStats.reduce((sum, item) => sum + Number(item.totalOrders || 0), 0);
  const totalWarehouses = branches.reduce((sum, branch) => sum + Number(branch.warehousesCount || 0), 0);
  const statsByBranch = new Map(branchStats.map((item) => [item.branchId, item]));

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, companyId: companies[0]?.id || '' });
    setFormOpen(true);
  };

  const openEdit = (branch: Branch) => {
    setEditing(branch);
    setForm({
      name: branch.name,
      code: branch.code,
      phone: branch.phone || '',
      address: branch.address || '',
      city: branch.city || '',
      companyId: branch.companyId || '',
      managerId: branch.managerId || '',
      deviceType: branch.deviceType || 'WINDOWS',
      deviceName: '',
      isDefault: branch.isMain,
    });
    setFormOpen(true);
  };

  const submitForm = (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        branchService.updateBranch(editing.id, {
          name: form.name,
          code: form.code,
          phone: form.phone,
          address: form.address,
          city: form.city,
          managerId: form.managerId || null,
          isDefault: form.isDefault,
        });
        toast.success('تم تحديث بيانات الفرع.');
      } else {
        const created = operations.createBranch({
          name: form.name,
          phone: form.phone,
          address: form.address,
          city: form.city,
          companyId: form.companyId || undefined,
          managerId: form.managerId || undefined,
          deviceType: form.deviceType,
          deviceName: form.deviceName,
          isDefault: form.isDefault,
        });
        setCreatedActivation({
          branchName: created.name,
          activationCode: created.activationCode || '—',
          deviceType: created.deviceType || form.deviceType,
        });
        toast.success('تم إنشاء الفرع ورمزه جاهز للتفعيل.');
      }
      setFormOpen(false);
      setEditing(null);
      setForm(emptyForm);
      load();
    } catch (saveError: unknown) {
      toast.error('لم يتم حفظ الفرع', saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = (branch: Branch) => {
    try {
      if (branch.isActive) {
        operations.toggleBranch(branch.id, false);
      } else {
        operations.toggleBranch(branch.id, true);
      }
      toast.success(branch.isActive ? 'تم تعطيل الفرع.' : 'تم تفعيل الفرع.');
      load();
    } catch (statusError: unknown) {
      toast.error('تعذر تغيير حالة الفرع', statusError instanceof Error ? statusError.message : String(statusError));
    }
  };

  const switchToBranch = (branch: Branch) => {
    try {
      branchAccess.setCurrentBranchId(branch.id);
      window.location.reload();
    } catch (switchError: unknown) {
      toast.error('تعذر التبديل إلى الفرع', switchError instanceof Error ? switchError.message : String(switchError));
    }
  };

  const openManagement = (branch: Branch, tab: ManagementTab) => {
    setManagedBranch(branch);
    setManagementTab(tab);
    setSelectedWarehouse('');
    setPrimaryWarehouse(false);
    try {
      if (canViewWarehouses) {
        const mappings = branchService.getBranchWarehouses(branch.id);
        const directWarehouses = warehouses.filter((warehouse) => warehouse.branchId === branch.id);
        const mappedIds = new Set(mappings.map((warehouse) => warehouse.warehouseId));
        setBranchWarehouses([
          ...directWarehouses.map((warehouse) => ({
            id: `direct-${warehouse.id}`,
            warehouseId: warehouse.id,
            warehouseName: warehouse.name,
            isPrimary: warehouse.isDefault,
            direct: true,
          })),
          ...mappings
            .filter((warehouse) => !directWarehouses.some((direct) => direct.id === warehouse.warehouseId))
            .map((warehouse) => ({
              id: warehouse.id,
              warehouseId: warehouse.warehouseId,
              warehouseName: warehouse.warehouseName,
              isPrimary: Boolean(warehouse.isPrimary),
              direct: false,
            })),
        ]);
      }
      if (canManageUsers) {
        const assignments = branchService.getBranchUserAssignments(branch.id);
        setBranchUsers(assignments);
        setSelectedUserIds(assignments.filter((user) => user.isAssigned).map((user) => user.id));
      }
      setError(null);
    } catch (managementError: unknown) {
      toast.error('تعذر تحميل تفاصيل الفرع', managementError instanceof Error ? managementError.message : String(managementError));
    }
  };

  const assignWarehouse = () => {
    if (!managedBranch || !selectedWarehouse) return;
    try {
      branchService.assignWarehouseToBranch(managedBranch.id, selectedWarehouse, primaryWarehouse);
      toast.success('تم ربط المخزن بالفرع.');
      setSelectedWarehouse('');
      setPrimaryWarehouse(false);
      openManagement(managedBranch, 'warehouses');
    } catch (warehouseError: unknown) {
      toast.error('تعذر ربط المخزن', warehouseError instanceof Error ? warehouseError.message : String(warehouseError));
    }
  };

  const removeWarehouse = (warehouseId: string) => {
    if (!managedBranch) return;
    try {
      branchService.removeWarehouseFromBranch(managedBranch.id, warehouseId);
      toast.success('تم إلغاء ربط المخزن.');
      openManagement(managedBranch, 'warehouses');
    } catch (warehouseError: unknown) {
      toast.error('تعذر إلغاء ربط المخزن', warehouseError instanceof Error ? warehouseError.message : String(warehouseError));
    }
  };

  const saveUserAssignments = () => {
    if (!managedBranch) return;
    setSaving(true);
    try {
      branchService.updateBranchUserAssignments(managedBranch.id, selectedUserIds);
      toast.success('تم تحديث مستخدمي الفرع.');
      openManagement(managedBranch, 'users');
    } catch (assignmentError: unknown) {
      toast.error('تعذر تحديث المستخدمين', assignmentError instanceof Error ? assignmentError.message : String(assignmentError));
    } finally {
      setSaving(false);
    }
  };

  const availableWarehouses = warehouses.filter((warehouse) =>
    warehouse.isActive && !warehouse.branchId && !branchWarehouses.some((row) => row.warehouseId === warehouse.id)
  );
  return (
    <div className="flex h-full flex-col overflow-hidden bg-slate-50 text-slate-900" dir="rtl">
      <header className="flex flex-col gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-sky-100 bg-sky-50 text-sky-600">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-black">إدارة الفروع والمعارض</h1>
            <p className="mt-0.5 text-xs text-slate-500">بيانات الفروع، المسؤولون، المخازن، المستخدمون، وحركة كل فرع</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> تحديث
          </button>
          {canCreate && (
            <button onClick={openCreate} className="flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-sky-700">
              <Plus className="h-4 w-4" /> إضافة فرع
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 sm:p-6">
        {error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

        <section className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <SummaryCard icon={<Building2 className="h-4 w-4" />} label="إجمالي الفروع" value={branches.length} tone="sky" />
          <SummaryCard icon={<ShieldCheck className="h-4 w-4" />} label="الفروع النشطة" value={activeCount} tone="emerald" />
          <SummaryCard icon={<Warehouse className="h-4 w-4" />} label="المخازن النشطة" value={totalWarehouses} tone="violet" />
          <SummaryCard icon={<Users className="h-4 w-4" />} label="عدد الفواتير" value={totalOrders.toLocaleString('ar-EG')} tone="amber" />
        </section>

        {createdActivation && (
          <section className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
            <div className="mb-2 flex items-center gap-2 font-black"><ShieldCheck className="h-5 w-5" /> تم تجهيز الفرع بنجاح</div>
            <div className="grid gap-2 text-xs sm:grid-cols-3">
              <div><span className="text-emerald-700">الفرع:</span> {createdActivation.branchName}</div>
              <div><span className="text-emerald-700">نوع الجهاز:</span> {createdActivation.deviceType}</div>
              <div><span className="text-emerald-700">رمز التفعيل:</span> <code className="font-black">{createdActivation.activationCode}</code></div>
            </div>
          </section>
        )}

        <section className="mb-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center">
          <form onSubmit={(event) => { event.preventDefault(); load(); }} className="relative flex-1">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث بالاسم أو الكود أو المدينة أو العنوان" className={`${inputClass} pr-9`} />
          </form>
          <label className="relative min-w-40">
            <span className="sr-only">تصفية حالة الفروع</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as BranchStatusFilter)} className={`${inputClass} appearance-none pl-9`}>
              <option value="ALL">كل الحالات ({branches.length})</option>
              <option value="ACTIVE">النشطة ({activeCount})</option>
              <option value="INACTIVE">المعطلة</option>
            </select>
            <ChevronDown className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </label>
        </section>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-sky-500" /></div>
        ) : visibleBranches.length ? (
          <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {visibleBranches.map((branch) => {
              const stats = statsByBranch.get(branch.id);
              const isSelectedBranch = branch.id === activeBranchId;
              return (
                <article key={branch.id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-base font-black">{branch.name}</h2>
                        {branch.isMain && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700"><Star className="h-3 w-3" /> افتراضي</span>}
                      </div>
                      <p className="mt-1 font-mono text-[11px] text-slate-400">{branch.code}</p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold ${branch.isActive ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-100 text-slate-500'}`}>
                      {branch.isActive ? 'نشط' : 'معطل'}
                    </span>
                  </div>

                  <div className="my-4 space-y-2.5 text-xs text-slate-600">
                    <InfoRow icon={<MapPin />} value={[branch.address, branch.city].filter(Boolean).join('، ') || 'لا يوجد عنوان مسجل'} />
                    <InfoRow icon={<Phone />} value={branch.phone || 'لا يوجد هاتف'} href={branch.phone ? `tel:${branch.phone}` : undefined} />
                    <InfoRow icon={<Building2 />} value={branch.companyName || 'الشركة غير محددة'} />
                    <InfoRow icon={<UserRound />} value={branch.managerName || 'لم يتم تعيين مسؤول'} />
                    <InfoRow icon={<Warehouse />} value={`${branch.warehousesCount || 0} مخزن نشط`} />
                    {branch.deviceType && <InfoRow icon={<Smartphone />} value={`جهاز المزامنة: ${branch.deviceType}`} />}
                  </div>

                  {isSelectedBranch ? (
                    <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3">
                      <div>
                        <p className="text-[10px] font-semibold text-slate-500">إجمالي المبيعات</p>
                        <p className="mt-1 text-sm font-black text-slate-800">{formatCurrency(Number(stats?.totalSales || 0), branch.companyCurrency)}</p>
                      </div>
                      <div className="border-r border-slate-200 pr-3">
                        <p className="text-[10px] font-semibold text-slate-500">عدد الفواتير</p>
                        <p className="mt-1 text-sm font-black text-slate-800">{Number(stats?.totalOrders || 0).toLocaleString('ar-EG')}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="mb-4 rounded-xl bg-slate-50 p-3 text-center text-xs text-slate-500">بدّل إلى هذا الفرع لعرض بياناته التشغيلية.</p>
                  )}

                  <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                    {isSelectedBranch ? (
                      <>
                        <button onClick={() => openManagement(branch, 'overview')} className="rounded-lg px-2.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100">التفاصيل</button>
                        {canUpdate && <button onClick={() => openEdit(branch)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-bold text-sky-700 hover:bg-sky-50"><Pencil className="h-3.5 w-3.5" /> تعديل</button>}
                        {canViewWarehouses && <button onClick={() => openManagement(branch, 'warehouses')} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-bold text-violet-700 hover:bg-violet-50"><Warehouse className="h-3.5 w-3.5" /> المخازن</button>}
                        {canManageUsers && <button onClick={() => openManagement(branch, 'users')} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-50"><Users className="h-3.5 w-3.5" /> المستخدمون</button>}
                      </>
                    ) : branch.isActive ? (
                      <button onClick={() => switchToBranch(branch)} className="rounded-lg bg-sky-50 px-3 py-2 text-xs font-bold text-sky-700 hover:bg-sky-100">التبديل إلى هذا الفرع</button>
                    ) : null}
                    {canUpdate && (
                      <button
                        onClick={() => changeStatus(branch)}
                        disabled={branch.isMain || (branch.isActive && !isSelectedBranch)}
                        title={branch.isMain ? 'عيّن فرعًا افتراضيًا آخر قبل تعطيل هذا الفرع' : undefined}
                        className={`mr-auto inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-40 ${branch.isActive ? 'text-rose-700 hover:bg-rose-50' : 'text-emerald-700 hover:bg-emerald-50'}`}
                      >
                        <Power className="h-3.5 w-3.5" /> {branch.isActive ? 'تعطيل' : 'تفعيل'}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </section>
        ) : (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white py-16 text-center">
            <Building2 className="mx-auto mb-3 h-8 w-8 text-slate-300" />
            <p className="font-bold text-slate-600">{search || statusFilter !== 'ALL' ? 'لا توجد فروع مطابقة للبحث والتصفية.' : 'لا توجد فروع مسجلة حتى الآن.'}</p>
            {canCreate && !search && <button onClick={openCreate} className="mt-3 text-sm font-bold text-sky-700 hover:underline">إضافة أول فرع</button>}
          </div>
        )}
      </main>

      {formOpen && (
        <Modal onClose={() => setFormOpen(false)} title={editing ? 'تعديل بيانات الفرع' : 'إضافة فرع جديد'}>
          <form onSubmit={submitForm} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="اسم الفرع *" className="sm:col-span-2">
                <input required minLength={2} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={inputClass} />
              </FormField>
              {editing && <FormField label="كود الفرع *"><input required value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} className={inputClass} /></FormField>}
              <FormField label="رقم الهاتف"><input type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} className={inputClass} /></FormField>
              <FormField label="المدينة"><input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} className={inputClass} /></FormField>
              <FormField label="العنوان" className="sm:col-span-2"><input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} className={inputClass} /></FormField>
              {!editing && canViewCompanies && (
                <FormField label="الشركة المالكة">
                  <select value={form.companyId} onChange={(event) => setForm({ ...form, companyId: event.target.value })} className={inputClass}>
                    <option value="">الشركة الافتراضية</option>
                    {companies.map((company) => <option key={company.id} value={company.id}>{company.name} ({company.code})</option>)}
                  </select>
                </FormField>
              )}
              {managers.length > 0 && (
                <FormField label="مسؤول الفرع">
                  <select value={form.managerId} onChange={(event) => setForm({ ...form, managerId: event.target.value })} className={inputClass}>
                    <option value="">بدون مسؤول محدد</option>
                    {managers
                      .filter((manager) => manager.isActive || (editing?.managerId === manager.id))
                      .map((manager) => <option key={manager.id} value={manager.id}>{manager.fullName} — {manager.username}{manager.isActive ? '' : ' (غير نشط)'}</option>)}
                  </select>
                </FormField>
              )}
              {!editing && (
                <>
                  <FormField label="نوع جهاز الفرع">
                    <select value={form.deviceType} onChange={(event) => setForm({ ...form, deviceType: event.target.value })} className={inputClass}>
                      <option value="WINDOWS">ويندوز</option><option value="MAC">ماك</option><option value="LINUX">لينكس</option><option value="ANDROID">أندرويد</option>
                    </select>
                  </FormField>
                  <FormField label="اسم الجهاز"><input value={form.deviceName} onChange={(event) => setForm({ ...form, deviceName: event.target.value })} placeholder="حاسوب الفرع" className={inputClass} /></FormField>
                </>
              )}
            </div>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <input type="checkbox" checked={form.isDefault} onChange={(event) => setForm({ ...form, isDefault: event.target.checked })} className="h-4 w-4 accent-sky-600" />
              <span><span className="block text-xs font-bold">تعيين كفرع افتراضي</span><span className="mt-0.5 block text-[10px] text-slate-500">سيحل هذا الفرع محل الفرع الافتراضي الحالي.</span></span>
            </label>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button type="button" onClick={() => setFormOpen(false)} className="rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-bold text-slate-600">إلغاء</button>
              <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} {editing ? 'حفظ التعديلات' : 'إنشاء الفرع'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {managedBranch && (
        <Modal onClose={() => setManagedBranch(null)} title={managedBranch.name} wide>
          <div className="mb-4 flex flex-wrap gap-2 border-b border-slate-100 pb-3">
            <TabButton active={managementTab === 'overview'} onClick={() => setManagementTab('overview')}>نظرة عامة</TabButton>
            {canViewWarehouses && <TabButton active={managementTab === 'warehouses'} onClick={() => setManagementTab('warehouses')}>المخازن</TabButton>}
            {canManageUsers && <TabButton active={managementTab === 'users'} onClick={() => setManagementTab('users')}>مستخدمو الفرع</TabButton>}
          </div>

          {managementTab === 'overview' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Detail label="كود الفرع" value={managedBranch.code} />
              <Detail label="الحالة" value={managedBranch.isActive ? 'نشط' : 'معطل'} />
              <Detail label="الشركة المالكة" value={managedBranch.companyName || 'غير محددة'} />
              <Detail label="مسؤول الفرع" value={managedBranch.managerName || 'غير محدد'} />
              <Detail label="الهاتف" value={managedBranch.phone || 'غير مسجل'} />
              <Detail label="الموقع" value={[managedBranch.address, managedBranch.city].filter(Boolean).join('، ') || 'غير مسجل'} />
              <Detail label="تاريخ الإنشاء" value={managedBranch.createdAt ? new Date(managedBranch.createdAt).toLocaleDateString('ar-EG') : '—'} />
              <Detail label="حالة المزامنة" value={managedBranch.activationCode ? 'جاهز للتفعيل' : 'غير مربوط بجهاز'} />
              {managedBranch.activationCode && <Detail label="رمز التفعيل" value={managedBranch.activationCode} code />}
            </div>
          )}

          {managementTab === 'warehouses' && canViewWarehouses && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 p-3">
                <h3 className="mb-3 text-xs font-black">ربط مخزن متاح بالفرع</h3>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <select value={selectedWarehouse} onChange={(event) => setSelectedWarehouse(event.target.value)} className={`${inputClass} flex-1`}>
                    <option value="">اختر مخزنًا غير مرتبط</option>
                    {availableWarehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name} ({warehouse.code})</option>)}
                  </select>
                  <label className="flex items-center gap-2 whitespace-nowrap px-2 text-xs font-semibold text-slate-600">
                    <input type="checkbox" checked={primaryWarehouse} onChange={(event) => setPrimaryWarehouse(event.target.checked)} className="h-4 w-4 accent-violet-600" /> مخزن أساسي
                  </label>
                  <button onClick={assignWarehouse} disabled={!selectedWarehouse} className="rounded-xl bg-violet-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">ربط المخزن</button>
                </div>
                {!availableWarehouses.length && <p className="mt-2 text-[10px] text-slate-500">لا توجد مخازن غير مرتبطة. يمكنك إنشاء مخزن من صفحة المخازن واختيار الفرع مباشرة.</p>}
              </div>
              <div className="space-y-2">
                {branchWarehouses.map((warehouse) => (
                  <div key={warehouse.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5">
                    <div className="flex items-center gap-2 text-sm font-bold"><Warehouse className="h-4 w-4 text-violet-600" /> {warehouse.warehouseName || warehouse.warehouseId}
                      {warehouse.isPrimary && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700">أساسي</span>}
                      {warehouse.direct && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">مرتبط مباشرة</span>}
                    </div>
                    {!warehouse.direct && <button onClick={() => removeWarehouse(warehouse.warehouseId)} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50" aria-label="إلغاء ربط المخزن"><X className="h-4 w-4" /></button>}
                  </div>
                ))}
                {!branchWarehouses.length && <p className="py-6 text-center text-xs text-slate-500">لا توجد مخازن مرتبطة بهذا الفرع.</p>}
              </div>
            </div>
          )}

          {managementTab === 'users' && canManageUsers && (
            <div>
              <div className="mb-3 flex items-start gap-2 rounded-xl bg-indigo-50 p-3 text-xs text-indigo-800">
                <Users className="mt-0.5 h-4 w-4 shrink-0" />
                <p>اختيار المستخدم يربطه بالفرع ويمنحه نطاقًا متاحًا لإدارة بياناته وفق صلاحيات دوره. لا يمكن إزالة آخر فرع لمستخدم نطاقه «الفروع المسندة».</p>
              </div>
              <div className="max-h-80 space-y-2 overflow-y-auto">
                {branchUsers.map((user) => (
                  <label key={user.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={selectedUserIds.includes(user.id)}
                      onChange={(event) => setSelectedUserIds((current) =>
                        event.target.checked ? [...current, user.id] : current.filter((id) => id !== user.id)
                      )}
                      className="h-4 w-4 accent-indigo-600"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-bold">{user.fullName}</span>
                      <span className="mt-0.5 block text-[10px] text-slate-500">{user.username} · {user.role}</span>
                    </span>
                    {user.branchScope === 'ALL' && <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] text-slate-500">وصول مركزي</span>}
                    {user.isAssigned && <Check className="h-4 w-4 text-emerald-600" />}
                  </label>
                ))}
                {!branchUsers.length && <p className="py-8 text-center text-xs text-slate-500">لا يوجد مستخدمون نشطون قابلون للإسناد.</p>}
              </div>
              <div className="mt-4 flex justify-end border-t border-slate-100 pt-3">
                <button onClick={saveUserAssignments} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />} حفظ إسناد المستخدمين
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
};

const formatCurrency = (value: number, currency?: string | null): string => {
  const code = currency || 'EGP';
  try {
    return new Intl.NumberFormat('ar-EG', { style: 'currency', currency: code, maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${value.toLocaleString('ar-EG', { maximumFractionDigits: 0 })} ${code}`;
  }
};

const SummaryCard: React.FC<{ icon: React.ReactNode; label: string; value: string | number; tone: 'sky' | 'emerald' | 'violet' | 'amber' }> = ({ icon, label, value, tone }) => {
  const tones = {
    sky: 'bg-sky-50 text-sky-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    violet: 'bg-violet-50 text-violet-600',
    amber: 'bg-amber-50 text-amber-600',
  };
  return (
  <div className="rounded-2xl border border-slate-200 bg-white p-4">
    <div className={`mb-3 flex h-8 w-8 items-center justify-center rounded-xl ${tones[tone]}`}>{icon}</div>
    <p className="text-[11px] font-semibold text-slate-500">{label}</p>
    <p className="mt-1 truncate text-lg font-black text-slate-900">{value}</p>
  </div>
  );
};

const InfoRow: React.FC<{ icon: React.ReactElement<{ className?: string }>; value: string; href?: string }> = ({ icon, value, href }) => (
  <div className="flex items-center gap-2">
    {React.cloneElement(icon, { className: 'h-4 w-4 shrink-0 text-slate-400' })}
    {href ? <a href={href} className="truncate hover:text-sky-700">{value}</a> : <span className="truncate">{value}</span>}
  </div>
);

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }> = ({ title, onClose, children, wide }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-3 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className={`max-h-[92vh] w-full overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6 ${wide ? 'max-w-2xl' : 'max-w-xl'}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-black">{title}</h2>
        <button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="إغلاق"><X className="h-4 w-4" /></button>
      </div>
      {children}
    </div>
  </div>
);

const FormField: React.FC<{ label: string; children: React.ReactNode; className?: string }> = ({ label, children, className = '' }) => (
  <label className={`block ${className}`}><span className="mb-1.5 block text-xs font-bold text-slate-700">{label}</span>{children}</label>
);

const Detail: React.FC<{ label: string; value: string; code?: boolean }> = ({ label, value, code }) => (
  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
    <p className="text-[10px] font-semibold text-slate-500">{label}</p>
    <p className={`mt-1 break-words text-xs font-bold text-slate-800 ${code ? 'font-mono' : ''}`}>{value}</p>
  </div>
);

const TabButton: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button onClick={onClick} className={`rounded-lg px-3 py-2 text-xs font-bold ${active ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{children}</button>
);
