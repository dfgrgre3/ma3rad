import React from 'react';
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
import { canPlatform } from '../../hooks/platform/usePlatformPermission';
import type {
  PlatformLicense,
  PlatformLicenseStatus,
  PlatformPlan,
  PlatformTenant,
  PlatformCouplingMode,
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
  inputClass,
} from './components/PlatformUI';

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

  const load = React.useCallback(() => {
    setLoading(true);
    try {
      setLicenses(platformAdminService.listLicenses(search, status));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل التراخيص.');
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  React.useEffect(() => { load(); }, [load]);

  React.useEffect(() => {
    try {
      setTenants(platformAdminService.listTenants());
      setPlans(platformAdminService.listPlans(false));
    } catch {
      /* handled by the list error */
    }
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

  const issue = () => {
    if (!canManageLicenses) {
      toast.error('لا تملك صلاحية إدارة التراخيص');
      return;
    }
    if (!issueForm.tenantId || !issueForm.planId) {
      toast.error('اختر العميل والخطة');
      return;
    }
    setSaving(true);
    try {
      const license = platformAdminService.issueLicense(issueForm.tenantId, issueForm.planId, {
        months: issueForm.months,
        seats: issueForm.seats,
        branchesLimit: issueForm.branchesLimit,
        offlineGracePeriodDays: issueForm.offlineGracePeriodDays,
        couplingMode: issueForm.couplingMode,
        notes: issueForm.notes,
      });
      toast.success('تم إصدار الترخيص', license.licenseKey);
      setIssueOpen(false);
      load();
    } catch (err) {
      toast.error('تعذر إصدار الترخيص', err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = (license: PlatformLicense, next: PlatformLicenseStatus) => {
    if (!canManageLicenses) {
      toast.error('لا تملك صلاحية إدارة التراخيص');
      return;
    }
    const verb = next === 'REVOKED' ? 'إلغاء' : next === 'SUSPENDED' ? 'إيقاف' : 'تفعيل';
    if (!window.confirm(`${verb} الترخيص ${license.licenseKey}؟`)) return;
    try {
      platformAdminService.setLicenseStatus(license.id, next);
      toast.success(`تم ${verb} الترخيص`);
      load();
    } catch (err) {
      toast.error('تعذر تحديث الترخيص', err instanceof Error ? err.message : undefined);
    }
  };

  const renew = () => {
    if (!renewTarget) return;
    if (!canManageLicenses) {
      toast.error('لا تملك صلاحية إدارة التراخيص');
      return;
    }
    try {
      platformAdminService.renewLicense(renewTarget.id, renewMonths);
      toast.success('تم تجديد الترخيص');
      setRenewTarget(null);
      load();
    } catch (err) {
      toast.error('تعذر تجديد الترخيص', err instanceof Error ? err.message : undefined);
    }
  };

  const detectClones = () => {
    if (!canManageLicenses) {
      toast.error('لا تملك صلاحية إدارة التراخيص');
      return;
    }
    try {
      const result = platformAdminService.detectCloneDevices();
      setCloneAlerts(result.alerts);
      if (result.alerts.length > 0) {
        toast.warning(`تم اكتشاف ${result.alerts.length} تنبيه استنساخ`);
      } else {
        toast.success('لا يوجد اشتباه استنساخ');
      }
      load();
    } catch (err) {
      toast.error('تعذر الكشف عن الاستنساخ', err instanceof Error ? err.message : undefined);
    }
  };

  const openDeviceAction = (action: 'suspend' | 'release' | 'revoke', device: { id: string; hardwareId: string; tenantId: string; status: string }) => {
    setDeviceTarget(device);
    setDeviceAction(action);
  };

  const executeDeviceAction = () => {
    if (!deviceTarget || !deviceAction) return;
    if (!canManageLicenses) {
      toast.error('لا تملك صلاحية إدارة التراخيص');
      return;
    }
    try {
      if (deviceAction === 'suspend') {
        platformAdminService.suspendDevice(deviceTarget.id, 'إيقاف عبر لوحة التحكم');
      } else if (deviceAction === 'release') {
        platformAdminService.releaseDevice(deviceTarget.id, 'تحرير عبر لوحة التحكم');
      } else if (deviceAction === 'revoke') {
        platformAdminService.revokeDevice(deviceTarget.id, 'إلغاء عبر لوحة التحكم');
      }
      toast.success(`تم ${deviceAction === 'suspend' ? 'إيقاف' : deviceAction === 'release' ? 'تحرير' : 'إلغاء'} الجهاز`);
      setDeviceTarget(null);
      setDeviceAction(null);
      load();
    } catch (err) {
      toast.error('تعذر تنفيذ الإجراء', err instanceof Error ? err.message : undefined);
    }
  };

  const bindHardware = () => {
    if (!hardwareTarget) return;
    if (!canManageLicenses) {
      toast.error('لا تملك صلاحية إدارة التراخيص');
      return;
    }
    try {
      platformAdminService.bindLicenseHardware(hardwareTarget.id, hardwareId);
      toast.success('تم ربط الترخيص بالجهاز');
      setHardwareTarget(null);
      load();
    } catch (err) {
      toast.error('تعذر ربط الجهاز', err instanceof Error ? err.message : undefined);
    }
  };

  const exportCompliance = () => {
    if (!canManageLicenses) {
      toast.error('لا تملك صلاحية إدارة التراخيص');
      return;
    }
    try {
      const report = platformAdminService.exportLicenseComplianceReport({
        includeActivations: true,
        includeChanges: true,
      });
      const rows = [
        ['المفتاح', 'العميل', 'الخطة', 'الحالة', 'تاريخ الإصدار', 'يبدأ من', 'ينتهي في', 'المستخدمون', 'الأجهزة', 'الفروع', 'معرف الجهاز', 'الربط'],
        ...report.licenses.map((license: any) => [
          license.license_key,
          license.tenantName,
          license.planName,
          license.status,
          license.issued_at,
          license.starts_at || '',
          license.expires_at || '',
          license.seats,
          license.device_limit,
          license.branches_limit,
          license.hardware_id || '',
          license.coupling_mode || 'FULL',
        ]),
      ];
      downloadCsv('license-compliance.csv', rows);
      toast.success(`تم تصدير تقرير الامتثال (${report.summary.totalLicenses} ترخيص)`);
    } catch (err) {
      toast.error('تعذر تصدير التقرير', err instanceof Error ? err.message : undefined);
    }
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
                <Button variant="ghost" size="sm" leadingIcon={<ShieldAlert className="h-3.5 w-3.5" />} onClick={detectClones}>
                  كشف الاستنساخ
                </Button>
                <Button variant="secondary" size="sm" leadingIcon={<Clock className="h-3.5 w-3.5" />} onClick={exportCompliance}>
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

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
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
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">{licenses.length} ترخيص</span>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-700">{error}</div>
      )}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="py-16 text-center text-sm font-semibold text-slate-500">جارٍ تحميل التراخيص...</div>
        ) : licenses.length === 0 ? (
          <EmptyState
            icon={<KeyRound className="h-5 w-5" />}
            title="لا توجد تراخيص مطابقة"
            description="أصدر ترخيصاً جديداً أو غيّر عوامل التصفية."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-right">
              <thead className="bg-slate-50">
                <tr className="text-[10.5px] text-slate-500">
                  <th className="px-4 py-2.5 font-semibold">المفتاح</th>
                  <th className="px-4 py-2.5 font-semibold">العميل</th>
                  <th className="px-4 py-2.5 font-semibold">الخطة</th>
                  <th className="px-4 py-2.5 font-semibold">الحالة</th>
                  <th className="px-4 py-2.5 font-semibold">يبدأ من</th>
                  <th className="px-4 py-2.5 font-semibold">ينتهي في</th>
                  <th className="px-4 py-2.5 font-semibold">المستخدمون</th>
                  <th className="px-4 py-2.5 font-semibold">الأجهزة</th>
                  <th className="px-4 py-2.5 font-semibold">الفروع</th>
                  <th className="px-4 py-2.5 font-semibold">الربط</th>
                  <th className="px-4 py-2.5 font-semibold">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {licenses.map((license) => (
                  <tr key={license.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="px-4 py-2.5">
                      <span className="block font-mono text-[11px] font-bold text-slate-800" dir="ltr">{license.licenseKey}</span>
                      <span className="text-[10px] text-slate-400">{formatDate(license.issuedAt)}</span>
                    </td>
                    <td className="px-4 py-2.5 text-[12px] font-semibold text-slate-700">{license.tenantName || '—'}</td>
                    <td className="px-4 py-2.5 text-[11.5px] text-slate-600">{license.planName || '—'}</td>
                    <td className="px-4 py-2.5"><StatusBadge value={license.status} label={LICENSE_STATUS_LABELS[license.status]} /></td>
                    <td className="px-4 py-2.5 text-[11px] text-slate-600">{formatDate(license.startsAt)}</td>
                    <td className="px-4 py-2.5 text-[11px] text-slate-600">{formatDate(license.expiresAt)}</td>
                    <td className="px-4 py-2.5 text-[11px] font-semibold text-slate-700">{license.seats}</td>
                    <td className="px-4 py-2.5 text-[11px] font-semibold text-slate-700">{license.deviceLimit}</td>
                    <td className="px-4 py-2.5 text-[11px] font-semibold text-slate-700">{license.branchesLimit}</td>
                    <td className="px-4 py-2.5 text-[10px] text-slate-500">{COUPLING_LABELS[license.couplingMode ?? 'FULL']}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1">
                        {canManageLicenses && (
                          <>
                            <button
                              type="button"
                              onClick={() => { setRenewTarget(license); setRenewMonths(12); }}
                              className="rounded p-1.5 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700"
                              title="تجديد"
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => { setHardwareTarget(license); setHardwareId(license.hardwareId ?? ''); }}
                              className="rounded p-1.5 text-slate-500 hover:bg-sky-50 hover:text-sky-700"
                              title="ربط جهاز"
                            >
                              <Cpu className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const next = license.status === 'ACTIVE' || license.status === 'ISSUED' ? 'SUSPENDED' : 'ACTIVE';
                                changeStatus(license, next);
                              }}
                              className="rounded p-1.5 text-slate-500 hover:bg-amber-50 hover:text-amber-700"
                              title={license.status === 'ACTIVE' || license.status === 'ISSUED' ? 'إيقاف' : 'تفعيل'}
                            >
                              {license.status === 'ACTIVE' || license.status === 'ISSUED' ? (
                                <Ban className="h-3.5 w-3.5" />
                              ) : (
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => changeStatus(license, 'REVOKED')}
                              className="rounded p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-700"
                              title="إلغاء"
                            >
                              <ShieldX className="h-3.5 w-3.5" />
                            </button>
                            {license.hardwareId && (
                              <button
                                type="button"
                                onClick={() => openDeviceAction('release', { id: license.id, hardwareId: license.hardwareId ?? '', tenantId: license.tenantId, status: license.status })}
                                className="rounded p-1.5 text-slate-500 hover:bg-blue-50 hover:text-blue-700"
                                title="تحرير الجهاز"
                              >
                                <Link className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {license.status === 'ACTIVE' && (
                              <button
                                type="button"
                                onClick={() => openDeviceAction('suspend', { id: license.id, hardwareId: license.hardwareId ?? '', tenantId: license.tenantId, status: license.status })}
                                className="rounded p-1.5 text-slate-500 hover:bg-orange-50 hover:text-orange-700"
                                title="إيقاف الجهاز"
                              >
                                <ShieldAlert className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
            <Button variant="primary" onClick={issue} loading={saving} disabled={!canManageLicenses}>إصدار الترخيص</Button>
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
            <Button variant="primary" onClick={renew} disabled={!canManageLicenses}>تجديد</Button>
          </div>
        }
      >
        <Field label="المدة (أشهر)">
          <input type="number" min={1} className={inputClass} value={renewMonths} onChange={(event) => setRenewMonths(Number(event.target.value))} />
        </Field>
        {renewTarget && (
          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
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
            <Button variant="primary" onClick={bindHardware} disabled={!canManageLicenses}>حفظ الربط</Button>
          </div>
        }
      >
        <Field label="معرف الجهاز" hint="اتركه فارغاً لإلغاء الربط">
          <input dir="ltr" className={inputClass} value={hardwareId} onChange={(event) => setHardwareId(event.target.value)} />
        </Field>
        {hardwareTarget && (
          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 font-mono text-[11px] text-slate-600" dir="ltr">
            {hardwareTarget.licenseKey}
          </p>
        )}
        <p className="mt-3 text-[10.5px] text-slate-500">
          آخر تحديث: {formatDateTime(hardwareTarget?.updatedAt)}
        </p>
      </Modal>

      {/* Clone alerts */}
      {cloneAlerts.length > 0 && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h3 className="text-sm font-bold text-amber-800 mb-2">تنبيهات الاستنساخ المكتشفة</h3>
          <ul className="text-[11px] text-amber-700 space-y-1 list-disc list-inside">
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
            <Button variant="danger" onClick={executeDeviceAction} disabled={!canManageLicenses}>
              {deviceAction === 'suspend' ? 'تأكيد الإيقاف' : deviceAction === 'release' ? 'تأكيد التحرير' : 'تأكيد الإلغاء'}
            </Button>
          </div>
        }
      >
        {deviceTarget && (
          <>
            <p className="text-[11px] text-slate-600 mb-3">
              الجهاز: <span className="font-mono text-[10px] text-slate-800" dir="ltr">{deviceTarget.hardwareId}</span>
            </p>
            <p className="text-[11px] text-slate-600 mb-1">
              الإجراء: {deviceAction === 'suspend' ? 'إيقاف' : deviceAction === 'release' ? 'تحرير' : 'إلغاء'}
            </p>
          </>
        )}
      </Modal>
    </div>
  );
};

export default PlatformLicensesPage;
