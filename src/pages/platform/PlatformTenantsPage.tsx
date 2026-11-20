import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Building2, Download, Plus, Upload } from 'lucide-react';
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
import { emptyAccountForm, emptyForm, type CreatedAccountInfo, type NewAccountForm } from './PlatformTenantsPage/constants';
import { useTenantDetail } from './PlatformTenantsPage/useTenantDetail';
import { useTenantBulk } from './PlatformTenantsPage/useTenantBulk';
import { useCsvImport } from './PlatformTenantsPage/useCsvImport';
import { useRemoteControl } from './PlatformTenantsPage/useRemoteControl';
import { TenantListSection } from './PlatformTenantsPage/TenantListSection';
import { TenantStatsSection } from './PlatformTenantsPage/TenantStatsSection';
import { TenantFormModal } from './PlatformTenantsPage/TenantFormModal';
import { TenantDetailModal } from './PlatformTenantsPage/TenantDetailModal';
import { AccountModal } from './PlatformTenantsPage/AccountModal';
import { ActivationModal } from './PlatformTenantsPage/ActivationModal';
import { UserModal } from './PlatformTenantsPage/UserModal';
import { BulkActionModal } from './PlatformTenantsPage/BulkActionModal';
import { CsvImportModal } from './PlatformTenantsPage/CsvImportModal';
import { BranchModal } from './PlatformTenantsPage/BranchModal';
import { TenantCatalogWizard, TenantCreatedModal } from './PlatformTenantsPage/TenantCatalogWizard';

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
  const [accountForm, setAccountForm] = React.useState<NewAccountForm>(emptyAccountForm);
  const [saving, setSaving] = React.useState(false);
  const [createdTenant, setCreatedTenant] = React.useState<PlatformTenant | null>(null);
  const [createdAccount, setCreatedAccount] = React.useState<CreatedAccountInfo | null>(null);
  const [catalogTenant, setCatalogTenant] = React.useState<PlatformTenant | null>(null);
  const [catalogOpen, setCatalogOpen] = React.useState(false);

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

  const [searchParams, setSearchParams] = useSearchParams();
  React.useEffect(() => {
    const presetStatus = searchParams.get('status');
    if (presetStatus) setStatus(presetStatus);
    if (searchParams.get('new') === '1' && canManageTenants) {
      setEditing(null);
      setForm({ ...emptyForm, planId: plans.find((plan) => plan.isDefault)?.id ?? plans[0]?.id ?? '' });
      setAccountForm(emptyAccountForm);
      setFormOpen(true);
    }
    if (presetStatus || searchParams.get('new') === '1') {
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, canManageTenants, plans]);

  const detail = useTenantDetail({ plans, centralActive, canManageTenants, load });
  const bulk = useTenantBulk({ tenants, centralActive, detailId: detail.detailId, loadProfile: detail.loadProfile, load });
  const csv = useCsvImport({ plans, centralActive, load });
  const remote = useRemoteControl({ detailId: detail.detailId, tab: detail.tab, centralActive, run: detail.run });

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, planId: plans.find((plan) => plan.isDefault)?.id ?? plans[0]?.id ?? '' });
    setAccountForm(emptyAccountForm);
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

  const createAccountForTenant = (tenant: PlatformTenant): Promise<CreatedAccountInfo> => {
    const input = {
      username: accountForm.username.trim() || undefined,
      email: accountForm.email.trim() || tenant.email || undefined,
      fullName: accountForm.fullName.trim() || tenant.contactName || tenant.name,
      password: accountForm.password || undefined,
    };
    if (centralActive) {
      return centralPlatformClient.createTenantAccount(tenant.id, input).then((result: any) => ({
        username: result?.account?.username ?? input.username ?? '',
        temporaryPassword: result?.temporaryPassword ?? null,
        activationCode: result?.activationCode ?? result?.account?.activationCode ?? null,
        loginUrl: `${window.location.origin}/login`,
      }));
    }
    const details = platformAdminService.createTenantAccount(tenant.id, input);
    return Promise.resolve({
      username: details.username,
      temporaryPassword: details.temporaryPassword ?? null,
      activationCode: details.activationCode,
      loginUrl: details.loginUrl,
    });
  };

  const save = () => {
    setSaving(true);
    const fail = (err: unknown) => {
      toast.error('تعذر حفظ العميل', err instanceof Error ? err.message : undefined);
      setSaving(false);
    };
    const finishCreate = (created: PlatformTenant) => {
      const done = (account: CreatedAccountInfo | null, accountError?: unknown) => {
        if (accountError) {
          toast.error('تم إنشاء العميل لكن تعذر إنشاء حساب الدخول', accountError instanceof Error ? accountError.message : undefined);
        }
        setCreatedAccount(account);
        setCreatedTenant(created);
        setFormOpen(false);
        load();
        setSaving(false);
      };
      if (!accountForm.enabled) {
        done(null);
        return;
      }
      createAccountForTenant(created).then((account) => done(account)).catch((err) => done(null, err));
    };
    const finishEdit = () => {
      setFormOpen(false);
      if (detail.detailId && editing?.id === detail.detailId) detail.loadProfile(detail.detailId);
      load();
      setSaving(false);
    };
    if (centralActive) {
      const request = editing
        ? centralPlatformClient.updateTenant(editing.id, form as Record<string, any>)
        : centralPlatformClient.createTenant(form);
      request
        .then((result: any) => {
          if (editing) {
            toast.success('تم تحديث بيانات العميل');
            finishEdit();
          } else {
            toast.success('تمت إضافة العميل بنجاح');
            finishCreate(result as PlatformTenant);
          }
        })
        .catch(fail);
      return;
    }
    try {
      if (editing) {
        platformAdminService.updateTenant(editing.id, form);
        toast.success('تم تحديث بيانات العميل');
        finishEdit();
      } else {
        const created = platformAdminService.createTenant(form);
        toast.success('تمت إضافة العميل بنجاح');
        finishCreate(created);
      }
    } catch (err) {
      fail(err);
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
            {canManageTenants && (<Button variant="ghost" size="sm" leadingIcon={<Upload className="h-3.5 w-3.5" />} onClick={() => csv.setCsvImportOpen(true)}>
              استيراد CSV
            </Button>)}
            {canManageTenants && (
              <Button variant="primary" size="sm" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={openCreate}>
                عميل جديد
              </Button>
            )}    </div>
        }
      />

      <TenantStatsSection tenants={tenants} activeStatus={status} onSelectStatus={setStatus} />

      <TenantListSection
        search={search}
        setSearch={setSearch}
        status={status}
        setStatus={setStatus}
        planId={planId}
        setPlanId={setPlanId}
        plans={plans}
        tenants={tenants}
        page={page}
        setPage={setPage}
        error={error}
        loading={loading}
        selectedIds={bulk.selectedIds}
        setSelectedIds={bulk.setSelectedIds}
        handleSelectAll={bulk.handleSelectAll}
        handleSelectOne={bulk.handleSelectOne}
        canManageTenants={canManageTenants}
        openProfile={detail.openProfile}
        openEdit={openEdit}
        setBulkActionType={bulk.setBulkActionType}
        setBulkActionOpen={bulk.setBulkActionOpen}
        executeBulkAction={bulk.executeBulkAction}
        showAdvancedFilters={showAdvancedFilters}
        setShowAdvancedFilters={setShowAdvancedFilters}
        dateRange={dateRange}
        setDateRange={setDateRange}
        outstandingRange={outstandingRange}
        setOutstandingRange={setOutstandingRange}
        deviceUtilizationFilter={deviceUtilizationFilter}
        setDeviceUtilizationFilter={setDeviceUtilizationFilter}
        healthScoreFilter={healthScoreFilter}
        setHealthScoreFilter={setHealthScoreFilter}
        filterPresets={filterPresets}
        loadFilterPreset={loadFilterPreset}
        saveFilterPreset={saveFilterPreset}
      />

      <TenantFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editing={editing}
        form={form}
        setForm={setForm}
        plans={plans}
        saving={saving}
        save={save}
        canManageTenants={canManageTenants}
        accountForm={accountForm}
        setAccountForm={setAccountForm}
      />

      <TenantDetailModal
        open={Boolean(detail.detailId)}
        onClose={detail.closeDetail}
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
        exportRows={exportRows}
        openEdit={openEdit}
        sendActivation={detail.sendActivation}
        resetPassword={detail.resetPassword}
        toggleAccount={detail.toggleAccount}
        changeStatus={detail.changeStatus}
        resetDevices={detail.resetDevices}
        cancelSubscription={detail.cancelSubscription}
        archive={detail.archive}
        copyToClipboard={detail.copyToClipboard}
        setAccountOpen={detail.setAccountOpen}
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
        onOpenCatalog={canManageTenants ? () => {
          if (detail.tenant) {
            setCatalogTenant(detail.tenant);
            setCatalogOpen(true);
          }
        } : undefined}
      />

      <TenantCreatedModal
        open={Boolean(createdTenant)}
        tenant={createdTenant}
        account={createdAccount}
        onClose={() => { setCreatedTenant(null); setCreatedAccount(null); }}
        onContinue={() => {
          setCatalogTenant(createdTenant);
          setCreatedTenant(null);
          setCreatedAccount(null);
          setCatalogOpen(true);
        }}
      />

      <TenantCatalogWizard
        open={catalogOpen}
        onClose={() => { setCatalogOpen(false); setCatalogTenant(null); }}
        tenant={catalogTenant}
        plan={plans.find((plan) => plan.id === catalogTenant?.planId) ?? null}
        centralActive={centralActive}
        canManageTenants={canManageTenants}
        onApplied={load}
      />

      <AccountModal
        open={detail.accountOpen}
        onClose={() => detail.setAccountOpen(false)}
        accountForm={detail.accountForm}
        setAccountForm={detail.setAccountForm}
        working={detail.working}
        canManageTenants={canManageTenants}
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

      <BulkActionModal
        open={bulk.bulkActionOpen}
        onClose={() => bulk.setBulkActionOpen(false)}
        bulkActionType={bulk.bulkActionType}
        selectedCount={bulk.selectedIds.size}
        bulkWorking={bulk.bulkWorking}
        executeBulkAction={bulk.executeBulkAction}
        canManageTenants={canManageTenants}
        bulkStatus={bulk.bulkStatus}
        setBulkStatus={bulk.setBulkStatus}
        bulkPlanId={bulk.bulkPlanId}
        setBulkPlanId={bulk.setBulkPlanId}
        plans={plans}
        bulkMonths={bulk.bulkMonths}
        setBulkMonths={bulk.setBulkMonths}
        bulkChannels={bulk.bulkChannels}
        setBulkChannels={bulk.setBulkChannels}
      />

      <CsvImportModal
        open={csv.csvImportOpen}
        onClose={() => { csv.setCsvImportOpen(false); csv.setCsvFile(null); csv.setCsvPreview([]); }}
        csvImporting={csv.csvImporting}
        executeCsvImport={csv.executeCsvImport}
        csvFile={csv.csvFile}
        handleCsvFileSelect={csv.handleCsvFileSelect}
        csvPreview={csv.csvPreview}
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

    </div>
  );
};

export default PlatformTenantsPage;
