import React from 'react';
import {
  Archive,
  Ban,
  CalendarClock,
  CheckCircle2,
  Cpu,
  CreditCard,
  Download,
  Eye,
  KeyRound,
  LayoutGrid,
  LockKeyhole,
  Pencil,
  RefreshCw,
  ScrollText,
  Send,
  ShieldCheck,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react';
import { PLATFORM_TENANT_STATUS_LABELS } from '../../../services/domains/platform/PlatformAdminService';
import type {
  PlatformPlan,
  PlatformTenant,
  PlatformTenantOverride,
  PlatformTenantOverrideInput,
  PlatformTenantProfile,
  PlatformTenantStatus,
} from '../../../services/domains/platform/platformTypes';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { StatusBadge, formatDate } from '../components/PlatformUI';
import { ACCOUNT_STATUS } from './constants';
import type { TabKey } from './constants';
import { OverviewTab } from './OverviewTab';
import { SubscriptionTab } from './SubscriptionTab';
import { LicensesTab } from './LicensesTab';
import { BillingTab } from './BillingTab';
import { UsersTab } from './UsersTab';
import { LogsTab } from './LogsTab';
import { RemoteTab } from './RemoteTab';

const TABS: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
  { key: 'overview', label: 'نظرة عامة', icon: <Eye className="h-3.5 w-3.5" /> },
  { key: 'subscription', label: 'الاشتراك والباقة', icon: <CalendarClock className="h-3.5 w-3.5" /> },
  { key: 'licenses', label: 'التراخيص والتفعيلات', icon: <KeyRound className="h-3.5 w-3.5" /> },
  { key: 'billing', label: 'المدفوعات والفواتير', icon: <CreditCard className="h-3.5 w-3.5" /> },
  { key: 'logs', label: 'السجلات والنشاط', icon: <ScrollText className="h-3.5 w-3.5" /> },
  { key: 'users', label: 'مستخدمو العميل', icon: <Users className="h-3.5 w-3.5" /> },
  { key: 'remote', label: 'التحكم عن بعد', icon: <Cpu className="h-3.5 w-3.5" /> },
];

interface TenantDetailModalProps {
  open: boolean;
  onClose: () => void;
  tenant: PlatformTenant | null;
  profile: PlatformTenantProfile | null;
  account: any;
  subscription: any;
  healthChecks: Array<{ label: string; ok: boolean }>;
  healthScore: number;
  working: boolean;
  canManageTenants: boolean;
  centralActive: boolean;
  tab: TabKey;
  setTab: React.Dispatch<React.SetStateAction<TabKey>>;
  exportRows: () => void;
  openEdit: (tenant: PlatformTenant) => void;
  sendActivation: () => void;
  resetPassword: () => void;
  toggleAccount: (active: boolean) => void;
  changeStatus: (tenant: PlatformTenant, next: PlatformTenantStatus) => void;
  resetDevices: () => void;
  cancelSubscription: () => void;
  archive: (tenant: PlatformTenant) => void;
  copyToClipboard: (text: string, label: string) => Promise<void>;
  setAccountOpen: React.Dispatch<React.SetStateAction<boolean>>;
  branches: any[];
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
  users: any[];
  openUserCreate: () => void;
  openUserEdit: (user: any) => void;
  toggleUser: (user: any, active: boolean) => void;
  deleteUser: (user: any) => void;
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
  remoteDevices: any[];
  selectedDeviceIds: string[];
  setSelectedDeviceIds: React.Dispatch<React.SetStateAction<string[]>>;
  toggleDeviceStatus: (device: any) => void;
  configForm: { key: string; value: string; scope: string; targetDeviceIds: string[] };
  setConfigForm: React.Dispatch<React.SetStateAction<{ key: string; value: string; scope: string; targetDeviceIds: string[] }>>;
  pushConfig: () => void;
  remoteConfig: any[];
  remoteHistory: any[];
  onOpenCatalog?: () => void;
}

export const TenantDetailModal: React.FC<TenantDetailModalProps> = ({
  open,
  onClose,
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
  exportRows,
  openEdit,
  sendActivation,
  resetPassword,
  toggleAccount,
  changeStatus,
  resetDevices,
  cancelSubscription,
  archive,
  copyToClipboard,
  setAccountOpen,
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
}) => (
  <>
      {/* Central customer file */}
      <Modal
        open={open}
        onClose={onClose}
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
          <div className="py-16 text-center text-sm font-semibold text-muted">جارٍ تحميل ملف العميل...</div>
        ) : (
          <div className="space-y-4">
            {/* Header strip */}
            <div className="rounded-xl bg-gradient-to-l from-ink via-ink to-success p-4 text-white">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10.5px] font-bold uppercase tracking-wide text-success">{tenant.businessType || 'نشاط غير محدد'}</p>
                  <h3 className="mt-1 truncate text-lg font-black">{tenant.name}</h3>
                  <p className="mt-1 text-[11px] text-muted">
                    رقم العميل <span dir="ltr" className="font-mono font-bold text-white">{tenant.code}</span>
                    {' · '}Tenant ID <span dir="ltr" className="font-mono">{tenant.id}</span>
                    {' · '}مسجل في {formatDate(tenant.createdAt)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge value={tenant.status} label={PLATFORM_TENANT_STATUS_LABELS[tenant.status]} />
                  <span className={`rounded-full border px-2 py-0.5 text-[10.5px] font-bold ${
                    account?.isActive ? 'border-success/40 bg-success/20 text-success' : 'border-danger/40 bg-danger/20 text-danger'
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
              {onOpenCatalog && (
                <Button variant="secondary" size="sm" leadingIcon={<LayoutGrid className="h-3.5 w-3.5" />} onClick={onOpenCatalog} disabled={!canManageTenants}>
                  الصفحات والمميزات
                </Button>
              )}
              <Button variant="ghost" size="sm" leadingIcon={<Archive className="h-3.5 w-3.5" />} onClick={() => archive(tenant)} loading={working} disabled={!canManageTenants}>
                أرشفة العميل
              </Button>
            </div>

            {/* Tabs */}
            <div className="flex flex-wrap gap-1 rounded-xl border border-line bg-surface-muted p-1">
              {TABS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setTab(item.key)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11.5px] font-bold transition ${
                    tab === item.key ? 'bg-surface text-success shadow-sm ring-1 ring-success' : 'text-ink-secondary hover:bg-surface/70'
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

            {tab === 'remote' && (
              <RemoteTab
                remoteControlData={remoteControlData}
                loadRemoteControlData={loadRemoteControlData}
                configSending={configSending}
                forceSync={forceSync}
                forceSyncWorking={forceSyncWorking}
                canManageTenants={canManageTenants}
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
        )}
      </Modal>
  </>
);
