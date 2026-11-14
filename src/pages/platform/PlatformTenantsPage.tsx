import React from 'react';
import {
  Activity,
  AlertTriangle,
  Archive,
  Ban,
  Building2,
  CalendarClock,
  CheckCircle2,
  Copy,
  CreditCard,
  Download,
  Eye,
  KeyRound,
  Layers3,
  LockKeyhole,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Send,
  Trash2,
  ShieldCheck,
  Smartphone,
  ScrollText,
  UserPlus,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react';
import { platformAdminService, PLATFORM_TENANT_STATUS_LABELS } from '../../services/domains/platform/PlatformAdminService';
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

type TabKey = 'overview' | 'subscription' | 'licenses' | 'billing' | 'logs' | 'users';

const TABS: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
  { key: 'overview', label: 'نظرة عامة', icon: <Eye className="h-3.5 w-3.5" /> },
  { key: 'subscription', label: 'الاشتراك والباقة', icon: <CalendarClock className="h-3.5 w-3.5" /> },
  { key: 'licenses', label: 'التراخيص والتفعيلات', icon: <KeyRound className="h-3.5 w-3.5" /> },
  { key: 'billing', label: 'المدفوعات والفواتير', icon: <CreditCard className="h-3.5 w-3.5" /> },
  { key: 'logs', label: 'السجلات والنشاط', icon: <ScrollText className="h-3.5 w-3.5" /> },
  { key: 'users', label: 'مستخدمو العميل', icon: <Users className="h-3.5 w-3.5" /> },
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
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

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

  const load = React.useCallback(() => {
    setLoading(true);
    try {
      setTenants(platformAdminService.listTenants(search, status));
      setPlans(platformAdminService.listPlans());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل العملاء.');
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  React.useEffect(() => { load(); }, [load]);

  const loadProfile = React.useCallback((id: string) => {
    try {
      const next = platformAdminService.getTenantProfile(id);
      setProfile(next);
      setOverrides(platformAdminService.listTenantOverrides(id));
      setUsers(platformAdminService.listTenantUsers(id));
      setPlanForm((current) => ({
        planId: current.planId || next.tenant.planId || plans.find((plan) => plan.isDefault)?.id || '',
        months: current.months || 12,
        seats: current.seats || next.tenant.seatsLimit,
      }));
    } catch (err) {
      toast.error('تعذر تحميل ملف العميل', err instanceof Error ? err.message : undefined);
      setDetailId(null);
      setProfile(null);
    }
  }, [plans, toast]);

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
    try {
      if (editing) {
        platformAdminService.updateTenant(editing.id, form);
        toast.success('تم تحديث بيانات العميل');
      } else {
        platformAdminService.createTenant(form);
        toast.success('تمت إضافة العميل بنجاح');
      }
      setFormOpen(false);
      if (detailId && editing?.id === detailId) loadProfile(detailId);
      load();
    } catch (err) {
      toast.error('تعذر حفظ العميل', err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
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

  const run = (action: () => void, message: string) => {
    setWorking(true);
    try {
      action();
      toast.success(message);
      refreshDetail();
    } catch (err) {
      toast.error('تعذر تنفيذ العملية', err instanceof Error ? err.message : undefined);
    } finally {
      setWorking(false);
    }
  };

  const changeStatus = (tenant: PlatformTenant, next: PlatformTenantStatus) => {
    run(() => platformAdminService.setTenantStatus(tenant.id, next), `تم تحديث الحالة إلى ${PLATFORM_TENANT_STATUS_LABELS[next]}`);
  };

  const archive = (tenant: PlatformTenant) => {
    if (!window.confirm(`أرشفة العميل "${tenant.name}" وإلغاء كل تراخيصه؟`)) return;
    run(() => platformAdminService.archiveTenant(tenant.id), 'تمت أرشفة العميل');
  };

  const createAccount = () => {
    if (!detailId) return;
    setWorking(true);
    try {
      const created = platformAdminService.createTenantAccount(detailId, {
        username: accountForm.username,
        email: accountForm.email,
        fullName: accountForm.fullName,
        password: accountForm.password || undefined,
      });
      const next = platformAdminService.getTenantProfile(detailId);
      setProfile(next);
      setAccountOpen(false);
      setActivation(buildActivation(next, created.temporaryPassword));
      setActivationOpen(true);
      toast.success('تم إنشاء حساب العميل وتوليد بيانات التفعيل');
      load();
    } catch (err) {
      toast.error('تعذر إنشاء الحساب', err instanceof Error ? err.message : undefined);
    } finally {
      setWorking(false);
    }
  };

  const resetPassword = () => {
    if (!detailId || !profile) return;
    if (!window.confirm('إعادة تعيين كلمة مرور حساب العميل؟ سيتم إنشاء كلمة مرور مؤقتة جديدة.')) return;
    setWorking(true);
    try {
      const reset = platformAdminService.resetTenantAccountPassword(detailId);
      const next = platformAdminService.getTenantProfile(detailId);
      setProfile(next);
      setActivation(buildActivation(next, reset.temporaryPassword));
      setActivationOpen(true);
      toast.success('تم إعادة تعيين كلمة المرور');
    } catch (err) {
      toast.error('تعذر إعادة تعيين كلمة المرور', err instanceof Error ? err.message : undefined);
    } finally {
      setWorking(false);
    }
  };

  const toggleAccount = (active: boolean) => {
    if (!detailId) return;
    run(() => platformAdminService.setTenantAccountActive(detailId, active), active ? 'تم تفعيل حساب العميل' : 'تم تعليق حساب العميل');
  };

  const renewSubscription = () => {
    if (!detailId) return;
    run(
      () => platformAdminService.renewTenantSubscription(detailId, renewMonths),
      `تم تجديد الاشتراك لمدة ${renewMonths} شهر`
    );
  };

  const changePlan = () => {
    if (!detailId || !planForm.planId) return;
    run(
      () => platformAdminService.changeTenantPlan(detailId, planForm.planId, {
        months: planForm.months,
        seats: planForm.seats,
      }),
      'تم نقل العميل إلى الباقة الجديدة وإصدار ترخيص جديد'
    );
  };

  const cancelSubscription = () => {
    if (!detailId || !profile) return;
    if (!window.confirm(`إلغاء اشتراك العميل "${profile.tenant.name}"؟ سيتم إلغاء الاشتراك وإبطال التراخيص وحساب الدخول.`)) return;
    run(() => platformAdminService.cancelTenantSubscription(detailId, 'إلغاء يدوي من لوحة المنصة'), 'تم إلغاء اشتراك العميل');
  };

  const addOverride = () => {
    if (!detailId || !overrideForm.code.trim()) {
      toast.error('أدخل رمز الميزة أو الحد');
      return;
    }
    run(() => platformAdminService.addTenantOverride(detailId, overrideForm), 'تم إضافة ميزة/حد خاص للعميل');
    setOverrideForm({ kind: 'MODULE', code: '', value: '', isEnabled: true });
  };

  const removeOverride = (id: string) => {
    if (!window.confirm('حذف هذا التجاوز الخاص؟')) return;
    run(() => platformAdminService.removeTenantOverride(id), 'تم حذف التجاوز الخاص');
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
    if (!detailId) return;
    setWorking(true);
    try {
      if (editingUser) {
        platformAdminService.updateTenantUser(editingUser.id, { ...userForm, status: userForm.status as any });
        toast.success('تم تحديث المستخدم');
      } else {
        platformAdminService.createTenantUser(detailId, { ...userForm, status: userForm.status as any });
        toast.success('تمت إضافة المستخدم');
      }
      setUserOpen(false);
      refreshDetail();
    } catch (err) {
      toast.error('تعذر حفظ المستخدم', err instanceof Error ? err.message : undefined);
    } finally {
      setWorking(false);
    }
  };

  const toggleUser = (user: any, active: boolean) => {
    run(() => platformAdminService.setTenantUserActive(user.id, active), active ? 'تم تفعيل المستخدم' : 'تم تعليق المستخدم');
  };

  const deleteUser = (user: any) => {
    if (!window.confirm(`حذف المستخدم "${user.fullName}"؟`)) return;
    run(() => platformAdminService.deleteTenantUser(user.id), 'تم حذف المستخدم');
  };

  const resetDevices = () => {
    if (!detailId) return;
    if (!window.confirm('إعادة تعيين الأجهزة المرتبطة بهذا العميل؟ سيتم تحرير كل الأجهزة المربوطة بالتراخيص.')) return;
    setWorking(true);
    try {
      const count = platformAdminService.resetTenantDevices(detailId);
      toast.success('تم إعادة تعيين الأجهزة', `تم تحرير ${formatNumber(count)} جهاز`);
      refreshDetail();
    } catch (err) {
      toast.error('تعذر إعادة تعيين الأجهزة', err instanceof Error ? err.message : undefined);
    } finally {
      setWorking(false);
    }
  };

  const sendActivation = () => {
    if (!detailId) return;
    if (channels.length === 0) {
      toast.error('اختر وسيلة إرسال واحدة على الأقل');
      return;
    }
    setWorking(true);
    try {
      const details = platformAdminService.sendTenantActivation(detailId, channels);
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
            <Button variant="ghost" size="sm" leadingIcon={<Download className="h-3.5 w-3.5" />} onClick={exportRows}>
              تصدير CSV
            </Button>
            <Button variant="primary" size="sm" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={openCreate}>
              عميل جديد
            </Button>
          </div>
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
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">{tenants.length} عميل</span>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-700">{error}</div>
      )}

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
                {tenants.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100 hover:bg-slate-50/60">
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
                        <button
                          type="button"
                          onClick={() => openEdit(item)}
                          className="rounded p-1.5 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700"
                          title="تعديل البيانات"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
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
            <Button variant="primary" onClick={save} loading={saving}>{editing ? 'حفظ التعديلات' : 'إضافة العميل'}</Button>
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
                <Button variant="ghost" size="sm" leadingIcon={<Download className="h-3.5 w-3.5" />} onClick={exportRows}>
                  تصدير القائمة
                </Button>
                <Button variant="secondary" size="sm" leadingIcon={<Pencil className="h-3.5 w-3.5" />} onClick={() => openEdit(tenant)}>
                  تعديل البيانات
                </Button>
                <Button variant="primary" size="sm" leadingIcon={<Send className="h-3.5 w-3.5" />} onClick={sendActivation} loading={working}>
                  إرسال بيانات التفعيل
                </Button>
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
                <Button variant="secondary" size="sm" leadingIcon={<UserPlus className="h-3.5 w-3.5" />} onClick={() => setAccountOpen(true)}>
                  إنشاء حساب للعميل
                </Button>
              ) : (
                <>
                  <Button variant="secondary" size="sm" leadingIcon={<LockKeyhole className="h-3.5 w-3.5" />} onClick={resetPassword} loading={working}>
                    إعادة تعيين كلمة المرور
                  </Button>
                  <Button
                    variant={account.isActive ? 'ghost' : 'success'}
                    size="sm"
                    leadingIcon={account.isActive ? <Ban className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    onClick={() => toggleAccount(!account.isActive)}
                    loading={working}
                  >
                    {account.isActive ? 'تعليق حساب الدخول' : 'تفعيل حساب الدخول'}
                  </Button>
                </>
              )}
              {tenant.status === 'SUSPENDED' ? (
                <Button variant="success" size="sm" leadingIcon={<CheckCircle2 className="h-3.5 w-3.5" />} onClick={() => changeStatus(tenant, 'ACTIVE')} loading={working}>
                  إعادة تفعيل العميل
                </Button>
              ) : (
                <Button variant="ghost" size="sm" leadingIcon={<Ban className="h-3.5 w-3.5" />} onClick={() => changeStatus(tenant, 'SUSPENDED')} loading={working}>
                  تعليق العميل
                </Button>
              )}
              <Button variant="ghost" size="sm" leadingIcon={<RefreshCw className="h-3.5 w-3.5" />} onClick={resetDevices} loading={working}>
                إعادة تعيين الأجهزة
              </Button>
              <Button variant="danger" size="sm" leadingIcon={<XCircle className="h-3.5 w-3.5" />} onClick={cancelSubscription} loading={working}>
                إلغاء الاشتراك
              </Button>
              <Button variant="ghost" size="sm" leadingIcon={<Archive className="h-3.5 w-3.5" />} onClick={() => archive(tenant)} loading={working}>
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
                        <p className="mt-1 text-lg font-black text-slate-800">{formatNumber(profile.usage.branchesLimit)}</p>
                        <p className="mt-1 text-[10px] text-slate-500">حسب الباقة الحالية</p>
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
                        <Button variant="secondary" size="sm" leadingIcon={<Send className="h-3.5 w-3.5" />} onClick={sendActivation} loading={working}>
                          تجهيز بيانات التفعيل
                        </Button>
                        <Button variant="ghost" size="sm" leadingIcon={<Copy className="h-3.5 w-3.5" />} onClick={() => copyToClipboard(account.username, 'اسم المستخدم')}>
                          نسخ اسم المستخدم
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-3 p-3">
                      <p className="text-[11.5px] text-slate-500">لا يوجد حساب دخول لهذا العميل بعد. أنشئ حساباً لتوليد بيانات التفعيل.</p>
                      <Button variant="primary" size="sm" leadingIcon={<UserPlus className="h-3.5 w-3.5" />} onClick={() => setAccountOpen(true)}>
                        إنشاء حساب
                      </Button>
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
                        <Button variant="primary" size="sm" block leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={addOverride} loading={working}>
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
                        <Button variant="success" block leadingIcon={<CheckCircle2 className="h-3.5 w-3.5" />} onClick={renewSubscription} loading={working}>
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
                        <Button variant="primary" block leadingIcon={<ArrowRightIcon />} onClick={changePlan} loading={working} disabled={!planForm.planId}>
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
                    <Button variant="ghost" size="sm" leadingIcon={<RefreshCw className="h-3.5 w-3.5" />} onClick={resetDevices} loading={working}>
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
                    <Button variant="primary" size="sm" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={openUserCreate}>
                      إضافة مستخدم
                    </Button>
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
            <Button variant="primary" leadingIcon={<UserPlus className="h-3.5 w-3.5" />} onClick={createAccount} loading={working}>
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
                <Button variant="primary" leadingIcon={<Send className="h-3.5 w-3.5" />} onClick={sendActivation} loading={working}>
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
            <Button variant="primary" onClick={saveUser} loading={working}>{editingUser ? 'حفظ' : 'إضافة'}</Button>
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

    </div>
  );
};

const ArrowRightIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M4 12h16" />
  </svg>
);

export default PlatformTenantsPage;
