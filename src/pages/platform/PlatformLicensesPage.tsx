import React from 'react';
import { DataTable } from '../../components/ui/DataTable';
import {
  KeyRound,
  Plus,
  Search,
  RefreshCw,
  Ban,
  CheckCircle2,
  Cpu,
  Download,
  ShieldX,
  ShieldAlert,
  Clock,
  Eye,
  Pencil,
  Link,
} from 'lucide-react';
import { platformAdminService } from '../../services/domains/platform/PlatformAdminService';
import { centralPlatformClient } from '../../services/domains/platform/CentralPlatformClient';
import { getCentralDataSourceState } from '../../hooks/platform/useCentralDataSource';
import { canPlatform } from '../../hooks/platform/usePlatformPermission';
import type {
  PlatformLicense,
  PlatformLicenseStatus,
  PlatformPlan,
  PlatformTenant,
  PlatformDevice,
  PlatformCouplingMode,
} from '../../services/domains/platform/platformTypes';
import { Button } from '../../components/ui/Button';
import { PageHeader } from '../../components/ui/PageHeader';
import {
  EmptyState,
  StatusBadge,
  downloadCsv,
  formatDate,
  inputClass,
} from './components/PlatformUI';
import { useToast } from '../../components/ui/Toast';
import {
  COUPLING_LABELS,
  LICENSE_STATUS_LABELS,
  STATUSES,
  daysUntilExpiry,
} from './PlatformLicensesPage/licenseData';
import { LicenseStatsBar } from './PlatformLicensesPage/LicenseStatsBar';
import { LicenseDetailsDrawer } from './PlatformLicensesPage/LicenseDetailsDrawer';
import { EditLicenseModal, type LicenseUpdatePayload } from './PlatformLicensesPage/EditLicenseModal';
import { IssueLicenseModal, type IssueLicenseForm } from './PlatformLicensesPage/IssueLicenseModal';
import { RenewLicenseModal } from './PlatformLicensesPage/RenewLicenseModal';
import { BindHardwareModal } from './PlatformLicensesPage/BindHardwareModal';
import { DeviceActionModal, type DeviceAction, type DeviceActionTarget } from './PlatformLicensesPage/DeviceActionModal';

export const PlatformLicensesPage: React.FC = () => {
  const toast = useToast();
  const canManageLicenses = canPlatform('licenses');
  const [licenses, setLicenses] = React.useState<PlatformLicense[]>([]);
  const [tenants, setTenants] = React.useState<PlatformTenant[]>([]);
  const [plans, setPlans] = React.useState<PlatformPlan[]>([]);
  const [search, setSearch] = React.useState('');
  // Raw input is debounced ~300ms before it hits `search` (and therefore the API).
  const [searchInput, setSearchInput] = React.useState('');
  React.useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);
  const [status, setStatus] = React.useState('');
  const [planFilter, setPlanFilter] = React.useState('');
  const [expiringOnly, setExpiringOnly] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [issueOpen, setIssueOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const [detailsTarget, setDetailsTarget] = React.useState<PlatformLicense | null>(null);
  const [editTarget, setEditTarget] = React.useState<PlatformLicense | null>(null);

  const [renewTarget, setRenewTarget] = React.useState<PlatformLicense | null>(null);
  const [renewMonths, setRenewMonths] = React.useState(12);

  const [hardwareTarget, setHardwareTarget] = React.useState<PlatformLicense | null>(null);
  const [hardwareId, setHardwareId] = React.useState('');
  const [deviceTarget, setDeviceTarget] = React.useState<DeviceActionTarget | null>(null);
  const [deviceAction, setDeviceAction] = React.useState<DeviceAction | null>(null);
  const [cloneAlerts, setCloneAlerts] = React.useState<string[]>([]);
  const [centralMode, setCentralMode] = React.useState(false);
  const [devices, setDevices] = React.useState<PlatformDevice[]>([]);

  const misconfiguredError = 'مصدر البيانات مضبوط على «المركزي» لكن جسر الاتصال بالسيرفر غير متاح في هذا الإصدار.';

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const central = getCentralDataSourceState();
      setCentralMode(central.active);
      if (central.misconfigured) {
        throw new Error(misconfiguredError);
      }
      if (central.active) {
        const [centralLicenses, centralDevices] = await Promise.all([
          centralPlatformClient.listLicenses(search, status),
          centralPlatformClient.listDevices(),
        ]);
        setLicenses(centralLicenses);
        setDevices(centralDevices);
      } else {
        setLicenses(platformAdminService.listLicenses(search, status));
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل التراخيص.');
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  React.useEffect(() => { void load(); }, [load]);

  React.useEffect(() => {
    const central = getCentralDataSourceState();
    if (central.misconfigured) {
      setError(misconfiguredError);
      return;
    }
    const loadRefs = async () => {
      try {
        if (central.active) {
          const [centralTenants, centralPlans] = await Promise.all([
            centralPlatformClient.listTenants(),
            centralPlatformClient.listPlans(),
          ]);
          setTenants(centralTenants);
          setPlans(centralPlans);
        } else {
          setTenants(platformAdminService.listTenants());
          setPlans(platformAdminService.listPlans(false));
        }
      } catch {
        /* handled by the list error */
      }
    };
    void loadRefs();
  }, []);

  const issue = async (form: IssueLicenseForm) => {
    if (!canManageLicenses) {
      toast.error('لا تملك صلاحية إدارة التراخيص');
      return;
    }
    if (!form.tenantId || !form.planId) {
      toast.error('اختر العميل والخطة');
      return;
    }
    const central = getCentralDataSourceState();
    if (central.misconfigured) {
      toast.error(misconfiguredError);
      return;
    }
    setSaving(true);
    try {
      if (central.active) {
        const result: any = await centralPlatformClient.issueLicense({
          tenantId: form.tenantId,
          planId: form.planId,
          months: form.months,
          seats: form.seats,
          branchesLimit: form.branchesLimit,
          offlineGracePeriodDays: form.offlineGracePeriodDays,
          couplingMode: form.couplingMode,
          notes: form.notes || undefined,
        });
        toast.success('تم إصدار الترخيص', result?.license?.licenseKey ?? result?.license?.license_key ?? '');
      } else {
        const license = platformAdminService.issueLicense(form.tenantId, form.planId, {
          months: form.months,
          seats: form.seats,
          branchesLimit: form.branchesLimit,
          offlineGracePeriodDays: form.offlineGracePeriodDays,
          couplingMode: form.couplingMode,
          notes: form.notes,
        });
        toast.success('تم إصدار الترخيص', license.licenseKey);
      }
      setIssueOpen(false);
      await load();
    } catch (err) {
      toast.error('تعذر إصدار الترخيص', err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (license: PlatformLicense, next: PlatformLicenseStatus) => {
    if (!canManageLicenses) {
      toast.error('لا تملك صلاحية إدارة التراخيص');
      return;
    }
    const verb = next === 'REVOKED' ? 'إلغاء' : next === 'SUSPENDED' ? 'إيقاف' : 'تفعيل';
    if (!window.confirm(`${verb} الترخيص ${license.licenseKey}؟`)) return;
    const central = getCentralDataSourceState();
    if (central.misconfigured) {
      toast.error(misconfiguredError);
      return;
    }
    try {
      if (central.active) {
        if (next === 'SUSPENDED') {
          await centralPlatformClient.suspendLicense(license.id, 'إيقاف من لوحة التراخيص');
        } else if (next === 'REVOKED') {
          await centralPlatformClient.revokeLicense(license.id, 'إلغاء من لوحة التراخيص');
        } else {
          await centralPlatformClient.reactivateLicense(license.id, 'تفعيل من لوحة التراخيص');
        }
      } else {
        platformAdminService.setLicenseStatus(license.id, next);
      }
      toast.success(`تم ${verb} الترخيص`);
      await load();
    } catch (err) {
      toast.error('تعذر تحديث الترخيص', err instanceof Error ? err.message : undefined);
    }
  };

  const saveEdit = async (payload: LicenseUpdatePayload) => {
    if (!editTarget) return;
    if (!canManageLicenses) {
      toast.error('لا تملك صلاحية إدارة التراخيص');
      return;
    }
    const central = getCentralDataSourceState();
    if (central.misconfigured) {
      toast.error(misconfiguredError);
      return;
    }
    setSaving(true);
    try {
      if (central.active) {
        await centralPlatformClient.updateLicense(editTarget.id, {
          seats: payload.seats,
          deviceLimit: payload.deviceLimit,
          branchesLimit: payload.branchesLimit,
          offlineGracePeriodDays: payload.offlineGracePeriodDays,
          notes: payload.notes,
          couplingMode: payload.couplingMode,
        });
      } else {
        platformAdminService.updateLicense(editTarget.id, {
          seats: payload.seats,
          deviceLimit: payload.deviceLimit,
          branchesLimit: payload.branchesLimit,
          offlineGracePeriodDays: payload.offlineGracePeriodDays,
          notes: payload.notes,
          couplingMode: payload.couplingMode,
        });
      }
      toast.success('تم حفظ تعديلات الترخيص');
      setEditTarget(null);
      await load();
    } catch (err) {
      toast.error('تعذر حفظ التعديلات', err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const renew = async () => {
    if (!renewTarget) return;
    if (!canManageLicenses) {
      toast.error('لا تملك صلاحية إدارة التراخيص');
      return;
    }
    const central = getCentralDataSourceState();
    if (central.misconfigured) {
      toast.error(misconfiguredError);
      return;
    }
    try {
      if (central.active) {
        await centralPlatformClient.renewLicense(renewTarget.id, renewMonths);
      } else {
        platformAdminService.renewLicense(renewTarget.id, renewMonths);
      }
      toast.success('تم تجديد الترخيص');
      setRenewTarget(null);
      await load();
    } catch (err) {
      toast.error('تعذر تجديد الترخيص', err instanceof Error ? err.message : undefined);
    }
  };

  const detectClones = async () => {
    if (!canManageLicenses) {
      toast.error('لا تملك صلاحية إدارة التراخيص');
      return;
    }
    const central = getCentralDataSourceState();
    if (central.misconfigured) {
      toast.error(misconfiguredError);
      return;
    }
    try {
      if (central.active) {
        const result = await centralPlatformClient.detectCloneDevices();
        setCloneAlerts(Array.from(new Set(result.alerts)));
        if (result.alerts.length > 0) {
          toast.warning(`تم اكتشاف ${result.alerts.length} تنبيه استنساخ`);
        } else {
          toast.success('لا يوجد اشتباه استنساخ');
        }
      } else {
        const result = platformAdminService.detectCloneDevices();
        setCloneAlerts(Array.from(new Set(result.alerts.map((a) => a.message))));
        if (result.alerts.length > 0) {
          toast.warning(`تم اكتشاف ${result.alerts.length} تنبيه استنساخ`);
        } else {
          toast.success('لا يوجد اشتباه استنساخ');
        }
      }
      await load();
    } catch (err) {
      toast.error('تعذر الكشف عن الاستنساخ', err instanceof Error ? err.message : undefined);
    }
  };

  const openDeviceAction = (action: DeviceAction, device: DeviceActionTarget) => {
    setDeviceTarget(device);
    setDeviceAction(action);
  };

  const executeDeviceAction = async () => {
    if (!deviceTarget || !deviceAction) return;
    if (!canManageLicenses) {
      toast.error('لا تملك صلاحية إدارة التراخيص');
      return;
    }
    const central = getCentralDataSourceState();
    if (central.misconfigured) {
      toast.error(misconfiguredError);
      return;
    }
    try {
      if (central.active) {
        const reason = `إجراء ${deviceAction} عبر لوحة التراخيص`;
        if (deviceAction === 'suspend') {
          await centralPlatformClient.suspendDevice(deviceTarget.id, reason);
        } else if (deviceAction === 'release') {
          await centralPlatformClient.releaseDevice(deviceTarget.id, reason);
        } else {
          await centralPlatformClient.revokeDevice(deviceTarget.id, reason);
        }
      } else if (deviceAction === 'suspend') {
        platformAdminService.suspendDevice(deviceTarget.id, 'إيقاف عبر لوحة التحكم');
      } else if (deviceAction === 'release') {
        platformAdminService.releaseDevice(deviceTarget.id, 'تحرير عبر لوحة التحكم');
      } else if (deviceAction === 'revoke') {
        platformAdminService.revokeDevice(deviceTarget.id, 'إلغاء عبر لوحة التحكم');
      }
      toast.success(`تم ${deviceAction === 'suspend' ? 'إيقاف' : deviceAction === 'release' ? 'تحرير' : 'إلغاء'} الجهاز`);
      setDeviceTarget(null);
      setDeviceAction(null);
      await load();
    } catch (err) {
      toast.error('تعذر تنفيذ الإجراء', err instanceof Error ? err.message : undefined);
    }
  };

  const bindHardware = async () => {
    if (!hardwareTarget) return;
    if (!canManageLicenses) {
      toast.error('لا تملك صلاحية إدارة التراخيص');
      return;
    }
    const central = getCentralDataSourceState();
    if (central.misconfigured) {
      toast.error(misconfiguredError);
      return;
    }
    try {
      if (central.active) {
        await centralPlatformClient.transferLicense(hardwareTarget.id, hardwareId.trim(), hardwareId.trim() ? 'ربط جهاز من لوحة التراخيص' : 'فك ربط الجهاز من لوحة التراخيص');
      } else {
        platformAdminService.bindLicenseHardware(hardwareTarget.id, hardwareId);
      }
      toast.success(hardwareId.trim() ? 'تم ربط الترخيص بالجهاز' : 'تم فك ربط الترخيص من الجهاز');
      setHardwareTarget(null);
      await load();
    } catch (err) {
      toast.error('تعذر تحديث ربط الجهاز', err instanceof Error ? err.message : undefined);
    }
  };

  const exportCompliance = async () => {
    if (!canManageLicenses) {
      toast.error('لا تملك صلاحية إدارة التراخيص');
      return;
    }
    const central = getCentralDataSourceState();
    try {
      // The central API exposes the license list (already loaded, honouring the
      // active filters); the compliance CSV is assembled client-side from it.
      const reportLicenses = central.active ? licenses : (platformAdminService.exportLicenseComplianceReport({
        includeActivations: true,
        includeChanges: true,
      }).licenses as any[]);
      if (central.misconfigured) {
        toast.error(misconfiguredError);
        return;
      }
      const rows = [
        ['المفتاح', 'العميل', 'الخطة', 'الحالة', 'تاريخ الإصدار', 'يبدأ من', 'ينتهي في', 'المستخدمون', 'الأجهزة', 'الفروع', 'معرف الجهاز', 'الربط'],
        ...reportLicenses.map((license: any) => [
          license.licenseKey ?? license.license_key,
          license.tenantName ?? license.tenant_name ?? '',
          license.planName ?? license.plan_name ?? '',
          license.status,
          license.issuedAt ?? license.issued_at,
          license.startsAt ?? license.starts_at ?? '',
          license.expiresAt ?? license.expires_at ?? '',
          license.seats,
          license.deviceLimit ?? license.device_limit,
          license.branchesLimit ?? license.branches_limit,
          license.hardwareId ?? license.hardware_id ?? '',
          license.couplingMode ?? license.coupling_mode ?? 'FULL',
        ]),
      ];
      downloadCsv('license-compliance.csv', rows);
      toast.success(`تم تصدير تقرير الامتثال (${reportLicenses.length} ترخيص)`);
    } catch (err) {
      toast.error('تعذر تصدير التقرير', err instanceof Error ? err.message : undefined);
    }
  };

  /** Central device actions need the platform_devices id, not the license id. */
  const deviceIdForLicense = (license: PlatformLicense): string | null => {
    if (!centralMode) return license.id;
    return devices.find((device) => device.licenseId === license.id)?.id ?? null;
  };

  const exportRows = () => {
    if (!canManageLicenses) {
      toast.error('لا تملك صلاحية إدارة التراخيص');
      return;
    }
    downloadCsv('platform-licenses.csv', [
      ['المفتاح', 'العميل', 'الخطة', 'الحالة', 'تاريخ الإصدار', 'يبدأ من', 'ينتهي في', 'الأيام المتبقية', 'المستخدمون', 'الأجهزة', 'الفروع', 'معرف الجهاز', 'الربط'],
      ...licenses.map((license) => {
        const days = daysUntilExpiry(license.expiresAt);
        return [
          license.licenseKey,
          license.tenantName ?? '',
          license.planName ?? '',
          LICENSE_STATUS_LABELS[license.status],
          license.issuedAt,
          license.startsAt ?? '',
          license.expiresAt ?? '',
          days === null ? '' : days,
          license.seats,
          license.deviceLimit,
          license.branchesLimit,
          license.hardwareId ?? '',
          license.couplingMode ?? 'FULL',
        ];
      }),
    ]);
  };

  const filteredLicenses = React.useMemo(() => {
    let rows = licenses;
    if (planFilter) rows = rows.filter((license) => license.planId === planFilter);
    if (expiringOnly) {
      rows = rows.filter((license) => {
        const days = daysUntilExpiry(license.expiresAt);
        return days !== null && days <= 30 && license.status !== 'REVOKED';
      });
    }
    return rows;
  }, [licenses, expiringOnly, planFilter]);

  const expiryCell = (license: PlatformLicense) => {
    const days = daysUntilExpiry(license.expiresAt);
    if (days === null) return <span className="text-[11px] text-muted">—</span>;
    if (days < 0) return <span className="text-[11px] font-bold text-danger">منتهي منذ {Math.abs(days)} يوم</span>;
    if (days <= 30) return <span className="text-[11px] font-bold text-warning">متبقي {days} يوم</span>;
    return <span className="text-[11px] text-ink-secondary">متبقي {days} يوم</span>;
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="إدارة التراخيص"
        description="إصدار وتجديد وتعديل تراخيص العملاء وربطها بالأجهزة ومتابعة سجل التفعيلات."
        icon={<KeyRound className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap gap-2">
            {canManageLicenses && (
              <Button variant="ghost" size="sm" leadingIcon={<Download className="h-3.5 w-3.5" />} onClick={exportRows}>
                تصدير CSV
              </Button>
            )}
            {canManageLicenses && (
              <>
                <Button variant="ghost" size="sm" leadingIcon={<ShieldAlert className="h-3.5 w-3.5" />} onClick={() => void detectClones()}>
                  كشف الاستنساخ
                </Button>
                <Button variant="secondary" size="sm" leadingIcon={<Clock className="h-3.5 w-3.5" />} onClick={() => void exportCompliance()}>
                  تقرير الامتثال
                </Button>
                <Button variant="primary" size="sm" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setIssueOpen(true)}>
                  إصدار ترخيص
                </Button>
              </>
            )}
          </div>
        }
      />

      <LicenseStatsBar licenses={licenses} />

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-3 shadow-sm">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="ابحث بالمفتاح أو العميل أو معرف الجهاز..."
            className={`${inputClass} pr-8`}
          />
        </div>
        <select value={status} onChange={(event) => setStatus(event.target.value)} className={`${inputClass} max-w-[170px]`}>
          <option value="">كل الحالات</option>
          {STATUSES.map((value) => (
            <option key={value} value={value}>{LICENSE_STATUS_LABELS[value]}</option>
          ))}
        </select>
        <select value={planFilter} onChange={(event) => setPlanFilter(event.target.value)} className={`${inputClass} max-w-[170px]`}>
          <option value="">كل الخطط</option>
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>{plan.name}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setExpiringOnly((value) => !value)}
          className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition ${expiringOnly ? 'bg-warning-soft text-warning' : 'bg-surface-sunken text-muted hover:text-ink'}`}
        >
          ينتهي خلال 30 يوم
        </button>
        <span className="rounded-full bg-surface-sunken px-2.5 py-1 text-[11px] font-bold text-ink-secondary">{filteredLicenses.length} ترخيص</span>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-danger-border bg-danger-soft px-4 py-2.5 text-xs font-semibold text-danger">{error}</div>
      )}

      <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
        {loading ? (
          <div className="py-16 text-center text-sm font-semibold text-muted">جارٍ تحميل التراخيص...</div>
        ) : filteredLicenses.length === 0 ? (
          <EmptyState
            icon={<KeyRound className="h-5 w-5" />}
            title="لا توجد تراخيص مطابقة"
            description="أصدر ترخيصاً جديداً أو غيّر عوامل التصفية."
          />
        ) : (
          <div className="overflow-x-auto">
            <DataTable<PlatformLicense>
              ariaLabel="التراخيص"
              rows={filteredLicenses}
              rowKey={(license) => String(license.id)}
              minWidth={1100}
              dense
              tableClassName="text-[11px]"
              rowClassName={() => 'transition hover:bg-surface-muted/60'}
              columns={[
                {
                  key: 'key', header: 'المفتاح',
                  render: (license) => (
                    <span className="block">
                      <span className="block font-mono text-[11px] font-bold text-ink" dir="ltr">{license.licenseKey}</span>
                      <span className="text-[10px] text-muted">{formatDate(license.issuedAt)}</span>
                    </span>
                  ),
                },
                { key: 'tenant', header: 'العميل', render: (license) => <span className="text-[12px] font-semibold text-ink">{license.tenantName || '—'}</span> },
                { key: 'plan', header: 'الخطة', render: (license) => <span className="text-[11.5px] text-ink-secondary">{license.planName || '—'}</span> },
                { key: 'status', header: 'الحالة', render: (license) => <StatusBadge value={license.status} label={LICENSE_STATUS_LABELS[license.status]} /> },
                { key: 'start', header: 'يبدأ من', render: (license) => <span className="text-[11px] text-ink-secondary">{formatDate(license.startsAt)}</span> },
                { key: 'end', header: 'ينتهي في', render: (license) => <span className="text-[11px] text-ink-secondary">{formatDate(license.expiresAt)}</span> },
                { key: 'remaining', header: 'المتبقي', render: expiryCell },
                { key: 'seats', header: 'المستخدمون', render: (license) => <span className="text-[11px] font-semibold text-ink">{license.seats}</span> },
                { key: 'devices', header: 'الأجهزة', render: (license) => <span className="text-[11px] font-semibold text-ink">{license.deviceLimit}</span> },
                { key: 'branches', header: 'الفروع', render: (license) => <span className="text-[11px] font-semibold text-ink">{license.branchesLimit}</span> },
                { key: 'coupling', header: 'الربط', render: (license) => <span className="text-[10px] text-muted">{COUPLING_LABELS[(license.couplingMode ?? 'FULL') as PlatformCouplingMode]}</span> },
                {
                  key: 'actions', header: 'إجراءات',
                  render: (license) => (
                    <span className="flex items-center gap-1">
                      <button type="button" onClick={() => setDetailsTarget(license)} className="rounded p-1.5 text-muted hover:bg-accent-soft hover:text-primary" title="التفاصيل">
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      {canManageLicenses && (
                        <>
                          <button type="button" onClick={() => { setRenewTarget(license); setRenewMonths(12); }} className="rounded p-1.5 text-muted hover:bg-success-soft hover:text-success" title="تجديد">
                            <RefreshCw className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" onClick={() => setEditTarget(license)} className="rounded p-1.5 text-muted hover:bg-accent-soft hover:text-primary" title="تعديل">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" onClick={() => { setHardwareTarget(license); setHardwareId(license.hardwareId ?? ''); }} className="rounded p-1.5 text-muted hover:bg-accent-soft hover:text-primary" title={license.hardwareId ? 'تغيير/فك الربط' : 'ربط جهاز'}>
                            <Cpu className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const next = license.status === 'ACTIVE' || license.status === 'ISSUED' ? 'SUSPENDED' : 'ACTIVE';
                              void changeStatus(license, next);
                            }}
                            className="rounded p-1.5 text-muted hover:bg-warning-soft hover:text-warning"
                            title={license.status === 'ACTIVE' || license.status === 'ISSUED' ? 'إيقاف' : 'تفعيل'}
                          >
                            {license.status === 'ACTIVE' || license.status === 'ISSUED' ? (
                              <Ban className="h-3.5 w-3.5" />
                            ) : (
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            )}
                          </button>
                          <button type="button" onClick={() => void changeStatus(license, 'REVOKED')} className="rounded p-1.5 text-muted hover:bg-danger-soft hover:text-danger" title="إلغاء">
                            <ShieldX className="h-3.5 w-3.5" />
                          </button>
                          {license.hardwareId && (() => {
                            const deviceId = deviceIdForLicense(license);
                            const unsupported = centralMode && !deviceId;
                            return (
                              <button
                                type="button"
                                disabled={unsupported}
                                onClick={() => { if (deviceId) openDeviceAction('release', { id: deviceId, hardwareId: license.hardwareId ?? '', tenantId: license.tenantId, status: license.status }); }}
                                className={`rounded p-1.5 ${unsupported ? 'cursor-not-allowed text-muted/40' : 'text-muted hover:bg-accent-soft hover:text-primary'}`}
                                title={unsupported ? 'لا يوجد جهاز مرتبط قابل للإدارة في الوضع المركزي' : 'تحرير الجهاز'}
                              >
                                <Link className="h-3.5 w-3.5" />
                              </button>
                            );
                          })()}
                          {license.status === 'ACTIVE' && (() => {
                            const deviceId = deviceIdForLicense(license);
                            const unsupported = centralMode && !deviceId;
                            return (
                              <button
                                type="button"
                                disabled={unsupported}
                                onClick={() => { if (deviceId) openDeviceAction('suspend', { id: deviceId, hardwareId: license.hardwareId ?? '', tenantId: license.tenantId, status: license.status }); }}
                                className={`rounded p-1.5 ${unsupported ? 'cursor-not-allowed text-muted/40' : 'text-muted hover:bg-warning-soft hover:text-warning'}`}
                                title={unsupported ? 'لا يوجد جهاز مرتبط قابل للإدارة في الوضع المركزي' : 'إيقاف الجهاز'}
                              >
                                <ShieldAlert className="h-3.5 w-3.5" />
                              </button>
                            );
                          })()}
                        </>
                      )}
                    </span>
                  ),
                },
              ]}
            />
          </div>
        )}
      </section>

      {/* Clone alerts */}
      {cloneAlerts.length > 0 && (
        <section className="rounded-lg border border-warning-border bg-warning-soft p-4">
          <h3 className="text-sm font-bold text-warning mb-2">تنبيهات الاستنساخ المكتشفة</h3>
          <ul className="text-[11px] text-warning space-y-1 list-disc list-inside">
            {cloneAlerts.map((alert) => (
              <li key={alert}>{alert}</li>
            ))}
          </ul>
        </section>
      )}

      <IssueLicenseModal
        open={issueOpen}
        saving={saving}
        canManage={canManageLicenses}
        tenants={tenants}
        plans={plans}
        onClose={() => setIssueOpen(false)}
        onSubmit={(form) => void issue(form)}
      />

      <EditLicenseModal
        license={editTarget}
        saving={saving}
        canManage={canManageLicenses}
        onClose={() => setEditTarget(null)}
        onSave={(payload) => void saveEdit(payload)}
      />

      <LicenseDetailsDrawer
        license={detailsTarget ? licenses.find((item) => item.id === detailsTarget.id) ?? detailsTarget : null}
        canManage={canManageLicenses}
        centralMode={centralMode}
        licenses={licenses}
        onClose={() => setDetailsTarget(null)}
        onChanged={() => void load()}
      />

      <RenewLicenseModal
        license={renewTarget}
        months={renewMonths}
        onMonthsChange={setRenewMonths}
        canManage={canManageLicenses}
        onClose={() => setRenewTarget(null)}
        onConfirm={() => void renew()}
      />

      <BindHardwareModal
        license={hardwareTarget}
        hardwareId={hardwareId}
        onHardwareIdChange={setHardwareId}
        canManage={canManageLicenses}
        onClose={() => setHardwareTarget(null)}
        onConfirm={() => void bindHardware()}
      />

      <DeviceActionModal
        target={deviceTarget}
        action={deviceAction}
        canManage={canManageLicenses}
        onClose={() => { setDeviceTarget(null); setDeviceAction(null); }}
        onConfirm={() => void executeDeviceAction()}
      />
    </div>
  );
};

export default PlatformLicensesPage;
