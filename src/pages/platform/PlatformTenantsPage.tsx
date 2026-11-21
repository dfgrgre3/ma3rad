import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
import { emptyAccountForm, emptyForm, isValidEmail, type CreatedAccountInfo, type NewAccountForm } from './PlatformTenantsPage/constants';
import { useTenantBulk } from './PlatformTenantsPage/useTenantBulk';
import { useCsvImport } from './PlatformTenantsPage/useCsvImport';
import { TenantListSection } from './PlatformTenantsPage/TenantListSection';
import { TenantStatsSection } from './PlatformTenantsPage/TenantStatsSection';
import { TenantFormModal } from './PlatformTenantsPage/TenantFormModal';
import { BulkActionModal } from './PlatformTenantsPage/BulkActionModal';
import { CsvImportModal } from './PlatformTenantsPage/CsvImportModal';
import { TenantCatalogWizard, TenantCreatedModal } from './PlatformTenantsPage/TenantCatalogWizard';

export const PlatformTenantsPage: React.FC = () => {
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tenants, setTenants] = React.useState<PlatformTenant[]>([]);
  const [plans, setPlans] = React.useState<PlatformPlan[]>([]);
  // Filters persist in the URL (?q / ?status / ?plan) so views are shareable.
  const [search, setSearch] = React.useState(() => searchParams.get('q') ?? '');
  // Raw input is debounced ~300ms before it hits `search` (and therefore the API).
  const [searchInput, setSearchInput] = React.useState(() => searchParams.get('q') ?? '');
  React.useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);
  const [status, setStatus] = React.useState(() => searchParams.get('status') ?? '');
  const [planId, setPlanId] = React.useState(() => searchParams.get('plan') ?? '');
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

  const loadSeqRef = React.useRef(0);
  const load = React.useCallback(() => {
    const seq = ++loadSeqRef.current;
    setLoading(true);
    const finish = (err?: unknown) => {
      if (seq !== loadSeqRef.current) return; // a newer load superseded this one
      if (err) setError(err instanceof Error ? err.message : 'تعذر تحميل العملاء.');
      else setError(null);
      setPage(1);
      setLoading(false);
    };
    const central = getCentralDataSourceState();
    if (central.misconfigured) {
      finish(new Error('مصدر البيانات مضبوط على «المركزي» لكن جسر الاتصال بالسيرفر غير متاح في هذا الإصدار.'));
      return;
    }
    if (central.active) {
      Promise.all([centralPlatformClient.listTenants(search, status, planId), centralPlatformClient.listPlans()])
        .then(([nextTenants, nextPlans]) => {
          if (seq !== loadSeqRef.current) return;
          setTenants(nextTenants); setPlans(nextPlans); finish();
        })
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

  // One-shot deep link: ?new=1 opens the create form, then the param is removed.
  // Filter params (q/status/plan) are persistent state synced by the effect below.
  React.useEffect(() => {
    if (searchParams.get('new') !== '1') return;
    if (canManageTenants) {
      setEditing(null);
      setForm({ ...emptyForm, planId: plans.find((plan) => plan.isDefault)?.id ?? plans[0]?.id ?? '' });
      setAccountForm(emptyAccountForm);
      setFormOpen(true);
    }
    const next = new URLSearchParams(searchParams);
    next.delete('new');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, canManageTenants, plans]);

  // Keep the URL in sync with the active filters (replace, no history spam).
  // Uses the History API directly so it never triggers router navigations.
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.delete('new');
    if (search) params.set('q', search); else params.delete('q');
    if (status) params.set('status', status); else params.delete('status');
    if (planId) params.set('plan', planId); else params.delete('plan');
    const qs = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`);
  }, [search, status, planId]);

  // ─── Advanced (client-side) filters ────────────────────────────────────────
  // The tenant list is fully loaded client-side, so these filters are applied
  // locally on top of the server-side search/status/plan filters.

  const tenantHealthScore = React.useCallback((tenant: PlatformTenant): number => {
    const checks = [
      tenant.status === 'ACTIVE' || tenant.status === 'TRIAL',
      (tenant.outstanding ?? 0) <= 0,
      !tenant.subscriptionExpiresAt || new Date(tenant.subscriptionExpiresAt).getTime() > Date.now(),
      (tenant.devicesUsed ?? 0) <= tenant.devicesLimit,
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, []);

  const visibleTenants = React.useMemo(() => tenants.filter((tenant) => {
    if (dateRange.from || dateRange.to) {
      const created = tenant.createdAt ? new Date(tenant.createdAt) : null;
      const createdTime = created ? created.getTime() : NaN;
      if (!Number.isFinite(createdTime)) return false;
      if (dateRange.from && createdTime < new Date(`${dateRange.from}T00:00:00`).getTime()) return false;
      if (dateRange.to && createdTime > new Date(`${dateRange.to}T23:59:59.999`).getTime()) return false;
    }
    const outstanding = tenant.outstanding ?? 0;
    const minOutstanding = outstandingRange.min === '' ? null : Number(outstandingRange.min);
    const maxOutstanding = outstandingRange.max === '' ? null : Number(outstandingRange.max);
    if (minOutstanding !== null && Number.isFinite(minOutstanding) && outstanding < minOutstanding) return false;
    if (maxOutstanding !== null && Number.isFinite(maxOutstanding) && outstanding > maxOutstanding) return false;
    if (deviceUtilizationFilter) {
      const pct = tenant.devicesLimit > 0 ? ((tenant.devicesUsed ?? 0) / tenant.devicesLimit) * 100 : 0;
      switch (deviceUtilizationFilter) {
        case 'unused': if (pct !== 0) return false; break;
        case 'low': if (!(pct > 0 && pct < 50)) return false; break;
        case 'medium': if (!(pct >= 50 && pct <= 80)) return false; break;
        case 'high': if (!(pct > 80 && pct < 100)) return false; break;
        case 'full': if (pct !== 100) return false; break;
        default: break;
      }
    }
    if (healthScoreFilter) {
      const score = tenantHealthScore(tenant);
      switch (healthScoreFilter) {
        case 'excellent': if (score < 90) return false; break;
        case 'good': if (score < 70 || score >= 90) return false; break;
        case 'fair': if (score < 50 || score >= 70) return false; break;
        case 'poor': if (score >= 50) return false; break;
        default: break;
      }
    }
    return true;
  }), [tenants, dateRange, outstandingRange, deviceUtilizationFilter, healthScoreFilter, tenantHealthScore]);

  // Reset to the first page whenever the visible set changes (filters/search/load).
  React.useEffect(() => { setPage(1); }, [visibleTenants]);

  const bulk = useTenantBulk({ tenants: visibleTenants, centralActive, load });
  const csv = useCsvImport({ plans, centralActive, load });

  // Customer file opens as a dedicated page, not a modal.
  const openProfile = (tenant: PlatformTenant) => {
    navigate(`/platform/tenants/${tenant.id}`);
  };

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
    if (saving) return; // prevent double-submit while a save is in flight
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
    setSearchInput(preset.search ?? '');
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

  const TENANT_CSV_HEADERS = ['رقم العميل', 'Tenant ID', 'الشركة', 'النشاط', 'المسؤول', 'الهاتف', 'البريد', 'الدولة', 'المدينة', 'العنوان', 'تاريخ التسجيل', 'الباقة', 'الحالة', 'بداية الاشتراك', 'نهاية الاشتراك', 'الأجهزة المسموحة', 'الأجهزة المستخدمة', 'الفروع'];

  const exportRows = () => {
    downloadCsv('platform-customers.csv', [
      TENANT_CSV_HEADERS,
      ...visibleTenants.map(tenantCsvRow),
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
        search={searchInput}
        setSearch={setSearchInput}
        status={status}
        setStatus={setStatus}
        planId={planId}
        setPlanId={setPlanId}
        plans={plans}
        tenants={visibleTenants}
        page={page}
        setPage={setPage}
        error={error}
        loading={loading}
        selectedIds={bulk.selectedIds}
        setSelectedIds={bulk.setSelectedIds}
        handleSelectAll={bulk.handleSelectAll}
        handleSelectOne={bulk.handleSelectOne}
        canManageTenants={canManageTenants}
        openProfile={openProfile}
        openEdit={openEdit}
        setBulkActionType={bulk.setBulkActionType}
        setBulkActionOpen={bulk.setBulkActionOpen}
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
        deleteFilterPreset={deleteFilterPreset}
        healthScoreFor={tenantHealthScore}
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

    </div>
  );
};

export default PlatformTenantsPage;
