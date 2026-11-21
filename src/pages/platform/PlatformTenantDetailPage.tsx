import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Building2, Download, Pencil, Send } from 'lucide-react';
import { platformAdminService, PLATFORM_TENANT_STATUS_LABELS } from '../../services/domains/platform/PlatformAdminService';
import { centralPlatformClient } from '../../services/domains/platform/CentralPlatformClient';
import { getCentralDataSourceState } from '../../hooks/platform/useCentralDataSource';
import { canPlatform } from '../../hooks/platform/usePlatformPermission';
import type {
  PlatformPlan,
  PlatformTenant,
  PlatformTenantInput,
} from '../../services/domains/platform/platformTypes';
import { Button } from '../../components/ui/Button';
import { PageHeader } from '../../components/ui/PageHeader';
import { downloadCsv } from './components/PlatformUI';
import { useToast } from '../../components/ui/Toast';
import { emptyAccountForm, emptyForm, isValidEmail, type NewAccountForm } from './PlatformTenantsPage/constants';
import { useTenantDetail } from './PlatformTenantsPage/useTenantDetail';
import { useRemoteControl } from './PlatformTenantsPage/useRemoteControl';
import { TenantDetailContent } from './PlatformTenantsPage/TenantDetailContent';
import { TenantFormModal } from './PlatformTenantsPage/TenantFormModal';
import { AccountModal } from './PlatformTenantsPage/AccountModal';
import { ActivationModal } from './PlatformTenantsPage/ActivationModal';
import { UserModal } from './PlatformTenantsPage/UserModal';
import { BranchModal } from './PlatformTenantsPage/BranchModal';
import { TenantCatalogWizard } from './PlatformTenantsPage/TenantCatalogWizard';

const TENANT_CSV_HEADERS = ['رقم العميل', 'Tenant ID', 'الشركة', 'النشاط', 'المسؤول', 'الهاتف', 'البريد', 'الدولة', 'المدينة', 'العنوان', 'تاريخ التسجيل', 'الباقة', 'الحالة', 'بداية الاشتراك', 'نهاية الاشتراك', 'الأجهزة المسموحة', 'الأجهزة المستخدمة', 'الفروع'];

const tenantCsvRow = (tenant: PlatformTenant): Array<string | number> => [
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
];

export const PlatformTenantDetailPage: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [plans, setPlans] = React.useState<PlatformPlan[]>([]);
  const [plansLoading, setPlansLoading] = React.useState(true);

  const centralState = React.useMemo(() => getCentralDataSourceState(), []);
  const centralActive = centralState.active;
  const canManageTenants = canPlatform('tenants', 'platform.tenants.update');

  const loadPlans = React.useCallback(() => {
    const central = getCentralDataSourceState();
    if (central.misconfigured) {
      setPlans([]);
      setPlansLoading(false);
      return;
    }
    if (central.active) {
      centralPlatformClient.listPlans()
        .then(setPlans)
        .catch(() => setPlans([]))
        .finally(() => setPlansLoading(false));
      return;
    }
    try {
      setPlans(platformAdminService.listPlans());
    } catch {
      setPlans([]);
    } finally {
      setPlansLoading(false);
    }
  }, []);

  React.useEffect(() => { loadPlans(); }, [loadPlans]);

  const detail = useTenantDetail({ plans, centralActive, canManageTenants, load: loadPlans });
  const remote = useRemoteControl({ detailId: detail.detailId, tab: detail.tab, centralActive, run: detail.run });

  // Open the profile for the tenantId in the URL.
  React.useEffect(() => {
    if (!tenantId) {
      navigate('/platform/tenants', { replace: true });
      return;
    }
    detail.setDetailId(tenantId);
    detail.setTab('overview');
    detail.setProfile(null);
    detail.loadProfile(tenantId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  // If the profile failed to load the hook clears detailId — send the user back to the list.
  const hadDetailRef = React.useRef(false);
  React.useEffect(() => {
    if (detail.detailId) {
      hadDetailRef.current = true;
    } else if (hadDetailRef.current && !detail.profile) {
      navigate('/platform/tenants', { replace: true });
    }
  }, [detail.detailId, detail.profile, navigate]);

  // Prefill the account form once the tenant profile arrives (once per tenant).
  const accountSeededRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    const tenant = detail.profile?.tenant;
    if (!tenant || accountSeededRef.current === tenant.id) return;
    accountSeededRef.current = tenant.id;
    detail.setAccountForm({
      username: tenant.code.toLowerCase(),
      email: tenant.email ?? '',
      fullName: tenant.contactName ?? tenant.name,
      password: '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.profile?.tenant?.id]);

  // ─── Edit tenant ────────────────────────────────────────────────────────────
  const [editOpen, setEditOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<PlatformTenant | null>(null);
  const [form, setForm] = React.useState<PlatformTenantInput>(emptyForm);
  const [accountForm, setAccountForm] = React.useState<NewAccountForm>(emptyAccountForm);
  const [saving, setSaving] = React.useState(false);

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
    setEditOpen(true);
  };

  const saveEdit = () => {
    if (saving || !editing) return;
    if (!form.name?.trim()) {
      toast.error('اسم الشركة مطلوب');
      return;
    }
    if (!isValidEmail(form.email)) {
      toast.error('البريد الإلكتروني غير صالح');
      return;
    }
    setSaving(true);
    const fail = (err: unknown) => {
      toast.error('تعذر حفظ العميل', err instanceof Error ? err.message : undefined);
      setSaving(false);
    };
    const done = () => {
      toast.success('تم تحديث بيانات العميل');
      setEditOpen(false);
      detail.loadProfile(editing.id);
      loadPlans();
      setSaving(false);
    };
    if (centralActive) {
      centralPlatformClient.updateTenant(editing.id, form as Record<string, any>)
        .then(done)
        .catch(fail);
      return;
    }
    try {
      platformAdminService.updateTenant(editing.id, form);
      done();
    } catch (err) {
      fail(err);
    }
  };

  // ─── Export ─────────────────────────────────────────────────────────────────
  const exportTenant = (tenant: PlatformTenant) => {
    downloadCsv(`platform-customer-${tenant.code || tenant.id}.csv`, [
      TENANT_CSV_HEADERS,
      tenantCsvRow(tenant),
    ]);
    toast.success('تم تصدير بيانات العميل', tenant.name);
  };

  // ─── Catalog wizard ─────────────────────────────────────────────────────────
  const [catalogOpen, setCatalogOpen] = React.useState(false);
  const [catalogTenant, setCatalogTenant] = React.useState<PlatformTenant | null>(null);

  const tenant = detail.tenant;
  const title = tenant?.name ?? 'ملف العميل';

  return (
    <div className="space-y-4">
      <PageHeader
        title={title}
        description={tenant ? `رقم العميل ${tenant.code} · ${tenant.planName ?? 'بدون باقة'}` : 'جارٍ تحميل ملف العميل...'}
        icon={<Building2 className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" leadingIcon={<ArrowRight className="h-3.5 w-3.5" />} onClick={() => navigate('/platform/tenants')}>
              رجوع للقائمة
            </Button>
            {tenant && canManageTenants && (
              <>
                <Button variant="ghost" size="sm" leadingIcon={<Download className="h-3.5 w-3.5" />} onClick={() => exportTenant(tenant)}>
                  تصدير CSV
                </Button>
                <Button variant="secondary" size="sm" leadingIcon={<Pencil className="h-3.5 w-3.5" />} onClick={() => openEdit(tenant)}>
                  تعديل البيانات
                </Button>
                <Button variant="primary" size="sm" leadingIcon={<Send className="h-3.5 w-3.5" />} onClick={detail.sendActivation} loading={detail.working}>
                  إرسال بيانات التفعيل
                </Button>
              </>
            )}
          </div>
        }
      />

      {plansLoading && !detail.profile ? (
        <div className="flex flex-col items-center gap-3 py-20 text-sm font-semibold text-muted">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-success" />
          جارٍ تحميل ملف العميل...
        </div>
      ) : (
        <TenantDetailContent
          tenant={detail.tenant}
          profile={detail.profile}
          account={detail.account}
          subscription={detail.subscription}
          healthChecks={detail.healthChecks}
          healthScore={detail.healthScore}
          working={detail.working}
          canManageTenants={canManageTenants}
          centralActive={centralActive}
          tab={detail.tab}
          setTab={detail.setTab}
          sendActivation={detail.sendActivation}
          resetPassword={detail.resetPassword}
          toggleAccount={detail.toggleAccount}
          changeStatus={detail.changeStatus}
          resetDevices={detail.resetDevices}
          cancelSubscription={detail.cancelSubscription}
          archive={detail.archive}
          copyToClipboard={detail.copyToClipboard}
          setAccountOpen={detail.setAccountOpen}
          openAccountEdit={detail.openAccountEdit}
          branches={detail.branches}
          setBranchOpen={detail.setBranchOpen}
          closeBranch={detail.closeBranch}
          overrides={detail.overrides}
          overrideForm={detail.overrideForm}
          setOverrideForm={detail.setOverrideForm}
          addOverride={detail.addOverride}
          removeOverride={detail.removeOverride}
          plans={plans}
          renewMonths={detail.renewMonths}
          setRenewMonths={detail.setRenewMonths}
          renewSubscription={detail.renewSubscription}
          planForm={detail.planForm}
          setPlanForm={detail.setPlanForm}
          changePlan={detail.changePlan}
          users={detail.users}
          openUserCreate={detail.openUserCreate}
          openUserEdit={detail.openUserEdit}
          toggleUser={detail.toggleUser}
          deleteUser={detail.deleteUser}
          remoteControlData={remote.remoteControlData}
          loadRemoteControlData={remote.loadRemoteControlData}
          configSending={remote.configSending}
          forceSync={remote.forceSync}
          forceSyncWorking={remote.forceSyncWorking}
          remoteDevices={remote.remoteDevices}
          selectedDeviceIds={remote.selectedDeviceIds}
          setSelectedDeviceIds={remote.setSelectedDeviceIds}
          toggleDeviceStatus={remote.toggleDeviceStatus}
          configForm={remote.configForm}
          setConfigForm={remote.setConfigForm}
          pushConfig={remote.pushConfig}
          remoteConfig={remote.remoteConfig}
          remoteHistory={remote.remoteHistory}
          onOpenCatalog={canManageTenants && tenant ? () => {
            setCatalogTenant(tenant);
            setCatalogOpen(true);
          } : undefined}
        />
      )}

      <TenantFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        editing={editing}
        form={form}
        setForm={setForm}
        plans={plans}
        saving={saving}
        save={saveEdit}
        canManageTenants={canManageTenants}
        accountForm={accountForm}
        setAccountForm={setAccountForm}
      />

      <AccountModal
        open={detail.accountOpen}
        onClose={() => (detail.accountEditing ? detail.closeAccountModal() : detail.setAccountOpen(false))}
        accountForm={detail.accountForm}
        setAccountForm={detail.setAccountForm}
        working={detail.working}
        canManageTenants={canManageTenants}
        editing={detail.accountEditing}
        createAccount={detail.createAccount}
      />

      <ActivationModal
        open={detail.activationOpen && Boolean(detail.activation)}
        onClose={() => detail.setActivationOpen(false)}
        activation={detail.activation}
        copyToClipboard={detail.copyToClipboard}
        sendActivation={detail.sendActivation}
        working={detail.working}
        canManageTenants={canManageTenants}
        channels={detail.channels}
        setChannels={detail.setChannels}
      />

      <UserModal
        open={detail.userOpen}
        onClose={() => detail.setUserOpen(false)}
        editingUser={detail.editingUser}
        userForm={detail.userForm}
        setUserForm={detail.setUserForm}
        working={detail.working}
        canManageTenants={canManageTenants}
        saveUser={detail.saveUser}
      />

      <BranchModal
        open={detail.branchOpen}
        onClose={() => detail.setBranchOpen(false)}
        branchForm={detail.branchForm}
        setBranchForm={detail.setBranchForm}
        working={detail.working}
        canManageTenants={canManageTenants}
        saveBranch={detail.saveBranch}
      />

      <TenantCatalogWizard
        open={catalogOpen}
        onClose={() => { setCatalogOpen(false); setCatalogTenant(null); }}
        tenant={catalogTenant}
        plan={plans.find((plan) => plan.id === catalogTenant?.planId) ?? null}
        centralActive={centralActive}
        canManageTenants={canManageTenants}
        onApplied={() => { if (detail.detailId) detail.loadProfile(detail.detailId); loadPlans(); }}
      />
    </div>
  );
};

export default PlatformTenantDetailPage;
