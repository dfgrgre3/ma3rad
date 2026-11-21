import React from 'react';
import {
  Archive,
  Ban,
  CalendarClock,
  CheckCircle2,
  Cpu,
  CreditCard,
  Eye,
  KeyRound,
  Layers3,
  LayoutGrid,
  LockKeyhole,
  RefreshCw,
  ScrollText,
  ShieldCheck,
  UserPlus,
  Users,
  Webhook,
  XCircle,
} from 'lucide-react';
import { PLATFORM_TENANT_STATUS_LABELS } from '../../../services/domains/platform/PlatformAdminService';
import type {
  PlatformDevice,
  PlatformPlan,
  PlatformSubscription,
  PlatformTenant,
  PlatformTenantAccount,
  PlatformTenantOverride,
  PlatformTenantOverrideInput,
  PlatformTenantProfile,
  PlatformTenantStatus,
  PlatformTenantUser,
} from '../../../services/domains/platform/platformTypes';
import type { TenantBranch } from './shared';
import { Avatar, daysUntil, healthTone } from './shared';
import { Button } from '../../../components/ui/Button';
import { StatusBadge, formatDate, formatNumber } from '../components/PlatformUI';
import { ACCOUNT_STATUS } from './constants';
import type { TabKey } from './constants';
import { OverviewTab } from './OverviewTab';
import { SubscriptionTab } from './SubscriptionTab';
import { LicensesTab } from './LicensesTab';
import { BillingTab } from './BillingTab';
import { UsersTab } from './UsersTab';
import { LogsTab } from './LogsTab';
import { RemoteTab } from './RemoteTab';
import { AccessTab } from './AccessTab';
import { TenantApiTab } from './TenantApiTab';

const TABS: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
  { key: 'overview', label: 'نظرة عامة', icon: <Eye className="h-3.5 w-3.5" /> },
  { key: 'access', label: 'الوصول والصفحات', icon: <ShieldCheck className="h-3.5 w-3.5" /> },
  { key: 'api', label: 'API العميل', icon: <Webhook className="h-3.5 w-3.5" /> },
  { key: 'subscription', label: 'الاشتراك والباقة', icon: <CalendarClock className="h-3.5 w-3.5" /> },
  { key: 'licenses', label: 'التراخيص والتفعيلات', icon: <KeyRound className="h-3.5 w-3.5" /> },
  { key: 'billing', label: 'المدفوعات والفواتير', icon: <CreditCard className="h-3.5 w-3.5" /> },
  { key: 'logs', label: 'السجلات والنشاط', icon: <ScrollText className="h-3.5 w-3.5" /> },
  { key: 'users', label: 'مستخدمو العميل', icon: <Users className="h-3.5 w-3.5" /> },
  { key: 'remote', label: 'التحكم عن بعد', icon: <Cpu className="h-3.5 w-3.5" /> },
];

const HealthRing: React.FC<{ score: number }> = ({ score }) => {
  const radius = 15;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const tone = healthTone(clamped);
  const strokeClass = tone.bar === 'bg-success' ? 'stroke-success' : tone.bar === 'bg-warning' ? 'stroke-warning' : 'stroke-danger';
  return (
    <svg viewBox="0 0 36 36" className="h-9 w-9 -rotate-90" aria-hidden="true">
      <circle cx="18" cy="18" r={radius} fill="none" strokeWidth="4" className="stroke-surface-sunken" />
      <circle
        cx="18" cy="18" r={radius} fill="none" strokeWidth="4" strokeLinecap="round"
        className={strokeClass}
        strokeDasharray={circumference}
        strokeDashoffset={circumference - (clamped / 100) * circumference}
      />
    </svg>
  );
};

export interface TenantDetailContentProps {
  tenant: PlatformTenant | null;
  profile: PlatformTenantProfile | null;
  account: PlatformTenantAccount | null;
  subscription: PlatformSubscription | null;
  healthChecks: Array<{ label: string; ok: boolean }>;
  healthScore: number;
  working: boolean;
  canManageTenants: boolean;
  centralActive: boolean;
  tab: TabKey;
  setTab: React.Dispatch<React.SetStateAction<TabKey>>;
  sendActivation: () => void;
  resetPassword: () => void;
  toggleAccount: (active: boolean) => void;
  changeStatus: (tenant: PlatformTenant, next: PlatformTenantStatus) => void;
  resetDevices: () => void;
  cancelSubscription: () => void;
  archive: (tenant: PlatformTenant) => void;
  copyToClipboard: (text: string, label: string) => Promise<void>;
  setAccountOpen: React.Dispatch<React.SetStateAction<boolean>>;
  openAccountEdit: () => void;
  branches: TenantBranch[];
  setBranchOpen: React.Dispatch<React.SetStateAction<boolean>>;
  closeBranch: (branchId: string) => void;
  overrides: PlatformTenantOverride[];
  overrideForm: PlatformTenantOverrideInput;
  setOverrideForm: React.Dispatch<React.SetStateAction<PlatformTenantOverrideInput>>;
  addOverride: () => void;
  removeOverride: (id: string) => void;
  plans: PlatformPlan[];
  renewMonths: number;
  setRenewMonths: React.Dispatch<React.SetStateAction<number>>;
  renewSubscription: () => void;
  planForm: { planId: string; months: number; seats: number };
  setPlanForm: React.Dispatch<React.SetStateAction<{ planId: string; months: number; seats: number }>>;
  changePlan: () => void;
  users: PlatformTenantUser[];
  openUserCreate: () => void;
  openUserEdit: (user: PlatformTenantUser) => void;
  toggleUser: (user: PlatformTenantUser, active: boolean) => void;
  deleteUser: (user: PlatformTenantUser) => void;
  remoteControlData: {
    tenant: any;
    appliedConfig: any;
    configPushHistory: any[];
    devices: any[];
    lastSync: any;
  } | null;
  loadRemoteControlData: () => void;
  configSending: boolean;
  forceSync: () => void;
  forceSyncWorking: boolean;
  remoteDevices: PlatformDevice[];
  selectedDeviceIds: string[];
  setSelectedDeviceIds: React.Dispatch<React.SetStateAction<string[]>>;
  toggleDeviceStatus: (device: PlatformDevice) => void;
  configForm: { key: string; value: string; scope: string; targetDeviceIds: string[] };
  setConfigForm: React.Dispatch<React.SetStateAction<{ key: string; value: string; scope: string; targetDeviceIds: string[] }>>;
  pushConfig: () => void;
  remoteConfig: any[];
  remoteHistory: any[];
  onOpenCatalog?: () => void;
}

export const TenantDetailContent: React.FC<TenantDetailContentProps> = ({
  tenant,
  profile,
  account,
  subscription,
  healthChecks,
  healthScore,
  working,
  canManageTenants,
  centralActive,
  tab,
  setTab,
  sendActivation,
  resetPassword,
  toggleAccount,
  changeStatus,
  resetDevices,
  cancelSubscription,
  archive,
  copyToClipboard,
  setAccountOpen,
  openAccountEdit,
  branches,
  setBranchOpen,
  closeBranch,
  overrides,
  overrideForm,
  setOverrideForm,
  addOverride,
  removeOverride,
  plans,
  renewMonths,
  setRenewMonths,
  renewSubscription,
  planForm,
  setPlanForm,
  changePlan,
  users,
  openUserCreate,
  openUserEdit,
  toggleUser,
  deleteUser,
  remoteControlData,
  loadRemoteControlData,
  configSending,
  forceSync,
  forceSyncWorking,
  remoteDevices,
  selectedDeviceIds,
  setSelectedDeviceIds,
  toggleDeviceStatus,
  configForm,
  setConfigForm,
  pushConfig,
  remoteConfig,
  remoteHistory,
  onOpenCatalog,
}) => {
  if (!profile || !tenant) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-sm font-semibold text-muted">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-success" />
        جارٍ تحميل ملف العميل...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Hero header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-l from-primary via-primary to-success/90 p-5 text-white shadow-lg">
        <div className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-12 right-1/4 h-32 w-32 rounded-full bg-success/20 blur-2xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3.5">
            <Avatar name={tenant.name} size="xl" tone="bg-white/15 text-white" className="rounded-2xl ring-2 ring-white/30" />
            <div className="min-w-0">
              <p className="text-[10.5px] font-bold uppercase tracking-widest text-white/70">{tenant.businessType || 'نشاط غير محدد'}</p>
              <h3 className="mt-0.5 truncate text-xl font-black">{tenant.name}</h3>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-white/80">
                <span>رقم العميل <b dir="ltr" className="font-mono text-white">{tenant.code}</b></span>
                <span className="text-white/40">·</span>
                <span dir="ltr" className="font-mono">Tenant ID {tenant.id}</span>
                <span className="text-white/40">·</span>
                <span>مسجل {formatDate(tenant.createdAt)}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge value={tenant.status} label={PLATFORM_TENANT_STATUS_LABELS[tenant.status]} />
              <span className={`rounded-full border px-2.5 py-0.5 text-[10.5px] font-bold backdrop-blur ${
                account?.isActive ? 'border-white/30 bg-white/15 text-white' : 'border-danger/50 bg-danger/30 text-white'
              }`}>
                الحساب: {account ? ACCOUNT_STATUS(account.isActive) : 'غير منشأ'}
              </span>
              {tenant.planName && (
                <span className="rounded-full border border-white/30 bg-white/15 px-2.5 py-0.5 text-[10.5px] font-bold text-white">
                  {tenant.planName}
                </span>
              )}
            </div>
            {(() => {
              const days = daysUntil(tenant.subscriptionExpiresAt);
              if (days === null) return null;
              const overdue = days < 0;
              const soon = days <= 30;
              return (
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${
                  overdue ? 'bg-danger text-white' : soon ? 'bg-warning text-white' : 'bg-white/15 text-white'
                }`}>
                  {overdue ? `الاشتراك منتهي منذ ${formatNumber(Math.abs(days))} يوم` : days === 0 ? 'الاشتراك ينتهي اليوم' : `الاشتراك ينتهي خلال ${formatNumber(days)} يوم`}
                </span>
              );
            })()}
          </div>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <div className="rounded-2xl border border-line bg-surface p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <p className="flex items-center gap-1.5 text-[10px] font-bold text-muted"><Cpu className="h-3.5 w-3.5" /> الأجهزة</p>
          <p className="mt-1 text-lg font-black text-ink">
            {formatNumber(profile.usage.devicesUsed)} <span className="text-[11px] font-semibold text-muted">/ {formatNumber(profile.usage.devicesLimit)}</span>
          </p>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
            <div
              className={`h-full rounded-full ${profile.usage.devicesUsed >= profile.usage.devicesLimit ? 'bg-danger' : 'bg-success'}`}
              style={{ width: `${Math.min(100, profile.usage.devicesLimit ? (profile.usage.devicesUsed / profile.usage.devicesLimit) * 100 : 0)}%` }}
            />
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <p className="flex items-center gap-1.5 text-[10px] font-bold text-muted"><Layers3 className="h-3.5 w-3.5" /> الفروع</p>
          <p className="mt-1 text-lg font-black text-ink">
            {formatNumber(profile.usage.branchesUsed)} <span className="text-[11px] font-semibold text-muted">/ {formatNumber(profile.usage.branchesLimit)}</span>
          </p>
          <p className="mt-1 text-[9.5px] font-semibold text-muted">فروع مستخدمة / المسموح</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <p className="flex items-center gap-1.5 text-[10px] font-bold text-muted"><KeyRound className="h-3.5 w-3.5" /> التراخيص</p>
          <p className="mt-1 text-lg font-black text-ink">{formatNumber(profile.licenses.length)}</p>
          <p className="mt-1 text-[9.5px] font-semibold text-muted">
            {tenant.activeLicenses ? `${formatNumber(tenant.activeLicenses)} ساري · ${formatNumber(profile.usage.modulesCount)} وحدة` : `${formatNumber(profile.usage.modulesCount)} وحدة مفعّلة`}
          </p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <p className="flex items-center gap-1.5 text-[10px] font-bold text-muted"><ShieldCheck className="h-3.5 w-3.5" /> صحة العميل</p>
          <div className="mt-1 flex items-center gap-2">
            <HealthRing score={healthScore} />
            <div>
              <p className={`text-[13px] font-black ${healthTone(healthScore).text}`}>{healthScore}%</p>
              <p className="text-[9.5px] font-bold text-muted">{healthTone(healthScore).label}</p>
            </div>
          </div>
          <p className="mt-1 text-[9.5px] font-semibold text-muted">{healthChecks.filter((c) => c.ok).length}/{healthChecks.length} فحوصات ناجحة</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface-muted/60 p-2.5">
        {!account ? (
          canManageTenants ? (
            <Button variant="secondary" size="sm" leadingIcon={<UserPlus className="h-3.5 w-3.5" />} onClick={() => setAccountOpen(true)}>
              إنشاء حساب للعميل
            </Button>
          ) : null
        ) : (
          <>
            <Button variant="secondary" size="sm" leadingIcon={<UserPlus className="h-3.5 w-3.5" />} onClick={openAccountEdit} disabled={!canManageTenants}>
              تعديل الحساب
            </Button>
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
        {onOpenCatalog && (
          <Button variant="secondary" size="sm" leadingIcon={<LayoutGrid className="h-3.5 w-3.5" />} onClick={onOpenCatalog} disabled={!canManageTenants}>
            الصفحات والمميزات
          </Button>
        )}
        <Button variant="ghost" size="sm" leadingIcon={<Archive className="h-3.5 w-3.5" />} onClick={() => archive(tenant)} loading={working} disabled={!canManageTenants} className="mr-auto text-danger/80 hover:text-danger">
          أرشفة العميل
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 rounded-2xl border border-line bg-surface-muted/70 p-1.5">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[11.5px] font-bold transition ${
              tab === item.key
                ? 'bg-surface text-primary shadow-sm ring-1 ring-primary/30'
                : 'text-ink-secondary hover:bg-surface/70 hover:text-ink'
            }`}
          >
            {item.icon} {item.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <OverviewTab
          tenant={tenant}
          profile={profile}
          account={account}
          subscription={subscription}
          centralActive={centralActive}
          branches={branches}
          canManageTenants={canManageTenants}
          working={working}
          setBranchOpen={setBranchOpen}
          closeBranch={closeBranch}
          healthChecks={healthChecks}
          healthScore={healthScore}
          sendActivation={sendActivation}
          copyToClipboard={copyToClipboard}
          setAccountOpen={setAccountOpen}
          overrides={overrides}
          overrideForm={overrideForm}
          setOverrideForm={setOverrideForm}
          addOverride={addOverride}
          removeOverride={removeOverride}
        />
      )}

      {tab === 'subscription' && (
        <SubscriptionTab
          tenant={tenant}
          profile={profile}
          plans={plans}
          renewMonths={renewMonths}
          setRenewMonths={setRenewMonths}
          renewSubscription={renewSubscription}
          working={working}
          canManageTenants={canManageTenants}
          planForm={planForm}
          setPlanForm={setPlanForm}
          changePlan={changePlan}
        />
      )}

      {tab === 'licenses' && (
        <LicensesTab
          profile={profile}
          working={working}
          canManageTenants={canManageTenants}
          resetDevices={resetDevices}
          copyToClipboard={copyToClipboard}
        />
      )}

      {tab === 'billing' && (
        <BillingTab profile={profile} tenant={tenant} />
      )}

      {tab === 'users' && (
        <UsersTab
          users={users}
          canManageTenants={canManageTenants}
          openUserCreate={openUserCreate}
          openUserEdit={openUserEdit}
          toggleUser={toggleUser}
          deleteUser={deleteUser}
        />
      )}

      {tab === 'logs' && (
        <LogsTab profile={profile} />
      )}

      {tab === 'access' && (
        <AccessTab
          tenant={tenant}
          profile={profile}
          overrides={overrides}
          canManageTenants={canManageTenants}
        />
      )}

      {tab === 'api' && (
        <TenantApiTab
          tenant={tenant}
          canManageTenants={canManageTenants}
        />
      )}

      {tab === 'remote' && (
        <RemoteTab
          remoteControlData={remoteControlData}
          loadRemoteControlData={loadRemoteControlData}
          configSending={configSending}
          forceSync={forceSync}
          forceSyncWorking={forceSyncWorking}
          canManageTenants={canManageTenants}
          centralActive={centralActive}
          remoteDevices={remoteDevices}
          selectedDeviceIds={selectedDeviceIds}
          setSelectedDeviceIds={setSelectedDeviceIds}
          toggleDeviceStatus={toggleDeviceStatus}
          configForm={configForm}
          setConfigForm={setConfigForm}
          pushConfig={pushConfig}
          remoteConfig={remoteConfig}
          remoteHistory={remoteHistory}
        />
      )}
    </div>
  );
};

export default TenantDetailContent;
