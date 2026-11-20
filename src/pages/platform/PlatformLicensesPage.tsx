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
  Users,
  Settings,
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
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import {
  EmptyState,
  Field,
  StatusBadge,
  downloadCsv,
  formatDate,
  formatDateTime,
  inputClass,
} from './components/PlatformUI';

import { useToast } from '../../components/ui/Toast';
const LICENSE_STATUS_LABELS: Record<PlatformLicenseStatus, string> = {
  ISSUED: 'صادر',
  ACTIVE: 'نشط',
  SUSPENDED: 'موقوف',
  REVOKED: 'ملغي',
  EXPIRED: 'منتهي',
};

const COUPLING_LABELS: Record<PlatformCouplingMode, string> = {
  FULL: 'كامل',
  EXPIRY_ONLY: 'انتهاء الصلاحية فقط',
  NONE: 'مستقل',
};

const STATUSES: PlatformLicenseStatus[] = ['ACTIVE', 'ISSUED', 'SUSPENDED', 'EXPIRED', 'REVOKED'];

export const PlatformLicensesPage: React.FC = () => {
  const toast = useToast();
  const canManageLicenses = canPlatform('licenses');
  const [licenses, setLicenses] = React.useState<PlatformLicense[]>([]);
  const [tenants, setTenants] = React.useState<PlatformTenant[]>([]);
  const [plans, setPlans] = React.useState<PlatformPlan[]>([]);
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [issueOpen, setIssueOpen] = React.useState(false);
  const [issueForm, setIssueForm] = React.useState({
    tenantId: '',
    planId: '',
    months: 12,
    seats: 5,
    branchesLimit: 1,
    offlineGracePeriodDays: 14,
    couplingMode: 'FULL' as PlatformCouplingMode,
    notes: '',
  });
  const [saving, setSaving] = React.useState(false);

  const [renewTarget, setRenewTarget] = React.useState<PlatformLicense | null>(null);
  const [renewMonths, setRenewMonths] = React.useState(12);

  const [hardwareTarget, setHardwareTarget] = React.useState<PlatformLicense | null>(null);
  const [hardwareId, setHardwareId] = React.useState('');
  const [deviceTarget, setDeviceTarget] = React.useState<{ id: string; hardwareId: string; tenantId: string; status: string } | null>(null);
  const [deviceAction, setDeviceAction] = React.useState<'suspend' | 'release' | 'revoke' | null>(null);
  const [cloneAlerts, setCloneAlerts] = React.useState<string[]>([]);
  const [centralMode, setCentralMode] = React.useState(false);
  const [devices, setDevices] = React.useState<PlatformDevice[]>([]);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const central = getCentralDataSourceState();
      setCentralMode(central.active);
      if (central.misconfigured) {
        throw new Error('مصدر البيانات مضبوط على «المركزي» لكن جسر الاتصال بالسيرفر غير متاح في هذا الإصدار.');
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
      setError('مصدر البيانات مضبوط على «المركزي» لكن جسر الاتصال بالسيرفر غير متاح في هذا الإصدار.');
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

  const openIssue = () => {
    const defaultPlan = plans.find((plan) => plan.isDefault) ?? plans[0];
    setIssueForm({
      tenantId: tenants[0]?.id ?? '',
      planId: defaultPlan?.id ?? '',
      months: 12,
      seats: defaultPlan?.seatsLimit ?? 5,
      branchesLimit: defaultPlan?.branchesLimit ?? 1,
      offlineGracePeriodDays: defaultPlan?.offlineGracePeriodDays ?? 14,
      couplingMode: 'FULL',
      notes: '',
    });
    setIssueOpen(true);
  };

  const issue = async () => {
    if (!canManageLicenses) {
      toast.error('لا تملك صلاحية إدارة التراخيص');
      return;
    }
    if (!issueForm.tenantId || !issueForm.planId) {
      toast.error('اختر العميل والخطة');
      return;
    }
    const central = getCentralDataSourceState();
    if (central.misconfigured) {
      toast.error('مصدر البيانات مضبوط على «المركزي» لكن جسر الاتصال بالسيرفر غير متاح في هذا الإصدار.');
      return;
    }
    setSaving(true);
    try {
      if (central.active) {
        const result: any = await centralPlatformClient.issueLicense({
          tenantId: issueForm.tenantId,
          planId: issueForm.planId,
          months: issueForm.months,
          seats: issueForm.seats,
          branchesLimit: issueForm.branchesLimit,
          offlineGracePeriodDays: issueForm.offlineGracePeriodDays,
          couplingMode: issueForm.couplingMode,
          notes: issueForm.notes || undefined,
        });
        toast.success('تم إصدار الترخيص', result?.license?.licenseKey ?? result?.license?.license_key ?? '');
      } else {
        const license = platformAdminService.issueLicense(issueForm.tenantId, issueForm.planId, {
          months: issueForm.months,
          seats: issueForm.seats,
          branchesLimit: issueForm.branchesLimit,
          offlineGracePeriodDays: issueForm.offlineGracePeriodDays,
          couplingMode: issueForm.couplingMode,
          notes: issueForm.notes,
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
      toast.error('مصدر البيانات مضبوط على «المركزي» لكن جسر الاتصال بالسيرفر غير متاح في هذا الإصدار.');
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

  const renew = async () => {
    if (!renewTarget) return;
    if (!canManageLicenses) {
      toast.error('لا تملك صلاحية إدارة التراخيص');
      return;
    }
    const central = getCentralDataSourceState();
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
      toast.error('مصدر البيانات مضبوط على «المركزي» لكن جسر الاتصال بالسيرفر غير متاح في هذا الإصدار.');
      return;
    }
    try {
      if (central.active) {
        const result = await centralPlatformClient.detectCloneDevices();
        setCloneAlerts(result.alerts);
        if (result.alerts.length > 0) {
          toast.warning(`تم اكتشاف ${result.alerts.length} تنبيه استنساخ`);
        } else {
          toast.success('لا يوجد اشتباه استنساخ');
        }
      } else {
        const result = platformAdminService.detectCloneDevices();
        setCloneAlerts(result.alerts.map((a) => a.message));
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

  const openDeviceAction = (action: 'suspend' | 'release' | 'revoke', device: { id: string; hardwareId: string; tenantId: string; status: string }) => {
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
      toast.error('مصدر البيانات مضبوط على «المركزي» لكن جسر الاتصال بالسيرفر غير متاح في هذا الإصدار.');
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
    if (!hardwareId.trim()) {
      toast.error('أدخل معرف الجهاز (Hardware ID)');
      return;
    }
    const central = getCentralDataSourceState();
    if (central.misconfigured) {
      toast.error('مصدر البيانات مضبوط على «المركزي» لكن جسر الاتصال بالسيرفر غير متاح في هذا الإصدار.');
      return;
    }
    try {
      if (central.active) {
        await centralPlatformClient.transferLicense(hardwareTarget.id, hardwareId.trim(), 'ربط جهاز من لوحة التراخيص');
      } else {
        platformAdminService.bindLicenseHardware(hardwareTarget.id, hardwareId);
      }
      toast.success('تم ربط الترخيص بالجهاز');
      setHardwareTarget(null);
      await load();
    } catch (err) {
      toast.error('تعذر ربط الجهاز', err instanceof Error ? err.message : undefined);
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
        toast.error('مصدر البيانات مضبوط على «المركزي» لكن جسر الاتصال بالسيرفر غير متاح في هذا الإصدار.');
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
      ['المفتاح', 'العميل', 'الخطة', 'الحالة', 'تاريخ الإصدار', 'يبدأ من', 'ينتهي في', 'المستخدمون', 'الأجهزة', 'الفروع', 'معرف الجهاز', 'الربط'],
      ...licenses.map((license) => [
        license.licenseKey,
        license.tenantName ?? '',
        license.planName ?? '',
        LICENSE_STATUS_LABELS[license.status],
        license.issuedAt,
        license.startsAt ?? '',
        license.expiresAt ?? '',
        license.seats,
        license.deviceLimit,
        license.branchesLimit,
        license.hardwareId ?? '',
        license.couplingMode ?? 'FULL',
      ]),
    ]);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="إدارة التراخيص"
        description="إصدار وتجديد وإيقاف تراخيص العملاء وربطها بالأجهزة."
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
                <Button variant="primary" size="sm" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={openIssue}>
                  إصدار ترخيص
                </Button>
              </>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-3 shadow-sm">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
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
        <span className="rounded-full bg-surface-sunken px-2.5 py-1 text-[11px] font-bold text-ink-secondary">{licenses.length} ترخيص</span>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-danger-border bg-danger-soft px-4 py-2.5 text-xs font-semibold text-danger">{error}</div>
      )}

      <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
        {loading ? (
          <div className="py-16 text-center text-sm font-semibold text-muted">جارٍ تحميل التراخيص...</div>
        ) : licenses.length === 0 ? (
          <EmptyState
            icon={<KeyRound className="h-5 w-5" />}
            title="لا توجد تراخيص مطابقة"
            description="أصدر ترخيصاً جديداً أو غيّر عوامل التصفية."
          />
        ) : (
          <div className="overflow-x-auto">
            <DataTable
              ariaLabel="التراخيص"
              rows={licenses}
              rowKey={(license: any) => String(license.id)}
              minWidth={1000}
              dense
              tableClassName="text-[11px]"
              rowClassName={() => 'transition hover:bg-surface-muted/60'}
              columns={[
                {
                  key: 'key', header: 'المفتاح',
                  render: (license: any) => (
                    <span className="block">
                      <span className="block font-mono text-[11px] font-bold text-ink" dir="ltr">{license.licenseKey}</span>
                      <span className="text-[10px] text-muted">{formatDate(license.issuedAt)}</span>
                    </span>
                  ),
                },
                { key: 'tenant', header: 'العميل', render: (license: any) => <span className="text-[12px] font-semibold text-ink">{license.tenantName || '—'}</span> },
                { key: 'plan', header: 'الخطة', render: (license: any) => <span className="text-[11.5px] text-ink-secondary">{license.planName || '—'}</span> },
                { key: 'status', header: 'الحالة', render: (license: any) => <StatusBadge value={license.status} label={LICENSE_STATUS_LABELS[license.status as keyof typeof LICENSE_STATUS_LABELS]} /> },
                { key: 'start', header: 'يبدأ من', render: (license: any) => <span className="text-[11px] text-ink-secondary">{formatDate(license.startsAt)}</span> },
                { key: 'end', header: 'ينتهي في', render: (license: any) => <span className="text-[11px] text-ink-secondary">{formatDate(license.expiresAt)}</span> },
                { key: 'seats', header: 'المستخدمون', render: (license: any) => <span className="text-[11px] font-semibold text-ink">{license.seats}</span> },
                { key: 'devices', header: 'الأجهزة', render: (license: any) => <span className="text-[11px] font-semibold text-ink">{license.deviceLimit}</span> },
                { key: 'branches', header: 'الفروع', render: (license: any) => <span className="text-[11px] font-semibold text-ink">{license.branchesLimit}</span> },
                { key: 'coupling', header: 'الربط', render: (license: any) => <span className="text-[10px] text-muted">{COUPLING_LABELS[(license.couplingMode ?? 'FULL') as keyof typeof COUPLING_LABELS]}</span> },
                {
                  key: 'actions', header: 'إجراءات',
                  render: (license: any) => (
                    <span className="flex items-center gap-1">
                      {canManageLicenses && (
                        <>
                          <button type="button" onClick={() => { setRenewTarget(license); setRenewMonths(12); }} className="rounded p-1.5 text-muted hover:bg-success-soft hover:text-success" title="تجديد">
                            <RefreshCw className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" onClick={() => { setHardwareTarget(license); setHardwareId(license.hardwareId ?? ''); }} className="rounded p-1.5 text-muted hover:bg-accent-soft hover:text-primary" title="ربط جهاز">
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
                          {license.hardwareId && (!centralMode || deviceIdForLicense(license)) && (
                            <button
                              type="button"
                              onClick={() => {
                                const deviceId = deviceIdForLicense(license);
                                if (deviceId) openDeviceAction('release', { id: deviceId, hardwareId: license.hardwareId ?? '', tenantId: license.tenantId, status: license.status });
                              }}
                              className="rounded p-1.5 text-muted hover:bg-accent-soft hover:text-primary"
                              title="تحرير الجهاز"
                            >
                              <Link className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {license.status === 'ACTIVE' && (!centralMode || deviceIdForLicense(license)) && (
                            <button
                              type="button"
                              onClick={() => {
                                const deviceId = deviceIdForLicense(license);
                                if (deviceId) openDeviceAction('suspend', { id: deviceId, hardwareId: license.hardwareId ?? '', tenantId: license.tenantId, status: license.status });
                              }}
                              className="rounded p-1.5 text-muted hover:bg-warning-soft hover:text-warning"
                              title="إيقاف الجهاز"
                            >
                              <ShieldAlert className="h-3.5 w-3.5" />
                            </button>
                          )}
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

      {/* Issue license */}
      <Modal
        open={issueOpen}
        onClose={() => setIssueOpen(false)}
        title="إصدار ترخيص جديد"
        description="اختر العميل والخطة ومدة الترخيص."
        size="md"
        busy={saving}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setIssueOpen(false)} disabled={saving}>إلغاء</Button>
            <Button variant="primary" onClick={() => void issue()} loading={saving} disabled={!canManageLicenses}>إصدار الترخيص</Button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="العميل" required className="sm:col-span-2">
            <select className={inputClass} value={issueForm.tenantId} onChange={(event) => setIssueForm({ ...issueForm, tenantId: event.target.value })}>
              <option value="">اختر العميل</option>
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>{tenant.name} — {tenant.code}</option>
              ))}
            </select>
          </Field>
          <Field label="الخطة" required>
            <select
              className={inputClass}
              value={issueForm.planId}
              onChange={(event) => {
                const plan = plans.find((item) => item.id === event.target.value);
                setIssueForm({ ...issueForm, planId: event.target.value, seats: plan?.seatsLimit ?? issueForm.seats, branchesLimit: plan?.branchesLimit ?? issueForm.branchesLimit, offlineGracePeriodDays: plan?.offlineGracePeriodDays ?? issueForm.offlineGracePeriodDays });
              }}
            >
              <option value="">اختر الخطة</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>{plan.name}</option>
              ))}
            </select>
          </Field>
          <Field label="المدة (أشهر)">
            <input type="number" min={1} className={inputClass} value={issueForm.months} onChange={(event) => setIssueForm({ ...issueForm, months: Number(event.target.value) })} />
          </Field>
          <Field label="عدد المستخدمين">
            <input type="number" min={1} className={inputClass} value={issueForm.seats} onChange={(event) => setIssueForm({ ...issueForm, seats: Number(event.target.value) })} />
          </Field>
          <Field label="الفروع المسموح بها">
            <input type="number" min={1} className={inputClass} value={issueForm.branchesLimit} onChange={(event) => setIssueForm({ ...issueForm, branchesLimit: Number(event.target.value) })} />
          </Field>
          <Field label="فترة السماح أوفلاين (أيام)">
            <input type="number" min={0} className={inputClass} value={issueForm.offlineGracePeriodDays} onChange={(event) => setIssueForm({ ...issueForm, offlineGracePeriodDays: Number(event.target.value) })} />
          </Field>
          <Field label="نوع الربط بالاشتراك">
            <select className={inputClass} value={issueForm.couplingMode} onChange={(event) => setIssueForm({ ...issueForm, couplingMode: event.target.value as PlatformCouplingMode })}>
              <option value="FULL">كامل (المزامنة التلقائية)</option>
              <option value="EXPIRY_ONLY">انتهاء الصلاحية فقط</option>
              <option value="NONE">مستقل تماماً</option>
            </select>
          </Field>
          <Field label="ملاحظات" className="sm:col-span-2">
            <textarea rows={2} className={inputClass} value={issueForm.notes} onChange={(event) => setIssueForm({ ...issueForm, notes: event.target.value })} />
          </Field>
        </div>
      </Modal>

      {/* Renew */}
      <Modal
        open={Boolean(renewTarget)}
        onClose={() => setRenewTarget(null)}
        title="تجديد الترخيص"
        description={renewTarget ? `تجديد ترخيص ${renewTarget.tenantName ?? ''} منذ تاريخ الانتهاء الحالي.` : undefined}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRenewTarget(null)}>إلغاء</Button>
            <Button variant="primary" onClick={() => void renew()} disabled={!canManageLicenses}>تجديد</Button>
          </div>
        }
      >
        <Field label="المدة (أشهر)">
          <input type="number" min={1} className={inputClass} value={renewMonths} onChange={(event) => setRenewMonths(Number(event.target.value))} />
        </Field>
        {renewTarget && (
          <p className="mt-3 rounded-lg bg-surface-muted px-3 py-2 text-[11px] text-ink-secondary">
            ينتهي حالياً في <b>{formatDate(renewTarget.expiresAt)}</b>
          </p>
        )}
      </Modal>

      {/* Hardware */}
      <Modal
        open={Boolean(hardwareTarget)}
        onClose={() => setHardwareTarget(null)}
        title="ربط الترخيص بجهاز"
        description="أدخل معرف الجهاز (Hardware ID) لتقييد الترخيص به."
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setHardwareTarget(null)}>إلغاء</Button>
            <Button variant="primary" onClick={() => void bindHardware()} disabled={!canManageLicenses}>حفظ الربط</Button>
          </div>
        }
      >
        <Field label="معرف الجهاز" hint="اتركه فارغاً لإلغاء الربط">
          <input dir="ltr" className={inputClass} value={hardwareId} onChange={(event) => setHardwareId(event.target.value)} />
        </Field>
        {hardwareTarget && (
          <p className="mt-3 rounded-lg bg-surface-muted px-3 py-2 font-mono text-[11px] text-ink-secondary" dir="ltr">
            {hardwareTarget.licenseKey}
          </p>
        )}
        <p className="mt-3 text-[10.5px] text-muted">
          آخر تحديث: {formatDateTime(hardwareTarget?.updatedAt)}
        </p>
      </Modal>

      {/* Clone alerts */}
      {cloneAlerts.length > 0 && (
        <section className="rounded-lg border border-warning-border bg-warning-soft p-4">
          <h3 className="text-sm font-bold text-warning mb-2">تنبيهات الاستنساخ المكتشفة</h3>
          <ul className="text-[11px] text-warning space-y-1 list-disc list-inside">
            {cloneAlerts.map((alert, i) => (
              <li key={i}>{alert}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Device action modal */}
      <Modal
        open={Boolean(deviceTarget)}
        onClose={() => { setDeviceTarget(null); setDeviceAction(null); }}
        title={deviceAction === 'suspend' ? 'إيقاف الجهاز' : deviceAction === 'release' ? 'تحرير الجهاز' : 'إلغاء الجهاز'}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setDeviceTarget(null); setDeviceAction(null); }}>إلغاء</Button>
            <Button variant="danger" onClick={() => void executeDeviceAction()} disabled={!canManageLicenses}>
              {deviceAction === 'suspend' ? 'تأكيد الإيقاف' : deviceAction === 'release' ? 'تأكيد التحرير' : 'تأكيد الإلغاء'}
            </Button>
          </div>
        }
      >
        {deviceTarget && (
          <>
            <p className="text-[11px] text-ink-secondary mb-3">
              الجهاز: <span className="font-mono text-[10px] text-ink" dir="ltr">{deviceTarget.hardwareId}</span>
            </p>
            <p className="text-[11px] text-ink-secondary mb-1">
              الإجراء: {deviceAction === 'suspend' ? 'إيقاف' : deviceAction === 'release' ? 'تحرير' : 'إلغاء'}
            </p>
          </>
        )}
      </Modal>
    </div>
  );
};

export default PlatformLicensesPage;
