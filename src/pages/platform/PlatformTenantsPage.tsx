import React from 'react';
import {
  Activity,
  AlertTriangle,
  Archive,
  Ban,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Copy,
  CreditCard,
  Cpu,
  Download,
  Eye,
  FileText,
  Filter,
  Globe,
  KeyRound,
  Layers3,
  LockKeyhole,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  RotateCw,
  Search,
  Send,
  ShieldCheck,
  Smartphone,
  ScrollText,
  Trash2,
  Upload,
  UserPlus,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react';
import { platformAdminService, PLATFORM_TENANT_STATUS_LABELS } from '../../services/domains/platform/PlatformAdminService';
import { centralPlatformClient } from '../../services/domains/platform/CentralPlatformClient';
import { getCentralDataSourceState } from '../../hooks/platform/useCentralDataSource';
import { canPlatform } from '../../hooks/platform/usePlatformPermission';
import type {
  PlatformActivationDetails,
  PlatformPlan,
  PlatformTenant,
  PlatformTenantInput,
  PlatformTenantOverride,
  PlatformTenantOverrideInput,
  PlatformTenantProfile,
  PlatformTenantStatus,
} from '../../services/domains/platform/platformTypes';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { useToast } from '../../components/ui/Toast';
import {
  EmptyState,
  Field,
  StatusBadge,
  downloadCsv,
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  inputClass,
} from './components/PlatformUI';

const STATUSES: PlatformTenantStatus[] = ['TRIAL', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'CANCELLED'];

const CYCLE_LABELS: Record<string, string> = {
  MONTHLY: 'شهري',
  QUARTERLY: 'ربع سنوي',
  YEARLY: 'سنوي',
  LIFETIME: 'مدى الحياة',
};

const ACCOUNT_STATUS = (active?: boolean) => (active ? 'نشط' : 'موقوف');

const emptyForm: PlatformTenantInput = {
  name: '',
  code: '',
  contactName: '',
  email: '',
  phone: '',
  country: 'مصر',
  city: '',
  address: '',
  businessType: 'معرض سيراميك',
  status: 'TRIAL',
  planId: '',
  seatsLimit: 2,
  branchesLimit: 1,
  devicesLimit: 2,
  notes: '',
};

type TabKey = 'overview' | 'subscription' | 'licenses' | 'billing' | 'logs' | 'users' | 'remote';

const TABS: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
  { key: 'overview', label: 'نظرة عامة', icon: <Eye className="h-3.5 w-3.5" /> },
  { key: 'subscription', label: 'الاشتراك والباقة', icon: <CalendarClock className="h-3.5 w-3.5" /> },
  { key: 'licenses', label: 'التراخيص والتفعيلات', icon: <KeyRound className="h-3.5 w-3.5" /> },
  { key: 'billing', label: 'المدفوعات والفواتير', icon: <CreditCard className="h-3.5 w-3.5" /> },
  { key: 'logs', label: 'السجلات والنشاط', icon: <ScrollText className="h-3.5 w-3.5" /> },
  { key: 'users', label: 'مستخدمو العميل', icon: <Users className="h-3.5 w-3.5" /> },
  { key: 'remote', label: 'التحكم عن بعد', icon: <Cpu className="h-3.5 w-3.5" /> },
];

const InfoItem: React.FC<{ label: string; value: React.ReactNode; ltr?: boolean }> = ({ label, value, ltr }) => (
  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
    <dt className="text-[10.5px] font-semibold text-slate-500">{label}</dt>
    <dd className={`mt-0.5 text-[12px] font-bold text-slate-800 ${ltr ? 'font-mono' : ''}`} dir={ltr ? 'ltr' : undefined}>
      {value || '—'}
    </dd>
  </div>
);

const SectionCard: React.FC<{
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, subtitle, icon, action, children }) => (
  <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        {icon && <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">{icon}</span>}
        <div className="min-w-0">
          <h4 className="truncate text-[12.5px] font-bold text-slate-800">{title}</h4>
          {subtitle && <p className="truncate text-[10.5px] text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {action}
    </header>
    {children}
  </section>
);

const LogList: React.FC<{ entries: PlatformTenantProfile['activityLog']; empty: string }> = ({ entries, empty }) => (
  entries.length === 0 ? (
    <p className="px-3 py-4 text-[11px] text-slate-500">{empty}</p>
  ) : (
    <ol className="divide-y divide-slate-100">
      {entries.map((entry) => (
        <li key={entry.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[9.5px] font-bold text-slate-600">
            {entry.entityType === 'ACTIVATION' ? 'تفعيل' : entry.entityType === 'TENANT' ? 'إدارة' : entry.entityType}
          </span>
          <p className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-slate-800">{entry.action}</p>
          <span className="shrink-0 text-[10px] text-slate-500">{entry.actorName || 'النظام'}</span>
          <span className="shrink-0 text-[10px] text-slate-400">{formatDateTime(entry.createdAt)}</span>
        </li>
      ))}
    </ol>
  )
);

const buildActivation = (profile: PlatformTenantProfile, temporaryPassword: string | null): PlatformActivationDetails => {
  const license = profile.licenses.find((item) => item.status === 'ACTIVE' || item.status === 'ISSUED') ?? profile.licenses[0] ?? null;
  return {
    tenant: profile.tenant,
    account: profile.account,
    username: profile.account?.username ?? '',
    temporaryPassword,
    activationCode: profile.account?.activationCode ?? '',
    planName: profile.plan?.name ?? license?.planName ?? null,
    licenseKey: license?.licenseKey ?? null,
    licenseExpiresAt: license?.expiresAt ?? profile.tenant.subscriptionExpiresAt,
    modules: license?.modules?.length ? license.modules : profile.plan?.includedModules ?? [],
    loginUrl: typeof window !== 'undefined' ? `${window.location.origin}/login` : '/login',
    generatedAt: new Date().toISOString(),
  };
};

const activationText = (details: PlatformActivationDetails): string => [
  `بيانات تفعيل منصة ${details.tenant.name}`,
  `رقم العميل: ${details.tenant.code}`,
  `Tenant ID: ${details.tenant.id}`,
  `اسم المستخدم: ${details.username}`,
  details.temporaryPassword ? `كلمة المرور المؤقتة: ${details.temporaryPassword}` : null,
  `كود التفعيل: ${details.activationCode}`,
  details.planName ? `الباقة: ${details.planName}` : null,
  details.licenseKey ? `مفتاح الترخيص: ${details.licenseKey}` : null,
  details.licenseExpiresAt ? `انتهاء الترخيص: ${formatDate(details.licenseExpiresAt)}` : null,
  details.modules.length ? `الوحدات: ${details.modules.join(', ')}` : null,
  `رابط الدخول: ${details.loginUrl}`,
].filter(Boolean).join('\n');

export const PlatformTenantsPage: React.FC = () => {
  const toast = useToast();
  const [tenants, setTenants] = React.useState<PlatformTenant[]>([]);
  const [plans, setPlans] = React.useState<PlatformPlan[]>([]);
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [planId, setPlanId] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Advanced filters state
  const [showAdvancedFilters, setShowAdvancedFilters] = React.useState(false);
  const [dateRange, setDateRange] = React.useState({ from: '', to: '' });
  const [outstandingRange, setOutstandingRange] = React.useState({ min: '', max: '' });
  const [deviceUtilizationFilter, setDeviceUtilizationFilter] = React.useState('');
  const [healthScoreFilter, setHealthScoreFilter] = React.useState('');
  const [filterPresets, setFilterPresets] = React.useState<Record<string, any>>(() => {
    try { return JSON.parse(localStorage.getItem('tenantFilterPresets') || '{}'); } catch { return {}; }
  });

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<PlatformTenant | null>(null);
  const [form, setForm] = React.useState<PlatformTenantInput>(emptyForm);
  const [saving, setSaving] = React.useState(false);

  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [profile, setProfile] = React.useState<PlatformTenantProfile | null>(null);
  const [tab, setTab] = React.useState<TabKey>('overview');
  const [renewMonths, setRenewMonths] = React.useState(12);
  const [planForm, setPlanForm] = React.useState({ planId: '', months: 12, seats: 1 });
  const [accountOpen, setAccountOpen] = React.useState(false);
  const [accountForm, setAccountForm] = React.useState({ username: '', email: '', fullName: '', password: '' });
  const [activationOpen, setActivationOpen] = React.useState(false);
  const [activation, setActivation] = React.useState<PlatformActivationDetails | null>(null);
  const [channels, setChannels] = React.useState<string[]>(['EMAIL']);
  const [working, setWorking] = React.useState(false);
  const [overrides, setOverrides] = React.useState<PlatformTenantOverride[]>([]);
  const [overrideForm, setOverrideForm] = React.useState<PlatformTenantOverrideInput>({ kind: 'MODULE', code: '', value: '', isEnabled: true });
  const [users, setUsers] = React.useState<any[]>([]);
  const [userOpen, setUserOpen] = React.useState(false);
  const [editingUser, setEditingUser] = React.useState<any>(null);
  const [userForm, setUserForm] = React.useState({ fullName: '', username: '', email: '', phone: '', role: 'USER', status: 'ACTIVE', notes: '' });
  const [branches, setBranches] = React.useState<any[]>([]);
  const [branchForm, setBranchForm] = React.useState({ code: '', name: '', city: '', phone: '', seatsLimit: 1, devicesLimit: 1, isMain: false });
  const [branchOpen, setBranchOpen] = React.useState(false);

  // Bulk operations state
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [bulkActionOpen, setBulkActionOpen] = React.useState(false);
  const [bulkActionType, setBulkActionType] = React.useState<'status' | 'plan' | 'activation' | 'export' | 'import'>('status');
  const [bulkStatus, setBulkStatus] = React.useState<PlatformTenantStatus>('SUSPENDED');
  const [bulkPlanId, setBulkPlanId] = React.useState('');
  const [bulkMonths, setBulkMonths] = React.useState(12);
  const [bulkChannels, setBulkChannels] = React.useState<string[]>(['EMAIL']);
  const [bulkWorking, setBulkWorking] = React.useState(false);
  const [csvImportOpen, setCsvImportOpen] = React.useState(false);
  const [csvFile, setCsvFile] = React.useState<File | null>(null);
  const [csvPreview, setCsvPreview] = React.useState<string[][]>([]);
  const [csvImporting, setCsvImporting] = React.useState(false);

  // Remote Control state
  const [remoteDevices, setRemoteDevices] = React.useState<any[]>([]);
  const [remoteConfig, setRemoteConfig] = React.useState<any[]>([]);
  const [remoteHistory, setRemoteHistory] = React.useState<any[]>([]);
  const [remoteControlData, setRemoteControlData] = React.useState<{
    tenant: any;
    appliedConfig: any;
    configPushHistory: any[];
    devices: any[];
    lastSync: any;
  } | null>(null);
  const [configForm, setConfigForm] = React.useState({ key: '', value: '', scope: 'TENANT', targetDeviceIds: [] as string[] });
  const [configSending, setConfigSending] = React.useState(false);
  const [selectedDeviceIds, setSelectedDeviceIds] = React.useState<string[]>([]);
  const [forceSyncWorking, setForceSyncWorking] = React.useState(false);

  const centralState = React.useMemo(() => getCentralDataSourceState(), []);
  const centralActive = centralState.active;


  const load = React.useCallback(() => {
    setLoading(true);
    const finish = (err?: unknown) => {
      if (err) setError(err instanceof Error ? err.message : 'تعذر تحميل العملاء.');
      else setError(null);
      setPage(1);
      setLoading(false);
    };
    if (centralActive) {
      Promise.all([centralPlatformClient.listTenants(search, status, planId), centralPlatformClient.listPlans()])
        .then(([nextTenants, nextPlans]) => { setTenants(nextTenants); setPlans(nextPlans); finish(); })
        .catch(finish);
      return;
    }
    try {
      setTenants(platformAdminService.listTenants(search, status, planId));
      setPlans(platformAdminService.listPlans());
      finish();
    } catch (err) {
      finish(err);
    }
  }, [search, status, planId, centralActive]);

  React.useEffect(() => { load(); }, [load]);

  const canManageTenants = canPlatform('tenants', 'platform.tenants.update');

  const loadProfile = React.useCallback((id: string) => {
    const applyProfile = (next: PlatformTenantProfile) => {
      setProfile(next);
      setPlanForm((current) => ({
        planId: current.planId || next.tenant.planId || plans.find((plan) => plan.isDefault)?.id || '',
        months: current.months || 12,
        seats: current.seats || next.tenant.seatsLimit,
      }));
    };
    if (centralActive) {
      Promise.all([
        centralPlatformClient.getTenantProfile(id),
        centralPlatformClient.listTenantOverrides(id),
        centralPlatformClient.listTenantUsers(id),
        centralPlatformClient.listTenantBranches(id),
      ])
        .then(([next, nextOverrides, nextUsers, nextBranches]) => {
          applyProfile(next as PlatformTenantProfile);
          setOverrides(nextOverrides as PlatformTenantOverride[]);
          setUsers(nextUsers);
          setBranches(nextBranches);
        })
        .catch((err) => {
          toast.error('تعذر تحميل ملف العميل', err instanceof Error ? err.message : undefined);
          setDetailId(null);
          setProfile(null);
        });
      return;
    }
    try {
      const next = platformAdminService.getTenantProfile(id);
      applyProfile(next);
      setOverrides(platformAdminService.listTenantOverrides(id));
      setUsers(platformAdminService.listTenantUsers(id));
      setBranches([]);
    } catch (err) {
      toast.error('تعذر تحميل ملف العميل', err instanceof Error ? err.message : undefined);
      setDetailId(null);
      setProfile(null);
    }
  }, [plans, toast, centralActive]);

  const refreshDetail = React.useCallback(() => {
    if (detailId) loadProfile(detailId);
    load();
  }, [detailId, load, loadProfile]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, planId: plans.find((plan) => plan.isDefault)?.id ?? plans[0]?.id ?? '' });
    setFormOpen(true);
  };

  const openEdit = (tenant: PlatformTenant) => {
    setEditing(tenant);
    setForm({
      name: tenant.name,
      code: tenant.code,
      contactName: tenant.contactName ?? '',
      email: tenant.email ?? '',
      phone: tenant.phone ?? '',
      country: tenant.country ?? '',
      city: tenant.city ?? '',
      address: tenant.address ?? '',
      businessType: tenant.businessType ?? '',
      status: tenant.status,
      planId: tenant.planId ?? '',
      seatsLimit: tenant.seatsLimit,
      branchesLimit: tenant.branchesLimit,
      devicesLimit: tenant.devicesLimit,
      notes: tenant.notes ?? '',
    });
    setFormOpen(true);
  };

  const save = () => {
    setSaving(true);
    const done = () => {
      setFormOpen(false);
      if (detailId && editing?.id === detailId) loadProfile(detailId);
      load();
    };
    const fail = (err: unknown) => toast.error('تعذر حفظ العميل', err instanceof Error ? err.message : undefined);
    if (centralActive) {
      const request = editing
        ? centralPlatformClient.updateTenant(editing.id, form as Record<string, any>)
        : centralPlatformClient.createTenant(form);
      request
        .then(() => { toast.success(editing ? 'تم تحديث بيانات العميل' : 'تمت إضافة العميل بنجاح'); done(); })
        .catch(fail)
        .finally(() => setSaving(false));
      return;
    }
    try {
      if (editing) {
        platformAdminService.updateTenant(editing.id, form);
        toast.success('تم تحديث بيانات العميل');
      } else {
        platformAdminService.createTenant(form);
        toast.success('تمت إضافة العميل بنجاح');
      }
      done();
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  };

  const saveBranch = () => {
    if (!detailId || !branchForm.code.trim() || !branchForm.name.trim()) {
      toast.error('كود الفرع واسمه مطلوبان');
      return;
    }
    setWorking(true);
    centralPlatformClient.createTenantBranch(detailId, {
      code: branchForm.code.trim(),
      name: branchForm.name.trim(),
      city: branchForm.city.trim() || undefined,
      phone: branchForm.phone.trim() || undefined,
      seatsLimit: branchForm.seatsLimit,
      devicesLimit: branchForm.devicesLimit,
      isMain: branchForm.isMain,
    })
      .then(() => {
        toast.success('تمت إضافة الفرع');
        setBranchOpen(false);
        setBranchForm({ code: '', name: '', city: '', phone: '', seatsLimit: 1, devicesLimit: 1, isMain: false });
        if (detailId) centralPlatformClient.listTenantBranches(detailId).then(setBranches);
        loadProfile(detailId);
      })
      .catch((err) => toast.error('تعذر إضافة الفرع', err instanceof Error ? err.message : undefined))
      .finally(() => setWorking(false));
  };

  const closeBranch = (branchId: string) => {
    if (!detailId) return;
    if (!window.confirm('هل تريد إغلاق هذا الفرع؟')) return;
    setWorking(true);
    centralPlatformClient.closeTenantBranch(detailId, branchId)
      .then(() => {
        toast.success('تم إغلاق الفرع');
        centralPlatformClient.listTenantBranches(detailId).then(setBranches);
        loadProfile(detailId);
      })
      .catch((err) => toast.error('تعذر إغلاق الفرع', err instanceof Error ? err.message : undefined))
      .finally(() => setWorking(false));
  };

  const openProfile = (tenant: PlatformTenant) => {
    setDetailId(tenant.id);
    setTab('overview');
    setProfile(null);
    setPlanForm({ planId: tenant.planId || '', months: 12, seats: tenant.seatsLimit });
    setAccountForm({
      username: tenant.code.toLowerCase(),
      email: tenant.email ?? '',
      fullName: tenant.contactName ?? tenant.name,
      password: '',
    });
    loadProfile(tenant.id);
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('تم النسخ', label);
    } catch {
      toast.error('تعذر النسخ إلى الحافظة');
    }
  };

  const run = (action: () => unknown, message: string) => {
    setWorking(true);
    Promise.resolve()
      .then(action)
      .then(() => {
        toast.success(message);
        refreshDetail();
      })
      .catch((err) => toast.error('تعذر تنفيذ العملية', err instanceof Error ? err.message : undefined))
      .finally(() => setWorking(false));
  };

  const changeStatus = (tenant: PlatformTenant, next: PlatformTenantStatus) => {
    run(
      () => (centralActive ? centralPlatformClient.setTenantStatus(tenant.id, next) : platformAdminService.setTenantStatus(tenant.id, next)),
      `تم تحديث الحالة إلى ${PLATFORM_TENANT_STATUS_LABELS[next]}`
    );
  };

  const archive = (tenant: PlatformTenant) => {
    if (!window.confirm(`أرشفة العميل "${tenant.name}" وإلغاء كل تراخيصه؟`)) return;
    run(
      () => (centralActive ? centralPlatformClient.archiveTenant(tenant.id) : platformAdminService.archiveTenant(tenant.id)),
      'تمت أرشفة العميل'
    );
  };

  const createAccount = () => {
    if (!detailId) return;
    setWorking(true);
    const request = centralActive
      ? centralPlatformClient.createTenantAccount(detailId, {
          username: accountForm.username,
          email: accountForm.email,
          fullName: accountForm.fullName,
          password: accountForm.password || undefined,
        })
      : Promise.resolve(platformAdminService.createTenantAccount(detailId, {
          username: accountForm.username,
          email: accountForm.email,
          fullName: accountForm.fullName,
          password: accountForm.password || undefined,
        }));
    request
      .then((created: any) => {
        const next = centralActive
          ? centralPlatformClient.getTenantProfile(detailId)
          : Promise.resolve(platformAdminService.getTenantProfile(detailId));
        return next.then((profileNext: PlatformTenantProfile) => {
          setProfile(profileNext);
          setAccountOpen(false);
          setActivation(buildActivation(profileNext, created.temporaryPassword ?? null));
          setActivationOpen(true);
          toast.success('تم إنشاء حساب العميل وتوليد بيانات التفعيل');
          load();
        });
      })
      .catch((err) => toast.error('تعذر إنشاء الحساب', err instanceof Error ? err.message : undefined))
      .finally(() => setWorking(false));
  };

  const resetPassword = () => {
    if (!canManageTenants) { toast.error('لا تملك صلاحية إدارة العملاء'); return; }
    if (!detailId || !profile) return;
    if (!window.confirm('إعادة تعيين كلمة مرور حساب العميل؟ سيتم إنشاء كلمة مرور مؤقتة جديدة.')) return;
    setWorking(true);
    const request = centralActive
      ? centralPlatformClient.resetTenantAccountPassword(detailId)
      : Promise.resolve(platformAdminService.resetTenantAccountPassword(detailId));
    request
      .then((reset: any) => {
        const next = centralActive
          ? centralPlatformClient.getTenantProfile(detailId)
          : Promise.resolve(platformAdminService.getTenantProfile(detailId));
        return next.then((profileNext: PlatformTenantProfile) => {
          setProfile(profileNext);
          setActivation(buildActivation(profileNext, reset.temporaryPassword ?? null));
          setActivationOpen(true);
          toast.success('تم إعادة تعيين كلمة المرور');
        });
      })
      .catch((err) => toast.error('تعذر إعادة تعيين كلمة المرور', err instanceof Error ? err.message : undefined))
      .finally(() => setWorking(false));
  };

  const toggleAccount = (active: boolean) => {
    if (!detailId) return;
    run(
      () => (centralActive ? centralPlatformClient.setTenantAccountActive(detailId, active) : platformAdminService.setTenantAccountActive(detailId, active)),
      active ? 'تم تفعيل حساب العميل' : 'تم تعليق حساب العميل'
    );
  };

  const renewSubscription = () => {
    if (!detailId) return;
    run(
      () => (centralActive ? centralPlatformClient.renewSubscription(detailId, renewMonths) : platformAdminService.renewTenantSubscription(detailId, renewMonths)),
      `تم تجديد الاشتراك لمدة ${renewMonths} شهر`
    );
  };

  const changePlan = () => {
    if (!detailId || !planForm.planId) return;
    run(
      () => (centralActive
        ? centralPlatformClient.changeSubscriptionPlan(detailId, planForm.planId, { months: planForm.months, seats: planForm.seats })
        : platformAdminService.changeTenantPlan(detailId, planForm.planId, {
            months: planForm.months,
            seats: planForm.seats,
          })),
      'تم نقل العميل إلى الباقة الجديدة وإصدار ترخيص جديد'
    );
  };

  const cancelSubscription = () => {
    if (!detailId || !profile) return;
    if (!window.confirm(`إلغاء اشتراك العميل "${profile.tenant.name}"؟ سيتم إلغاء الاشتراك وإبطال التراخيص وحساب الدخول.`)) return;
    run(
      () => (centralActive
        ? centralPlatformClient.cancelSubscription(detailId, 'إلغاء يدوي من لوحة المنصة')
        : platformAdminService.cancelTenantSubscription(detailId, 'إلغاء يدوي من لوحة المنصة')),
      'تم إلغاء اشتراك العميل'
    );
  };

  const addOverride = () => {
    if (!detailId || !overrideForm.code.trim()) {
      toast.error('أدخل رمز الميزة أو الحد');
      return;
    }
    run(
      () => (centralActive
        ? centralPlatformClient.addTenantOverride(detailId, overrideForm)
        : platformAdminService.addTenantOverride(detailId, overrideForm)),
      'تم إضافة ميزة/حد خاص للعميل'
    );
    setOverrideForm({ kind: 'MODULE', code: '', value: '', isEnabled: true });
  };

  const removeOverride = (id: string) => {
    if (!window.confirm('حذف هذا التجاوز الخاص؟')) return;
    run(
      () => (centralActive && detailId
        ? centralPlatformClient.removeTenantOverride(detailId, id)
        : platformAdminService.removeTenantOverride(id)),
      'تم حذف التجاوز الخاص'
    );
  };

  const openUserCreate = () => {
    setEditingUser(null);
    setUserForm({ fullName: '', username: '', email: '', phone: '', role: 'USER', status: 'ACTIVE', notes: '' });
    setUserOpen(true);
  };

  const openUserEdit = (user: any) => {
    setEditingUser(user);
    setUserForm({
      fullName: user.fullName,
      username: user.username ?? '',
      email: user.email ?? '',
      phone: user.phone ?? '',
      role: user.role,
      status: user.status,
      notes: user.notes ?? '',
    });
    setUserOpen(true);
  };

  const saveUser = () => {
    if (!canManageTenants) { toast.error('لا تملك صلاحية إدارة العملاء'); return; }
    if (!detailId) return;
    setWorking(true);
    const request = editingUser
      ? (centralActive
          ? centralPlatformClient.updateTenantUser(detailId, editingUser.id, { ...userForm, status: userForm.status })
          : Promise.resolve(platformAdminService.updateTenantUser(editingUser.id, { ...userForm, status: userForm.status as any })))
      : (centralActive
          ? centralPlatformClient.createTenantUser(detailId, {
              ...userForm,
              status: userForm.status,
              provisionIdentity: true,
              provisioningMode: 'INVITE',
            })
          : Promise.resolve(platformAdminService.createTenantUser(detailId, {
              ...userForm,
              status: userForm.status as any,
              provisionIdentity: true,
              provisioningMode: 'INVITE',
            })));
    request
      .then((result: any) => {
        if (!editingUser) {
          const details = [result.message || 'تم إنشاء المستخدم.'];
          const inviteCode = result.inviteCode ?? result.user?.inviteCode;
          const tempPassword = result.temporaryPassword;
          if (inviteCode) details.push(`كود الدعوة: ${inviteCode}`);
          if (tempPassword) details.push(`كلمة المرور المؤقتة: ${tempPassword}`);
          const identityId = result.user?.identityUserId;
          if (identityId) details.push(`معرّف الهوية: ${identityId}`);
          details.push(`الدور/النطاق: ${result.user?.role ?? userForm.role}${result.user?.scope ? ` / ${result.user.scope}` : ''}`);
          toast.success('تم إنشاء/دعوة حساب هوية فعلي للعميل وربطه بالدور والنطاق', details.join('\n'));
        } else {
          toast.success('تم تحديث بيانات المستخدم.');
        }
        setUserOpen(false);
        refreshDetail();
      })
      .catch((err) => toast.error('تعذر حفظ المستخدم', err instanceof Error ? err.message : undefined))
      .finally(() => setWorking(false));
  };

  const toggleUser = (user: any, active: boolean) => {
    run(
      () => (centralActive && detailId
        ? centralPlatformClient.setTenantUserActive(detailId, user.id, active)
        : platformAdminService.setTenantUserActive(user.id, active)),
      active ? 'تم تفعيل المستخدم' : 'تم تعليق المستخدم'
    );
  };

  const deleteUser = (user: any) => {
    if (!canManageTenants) { toast.error('لا تملك صلاحية إدارة العملاء'); return; }
    if (!window.confirm(`حذف المستخدم "${user.fullName}"؟`)) return;
    run(
      () => (centralActive && detailId
        ? centralPlatformClient.deleteTenantUser(detailId, user.id)
        : platformAdminService.deleteTenantUser(user.id)),
      'تم حذف المستخدم'
    );
  };

  const resetDevices = () => {
    if (!canManageTenants) { toast.error('لا تملك صلاحية إدارة العملاء'); return; }
    if (!detailId) return;
    if (!window.confirm('إعادة تعيين الأجهزة المرتبطة بهذا العميل؟ سيتم تحرير كل الأجهزة المربوطة بالتراخيص.')) return;
    setWorking(true);
    const request = centralActive
      ? centralPlatformClient.getTenantRemoteControl(detailId).then((data: any) => {
          const devices = Array.isArray(data?.devices) ? data.devices : [];
          return devices.reduce((chain: Promise<number>, device: any) =>
            chain.then((count) => centralPlatformClient.releaseDevice(device.id).then(() => count + 1)),
          Promise.resolve(0));
        })
      : Promise.resolve(platformAdminService.resetTenantDevices(detailId));
    request
      .then((count: number) => {
        toast.success('تم إعادة تعيين الأجهزة', `تم تحرير ${formatNumber(count)} جهاز`);
        refreshDetail();
      })
      .catch((err) => toast.error('تعذر إعادة تعيين الأجهزة', err instanceof Error ? err.message : undefined))
      .finally(() => setWorking(false));
  };

  // Remote Control functions
  const loadRemoteDevices = React.useCallback(() => {
    if (!detailId) { setRemoteDevices([]); return; }
    if (centralActive) {
      centralPlatformClient.getTenantRemoteControl(detailId)
        .then((data: any) => setRemoteDevices(Array.isArray(data?.devices) ? data.devices : []))
        .catch(() => setRemoteDevices([]));
      return;
    }
    try {
      const devices = platformAdminService.listDevices().filter((d) => d.tenantId === detailId);
      setRemoteDevices(devices);
    } catch (err) {
      toast.error('تعذر تحميل الأجهزة', err instanceof Error ? err.message : undefined);
    }
  }, [detailId, toast, centralActive]);

  const loadRemoteHistory = React.useCallback(() => {
    if (!detailId) { setRemoteHistory([]); return; }
    if (centralActive) {
      centralPlatformClient.getTenantRemoteControl(detailId)
        .then((data: any) => {
          const history = Array.isArray(data?.configPushHistory) ? data.configPushHistory : [];
          setRemoteHistory(history.map((entry: any) => ({
            id: entry.id,
            type: 'CONFIG_PUSH',
            key: entry.key ?? entry.configKey ?? '—',
            value: entry.value ?? entry.configValue ?? '—',
            targetCount: Array.isArray(entry.targetDeviceIds) ? entry.targetDeviceIds.length : 0,
            status: entry.status === 'FAILED' ? 'FAILED' : 'SUCCESS',
            error: entry.error ?? null,
            result: entry.status === 'APPLIED' ? 'تم التطبيق' : null,
            createdAt: entry.createdAt ?? entry.appliedAt,
          })));
        })
        .catch(() => setRemoteHistory([]));
      return;
    }
    try {
      // Get audit logs related to config pushes for this tenant
      const logs = platformAdminService.getTenantProfile(detailId).activityLog
        .filter((entry) => entry.entityType === 'CONFIG_PUSH' || entry.action.includes('إعداد') || entry.action.includes('تكوين'))
        .map((entry) => ({
          id: entry.id,
          type: 'CONFIG_PUSH',
          key: entry.details ? JSON.parse(entry.details).key : '—',
          value: entry.details ? JSON.parse(entry.details).value : '—',
          targetCount: entry.details ? JSON.parse(entry.details).targetCount : 0,
          status: entry.action.includes('نجاح') ? 'SUCCESS' : entry.action.includes('فشل') ? 'FAILED' : 'PENDING',
          error: entry.details ? JSON.parse(entry.details).error : null,
          result: entry.details ? JSON.parse(entry.details).result : null,
          createdAt: entry.createdAt,
        }));
      setRemoteHistory(logs);
    } catch (err) {
      toast.error('تعذر تحميل السجل', err instanceof Error ? err.message : undefined);
    }
  }, [detailId, toast, centralActive]);

  const sendConfig = () => {
    if (centralActive) {
      if (!detailId || !configForm.key.trim()) return;
      setConfigSending(true);
      centralPlatformClient.pushTenantConfig(detailId, {
        key: configForm.key,
        value: configForm.value,
        scope: configForm.scope,
        targetDeviceIds: configForm.scope === 'DEVICE' ? selectedDeviceIds : undefined,
      })
        .then(() => {
          toast.success('تم إرسال الإعداد', `المفتاح: ${configForm.key}`);
          setConfigForm({ ...configForm, key: '', value: '' });
          setSelectedDeviceIds([]);
          loadRemoteControlData();
        })
        .catch((err) => toast.error('فشل إرسال الإعداد', err instanceof Error ? err.message : undefined))
        .finally(() => setConfigSending(false));
      return;
    }
    if (!detailId || !configForm.key.trim()) return;
    if (configForm.scope === 'DEVICE' && selectedDeviceIds.length === 0) {
      toast.error('اختر جهازاً واحداً على الأقل');
      return;
    }
    setConfigSending(true);
    try {
      let targetCount = 0;
      const targetDevices = configForm.scope === 'DEVICE'
        ? remoteDevices.filter((d) => selectedDeviceIds.includes(d.id))
        : remoteDevices.filter((d) => d.status === 'ACTIVE');

      targetCount = targetDevices.length;

      if (targetCount === 0) {
        toast.error('لا توجد أجهزة نشطة للإرسال');
        setConfigSending(false);
        return;
      }

      // Create override entries for each target device/tenant
      const overrideInput = {
        kind: 'FEATURE' as const,
        code: configForm.key,
        value: configForm.value,
        isEnabled: true,
        notes: `Remote config push via platform admin - scope: ${configForm.scope}, targets: ${targetCount}`,
      };

      // Add override at tenant level (affects all devices)
      if (configForm.scope === 'TENANT') {
        platformAdminService.addTenantOverride(detailId, overrideInput);
      }

      // Add to local history immediately for UI feedback
      const now = new Date().toISOString();
      const newEntry = {
        id: `rc_${Date.now()}`,
        type: 'CONFIG_PUSH',
        key: configForm.key,
        value: configForm.value,
        targetCount,
        status: 'SUCCESS' as const,
        result: `تم الإرسال إلى ${targetCount} جهاز`,
        error: null,
        createdAt: now,
      };
      setRemoteHistory((prev) => [newEntry, ...prev]);

      // Also update the applied config list
      const appliedConfig = {
        id: `cfg_${Date.now()}`,
        key: configForm.key,
        value: configForm.value,
        scope: configForm.scope,
        status: 'APPLIED',
        appliedAt: now,
        createdAt: now,
      };
      setRemoteConfig((prev) => [appliedConfig, ...prev]);

      toast.success('تم إرسال الإعداد', `إلى ${targetCount} جهاز`);
      setConfigForm({ ...configForm, key: '', value: '' });
      setSelectedDeviceIds([]);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'خطأ غير معروف';
      const newEntry = {
        id: `rc_${Date.now()}`,
        type: 'CONFIG_PUSH',
        key: configForm.key,
        value: configForm.value,
        targetCount: 0,
        status: 'FAILED' as const,
        result: null,
        error: errorMsg,
        createdAt: new Date().toISOString(),
      };
      setRemoteHistory((prev) => [newEntry, ...prev]);
      toast.error('فشل إرسال الإعداد', errorMsg);
    } finally {
      setConfigSending(false);
    }
  };

  const toggleDeviceStatus = (device: any) => {
    if (centralActive) {
      const newStatus = device.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
      run(
        () => (newStatus === 'SUSPENDED' ? centralPlatformClient.suspendDevice(device.id) : centralPlatformClient.releaseDevice(device.id)),
        `تم ${newStatus === 'ACTIVE' ? 'تفعيل' : 'إيقاف'} الجهاز`
      );
      return;
    }
    if (!detailId) return;
    const newStatus = device.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    run(() => {
      platformAdminService.setDeviceStatus(device.id, newStatus);
      loadRemoteDevices();
    }, `تم ${newStatus === 'ACTIVE' ? 'تفعيل' : 'إيقاف'} الجهاز`);
  };

  // Load remote data when detailId changes
  React.useEffect(() => {
    if (detailId) {
      loadRemoteDevices();
      loadRemoteHistory();
      // Load existing overrides as applied config
      const loadOverrides = centralActive
        ? centralPlatformClient.listTenantOverrides(detailId)
        : Promise.resolve(platformAdminService.listTenantOverrides(detailId));
      loadOverrides
        .then((overrideList: PlatformTenantOverride[]) => {
          const configs = overrideList.map((o: any) => ({
            id: o.id,
            key: o.code,
            value: o.value || (o.isEnabled ? 'true' : 'false'),
            scope: 'TENANT',
            status: o.isEnabled ? 'APPLIED' : 'DISABLED',
            appliedAt: o.updatedAt,
            createdAt: o.createdAt,
          }));
          setRemoteConfig(configs);
        })
        .catch(() => {
          // Remote config fetch is best-effort; ignore failures.
        });
    }
  }, [detailId, loadRemoteDevices, loadRemoteHistory, centralActive]);

  const sendActivation = () => {
    if (centralActive) {
      if (!detailId || !profile) return;
      if (channels.length === 0) {
        toast.error('اختر وسيلة إرسال واحدة على الأقل');
        return;
      }
      setWorking(true);
      centralPlatformClient.getTenantProfile(detailId)
        .then((next: any) => {
          setProfile(next as PlatformTenantProfile);
          setActivation(buildActivation(next as PlatformTenantProfile, null));
          setActivationOpen(true);
          toast.success('تم تجهيز بيانات التفعيل', channels.join(' · '));
        })
        .catch((err) => toast.error('تعذر إرسال بيانات التفعيل', err instanceof Error ? err.message : undefined))
        .finally(() => setWorking(false));
      return;
    }
    if (!canManageTenants) { toast.error('لا تملك صلاحية إدارة العملاء'); return; }
    if (!detailId) return;
    if (channels.length === 0) {
      toast.error('اختر وسيلة إرسال واحدة على الأقل');
      return;
    }
    setWorking(true);
    try {
      const details = platformAdminService.sendTenantActivation(detailId);
      setActivation(details);
      setActivationOpen(true);
      setProfile(platformAdminService.getTenantProfile(detailId));
      toast.success('تم تجهيز بيانات التفعيل', channels.join(' · '));
    } catch (err) {
      toast.error('تعذر إرسال بيانات التفعيل', err instanceof Error ? err.message : undefined);
    } finally {
      setWorking(false);
    }
  };

  // ─── Bulk Operations ────────────────────────────────────────────────────────

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(tenants.map(t => t.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const openBulkAction = (type: 'status' | 'plan' | 'activation' | 'export' | 'import') => {
    if (selectedIds.size === 0 && type !== 'import') {
      toast.error('اختر عميلاً واحداً على الأقل');
      return;
    }
    setBulkActionType(type);
    setBulkActionOpen(true);
  };

  const executeBulkAction = async () => {
    if (selectedIds.size === 0 && bulkActionType !== 'import') {
      toast.error('لا يوجد عملاء محددون');
      return;
    }
    setBulkWorking(true);
    try {
      const ids = Array.from(selectedIds);
      if (centralActive) {
        if (bulkActionType === 'status') {
          let success = 0;
          const failed: Array<{ tenantId: string; error: string }> = [];
          for (const id of ids) {
            try { await centralPlatformClient.setTenantStatus(id, bulkStatus); success += 1; }
            catch (err) { failed.push({ tenantId: id, error: err instanceof Error ? err.message : 'فشل' }); }
          }
          toast.success('اكتمل تغيير الحالة', `نجح: ${success}، فشل: ${failed.length}`);
          failed.forEach((f) => toast.error(`فشل ${f.tenantId}`, f.error));
        } else if (bulkActionType === 'plan') {
          if (!bulkPlanId) { toast.error('اختر باقة'); setBulkWorking(false); return; }
          let success = 0;
          const failed: Array<{ tenantId: string; error: string }> = [];
          for (const id of ids) {
            try {
              await centralPlatformClient.changeSubscriptionPlan(id, bulkPlanId, { months: bulkMonths });
              success += 1;
            } catch (err) { failed.push({ tenantId: id, error: err instanceof Error ? err.message : 'فشل' }); }
          }
          toast.success('اكتمل تغيير الباقة', `نجح: ${success}، فشل: ${failed.length}`);
          failed.forEach((f) => toast.error(`فشل ${f.tenantId}`, f.error));
        } else if (bulkActionType === 'activation') {
          const blocks: string[] = [];
          const failed: Array<{ tenantId: string; error: string }> = [];
          for (const id of ids) {
            try {
              const profileData: any = await centralPlatformClient.getTenantProfile(id);
              blocks.push(activationText(buildActivation(profileData as PlatformTenantProfile, null)));
            } catch (err) { failed.push({ tenantId: id, error: err instanceof Error ? err.message : 'فشل' }); }
          }
          if (blocks.length) {
            const blob = new Blob([blocks.join('\n\n---\n\n')], { type: 'text/plain;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `platform-activations-${new Date().toISOString().slice(0, 10)}.txt`;
            link.click();
            URL.revokeObjectURL(link.href);
          }
          toast.success('تم تجهيز بيانات التفعيل', `نجح: ${blocks.length}، فشل: ${failed.length}`);
          failed.forEach((f) => toast.error(`فشل ${f.tenantId}`, f.error));
        } else if (bulkActionType === 'export') {
          const selected = tenants.filter((t) => selectedIds.has(t.id));
          downloadCsv(`platform-customers-bulk-${new Date().toISOString().slice(0, 10)}.csv`, [
            ['رقم العميل', 'Tenant ID', 'الشركة', 'النشاط', 'المسؤول', 'الهاتف', 'البريد', 'الدولة', 'المدينة', 'العنوان', 'تاريخ التسجيل', 'الباقة', 'الحالة', 'بداية الاشتراك', 'نهاية الاشتراك', 'الأجهزة المسموحة', 'الأجهزة المستخدمة', 'الفروع'],
            ...selected.map((tenant) => [
              tenant.code, tenant.id, tenant.name, tenant.businessType ?? '', tenant.contactName ?? '',
              tenant.phone ?? '', tenant.email ?? '', tenant.country ?? '', tenant.city ?? '', tenant.address ?? '',
              tenant.createdAt, tenant.planName ?? '', PLATFORM_TENANT_STATUS_LABELS[tenant.status],
              tenant.subscriptionStartedAt ?? '', tenant.subscriptionExpiresAt ?? '',
              tenant.devicesLimit, tenant.devicesUsed ?? 0, tenant.branchesLimit,
            ]),
          ]);
          toast.success('تم تصدير البيانات', `${selected.length} عميل`);
        } else {
          // 'import' is handled by the CSV import modal.
          toast.info('استخدم نافذة استيراد CSV لإضافة عملاء جدد');
          setBulkWorking(false);
          return;
        }
        setBulkActionOpen(false);
        setSelectedIds(new Set());
        load();
        if (detailId) loadProfile(detailId);
        return;
      }
      switch (bulkActionType) {
        case 'status': {
          const result = platformAdminService.bulkChangeTenantStatus({ tenantIds: ids, status: bulkStatus });
          toast.success('اكتمل تغيير الحالة', `نجح: ${result.success}، فشل: ${result.failed.length}`);
          if (result.failed.length > 0) {
            result.failed.forEach(f => toast.error(`فشل ${f.tenantId}`, f.error));
          }
          break;
        }
        case 'plan': {
          if (!bulkPlanId) { toast.error('اختر باقة'); return; }
          const result = await platformAdminService.bulkChangeTenantPlan({ tenantIds: ids, planId: bulkPlanId, months: bulkMonths });
          toast.success('اكتمل تغيير الباقة', `نجح: ${result.success}، فشل: ${result.failed.length}`);
          if (result.failed.length > 0) {
            result.failed.forEach(f => toast.error(`فشل ${f.tenantId}`, f.error));
          }
          break;
        }
        case 'activation': {
          const result = platformAdminService.bulkSendActivation({ tenantIds: ids });
          toast.success('تم إرسال بيانات التفعيل', `نجح: ${result.success}، فشل: ${result.failed.length}`);
          if (result.failed.length > 0) {
            result.failed.forEach(f => toast.error(`فشل ${f.tenantId}`, f.error));
          }
          break;
        }
        case 'export': {
          const csv = platformAdminService.bulkExportTenants({ tenantIds: ids });
          const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = `platform-customers-bulk-${new Date().toISOString().slice(0,10)}.csv`;
          link.click();
          URL.revokeObjectURL(link.href);
          toast.success('تم تصدير البيانات', `${ids.length} عميل`);
          break;
        }
        case 'import': {
          // Handled by CSV import modal
          break;
        }
      }
      setBulkActionOpen(false);
      setSelectedIds(new Set());
      load();
      if (detailId) loadProfile(detailId);
    } catch (err) {
      toast.error('فشل العملية المجمعة', err instanceof Error ? err.message : undefined);
    } finally {
      setBulkWorking(false);
    }
  };

  // ─── CSV Import ────────────────────────────────────────────────────────────

  const handleCsvFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setCsvFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const lines = content.trim().split('\n');
      const preview = lines.slice(0, 5).map(line => {
        // Simple CSV parse
        const values: string[] = [];
        let current = '';
        let inQuotes = false;
        for (let j = 0; j < line.length; j++) {
          const char = line[j];
          if (char === '"') {
            if (inQuotes && line[j + 1] === '"') { current += '"'; j++; }
            else inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            values.push(current.trim()); current = '';
          } else current += char;
        }
        values.push(current.trim());
        return values;
      });
      setCsvPreview(preview);
    };
    reader.readAsText(file, 'utf-8');
  };

  const executeCsvImport = async () => {
    if (!csvFile) { toast.error('اختر ملف CSV'); return; }
    setCsvImporting(true);
    try {
      const content = await csvFile.text();
      if (centralActive) {
        const headerMap: Record<string, string> = {
          name: 'name', 'الاسم': 'name', tenantname: 'name',
          code: 'code', 'الكود': 'code', tenantcode: 'code',
          contactname: 'contactName', 'جهة الاتصال': 'contactName', contact: 'contactName',
          email: 'email', 'البريد': 'email', phone: 'phone', 'الهاتف': 'phone', mobile: 'phone',
          country: 'country', 'الدولة': 'country', city: 'city', 'المدينة': 'city',
          address: 'address', 'العنوان': 'address', businesstype: 'businessType', 'نوع النشاط': 'businessType',
          status: 'status', 'الحالة': 'status', planid: 'planId', plan: 'planId', 'الباقة': 'planId',
          seatslimit: 'seatsLimit', 'seats': 'seatsLimit', brancheslimit: 'branchesLimit', branches: 'branchesLimit',
          deviceslimit: 'devicesLimit', devices: 'devicesLimit', notes: 'notes', 'ملاحظات': 'notes',
        };
        const parseLine = (line: string): string[] => {
          const values: string[] = [];
          let current = '';
          let inQuotes = false;
          for (let j = 0; j < line.length; j++) {
            const char = line[j];
            if (char === '"') {
              if (inQuotes && line[j + 1] === '"') { current += '"'; j++; } else inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) { values.push(current.trim()); current = ''; }
            else current += char;
          }
          values.push(current.trim());
          return values;
        };
        const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
        const resolvedHeaders = lines.length > 0 ? parseLine(lines[0]).map((h) => headerMap[h.trim().toLowerCase()] ?? null) : [];
        let created = 0;
        let updated = 0;
        const errors: Array<{ row: number; error: string }> = [];
        for (let i = 1; i < lines.length; i++) {
          const rowNumber = i + 1;
          try {
            const values = parseLine(lines[i]);
            const input: Record<string, any> = { name: '' };
            values.forEach((value, index) => {
              const field = resolvedHeaders[index];
              if (!field || value === '') return;
              if (field === 'planId') {
                const plan = plans.find((p: any) => p.code === value || p.id === value || p.name === value);
                input.planId = plan?.id ?? value;
              } else if (field === 'status') {
                input.status = value.toUpperCase();
              } else if (field === 'seatsLimit' || field === 'branchesLimit' || field === 'devicesLimit') {
                const num = Number(value);
                if (!Number.isNaN(num)) input[field] = num;
              } else {
                input[field] = value;
              }
            });
            if (!input.name) throw new Error('اسم العميل مطلوب');
            const key = input.code || input.email || input.name;
            const existing = (await centralPlatformClient.listTenants(key)).find((t: any) =>
              (input.email && t.email === input.email) || (input.code && t.code === input.code) || t.name === input.name);
            if (existing) {
              await centralPlatformClient.updateTenant(existing.id, input);
              updated += 1;
            } else {
              await centralPlatformClient.createTenant(input as any);
              created += 1;
            }
          } catch (err) {
            errors.push({ row: rowNumber, error: err instanceof Error ? err.message : 'فشل' });
          }
        }
        toast.success('اكتمل الاستيراد', `مُنشأ: ${created}، مُحدّث: ${updated}، أخطاء: ${errors.length}`);
        errors.forEach((e) => toast.error(`السطر ${e.row}`, e.error));
      } else {
        const result = platformAdminService.importTenantsCsv(content, { skipHeader: true });
        toast.success('اكتمل الاستيراد', `مُنشأ: ${result.created}، مُحدّث: ${result.updated}، أخطاء: ${result.errors.length}`);
        if (result.errors.length > 0) {
          result.errors.forEach(e => toast.error(`السطر ${e.row}`, e.error));
        }
      }
      setCsvImportOpen(false);
      setCsvFile(null);
      setCsvPreview([]);
      load();
    } catch (err) {
      toast.error('فشل الاستيراد', err instanceof Error ? err.message : undefined);
    } finally {
      setCsvImporting(false);
    }
  };

  // ─── Filter Presets ────────────────────────────────────────────────────────

  const saveFilterPreset = (name: string) => {
    const preset = { search, status, planId, dateRange, outstandingRange, deviceUtilizationFilter, healthScoreFilter };
    const next = { ...filterPresets, [name]: preset };
    setFilterPresets(next);
    localStorage.setItem('tenantFilterPresets', JSON.stringify(next));
    toast.success('تم حفظ الفلتر', name);
  };

  const loadFilterPreset = (name: string) => {
    const preset = filterPresets[name];
    if (!preset) return;
    setSearch(preset.search);
    setStatus(preset.status);
    setPlanId(preset.planId);
    setDateRange(preset.dateRange);
    setOutstandingRange(preset.outstandingRange);
    setDeviceUtilizationFilter(preset.deviceUtilizationFilter);
    setHealthScoreFilter(preset.healthScoreFilter);
    toast.success('تم تحميل الفلتر', name);
  };

  const deleteFilterPreset = (name: string) => {
    const next = { ...filterPresets };
    delete next[name];
    setFilterPresets(next);
    localStorage.setItem('tenantFilterPresets', JSON.stringify(next));
    toast.success('تم حذف الفلتر', name);
  };

  // ─── Remote Control - New API ──────────────────────────────────────────────

  const loadRemoteControlData = React.useCallback(() => {
    if (!detailId) { setRemoteControlData(null); return; }
    if (centralActive) {
      centralPlatformClient.getTenantRemoteControl(detailId)
        .then((data: any) => {
          setRemoteControlData(data);
          setRemoteDevices(Array.isArray(data?.devices) ? data.devices : []);
          setRemoteHistory(Array.isArray(data?.configPushHistory) ? data.configPushHistory : []);
          setRemoteConfig(data?.appliedConfig ? [{
            id: data.appliedConfig.id,
            key: data.appliedConfig.key ?? 'applied_config',
            value: data.appliedConfig.value ?? '',
            scope: data.appliedConfig.scope ?? 'TENANT',
            status: 'APPLIED',
            appliedAt: data.appliedConfig.appliedAt,
            createdAt: data.appliedConfig.createdAt,
          }] : []);
        })
        .catch((err) => toast.error('تعذر تحميل بيانات التحكم عن بعد', err instanceof Error ? err.message : undefined));
      return;
    }
    try {
      const data = platformAdminService.getTenantRemoteControl(detailId);
      setRemoteControlData(data);
      setRemoteDevices(data.devices);
      setRemoteHistory(data.configPushHistory);
      if (data.appliedConfig) {
        setRemoteConfig([{
          id: data.appliedConfig.id,
          key: 'applied_config',
          value: JSON.stringify(data.appliedConfig.configPayload),
          scope: 'TENANT',
          status: 'APPLIED',
          appliedAt: data.appliedConfig.updatedAt,
          createdAt: data.appliedConfig.createdAt,
        }]);
      }
    } catch (err) {
      toast.error('تعذر تحميل بيانات التحكم عن بعد', err instanceof Error ? err.message : undefined);
    }
  }, [detailId, toast, centralActive]);

  const pushConfig = () => {
    if (!detailId || !configForm.key.trim()) return;
    if (configForm.scope === 'DEVICE' && selectedDeviceIds.length === 0) {
      toast.error('اختر جهازاً واحداً على الأقل');
      return;
    }
    setConfigSending(true);
    if (centralActive) {
      centralPlatformClient.pushTenantConfig(detailId, {
        key: configForm.key,
        value: configForm.value,
        scope: configForm.scope,
        targetDeviceIds: configForm.scope === 'DEVICE' ? selectedDeviceIds : undefined,
      })
        .then((result: any) => {
          toast.success('تم دفع التكوين', `معرف العملية: ${result?.id ?? ''}`);
          setConfigForm({ ...configForm, key: '', value: '' });
          setSelectedDeviceIds([]);
          loadRemoteControlData();
        })
        .catch((err) => toast.error('فشل دفع التكوين', err instanceof Error ? err.message : undefined))
        .finally(() => setConfigSending(false));
      return;
    }
    try {
      const result = platformAdminService.pushTenantConfig(detailId, {
        [configForm.key]: configForm.value,
        targetDeviceIds: configForm.scope === 'DEVICE' ? selectedDeviceIds : undefined,
      });
      toast.success('تم دفع التكوين', `معرف العملية: ${result.id}`);
      setConfigForm({ ...configForm, key: '', value: '' });
      setSelectedDeviceIds([]);
      loadRemoteControlData();
    } catch (err) {
      toast.error('فشل دفع التكوين', err instanceof Error ? err.message : undefined);
    } finally {
      setConfigSending(false);
    }
  };

  const forceSync = () => {
    if (!detailId) return;
    setForceSyncWorking(true);
    if (centralActive) {
      centralPlatformClient.forceTenantSync(detailId)
        .then(() => {
          toast.success('تم طلب مزامنة إجبارية', 'ستبدأ المزامنة خلال ثوانٍ');
          loadRemoteControlData();
        })
        .catch((err) => toast.error('فشل طلب المزامنة', err instanceof Error ? err.message : undefined))
        .finally(() => setForceSyncWorking(false));
      return;
    }
    try {
      platformAdminService.forceTenantSync(detailId);
      toast.success('تم طلب مزامنة إجبارية', 'ستبدأ المزامنة خلال ثوانٍ');
      loadRemoteControlData();
    } catch (err) {
      toast.error('فشل طلب المزامنة', err instanceof Error ? err.message : undefined);
    } finally {
      setForceSyncWorking(false);
    }
  };

  // Load remote data when detailId changes
  React.useEffect(() => {
    if (detailId && tab === 'remote') {
      loadRemoteControlData();
    }
  }, [detailId, tab, loadRemoteControlData]);

  const exportRows = () => {
    downloadCsv('platform-customers.csv', [
      ['رقم العميل', 'Tenant ID', 'الشركة', 'النشاط', 'المسؤول', 'الهاتف', 'البريد', 'الدولة', 'المدينة', 'العنوان', 'تاريخ التسجيل', 'الباقة', 'الحالة', 'بداية الاشتراك', 'نهاية الاشتراك', 'الأجهزة المسموحة', 'الأجهزة المستخدمة', 'الفروع'],
      ...tenants.map((tenant) => [
        tenant.code,
        tenant.id,
        tenant.name,
        tenant.businessType ?? '',
        tenant.contactName ?? '',
        tenant.phone ?? '',
        tenant.email ?? '',
        tenant.country ?? '',
        tenant.city ?? '',
        tenant.address ?? '',
        tenant.createdAt,
        tenant.planName ?? '',
        PLATFORM_TENANT_STATUS_LABELS[tenant.status],
        tenant.subscriptionStartedAt ?? '',
        tenant.subscriptionExpiresAt ?? '',
        tenant.devicesLimit,
        tenant.devicesUsed ?? 0,
        tenant.branchesLimit,
      ]),
    ]);
  };

  const tenant = profile?.tenant ?? null;
  const account = profile?.account ?? null;

  const healthChecks = profile
    ? [
        { label: 'العميل نشط', ok: profile.tenant.status === 'ACTIVE' || profile.tenant.status === 'TRIAL' },
        { label: 'يوجد ترخيص ساري', ok: profile.licenses.some((item) => item.status === 'ACTIVE' || item.status === 'ISSUED') },
        { label: 'لا توجد فواتير متأخرة', ok: (profile.tenant.outstanding ?? 0) <= 0 },
        { label: 'الاشتراك لم ينته', ok: !profile.tenant.subscriptionExpiresAt || new Date(profile.tenant.subscriptionExpiresAt) > new Date() },
        { label: 'الحساب مفعّل', ok: Boolean(profile.account?.isActive) },
        { label: 'الأجهزة ضمن الحد', ok: (profile.usage.devicesUsed <= profile.usage.devicesLimit) },
      ]
    : [];
  const healthScore = healthChecks.length
    ? Math.round((healthChecks.filter((item) => item.ok).length / healthChecks.length) * 100)
    : 0;
  const subscription = profile?.subscriptions.find((item) => item.status === 'ACTIVE' || item.status === 'TRIAL') ?? profile?.subscriptions[0] ?? null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="العملاء — الملف المركزي"
        description="ملف مركزي لكل عميل: البيانات، الحساب، الباقة، الأجهزة، الفروع، المدفوعات وسجل التغييرات."
        icon={<Building2 className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap gap-2">
            {canManageTenants && (<Button variant="ghost" size="sm" leadingIcon={<Download className="h-3.5 w-3.5" />} onClick={exportRows}>
              تصدير CSV
            </Button>)}
            {canManageTenants && (<Button variant="ghost" size="sm" leadingIcon={<Upload className="h-3.5 w-3.5" />} onClick={() => setCsvImportOpen(true)}>
              استيراد CSV
            </Button>)}
            {canManageTenants && (
              <Button variant="primary" size="sm" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={openCreate}>
                عميل جديد
              </Button>
            )}    </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="ابحث بالاسم أو رقم العميل أو الهاتف أو البريد..."
            className={`${inputClass} pr-8`}
          />
        </div>
        <select value={status} onChange={(event) => setStatus(event.target.value)} className={`${inputClass} max-w-[170px]`}>
          <option value="">كل الحالات</option>
          {STATUSES.map((value) => (
            <option key={value} value={value}>{PLATFORM_TENANT_STATUS_LABELS[value]}</option>
          ))}
        </select>
        <select value={planId} onChange={(event) => setPlanId(event.target.value)} className={`${inputClass} max-w-[200px]`}>
          <option value="">كل الباقات</option>
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>{plan.name}</option>
          ))}
        </select>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">{tenants.length} عميل</span>
      </div>

      {tenants.length > 20 && (
         <div className="flex items-center justify-center gap-2">
           <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded border px-3 py-1 text-sm disabled:opacity-50">السابق</button>
           <span className="text-sm">{page} / {Math.ceil(tenants.length / 20)}</span>
           <button disabled={page >= Math.ceil(tenants.length / 20)} onClick={() => setPage((p) => p + 1)} className="rounded border px-3 py-1 text-sm disabled:opacity-50">التالي</button>
         </div>
       )}
      {error && (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-700">{error}</div>
      )}

      {/* Bulk Action Toolbar */}
      {selectedIds.size > 0 && canManageTenants && (
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-[420px] z-50 animate-slide-up">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 shadow-xl p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-sm font-bold text-emerald-800">{selectedIds.size} عميل محدد</span>
              <button onClick={() => setSelectedIds(new Set())} className="text-emerald-600 hover:underline text-sm">إلغاء التحديد</button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" leadingIcon={<Ban className="h-3 w-3" />} onClick={() => { setBulkActionType('status'); setBulkActionOpen(true); }}>
                تغيير الحالة
              </Button>
              <Button variant="secondary" size="sm" leadingIcon={<Layers3 className="h-3 w-3" />} onClick={() => { setBulkActionType('plan'); setBulkActionOpen(true); }}>
                تغيير الباقة
              </Button>
              <Button variant="secondary" size="sm" leadingIcon={<Send className="h-3 w-3" />} onClick={() => { setBulkActionType('activation'); setBulkActionOpen(true); }}>
                إرسال تفعيل
              </Button>
              <Button variant="ghost" size="sm" leadingIcon={<Download className="h-3 w-3" />} onClick={() => { setBulkActionType('export'); executeBulkAction(); }}>
                تصدير
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Advanced Filters */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5">
          <button
            type="button"
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 hover:text-emerald-700"
          >
            <Filter className="h-4 w-4" />
            فلاتر متقدمة
            <ChevronDown className={`h-4 w-4 transition-transform ${showAdvancedFilters ? 'rotate-180' : ''}`} />
          </button>
          {Object.keys(filterPresets).length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-[10.5px] text-slate-500">قوالب محفوظة:</span>
              <select
                className={`${inputClass} max-w-[150px]`}
                onChange={(e) => loadFilterPreset(e.target.value)}
                defaultValue=""
              >
                <option value="">-- اختر قالب --</option>
                {Object.keys(filterPresets).map(name => <option key={name} value={name}>{name}</option>)}
              </select>
              <Button variant="ghost" size="sm" onClick={() => {
                const name = prompt('اسم القالب الجديد:');
                if (name) saveFilterPreset(name);
              }}>
                <Plus className="h-3.5 w-3.5" /> حفظ
              </Button>
            </div>
          )}
        </div>
        {showAdvancedFilters && (
          <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-5">
            <Field label="نطاق تاريخ الإنشاء">
              <div className="flex gap-2">
                <input type="date" className={inputClass} value={dateRange.from} onChange={(e) => setDateRange({...dateRange, from: e.target.value})} placeholder="من" />
                <input type="date" className={inputClass} value={dateRange.to} onChange={(e) => setDateRange({...dateRange, to: e.target.value})} placeholder="إلى" />
              </div>
            </Field>
            <Field label="نطاق المستحقات">
              <div className="flex gap-2">
                <input type="number" className={inputClass} value={outstandingRange.min} onChange={(e) => setOutstandingRange({...outstandingRange, min: e.target.value})} placeholder="الحد الأدنى" step="0.01" />
                <input type="number" className={inputClass} value={outstandingRange.max} onChange={(e) => setOutstandingRange({...outstandingRange, max: e.target.value})} placeholder="الحد الأقصى" step="0.01" />
              </div>
            </Field>
            <Field label="استخدام الأجهزة">
              <select className={inputClass} value={deviceUtilizationFilter} onChange={(e) => setDeviceUtilizationFilter(e.target.value)}>
                <option value="">الكل</option>
                <option value="unused">غير مستخدم (0%)</option>
                <option value="low">{'منخفض (< 50%)'}</option>
                <option value="medium">{'متوسط (50-80%)'}</option>
                <option value="high">{'عالي (> 80%)'}</option>
                <option value="full">ممتلئ (100%)</option>
              </select>
            </Field>
            <Field label="درجة الصحة">
              <select className={inputClass} value={healthScoreFilter} onChange={(e) => setHealthScoreFilter(e.target.value)}>
                <option value="">الكل</option>
                <option value="excellent">ممتاز (90-100%)</option>
                <option value="good">جيد (70-89%)</option>
                <option value="fair">مقبول (50-69%)</option>
                <option value="poor">{'ضعيف (< 50%)'}</option>
              </select>
            </Field>
            <div className="flex items-end">
              <Button variant="secondary" block onClick={() => {
                setSearch(''); setStatus(''); setPlanId('');
                setDateRange({from: '', to: ''}); setOutstandingRange({min: '', max: ''});
                setDeviceUtilizationFilter(''); setHealthScoreFilter('');
              }}>
                مسح الفلاتر
              </Button>
            </div>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="py-16 text-center text-sm font-semibold text-slate-500">جارٍ تحميل العملاء...</div>
        ) : tenants.length === 0 ? (
          <EmptyState
            icon={<Building2 className="h-5 w-5" />}
            title="لا يوجد عملاء مطابقون"
            description="أضف عميلاً جديداً أو غيّر عوامل التصفية."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-right">
              <thead className="bg-slate-50">
                <tr className="text-[10.5px] text-slate-500">
                  <th className="px-3 py-2.5 font-semibold w-10">
                    <input type="checkbox" checked={selectedIds.size === tenants.length && tenants.length > 0} onChange={(e) => handleSelectAll(e.target.checked)} />
                  </th>
                  <th className="px-3 py-2.5 font-semibold">العميل / Tenant ID</th>
                  <th className="px-3 py-2.5 font-semibold">النشاط</th>
                  <th className="px-3 py-2.5 font-semibold">الباقة</th>
                  <th className="px-3 py-2.5 font-semibold">الحالة</th>
                  <th className="px-3 py-2.5 font-semibold">نهاية الاشتراك</th>
                  <th className="px-3 py-2.5 font-semibold">الأجهزة</th>
                  <th className="px-3 py-2.5 font-semibold">الفروع</th>
                  <th className="px-3 py-2.5 font-semibold">مستحقات</th>
                  <th className="px-3 py-2.5 font-semibold">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {tenants.slice((page - 1) * 20, page * 20).map((item) => (
                  <tr key={item.id} className={`border-t border-slate-100 hover:bg-slate-50/60 ${selectedIds.has(item.id) ? 'bg-emerald-50/30' : ''}`}>
                    <td className="px-3 py-2.5">
                      <input type="checkbox" checked={selectedIds.has(item.id)} onChange={(e) => handleSelectOne(item.id, e.target.checked)} />
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="text-[12.5px] font-bold text-slate-800">{item.name}</p>
                      <p className="text-[10px] text-slate-500">
                        <span dir="ltr" className="font-mono">{item.code}</span>
                        {' · '}
                        <span dir="ltr" className="font-mono text-slate-400">{item.id}</span>
                      </p>
                      <p className="text-[10px] text-slate-500">{item.phone || item.email || '—'}</p>
                    </td>
                    <td className="px-3 py-2.5 text-[11px] text-slate-600">{item.businessType || '—'}</td>
                    <td className="px-3 py-2.5 text-[11.5px] font-semibold text-slate-600">{item.planName || '—'}</td>
                    <td className="px-3 py-2.5"><StatusBadge value={item.status} label={PLATFORM_TENANT_STATUS_LABELS[item.status]} /></td>
                    <td className="px-3 py-2.5 text-[11px] text-slate-600">{formatDate(item.subscriptionExpiresAt)}</td>
                    <td className="px-3 py-2.5 text-[11px] font-semibold text-slate-700">
                      {formatNumber(item.devicesUsed ?? 0)} / {formatNumber(item.devicesLimit)}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] font-semibold text-slate-700">{formatNumber(item.branchesLimit)}</td>
                    <td className={`px-3 py-2.5 text-[11px] font-bold ${(item.outstanding ?? 0) > 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                      {formatMoney(item.outstanding ?? 0)}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openProfile(item)}
                          className="rounded p-1.5 text-slate-500 hover:bg-sky-50 hover:text-sky-700"
                          title="فتح الملف المركزي"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        {canManageTenants && (<button
                          type="button"
                          onClick={() => openEdit(item)}
                          className="rounded p-1.5 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700"
                          title="تعديل البيانات"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>)}
                        <button
                          type="button"
                          onClick={() => openProfile(item)}
                          className="rounded p-1.5 text-slate-500 hover:bg-amber-50 hover:text-amber-700"
                          title="الحساب والترخيص"
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Create / edit */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'تعديل بيانات العميل' : 'إضافة عميل جديد'}
        description="بيانات المنشأة تحدد نشاطها وخطتها وحدود الاستخدام وتراخيصها."
        size="lg"
        busy={saving}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setFormOpen(false)} disabled={saving}>إلغاء</Button>
            <Button variant="primary" onClick={save} loading={saving} disabled={!canManageTenants}>{editing ? 'حفظ التعديلات' : 'إضافة العميل'}</Button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="اسم الشركة" required>
            <input className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </Field>
          <Field label="رقم العميل" hint="يُولَّد تلقائياً إذا تُرك فارغاً">
            <input className={inputClass} dir="ltr" value={form.code ?? ''} onChange={(event) => setForm({ ...form, code: event.target.value })} />
          </Field>
          <Field label="اسم المسؤول">
            <input className={inputClass} value={form.contactName ?? ''} onChange={(event) => setForm({ ...form, contactName: event.target.value })} />
          </Field>
          <Field label="الهاتف">
            <input className={inputClass} dir="ltr" value={form.phone ?? ''} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
          </Field>
          <Field label="البريد الإلكتروني">
            <input className={inputClass} dir="ltr" type="email" value={form.email ?? ''} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          </Field>
          <Field label="النشاط التجاري">
            <input className={inputClass} value={form.businessType ?? ''} onChange={(event) => setForm({ ...form, businessType: event.target.value })} />
          </Field>
          <Field label="الدولة">
            <input className={inputClass} value={form.country ?? ''} onChange={(event) => setForm({ ...form, country: event.target.value })} />
          </Field>
          <Field label="المدينة">
            <input className={inputClass} value={form.city ?? ''} onChange={(event) => setForm({ ...form, city: event.target.value })} />
          </Field>
          <Field label="العنوان" className="sm:col-span-2">
            <input className={inputClass} value={form.address ?? ''} onChange={(event) => setForm({ ...form, address: event.target.value })} />
          </Field>
          <Field label="الباقة">
            <select className={inputClass} value={form.planId ?? ''} onChange={(event) => setForm({ ...form, planId: event.target.value })}>
              <option value="">بدون خطة</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>{plan.name} — {formatMoney(plan.price, plan.currency)}</option>
              ))}
            </select>
          </Field>
          <Field label="حالة العميل">
            <select className={inputClass} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as PlatformTenantStatus })}>
              {STATUSES.map((value) => <option key={value} value={value}>{PLATFORM_TENANT_STATUS_LABELS[value]}</option>)}
            </select>
          </Field>
          <Field label="حد المستخدمين">
            <input type="number" min={1} className={inputClass} value={form.seatsLimit ?? 1} onChange={(event) => setForm({ ...form, seatsLimit: Number(event.target.value) })} />
          </Field>
          <Field label="حد الفروع">
            <input type="number" min={1} className={inputClass} value={form.branchesLimit ?? 1} onChange={(event) => setForm({ ...form, branchesLimit: Number(event.target.value) })} />
          </Field>
          <Field label="حد الأجهزة">
            <input type="number" min={1} className={inputClass} value={form.devicesLimit ?? 1} onChange={(event) => setForm({ ...form, devicesLimit: Number(event.target.value) })} />
          </Field>
          <Field label="ملاحظات" className="sm:col-span-2">
            <textarea rows={3} className={inputClass} value={form.notes ?? ''} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          </Field>
        </div>
      </Modal>

      {/* Central customer file */}
      <Modal
        open={Boolean(detailId)}
        onClose={() => { setDetailId(null); setProfile(null); }}
        title={tenant ? `ملف العميل: ${tenant.name}` : 'ملف العميل'}
        description={tenant ? `رقم العميل ${tenant.code} · Tenant ID ${tenant.id}` : 'جارٍ تحميل الملف...'}
        icon={<ShieldCheck className="h-5 w-5" />}
        size="xl"
        busy={working}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            {tenant && (
              <>
                {canManageTenants && (<Button variant="ghost" size="sm" leadingIcon={<Download className="h-3.5 w-3.5" />} onClick={exportRows}>
                  تصدير القائمة
                </Button>)}
                {canManageTenants && (<Button variant="secondary" size="sm" leadingIcon={<Pencil className="h-3.5 w-3.5" />} onClick={() => openEdit(tenant)}>
                  تعديل البيانات
                </Button>)}
                {canManageTenants && (<Button variant="primary" size="sm" leadingIcon={<Send className="h-3.5 w-3.5" />} onClick={sendActivation} loading={working}>
                  إرسال بيانات التفعيل
                </Button>)}
              </>
            )}
          </div>
        }
      >
        {!profile || !tenant ? (
          <div className="py-16 text-center text-sm font-semibold text-slate-500">جارٍ تحميل ملف العميل...</div>
        ) : (
          <div className="space-y-4">
            {/* Header strip */}
            <div className="rounded-xl bg-gradient-to-l from-slate-900 via-slate-800 to-emerald-900 p-4 text-white">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10.5px] font-bold uppercase tracking-wide text-emerald-300">{tenant.businessType || 'نشاط غير محدد'}</p>
                  <h3 className="mt-1 truncate text-lg font-black">{tenant.name}</h3>
                  <p className="mt-1 text-[11px] text-slate-300">
                    رقم العميل <span dir="ltr" className="font-mono font-bold text-white">{tenant.code}</span>
                    {' · '}Tenant ID <span dir="ltr" className="font-mono">{tenant.id}</span>
                    {' · '}مسجل في {formatDate(tenant.createdAt)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge value={tenant.status} label={PLATFORM_TENANT_STATUS_LABELS[tenant.status]} />
                  <span className={`rounded-full border px-2 py-0.5 text-[10.5px] font-bold ${
                    account?.isActive ? 'border-emerald-300/40 bg-emerald-400/20 text-emerald-200' : 'border-rose-300/40 bg-rose-400/20 text-rose-200'
                  }`}>
                    الحساب: {account ? ACCOUNT_STATUS(account.isActive) : 'غير منشأ'}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {!account ? (
                canManageTenants ? (
                  <Button variant="secondary" size="sm" leadingIcon={<UserPlus className="h-3.5 w-3.5" />} onClick={() => setAccountOpen(true)}>
                    إنشاء حساب للعميل
                  </Button>
                ) : null
              ) : (
                <>
                  <Button variant="secondary" size="sm" leadingIcon={<LockKeyhole className="h-3.5 w-3.5" />} onClick={resetPassword} loading={working} disabled={!canManageTenants}>
                    إعادة تعيين كلمة المرور
                  </Button>
                  <Button
                    variant={account.isActive ? 'ghost' : 'success'}
                    size="sm"
                    leadingIcon={account.isActive ? <Ban className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    onClick={() => toggleAccount(!account.isActive)}
                    loading={working}
                    disabled={!canManageTenants}
                  >
                    {account.isActive ? 'تعليق حساب الدخول' : 'تفعيل حساب الدخول'}
                  </Button>
                </>
              )}
              {tenant.status === 'SUSPENDED' ? (
                <Button variant="success" size="sm" leadingIcon={<CheckCircle2 className="h-3.5 w-3.5" />} onClick={() => changeStatus(tenant, 'ACTIVE')} loading={working} disabled={!canManageTenants}>
                  إعادة تفعيل العميل
                </Button>
              ) : (
                <Button variant="ghost" size="sm" leadingIcon={<Ban className="h-3.5 w-3.5" />} onClick={() => changeStatus(tenant, 'SUSPENDED')} loading={working} disabled={!canManageTenants}>
                  تعليق العميل
                </Button>
              )}
              <Button variant="ghost" size="sm" leadingIcon={<RefreshCw className="h-3.5 w-3.5" />} onClick={resetDevices} loading={working} disabled={!canManageTenants}>
                إعادة تعيين الأجهزة
              </Button>
              <Button variant="danger" size="sm" leadingIcon={<XCircle className="h-3.5 w-3.5" />} onClick={cancelSubscription} loading={working} disabled={!canManageTenants}>
                إلغاء الاشتراك
              </Button>
              <Button variant="ghost" size="sm" leadingIcon={<Archive className="h-3.5 w-3.5" />} onClick={() => archive(tenant)} loading={working} disabled={!canManageTenants}>
                أرشفة العميل
              </Button>
            </div>

            {/* Tabs */}
            <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
              {TABS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setTab(item.key)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11.5px] font-bold transition ${
                    tab === item.key ? 'bg-white text-emerald-700 shadow-sm ring-1 ring-emerald-200' : 'text-slate-600 hover:bg-white/70'
                  }`}
                >
                  {item.icon} {item.label}
                </button>
              ))}
            </div>

            {tab === 'overview' && (
              <div className="space-y-3">
                <SectionCard title="بيانات العميل" subtitle="الملف المركزي للشركة والمسؤول والعنوان" icon={<Building2 className="h-4 w-4" />}>
                  <dl className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-3">
                    <InfoItem label="اسم الشركة" value={tenant.name} />
                    <InfoItem label="النشاط التجاري" value={tenant.businessType} />
                    <InfoItem label="رقم العميل" value={tenant.code} ltr />
                    <InfoItem label="Tenant ID" value={<span dir="ltr" className="font-mono text-[10.5px]">{tenant.id}</span>} />
                    <InfoItem label="اسم المسؤول" value={tenant.contactName} />
                    <InfoItem label="تاريخ التسجيل" value={formatDate(tenant.createdAt)} />
                    <InfoItem label="الهاتف" value={<span className="inline-flex items-center gap-1"><Phone className="h-3 w-3 text-slate-400" />{tenant.phone || '—'}</span>} ltr />
                    <InfoItem label="البريد الإلكتروني" value={<span className="inline-flex items-center gap-1"><Mail className="h-3 w-3 text-slate-400" />{tenant.email || '—'}</span>} ltr />
                    <InfoItem label="العنوان" value={<span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3 text-slate-400" />{[tenant.country, tenant.city, tenant.address].filter(Boolean).join('، ') || '—'}</span>} />
                    {tenant.notes && <div className="sm:col-span-2 xl:col-span-3"><InfoItem label="ملاحظات" value={tenant.notes} /></div>}
                  </dl>
                </SectionCard>

                <div className="grid gap-3 xl:grid-cols-2">
                  <SectionCard title="الاشتراك الحالي" subtitle="الباقة والتواريخ وحالة الاشتراك" icon={<CalendarClock className="h-4 w-4" />}>
                    <dl className="grid gap-2 p-3 sm:grid-cols-2">
                      <InfoItem label="الباقة الحالية" value={tenant.planName || 'بدون باقة'} />
                      <InfoItem label="سعر الباقة" value={profile.plan ? formatMoney(profile.plan.price, profile.plan.currency) : '—'} />
                      <InfoItem label="حالة الاشتراك" value={<StatusBadge value={tenant.status} label={PLATFORM_TENANT_STATUS_LABELS[tenant.status]} />} />
                      <InfoItem label="دورة الفوترة" value={subscription ? CYCLE_LABELS[subscription.billingCycle] : profile.plan ? CYCLE_LABELS[profile.plan.billingCycle] : '—'} />
                      <InfoItem label="بداية الاشتراك" value={formatDate(tenant.subscriptionStartedAt)} />
                      <InfoItem label="نهاية الاشتراك" value={formatDate(tenant.subscriptionExpiresAt)} />
                      <InfoItem label="المستخدمون المسموحون" value={formatNumber(tenant.seatsLimit)} />
                      <InfoItem label="التجديد التلقائي" value={subscription ? (subscription.autoRenew ? 'مفعّل' : 'معطّل') : '—'} />
                    </dl>
                  </SectionCard>

                  <SectionCard title="حدود الاستخدام" subtitle="الأجهزة والفروع والوحدات المفعّلة" icon={<Smartphone className="h-4 w-4" />}>
                    <div className="grid gap-2 p-3 sm:grid-cols-2">
                      <div className="rounded-lg border border-slate-200 p-3">
                        <p className="flex items-center gap-1 text-[10.5px] font-semibold text-slate-500"><Smartphone className="h-3 w-3" /> الأجهزة</p>
                        <p className="mt-1 text-lg font-black text-slate-800">
                          {formatNumber(profile.usage.devicesUsed)} <span className="text-[11px] font-semibold text-slate-400">/ {formatNumber(profile.usage.devicesLimit)}</span>
                        </p>
                        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`h-full rounded-full ${profile.usage.devicesUsed >= profile.usage.devicesLimit ? 'bg-rose-500' : 'bg-emerald-500'}`}
                            style={{ width: `${Math.min(100, profile.usage.devicesLimit ? (profile.usage.devicesUsed / profile.usage.devicesLimit) * 100 : 0)}%` }}
                          />
                        </div>
                      </div>
                      <div className="rounded-lg border border-slate-200 p-3">
                        <p className="flex items-center gap-1 text-[10.5px] font-semibold text-slate-500"><Layers3 className="h-3 w-3" /> الفروع المسموحة</p>
                        <p className="mt-1 text-lg font-black text-slate-800">
                          {formatNumber(profile.usage.branchesUsed)} <span className="text-[11px] font-semibold text-slate-400">/ {formatNumber(profile.usage.branchesLimit)}</span>
                        </p>
                        <p className="mt-1 text-[10px] text-slate-500">فروع مستخدمة / المسموح</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 p-3 sm:col-span-2">
                        <p className="flex items-center gap-1 text-[10.5px] font-semibold text-slate-500"><KeyRound className="h-3 w-3" /> التراخيص والوحدات</p>
                        <p className="mt-1 text-[12px] font-bold text-slate-800">
                          {formatNumber(profile.licenses.length)} ترخيص · {formatNumber(profile.usage.modulesCount)} وحدة مفعّلة
                        </p>
                        <p className="mt-0.5 text-[10px] text-slate-500">
                          {tenant.activeLicenses ? `${formatNumber(tenant.activeLicenses)} ترخيص ساري` : 'لا يوجد ترخيص ساري'}
                        </p>
                      </div>
                    </div>
                  </SectionCard>
                </div>

                {centralActive && (
                  <SectionCard
                    title="فروع العميل"
                    subtitle={`${formatNumber(branches.filter((b) => b.status !== 'CLOSED').length)} من ${formatNumber(profile.usage.branchesLimit)} فرعاً مسموحاً`}
                    icon={<Layers3 className="h-4 w-4" />}
                    action={canManageTenants && (
                      <Button size="sm" variant="secondary" onClick={() => setBranchOpen(true)}>
                        <Plus className="h-3.5 w-3.5" /> إضافة فرع
                      </Button>
                    )}
                  >
                    {branches.length === 0 ? (
                      <p className="p-3 text-[11.5px] text-slate-500">لا توجد فروع مسجلة لهذا العميل.</p>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {branches.map((b) => (
                          <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                            <div className="min-w-0">
                              <p className="text-[12px] font-bold text-slate-800">
                                {b.name}
                                {b.isMain && <span className="mr-1.5 rounded bg-indigo-100 px-1.5 py-0.5 text-[9px] font-black text-indigo-700">رئيسي</span>}
                                {b.status === 'SUSPENDED' && <span className="mr-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-black text-amber-700">موقوف</span>}
                                {b.status === 'CLOSED' && <span className="mr-1.5 rounded bg-slate-200 px-1.5 py-0.5 text-[9px] font-black text-slate-600">مغلق</span>}
                              </p>
                              <p className="text-[10.5px] text-slate-500 font-mono">
                                {b.code}{b.city ? ` · ${b.city}` : ''} · {b.seatsLimit} مقعد / {b.devicesLimit} جهاز
                              </p>
                            </div>
                            {canManageTenants && b.status !== 'CLOSED' && !b.isMain && (
                              <Button size="sm" variant="ghost" onClick={() => closeBranch(b.id)}>
                                إغلاق
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </SectionCard>
                )}

                <SectionCard title="صحة العميل" subtitle={`تقييم ${healthScore}% — ${healthChecks.filter((item) => item.ok).length} من ${healthChecks.length} فحوصات ناجحة`} icon={<ShieldCheck className="h-4 w-4" />}>
                  <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-3">
                    {healthChecks.map((check) => (
                      <div
                        key={check.label}
                        className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-[11.5px] font-semibold ${
                          check.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'
                        }`}
                      >
                        {check.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                        {check.label}
                      </div>
                    ))}
                  </div>
                </SectionCard>

                <SectionCard title="حساب الدخول" subtitle="بيانات الحساب الذي يستخدمه العميل للدخول" icon={<LockKeyhole className="h-4 w-4" />}>
                  {account ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 p-3">
                      <div className="grid flex-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                        <InfoItem label="اسم المستخدم" value={account.username} ltr />
                        <InfoItem label="الاسم الكامل" value={account.fullName} />
                        <InfoItem label="البريد" value={account.email} ltr />
                        <InfoItem label="حالة الحساب" value={ACCOUNT_STATUS(account.isActive)} />
                        <InfoItem label="كود التفعيل" value={account.activationCode || '—'} ltr />
                        <InfoItem label="آخر تفعيل" value={formatDateTime(account.lastActivatedAt)} />
                        <InfoItem label="آخر دخول" value={formatDateTime(account.lastLoginAt)} />
                        <InfoItem label="تاريخ الإنشاء" value={formatDate(account.createdAt)} />
                      </div>
                      <div className="flex flex-col gap-2">
                        {canManageTenants && (
                          <Button variant="secondary" size="sm" leadingIcon={<Send className="h-3.5 w-3.5" />} onClick={sendActivation} loading={working}>
                            تجهيز بيانات التفعيل
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" leadingIcon={<Copy className="h-3.5 w-3.5" />} onClick={() => copyToClipboard(account.username, 'اسم المستخدم')}>
                          نسخ اسم المستخدم
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-3 p-3">
                      <p className="text-[11.5px] text-slate-500">لا يوجد حساب دخول لهذا العميل بعد. أنشئ حساباً لتوليد بيانات التفعيل.</p>
                      {canManageTenants && (
                        <Button variant="primary" size="sm" leadingIcon={<UserPlus className="h-3.5 w-3.5" />} onClick={() => setAccountOpen(true)}>
                          إنشاء حساب
                        </Button>
                      )}
                    </div>
                  )}
                </SectionCard>
                <SectionCard title="مزايا وحدود خاصة (Overrides)" subtitle="إضافة مزايا أو حدود لعميل معين دون تغيير باقته الأساسية" icon={<Layers3 className="h-4 w-4" />}>
                  <div className="space-y-3 p-3">
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                      <Field label="النوع">
                        <select className={inputClass} value={overrideForm.kind} onChange={(event) => setOverrideForm({ ...overrideForm, kind: event.target.value as PlatformTenantOverrideInput['kind'] })}>
                          <option value="MODULE">وحدة</option>
                          <option value="FEATURE">ميزة</option>
                          <option value="LIMIT">حد</option>
                          <option value="PERMISSION">صلاحية</option>
                        </select>
                      </Field>
                      <Field label="الرمز">
                        <input className={inputClass} dir="ltr" value={overrideForm.code} onChange={(event) => setOverrideForm({ ...overrideForm, code: event.target.value })} placeholder="reports / max_products" />
                      </Field>
                      <Field label="القيمة">
                        <input className={inputClass} value={overrideForm.value ?? ''} onChange={(event) => setOverrideForm({ ...overrideForm, value: event.target.value })} placeholder="true / 5000" />
                      </Field>
                      <div className="flex items-end">
                        <Button variant="primary" size="sm" block leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={addOverride} loading={working} disabled={!canManageTenants}>
                          إضافة
                        </Button>
                      </div>
                    </div>
                    {overrides.length === 0 ? (
                      <p className="text-[11px] text-slate-500">لا توجد مزايا أو حدود خاصة لهذا العميل.</p>
                    ) : (
                      <div className="overflow-x-auto rounded-lg border border-slate-200">
                        <table className="w-full min-w-[520px] text-right">
                          <thead className="bg-slate-50 text-[10px] text-slate-500">
                            <tr>
                              <th className="px-3 py-2">النوع</th>
                              <th className="px-3 py-2">الرمز</th>
                              <th className="px-3 py-2">القيمة</th>
                              <th className="px-3 py-2">الحالة</th>
                              <th className="px-3 py-2">إجراء</th>
                            </tr>
                          </thead>
                          <tbody>
                            {overrides.map((item) => (
                              <tr key={item.id} className="border-t border-slate-100">
                                <td className="px-3 py-1.5 text-[10.5px] font-semibold text-slate-700">{item.kind}</td>
                                <td className="px-3 py-1.5 font-mono text-[10.5px]" dir="ltr">{item.code}</td>
                                <td className="px-3 py-1.5 text-[10.5px]">{item.value || (item.isEnabled ? 'مفعّل' : 'معطّل')}</td>
                                <td className="px-3 py-1.5"><StatusBadge value={item.isEnabled ? 'ACTIVE' : 'CANCELLED'} label={item.isEnabled ? 'مفعّل' : 'معطّل'} /></td>
                                <td className="px-3 py-1.5">
                                  <button
                                    type="button"
                                    disabled={!canManageTenants}
              onClick={() => removeOverride(item.id)}
                                    className="rounded p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-700"
                                    title="حذف"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </SectionCard>
              </div>
            )}

            {tab === 'subscription' && (
              <div className="space-y-3">
                <div className="grid gap-3 xl:grid-cols-2">
                  <SectionCard title="تجديد الاشتراك" subtitle="يمدد الباقة والتراخيص من تاريخ الانتهاء الحالي" icon={<RefreshCw className="h-4 w-4" />}>
                    <div className="grid gap-2 p-3 sm:grid-cols-2">
                      <Field label="مدة التجديد (أشهر)">
                        <input type="number" min={1} className={inputClass} value={renewMonths} onChange={(event) => setRenewMonths(Math.max(1, Number(event.target.value)))} />
                      </Field>
                      <div className="flex items-end">
                        <Button variant="success" block leadingIcon={<CheckCircle2 className="h-3.5 w-3.5" />} onClick={renewSubscription} loading={working} disabled={!canManageTenants}>
                          تجديد الاشتراك
                        </Button>
                      </div>
                      <p className="text-[10.5px] text-slate-500 sm:col-span-2">
                        تاريخ الانتهاء الحالي: <b>{formatDate(tenant.subscriptionExpiresAt)}</b>
                      </p>
                    </div>
                  </SectionCard>

                  <SectionCard title="تغيير / نقل الباقة" subtitle="إلغاء الباقة الحالية وإصدار ترخيص بالباقة الجديدة" icon={<Layers3 className="h-4 w-4" />}>
                    <div className="grid gap-2 p-3 sm:grid-cols-2">
                      <Field label="الباقة الجديدة" className="sm:col-span-2">
                        <select className={inputClass} value={planForm.planId} onChange={(event) => setPlanForm({ ...planForm, planId: event.target.value })}>
                          <option value="">اختر الباقة</option>
                          {plans.filter((plan) => plan.isActive).map((plan) => (
                            <option key={plan.id} value={plan.id}>{plan.name} — {formatMoney(plan.price, plan.currency)} / {CYCLE_LABELS[plan.billingCycle]}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="المدة (أشهر)">
                        <input type="number" min={1} className={inputClass} value={planForm.months} onChange={(event) => setPlanForm({ ...planForm, months: Math.max(1, Number(event.target.value)) })} />
                      </Field>
                      <Field label="عدد المستخدمين">
                        <input type="number" min={1} className={inputClass} value={planForm.seats} onChange={(event) => setPlanForm({ ...planForm, seats: Math.max(1, Number(event.target.value)) })} />
                      </Field>
                      <div className="sm:col-span-2">
                        <Button variant="primary" block leadingIcon={<ArrowRightIcon />} onClick={changePlan} loading={working} disabled={!planForm.planId || !canManageTenants}>
                          نقل العميل إلى الباقة الجديدة
                        </Button>
                      </div>
                      <p className="text-[10.5px] text-amber-700 sm:col-span-2">
                        سيتم إلغاء التراخيص والاشتراكات الحالية واستبدالها بترخيص جديد بالباقة المختارة.
                      </p>
                    </div>
                  </SectionCard>
                </div>

                <SectionCard title="سجل الاشتراكات" subtitle={`${profile.subscriptions.length} اشتراك مسجل`} icon={<CalendarClock className="h-4 w-4" />}>
                  {profile.subscriptions.length === 0 ? (
                    <EmptyState icon={<CalendarClock className="h-5 w-5" />} title="لا توجد اشتراكات مسجلة" />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[720px] text-right">
                        <thead className="bg-slate-50 text-[10px] text-slate-500">
                          <tr>
                            <th className="px-3 py-2">الباقة</th>
                            <th className="px-3 py-2">الحالة</th>
                            <th className="px-3 py-2">البداية</th>
                            <th className="px-3 py-2">النهاية</th>
                            <th className="px-3 py-2">المستخدمون</th>
                            <th className="px-3 py-2">السعر</th>
                            <th className="px-3 py-2">الدورة</th>
                          </tr>
                        </thead>
                        <tbody>
                          {profile.subscriptions.map((item) => (
                            <tr key={item.id} className="border-t border-slate-100">
                              <td className="px-3 py-1.5 text-[11px] font-semibold text-slate-700">{item.planName || '—'}</td>
                              <td className="px-3 py-1.5"><StatusBadge value={item.status} label={item.status} /></td>
                              <td className="px-3 py-1.5 text-[10.5px]">{formatDate(item.startDate)}</td>
                              <td className="px-3 py-1.5 text-[10.5px]">{formatDate(item.endDate)}</td>
                              <td className="px-3 py-1.5 text-[10.5px]">{formatNumber(item.seats)}</td>
                              <td className="px-3 py-1.5 text-[10.5px] font-bold">{formatMoney(item.price)}</td>
                              <td className="px-3 py-1.5 text-[10.5px]">{CYCLE_LABELS[item.billingCycle] || item.billingCycle}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </SectionCard>
              </div>
            )}

            {tab === 'licenses' && (
              <div className="space-y-3">
                <SectionCard
                  title="التراخيص والأجهزة"
                  subtitle={`${profile.licenses.length} ترخيص · ${formatNumber(profile.usage.devicesUsed)} جهاز مستخدم من ${formatNumber(profile.usage.devicesLimit)}`}
                  icon={<KeyRound className="h-4 w-4" />}
                  action={
                    <Button variant="ghost" size="sm" leadingIcon={<RefreshCw className="h-3.5 w-3.5" />} onClick={resetDevices} loading={working} disabled={!canManageTenants}>
                      إعادة تعيين الأجهزة
                    </Button>
                  }
                >
                  {profile.licenses.length === 0 ? (
                    <EmptyState icon={<KeyRound className="h-5 w-5" />} title="لا توجد تراخيص" description="استخدم تبويب الاشتراك لإصدار ترخيص أو نقل الباقة." />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[760px] text-right">
                        <thead className="bg-slate-50 text-[10px] text-slate-500">
                          <tr>
                            <th className="px-3 py-2">مفتاح الترخيص</th>
                            <th className="px-3 py-2">الحالة</th>
                            <th className="px-3 py-2">الجهاز</th>
                            <th className="px-3 py-2">ينتهي</th>
                            <th className="px-3 py-2">المستخدمون</th>
                            <th className="px-3 py-2">حد الأجهزة</th>
                            <th className="px-3 py-2">الوحدات</th>
                          </tr>
                        </thead>
                        <tbody>
                          {profile.licenses.map((license) => (
                            <tr key={license.id} className="border-t border-slate-100">
                              <td className="px-3 py-1.5">
                                <button
                                  type="button"
                                  onClick={() => copyToClipboard(license.licenseKey, 'مفتاح الترخيص')}
                                  className="inline-flex items-center gap-1 font-mono text-[10.5px] text-slate-700 hover:text-emerald-700"
                                  dir="ltr"
                                >
                                  {license.licenseKey} <Copy className="h-3 w-3" />
                                </button>
                              </td>
                              <td className="px-3 py-1.5"><StatusBadge value={license.status} label={license.status} /></td>
                              <td className="px-3 py-1.5 text-[10.5px]" dir="ltr">{license.hardwareId || '—'}</td>
                              <td className="px-3 py-1.5 text-[10.5px]">{formatDate(license.expiresAt)}</td>
                              <td className="px-3 py-1.5 text-[10.5px]">{formatNumber(license.seats)}</td>
                              <td className="px-3 py-1.5 text-[10.5px]">{formatNumber(license.deviceLimit)}</td>
                              <td className="px-3 py-1.5 text-[10.5px]">{formatNumber(license.modules.length)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </SectionCard>

                <SectionCard title="سجل التفعيلات" subtitle="كل عمليات توليد وإرسال وتفعيل بيانات الدخول" icon={<Activity className="h-4 w-4" />}>
                  <LogList entries={profile.activationLog} empty="لا توجد عمليات تفعيل مسجلة بعد." />
                </SectionCard>
              </div>
            )}

            {tab === 'billing' && (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                    <p className="flex items-center gap-1 text-[10.5px] font-semibold text-emerald-700"><Wallet className="h-3 w-3" /> إجمالي المدفوعات</p>
                    <p className="mt-1 text-lg font-black text-emerald-800">
                      {formatMoney(profile.payments.reduce((sum, payment) => sum + payment.amount, 0))}
                    </p>
                  </div>
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                    <p className="flex items-center gap-1 text-[10.5px] font-semibold text-rose-700"><CreditCard className="h-3 w-3" /> مستحقات غير محصلة</p>
                    <p className="mt-1 text-lg font-black text-rose-800">{formatMoney(tenant.outstanding ?? 0)}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="flex items-center gap-1 text-[10.5px] font-semibold text-slate-600"><ScrollText className="h-3 w-3" /> عدد الفواتير</p>
                    <p className="mt-1 text-lg font-black text-slate-800">{formatNumber(profile.invoices.length)}</p>
                  </div>
                </div>

                <SectionCard title="سجل المدفوعات" subtitle={`${profile.payments.length} دفعة مسجلة`} icon={<Wallet className="h-4 w-4" />}>
                  {profile.payments.length === 0 ? (
                    <EmptyState icon={<Wallet className="h-5 w-5" />} title="لا توجد مدفوعات مسجلة" />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[600px] text-right">
                        <thead className="bg-slate-50 text-[10px] text-slate-500">
                          <tr>
                            <th className="px-3 py-2">التاريخ</th>
                            <th className="px-3 py-2">الفاتورة</th>
                            <th className="px-3 py-2">المبلغ</th>
                            <th className="px-3 py-2">الطريقة</th>
                            <th className="px-3 py-2">المرجع</th>
                          </tr>
                        </thead>
                        <tbody>
                          {profile.payments.map((payment) => (
                            <tr key={payment.id} className="border-t border-slate-100">
                              <td className="px-3 py-1.5 text-[10.5px]">{formatDateTime(payment.paidAt)}</td>
                              <td className="px-3 py-1.5 font-mono text-[10.5px]" dir="ltr">{payment.invoiceNumber || '—'}</td>
                              <td className="px-3 py-1.5 text-[11px] font-bold text-emerald-700">{formatMoney(payment.amount)}</td>
                              <td className="px-3 py-1.5 text-[10.5px]">{payment.method}</td>
                              <td className="px-3 py-1.5 text-[10.5px]" dir="ltr">{payment.reference || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </SectionCard>

                <SectionCard title="فواتير العميل" subtitle={`${profile.invoices.length} فاتورة`} icon={<CreditCard className="h-4 w-4" />}>
                  {profile.invoices.length === 0 ? (
                    <EmptyState icon={<CreditCard className="h-5 w-5" />} title="لا توجد فواتير بعد" />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[640px] text-right">
                        <thead className="bg-slate-50 text-[10px] text-slate-500">
                          <tr>
                            <th className="px-3 py-2">الرقم</th>
                            <th className="px-3 py-2">الإصدار</th>
                            <th className="px-3 py-2">الاستحقاق</th>
                            <th className="px-3 py-2">الإجمالي</th>
                            <th className="px-3 py-2">المدفوع</th>
                            <th className="px-3 py-2">الحالة</th>
                          </tr>
                        </thead>
                        <tbody>
                          {profile.invoices.map((invoice) => (
                            <tr key={invoice.id} className="border-t border-slate-100">
                              <td className="px-3 py-1.5 font-mono text-[10.5px]" dir="ltr">{invoice.number}</td>
                              <td className="px-3 py-1.5 text-[10.5px]">{formatDate(invoice.issueDate)}</td>
                              <td className="px-3 py-1.5 text-[10.5px]">{formatDate(invoice.dueDate)}</td>
                              <td className="px-3 py-1.5 text-[10.5px] font-bold">{formatMoney(invoice.total)}</td>
                              <td className="px-3 py-1.5 text-[10.5px]">{formatMoney(invoice.paidAmount)}</td>
                              <td className="px-3 py-1.5"><StatusBadge value={invoice.status} label={invoice.status} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </SectionCard>
              </div>
            )}

            {tab === 'users' && (
              <div className="space-y-3">
                <SectionCard
                  title="مستخدمو العميل"
                  subtitle={`${users.length} مستخدم مسجل`}
                  icon={<Users className="h-4 w-4" />}
                  action={
                    canManageTenants ? (<Button variant="primary" size="sm" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={openUserCreate}>
                      إضافة مستخدم
                    </Button>) : null
                  }
                >
                  {users.length === 0 ? (
                    <EmptyState icon={<Users className="h-5 w-5" />} title="لا يوجد مستخدمون مسجلون" description="أضف مستخدمين (مسؤولون، كاشير، ...) لإدارة هذا العميل." />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[720px] text-right">
                        <thead className="bg-slate-50 text-[10px] text-slate-500">
                          <tr>
                            <th className="px-3 py-2">الاسم</th>
                            <th className="px-3 py-2">اسم المستخدم</th>
                            <th className="px-3 py-2">البريد</th>
                            <th className="px-3 py-2">الهاتف</th>
                            <th className="px-3 py-2">الدور</th>
                            <th className="px-3 py-2">الحالة</th>
                            <th className="px-3 py-2">ملاحظات</th>
                            <th className="px-3 py-2">إجراء</th>
                          </tr>
                        </thead>
                        <tbody>
                          {users.map((user) => (
                            <tr key={user.id} className="border-t border-slate-100">
                              <td className="px-3 py-1.5 text-[11.5px] font-bold text-slate-800">{user.fullName}</td>
                              <td className="px-3 py-1.5 font-mono text-[10.5px]" dir="ltr">{user.username || '—'}</td>
                              <td className="px-3 py-1.5 text-[10.5px]" dir="ltr">{user.email || '—'}</td>
                              <td className="px-3 py-1.5 text-[10.5px]" dir="ltr">{user.phone || '—'}</td>
                              <td className="px-3 py-1.5 text-[10.5px] font-semibold text-slate-700">{user.role}</td>
                              <td className="px-3 py-1.5"><StatusBadge value={user.status === 'ACTIVE' ? 'ACTIVE' : user.status === 'SUSPENDED' ? 'SUSPENDED' : 'TRIAL'} label={user.status === 'ACTIVE' ? 'نشط' : user.status === 'SUSPENDED' ? 'موقوف' : 'مدعو'} /></td>
                              <td className="px-3 py-1.5 text-[10.5px] text-slate-500">{user.notes || '—'}</td>
                              <td className="px-3 py-1.5">
                                <div className="flex items-center gap-1">
                                  {canManageTenants && (<>
                                    <button type="button" onClick={() => openUserEdit(user)} className="rounded p-1.5 text-slate-500 hover:bg-sky-50 hover:text-sky-700" title="تعديل">
                                      <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => toggleUser(user, user.status !== 'ACTIVE')}
                                    className="rounded p-1.5 text-slate-500 hover:bg-amber-50 hover:text-amber-700"
                                    title={user.status === 'ACTIVE' ? 'تعليق' : 'تفعيل'}
                                  >
                                    {user.status === 'ACTIVE' ? <Ban className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                  </button>
                                  <button type="button" onClick={() => deleteUser(user)} className="rounded p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-700" title="حذف">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                  </>)}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </SectionCard>
              </div>
            )}

            {tab === 'logs' && (
              <div className="space-y-3">
                <SectionCard title="سجل التغييرات الإدارية" subtitle={`${profile.changeLog.length} تغيير على بيانات العميل`} icon={<Pencil className="h-4 w-4" />}>
                  <LogList entries={profile.changeLog} empty="لا توجد تغييرات إدارية مسجلة." />
                </SectionCard>
                <SectionCard title="سجل التفعيلات" subtitle={`${profile.activationLog.length} عملية تفعيل`} icon={<ShieldCheck className="h-4 w-4" />}>
                  <LogList entries={profile.activationLog} empty="لا توجد عمليات تفعيل مسجلة." />
                </SectionCard>
                <SectionCard title="كل نشاط العميل" subtitle="سجل موحد لكل العمليات المرتبطة بالعميل" icon={<Activity className="h-4 w-4" />}>
                  <LogList entries={profile.activityLog} empty="لا يوجد نشاط مسجل بعد." />
                </SectionCard>
              </div>
            )}

            {tab === 'remote' && (
              <div className="space-y-3">
                {/* Sync Status & Actions */}
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-slate-800">حالة المزامنة</p>
                      <p className="text-[11px] text-slate-500">
                        {remoteControlData?.lastSync ? (
                          <>
                            آخر مزامنة: <b>{formatDateTime(remoteControlData.lastSync.at)}</b> · حالة: <b>{remoteControlData.lastSync.status}</b>
                          </>
                        ) : (
                          'لا توجد مزامنة مسجلة بعد'
                        )}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" size="sm" leadingIcon={<RefreshCw className="h-3.5 w-3.5" />} onClick={loadRemoteControlData} loading={configSending}>
                        تحديث البيانات
                      </Button>
                      <Button variant="primary" size="sm" leadingIcon={<RotateCw className="h-3.5 w-3.5" />} onClick={forceSync} loading={forceSyncWorking} disabled={!canManageTenants}>
                        مزامنة إجبارية
                      </Button>
                    </div>
                  </div>
                </div>

                <SectionCard
                  title="الأجهزة المتصلة"
                  subtitle={`${remoteDevices.length} جهاز — ${remoteDevices.filter((d) => d.status === 'ACTIVE').length} نشط، ${remoteDevices.filter((d) => d.status === 'OFFLINE').length} غير متصل`}
                  icon={<Cpu className="h-4 w-4" />}
                  action={
                    <Button variant="secondary" size="sm" leadingIcon={<RefreshCw className="h-3.5 w-3.5" />} onClick={loadRemoteControlData} loading={configSending}>
                      تحديث
                    </Button>
                  }
                >
                  {remoteDevices.length === 0 ? (
                    <EmptyState icon={<Cpu className="h-5 w-5" />} title="لا توجد أجهزة متصلة" description="ستظهر الأجهزة عند تفعيل التراخيص وربطها." />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[900px] text-right">
                        <thead className="bg-slate-50 text-[10.5px] text-slate-500">
                          <tr>
                            <th className="px-3 py-2 w-10"><input type="checkbox" onChange={(e) => e.target.checked ? setSelectedDeviceIds(remoteDevices.map(d => d.id)) : setSelectedDeviceIds([])} /></th>
                            <th className="px-3 py-2 font-semibold">Hardware ID</th>
                            <th className="px-3 py-2 font-semibold">الاسم</th>
                            <th className="px-3 py-2 font-semibold">نظام التشغيل</th>
                            <th className="px-3 py-2 font-semibold">إصدار التطبيق</th>
                            <th className="px-3 py-2 font-semibold">IP</th>
                            <th className="px-3 py-2 font-semibold">أول اتصال</th>
                            <th className="px-3 py-2 font-semibold">آخر اتصال</th>
                            <th className="px-3 py-2 font-semibold">الحالة</th>
                            <th className="px-3 py-2 font-semibold">إجراءات</th>
                          </tr>
                        </thead>
                        <tbody>
                          {remoteDevices.map((device) => (
                            <tr key={device.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                              <td className="px-3 py-2"><input type="checkbox" checked={selectedDeviceIds.includes(device.id)} onChange={(e) => setSelectedDeviceIds(e.target.checked ? [...selectedDeviceIds, device.id] : selectedDeviceIds.filter(id => id !== device.id))} /></td>
                              <td className="px-3 py-2 font-mono text-[10.5px]" dir="ltr">{device.hardwareId}</td>
                              <td className="px-3 py-2 text-[11px] text-slate-600">{device.name || '—'}</td>
                              <td className="px-3 py-2 text-[11px] text-slate-600">{device.os || '—'}</td>
                              <td className="px-3 py-2 text-[11px] text-slate-600">{device.appVersion || '—'}</td>
                              <td className="px-3 py-2 font-mono text-[10.5px]" dir="ltr">{device.ipAddress || '—'}</td>
                              <td className="px-3 py-2 text-[10.5px] text-slate-600">{formatDateTime(device.firstActivatedAt)}</td>
                              <td className="px-3 py-2 text-[10.5px] text-slate-600">{formatDateTime(device.lastSeenAt)}</td>
                              <td className="px-3 py-2">
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                  device.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' :
                                  device.status === 'SUSPENDED' ? 'bg-amber-50 text-amber-700' :
                                  device.status === 'OFFLINE' ? 'bg-slate-100 text-slate-600' :
                                  'bg-rose-50 text-rose-700'
                                }`}>
                                  {device.status === 'ACTIVE' ? 'نشط' : device.status === 'SUSPENDED' ? 'موقوف' : device.status === 'OFFLINE' ? 'غير متصل' : 'ملغي'}
                                  {device.cloneSuspected ? ' · ⚠️' : ''}
                                </span>
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-1">
                                  {canManageTenants && (<button type="button" onClick={() => toggleDeviceStatus(device)} className="rounded p-1.5 text-slate-500 hover:bg-amber-50 hover:text-amber-700" title={device.status === 'ACTIVE' ? 'إيقاف' : 'تفعيل'}>
                                    {device.status === 'ACTIVE' ? <Ban className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                  </button>)}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </SectionCard>

                <SectionCard
                  title="إرسال إعدادات جديدة (Push Config)"
                  subtitle="إرسال مفاتيح تكوين (Feature Flags، حدود، وحدات، صلاحيات) إلى أجهزة العميل المستهدفة عبر outbox/sync"
                  icon={<Send className="h-4 w-4" />}
                >
                  <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-4">
                    <Field label="مفتاح الإعداد">
                      <input className={inputClass} dir="ltr" value={configForm.key} onChange={(e) => setConfigForm({ ...configForm, key: e.target.value })} placeholder="مثال: features.new_ui / limits.max_products / modules.inventory" />
                    </Field>
                    <Field label="القيمة">
                      <input className={inputClass} value={configForm.value} onChange={(e) => setConfigForm({ ...configForm, value: e.target.value })} placeholder='true / false / 5000 / ["module1","module2"]' />
                    </Field>
                    <Field label="النطاق">
                      <select className={inputClass} value={configForm.scope} onChange={(e) => setConfigForm({ ...configForm, scope: e.target.value })}>
                        <option value="TENANT">عميل (كل الأجهزة)</option>
                        <option value="DEVICE">أجهزة مختارة</option>
                        <option value="BRANCH">فرع</option>
                      </select>
                    </Field>
                    <div className="flex items-end">
                      <Button variant="primary" block leadingIcon={<Send className="h-3.5 w-3.5" />} onClick={pushConfig} loading={configSending} disabled={!canManageTenants || !configForm.key.trim() || (configForm.scope === 'DEVICE' && selectedDeviceIds.length === 0)}>
                        دفع التكوين
                      </Button>
                    </div>
                    {configForm.scope === 'DEVICE' && selectedDeviceIds.length > 0 && (
                      <p className="text-[10.5px] text-emerald-700 sm:col-span-2 xl:col-span-4">سيتم الإرسال إلى {selectedDeviceIds.length} جهاز محدد</p>
                    )}
                  </div>
                  {remoteConfig.length > 0 && (
                    <div className="border-t border-slate-100 mt-3 pt-3">
                      <p className="mb-2 text-[11px] font-semibold text-slate-700">إعدادات مطبقة حالياً</p>
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[600px] text-right">
                          <thead className="bg-slate-50 text-[10px] text-slate-500">
                            <tr>
                              <th className="px-3 py-2">المفتاح</th>
                              <th className="px-3 py-2">القيمة</th>
                              <th className="px-3 py-2">النطاق</th>
                              <th className="px-3 py-2">الحالة</th>
                              <th className="px-3 py-2">تاريخ التطبيق</th>
                            </tr>
                          </thead>
                          <tbody>
                            {remoteConfig.map((cfg) => (
                              <tr key={cfg.id || cfg.key} className="border-t border-slate-100">
                                <td className="px-3 py-1.5 font-mono text-[10.5px]" dir="ltr">{cfg.key}</td>
                                <td className="px-3 py-1.5 text-[10.5px]" dir="ltr">{cfg.value}</td>
                                <td className="px-3 py-1.5 text-[10.5px]">{cfg.scope}</td>
                                <td className="px-3 py-1.5"><StatusBadge value={cfg.status || 'APPLIED'} label={cfg.status === 'APPLIED' ? 'مطبق' : cfg.status === 'PENDING' ? 'بانتظار' : 'فشل'} /></td>
                                <td className="px-3 py-1.5 text-[10.5px] text-slate-500">{formatDateTime(cfg.appliedAt || cfg.createdAt)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </SectionCard>

                <SectionCard
                  title="سجل دفع التكوين (Config Push History)"
                  subtitle={`${remoteHistory.length} عملية مسجلة`}
                  icon={<ScrollText className="h-4 w-4" />}
                  action={
                    <Button variant="secondary" size="sm" leadingIcon={<RefreshCw className="h-3.5 w-3.5" />} onClick={loadRemoteControlData} loading={configSending}>
                      تحديث السجل
                    </Button>
                  }
                >
                  {remoteHistory.length === 0 ? (
                    <EmptyState icon={<ScrollText className="h-5 w-5" />} title="لا يوجد سجل عمليات" description="ستظهر هنا عمليات دفع التكوين عبر outbox/sync relay." />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[800px] text-right">
                        <thead className="bg-slate-50 text-[10px] text-slate-500">
                          <tr>
                            <th className="px-3 py-2">النوع</th>
                            <th className="px-3 py-2">المفتاح</th>
                            <th className="px-3 py-2">القيمة</th>
                            <th className="px-3 py-2">الأجهزة المستهدفة</th>
                            <th className="px-3 py-2">الحالة</th>
                            <th className="px-3 py-2">النتيجة / الخطأ</th>
                            <th className="px-3 py-2">التاريخ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {remoteHistory.map((entry) => (
                            <tr key={entry.id} className="border-t border-slate-100">
                              <td className="px-3 py-1.5 text-[10.5px] font-semibold text-slate-700">{entry.type || 'CONFIG_PUSH'}</td>
                              <td className="px-3 py-1.5 font-mono text-[10.5px]" dir="ltr">{entry.key}</td>
                              <td className="px-3 py-1.5 text-[10.5px]" dir="ltr">{entry.value}</td>
                              <td className="px-3 py-1.5 text-[10.5px] text-slate-600">{entry.targetCount || 0} جهاز</td>
                              <td className="px-3 py-1.5"><StatusBadge value={entry.status || 'PENDING'} label={entry.status === 'ACKNOWLEDGED' ? 'وصل' : entry.status === 'SENT' ? 'مرسل' : entry.status === 'FAILED' ? 'فشل' : 'بانتظار'} /></td>
                              <td className="px-3 py-1.5 text-[10.5px] text-slate-500" dir="ltr">{entry.error || entry.result || '—'}</td>
                              <td className="px-3 py-1.5 text-[10.5px] text-slate-500">{formatDateTime(entry.createdAt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </SectionCard>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Account creation */}
      <Modal
        open={accountOpen}
        onClose={() => setAccountOpen(false)}
        title="إنشاء حساب للعميل"
        description="سيتم إنشاء اسم مستخدم وكلمة مرور مؤقتة وكود تفعيل تسلمه للعميل."
        size="md"
        busy={working}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAccountOpen(false)} disabled={working}>إلغاء</Button>
            <Button variant="primary" leadingIcon={<UserPlus className="h-3.5 w-3.5" />} onClick={createAccount} loading={working} disabled={!canManageTenants}>
              إنشاء الحساب
            </Button>
          </div>
        }
      >
        <div className="grid gap-3">
          <Field label="اسم المستخدم" hint="حروف إنجليزية وأرقام فقط، ويُضمن أن يكون فريداً">
            <input className={inputClass} dir="ltr" value={accountForm.username} onChange={(event) => setAccountForm({ ...accountForm, username: event.target.value })} />
          </Field>
          <Field label="الاسم الكامل">
            <input className={inputClass} value={accountForm.fullName} onChange={(event) => setAccountForm({ ...accountForm, fullName: event.target.value })} />
          </Field>
          <Field label="البريد الإلكتروني">
            <input className={inputClass} dir="ltr" type="email" value={accountForm.email} onChange={(event) => setAccountForm({ ...accountForm, email: event.target.value })} />
          </Field>
          <Field label="كلمة المرور" hint="اتركها فارغة لتوليد كلمة مرور مؤقتة قوية">
            <input className={inputClass} dir="ltr" type="text" value={accountForm.password} onChange={(event) => setAccountForm({ ...accountForm, password: event.target.value })} />
          </Field>
        </div>
      </Modal>

      {/* Activation details */}
      <Modal
        open={activationOpen && Boolean(activation)}
        onClose={() => setActivationOpen(false)}
        title="بيانات تفعيل العميل"
        description="سلّم هذه البيانات للعميل ليتمكن من الدخول وتفعيل ترخيصه."
        icon={<ShieldCheck className="h-5 w-5" />}
        size="lg"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => setActivationOpen(false)}>إغلاق</Button>
            {activation && (
              <>
                <Button variant="secondary" leadingIcon={<Copy className="h-3.5 w-3.5" />} onClick={() => copyToClipboard(activationText(activation), 'بيانات التفعيل')}>
                  نسخ كل البيانات
                </Button>
                <Button variant="primary" leadingIcon={<Send className="h-3.5 w-3.5" />} onClick={sendActivation} loading={working} disabled={!canManageTenants}>
                  إعادة الإرسال
                </Button>
              </>
            )}
          </div>
        }
      >
        {activation && (
          <div className="space-y-3">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] font-semibold text-amber-800">
              تم تسجيل عملية التفعيل في سجل العميل. لا تشارك هذه البيانات إلا مع المسؤول المعتمد للعميل.
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <InfoItem label="العميل" value={activation.tenant.name} />
              <InfoItem label="رقم العميل" value={activation.tenant.code} ltr />
              <InfoItem label="اسم المستخدم" value={activation.username} ltr />
              <InfoItem
                label="كلمة المرور المؤقتة"
                value={activation.temporaryPassword ? <span className="font-mono text-emerald-700">{activation.temporaryPassword}</span> : 'غير متاحة — استخدم إعادة تعيين كلمة المرور'}
                ltr
              />
              <InfoItem label="كود التفعيل" value={activation.activationCode} ltr />
              <InfoItem label="الباقة" value={activation.planName} />
              <InfoItem label="مفتاح الترخيص" value={activation.licenseKey} ltr />
              <InfoItem label="انتهاء الترخيص" value={formatDate(activation.licenseExpiresAt)} />
              <InfoItem label="رابط الدخول" value={<span className="font-mono text-[10.5px]">{activation.loginUrl}</span>} ltr />
              <InfoItem label="تاريخ التجهيز" value={formatDateTime(activation.generatedAt)} />
            </div>
            {activation.modules.length > 0 && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="mb-1.5 text-[10.5px] font-semibold text-slate-500">الوحدات المضمنة</p>
                <div className="flex flex-wrap gap-1">
                  {activation.modules.map((module) => (
                    <span key={module} className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200" dir="ltr">
                      {module}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="mb-2 text-[10.5px] font-semibold text-slate-500">وسائل الإرسال</p>
              <div className="flex flex-wrap gap-3">
                {['EMAIL', 'SMS', 'WHATSAPP'].map((channel) => (
                  <label key={channel} className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={channels.includes(channel)}
                      onChange={(event) => setChannels((current) => event.target.checked
                        ? [...current, channel]
                        : current.filter((item) => item !== channel))}
                    />
                    {channel === 'EMAIL' ? 'بريد إلكتروني' : channel === 'SMS' ? 'رسالة SMS' : 'واتساب'}
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* User directory */}
      <Modal
        open={userOpen}
        onClose={() => setUserOpen(false)}
        title={editingUser ? 'تعديل مستخدم' : 'إضافة مستخدم للعميل'}
        description="سجّل مستخدمي العميل (مسؤول، كاشير، ...) لإدارتهم من لوحة المنصة."
        size="md"
        busy={working}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setUserOpen(false)} disabled={working}>إلغاء</Button>
            <Button variant="primary" onClick={saveUser} loading={working} disabled={!canManageTenants}>{editingUser ? 'حفظ' : 'إضافة'}</Button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="الاسم الكامل" required>
            <input className={inputClass} value={userForm.fullName} onChange={(event) => setUserForm({ ...userForm, fullName: event.target.value })} />
          </Field>
          <Field label="اسم المستخدم">
            <input className={inputClass} dir="ltr" value={userForm.username} onChange={(event) => setUserForm({ ...userForm, username: event.target.value })} />
          </Field>
          <Field label="البريد الإلكتروني">
            <input className={inputClass} dir="ltr" type="email" value={userForm.email} onChange={(event) => setUserForm({ ...userForm, email: event.target.value })} />
          </Field>
          <Field label="الهاتف">
            <input className={inputClass} dir="ltr" value={userForm.phone} onChange={(event) => setUserForm({ ...userForm, phone: event.target.value })} />
          </Field>
          <Field label="الدور">
            <input className={inputClass} value={userForm.role} onChange={(event) => setUserForm({ ...userForm, role: event.target.value })} placeholder="ADMIN / CASHIER / USER" />
          </Field>
          <Field label="الحالة">
            <select className={inputClass} value={userForm.status} onChange={(event) => setUserForm({ ...userForm, status: event.target.value })}>
              <option value="ACTIVE">نشط</option>
              <option value="SUSPENDED">موقوف</option>
              <option value="INVITED">مدعو</option>
            </select>
          </Field>
          <Field label="ملاحظات" className="sm:col-span-2">
            <textarea rows={2} className={inputClass} value={userForm.notes} onChange={(event) => setUserForm({ ...userForm, notes: event.target.value })} />
          </Field>
        </div>
      </Modal>

      {/* Bulk Action Modal */}
      <Modal
        open={bulkActionOpen}
        onClose={() => setBulkActionOpen(false)}
        title={bulkActionType === 'status' ? 'تغيير حالة العملاء المحددين' :
               bulkActionType === 'plan' ? 'تغيير باقة العملاء المحددين' :
               bulkActionType === 'activation' ? 'إرسال بيانات تفعيل للعملاء المحددين' :
               'تصدير بيانات العملاء'}
        description={`سيتم تطبيق العملية على ${selectedIds.size} عميل.`}
        size="md"
        busy={bulkWorking}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setBulkActionOpen(false)} disabled={bulkWorking}>إلغاء</Button>
            <Button variant="primary" onClick={executeBulkAction} loading={bulkWorking} disabled={!canManageTenants}>
              {bulkActionType === 'status' ? 'تطبيق الحالة' :
               bulkActionType === 'plan' ? 'تطبيق الباقة' :
               bulkActionType === 'activation' ? 'إرسال التفعيل' : 'تصدير'}
            </Button>
          </div>
        }
      >
        {bulkActionType === 'status' && (
          <div className="grid gap-3">
            <Field label="الحالة الجديدة">
              <select className={inputClass} value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value as PlatformTenantStatus)}>
                {STATUSES.map((value) => <option key={value} value={value}>{PLATFORM_TENANT_STATUS_LABELS[value]}</option>)}
              </select>
            </Field>
            <p className="text-[11px] text-amber-700">سيتم تحديث حالة العميل والتراخيص والاشتراكات المرتبطة.</p>
          </div>
        )}
        {bulkActionType === 'plan' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="الباقة الجديدة" className="sm:col-span-2">
              <select className={inputClass} value={bulkPlanId} onChange={(e) => setBulkPlanId(e.target.value)}>
                <option value="">اختر الباقة</option>
                {plans.filter((plan) => plan.isActive).map((plan) => (
                  <option key={plan.id} value={plan.id}>{plan.name} — {formatMoney(plan.price, plan.currency)}</option>
                ))}
              </select>
            </Field>
            <Field label="المدة (أشهر)">
              <input type="number" min={1} className={inputClass} value={bulkMonths} onChange={(e) => setBulkMonths(Math.max(1, Number(e.target.value)))} />
            </Field>
            <p className="text-[11px] text-amber-700 sm:col-span-2">سيتم إلغاء التراخيص والاشتراكات الحالية وإصدار تراخيص جديدة بالباقة المختارة.</p>
          </div>
        )}
        {bulkActionType === 'activation' && (
          <div className="grid gap-3">
            <p className="text-[11px] font-semibold text-slate-700">وسائل الإرسال</p>
            <div className="flex flex-wrap gap-3">
              {['EMAIL', 'SMS', 'WHATSAPP'].map((channel) => (
                <label key={channel} className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={bulkChannels.includes(channel)}
                    onChange={(event) => setBulkChannels((current) => event.target.checked
                      ? [...current, channel]
                      : current.filter((item) => item !== channel))}
                  />
                  {channel === 'EMAIL' ? 'بريد إلكتروني' : channel === 'SMS' ? 'رسالة SMS' : 'واتساب'}
                </label>
              ))}
            </div>
          </div>
        )}
        {bulkActionType === 'export' && (
          <p className="text-[11px] text-slate-600">سيتم تصدير بيانات العملاء المحددين إلى ملف CSV.</p>
        )}
      </Modal>

      {/* CSV Import Modal */}
      <Modal
        open={csvImportOpen}
        onClose={() => { setCsvImportOpen(false); setCsvFile(null); setCsvPreview([]); }}
        title="استيراد عملاء من CSV"
        description="ارفع ملف CSV لإنشاء أو تحديث عملاء بشكل مجمّع. الأعمدة المطلوبة: اسم، كود (اختياري)."
        size="lg"
        busy={csvImporting}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setCsvImportOpen(false); setCsvFile(null); setCsvPreview([]); }} disabled={csvImporting}>إلغاء</Button>
            <Button variant="primary" onClick={executeCsvImport} loading={csvImporting} disabled={!csvFile || csvImporting}>
              استيراد
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <input
              type="file"
              accept=".csv"
              onChange={handleCsvFileSelect}
              className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-lg file:border-0 file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
              disabled={csvImporting}
            />
            <p className="mt-2 text-[10.5px] text-slate-500">تنسيق CSV مدعوم: أعمدة بالعربية أو الإنجليزية. سيستخدم الكود لتحديث العميل إن وجد، وإلا سينشئ جديد.</p>
          </div>
          {csvPreview.length > 0 && (
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <p className="px-3 py-2 text-[10.5px] font-semibold text-slate-700 bg-slate-50 border-b">معاينة أول 5 أسطر:</p>
              <div className="overflow-x-auto max-h-48">
                <table className="w-full min-w-[600px] text-right text-sm">
                  <thead className="bg-slate-50 text-[10px] text-slate-500">
                    <tr>{csvPreview[0].map((h, i) => <th key={i} className="px-3 py-2">{h || `عمود ${i+1}`}</th>)}</tr>
                  </thead>
                  <tbody>
                    {csvPreview.slice(1).map((row, ri) => (
                      <tr key={ri} className="border-t border-slate-100">
                        {row.map((cell, ci) => <td key={ci} className="px-3 py-1.5 text-[10.5px]">{cell}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={branchOpen}
        onClose={() => setBranchOpen(false)}
        title="إضافة فرع للعميل"
        description="الفروع تُحتسب ضمن حد الفروع المسموح للباقة."
        size="md"
        busy={working}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setBranchOpen(false)} disabled={working}>إلغاء</Button>
            <Button variant="primary" onClick={saveBranch} loading={working} disabled={!canManageTenants}>إضافة الفرع</Button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="كود الفرع" required>
            <input className={inputClass} dir="ltr" value={branchForm.code} onChange={(e) => setBranchForm({ ...branchForm, code: e.target.value })} />
          </Field>
          <Field label="اسم الفرع" required>
            <input className={inputClass} value={branchForm.name} onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })} />
          </Field>
          <Field label="المدينة">
            <input className={inputClass} value={branchForm.city} onChange={(e) => setBranchForm({ ...branchForm, city: e.target.value })} />
          </Field>
          <Field label="الهاتف">
            <input className={inputClass} dir="ltr" value={branchForm.phone} onChange={(e) => setBranchForm({ ...branchForm, phone: e.target.value })} />
          </Field>
          <Field label="حد المقاعد">
            <input type="number" min={1} className={inputClass} value={branchForm.seatsLimit} onChange={(e) => setBranchForm({ ...branchForm, seatsLimit: Number(e.target.value) })} />
          </Field>
          <Field label="حد الأجهزة">
            <input type="number" min={1} className={inputClass} value={branchForm.devicesLimit} onChange={(e) => setBranchForm({ ...branchForm, devicesLimit: Number(e.target.value) })} />
          </Field>
          <label className="flex items-center gap-2 text-[12px] font-semibold text-slate-700 sm:col-span-2">
            <input type="checkbox" checked={branchForm.isMain} onChange={(e) => setBranchForm({ ...branchForm, isMain: e.target.checked })} />
            الفرع الرئيسي للعميل
          </label>
        </div>
      </Modal>

    </div>
  );
};

const ArrowRightIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M4 12h16" />
  </svg>
);

export default PlatformTenantsPage;
