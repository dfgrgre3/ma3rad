import React from 'react';
import {
  Ban,
  CheckCircle2,
  ClipboardCopy,
  Cpu,
  Eye,
  Link2,
  RefreshCw,
  ShieldAlert,
  ShieldX,
  Trash2,
} from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { StatusBadge, EmptyState, Field, formatDate, formatDateTime, inputClass } from '../components/PlatformUI';
import { platformAdminService } from '../../../services/domains/platform/PlatformAdminService';
import { centralPlatformClient } from '../../../services/domains/platform/CentralPlatformClient';
import { useToast } from '../../../components/ui/Toast';
import type {
  PlatformDevice,
  PlatformLicense,
  PlatformLicenseActivation,
  PlatformLicenseChange,
} from '../../../services/domains/platform/platformTypes';
import {
  ACTIVATION_ACTION_LABELS,
  ACTIVATION_STATUS_LABELS,
  COUPLING_LABELS,
  LICENSE_CHANGE_TYPE_LABELS,
  LICENSE_STATUS_LABELS,
} from './licenseData';

type DrawerTab = 'overview' | 'devices' | 'activations' | 'changes';

const DEVICE_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'نشط',
  SUSPENDED: 'موقوف',
  REVOKED: 'ملغي',
  OFFLINE: 'غير متصل',
  RELEASED: 'محرر',
  INACTIVE: 'غير نشط',
};

interface LicenseDetailsDrawerProps {
  license: PlatformLicense | null;
  canManage: boolean;
  centralMode: boolean;
  /** All licenses — used to pick a reassign target within the same tenant. */
  licenses: PlatformLicense[];
  onClose: () => void;
  onChanged: () => void;
}

const InfoRow: React.FC<{ label: string; children: React.ReactNode; mono?: boolean }> = ({ label, children, mono }) => (
  <div className="flex items-start justify-between gap-3 border-b border-line/60 py-2 last:border-0">
    <span className="shrink-0 text-[11px] font-semibold text-muted">{label}</span>
    <span className={`min-w-0 text-left text-[11.5px] font-semibold text-ink ${mono ? 'font-mono text-[10.5px]' : ''}`}>{children}</span>
  </div>
);

const CopyButton: React.FC<{ value: string; label: string }> = ({ value, label }) => {
  const toast = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`تم نسخ ${label}`);
    } catch {
      toast.error('تعذر النسخ');
    }
  };
  return (
    <button type="button" onClick={() => void copy()} className="rounded p-1 text-muted hover:bg-surface-muted hover:text-primary" title={`نسخ ${label}`}>
      <ClipboardCopy className="h-3.5 w-3.5" />
    </button>
  );
};

export const LicenseDetailsDrawer: React.FC<LicenseDetailsDrawerProps> = ({
  license,
  canManage,
  centralMode,
  licenses,
  onClose,
  onChanged,
}) => {
  const toast = useToast();
  const [tab, setTab] = React.useState<DrawerTab>('overview');
  const [devices, setDevices] = React.useState<PlatformDevice[]>([]);
  const [activations, setActivations] = React.useState<PlatformLicenseActivation[]>([]);
  const [changes, setChanges] = React.useState<PlatformLicenseChange[]>([]);
  const [loadingDevices, setLoadingDevices] = React.useState(false);
  const [loadingActivations, setLoadingActivations] = React.useState(false);
  const [loadingChanges, setLoadingChanges] = React.useState(false);
  const [reassignTarget, setReassignTarget] = React.useState<{ device: PlatformDevice; licenseId: string } | null>(null);
  const [busyDeviceId, setBusyDeviceId] = React.useState<string | null>(null);

  const licenseId = license?.id ?? null;

  React.useEffect(() => {
    setTab('overview');
    setDevices([]);
    setActivations([]);
    setChanges([]);
  }, [licenseId]);

  React.useEffect(() => {
    if (!licenseId || tab !== 'devices') return;
    let cancelled = false;
    setLoadingDevices(true);
    (async () => {
      try {
        const all = centralMode
          ? await centralPlatformClient.listDevices()
          : platformAdminService.listDevices();
        if (!cancelled) setDevices(all.filter((device) => device.licenseId === licenseId));
      } catch (err) {
        if (!cancelled) toast.error('تعذر تحميل الأجهزة', err instanceof Error ? err.message : undefined);
      } finally {
        if (!cancelled) setLoadingDevices(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [licenseId, tab, centralMode]);

  React.useEffect(() => {
    if (!licenseId || tab !== 'activations') return;
    let cancelled = false;
    setLoadingActivations(true);
    (async () => {
      try {
        const rows = centralMode
          ? await centralPlatformClient.listLicenseActivations(licenseId)
          : platformAdminService.listLicenseActivations(licenseId);
        if (!cancelled) setActivations(rows);
      } catch (err) {
        if (!cancelled) toast.error('تعذر تحميل سجل التفعيلات', err instanceof Error ? err.message : undefined);
      } finally {
        if (!cancelled) setLoadingActivations(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [licenseId, tab, centralMode]);

  React.useEffect(() => {
    if (!licenseId || tab !== 'changes') return;
    let cancelled = false;
    setLoadingChanges(true);
    (async () => {
      try {
        const rows = centralMode
          ? await centralPlatformClient.listLicenseChanges(licenseId)
          : platformAdminService.listLicenseChanges(licenseId);
        if (!cancelled) setChanges(rows);
      } catch (err) {
        if (!cancelled) toast.error('تعذر تحميل سجل التغييرات', err instanceof Error ? err.message : undefined);
      } finally {
        if (!cancelled) setLoadingChanges(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [licenseId, tab, centralMode]);

  const refreshDevices = React.useCallback(async () => {
    if (!licenseId) return;
    const all = centralMode
      ? await centralPlatformClient.listDevices()
      : platformAdminService.listDevices();
    setDevices(all.filter((device) => device.licenseId === licenseId));
  }, [licenseId, centralMode]);

  const runDeviceAction = async (device: PlatformDevice, action: 'suspend' | 'release' | 'revoke' | 'clone' | 'clear-clone' | 'delete') => {
    if (!license) return;
    const labels: Record<string, string> = {
      suspend: 'إيقاف', release: 'تحرير', revoke: 'إلغاء', clone: 'تمييز كمشبوه', 'clear-clone': 'إزالة الاشتباه', delete: 'حذف',
    };
    if (!window.confirm(`${labels[action]} الجهاز ${device.hardwareId}؟`)) return;
    setBusyDeviceId(device.id);
    try {
      if (centralMode) {
        if (action === 'suspend') await centralPlatformClient.suspendDevice(device.id, 'إيقاف من صفحة التراخيص');
        else if (action === 'release') await centralPlatformClient.releaseDevice(device.id, 'تحرير من صفحة التراخيص');
        else if (action === 'revoke') await centralPlatformClient.revokeDevice(device.id, 'إلغاء من صفحة التراخيص');
        else if (action === 'clone') await centralPlatformClient.setDeviceCloneSuspected(device.id, true);
        else if (action === 'clear-clone') await centralPlatformClient.setDeviceCloneSuspected(device.id, false);
        else if (action === 'delete') await centralPlatformClient.deleteDevice(device.id);
      } else {
        if (action === 'suspend') platformAdminService.suspendDevice(device.id, 'إيقاف من صفحة التراخيص');
        else if (action === 'release') platformAdminService.releaseDevice(device.id, 'تحرير من صفحة التراخيص');
        else if (action === 'revoke') platformAdminService.revokeDevice(device.id, 'إلغاء من صفحة التراخيص');
        else if (action === 'clone') platformAdminService.markDeviceCloneSuspected(device.id, true);
        else if (action === 'clear-clone') platformAdminService.markDeviceCloneSuspected(device.id, false);
        else if (action === 'delete') platformAdminService.deleteDevice(device.id);
      }
      toast.success(`تم ${labels[action]} الجهاز`);
      await refreshDevices();
      onChanged();
    } catch (err) {
      toast.error('تعذر تنفيذ الإجراء', err instanceof Error ? err.message : undefined);
    } finally {
      setBusyDeviceId(null);
    }
  };

  const confirmReassign = async () => {
    if (!reassignTarget || !license) return;
    setBusyDeviceId(reassignTarget.device.id);
    try {
      if (centralMode) {
        await centralPlatformClient.reassignDevice(reassignTarget.device.id, reassignTarget.licenseId, 'نقل من صفحة التراخيص');
      } else {
        platformAdminService.reassignDeviceSeat(reassignTarget.device.id, reassignTarget.licenseId);
      }
      toast.success('تم نقل الجهاز إلى الترخيص الجديد');
      setReassignTarget(null);
      await refreshDevices();
      onChanged();
    } catch (err) {
      toast.error('تعذر نقل الجهاز', err instanceof Error ? err.message : undefined);
    } finally {
      setBusyDeviceId(null);
    }
  };

  const reassignCandidates = license
    ? licenses.filter((item) => item.tenantId === license.tenantId && item.id !== license.id && item.status !== 'REVOKED')
    : [];

  const iconBtn = 'rounded p-1.5 text-muted transition hover:bg-surface-muted';

  return (
    <Modal
      open={Boolean(license)}
      onClose={onClose}
      title={license ? `ترخيص ${license.tenantName ?? license.licenseKey}` : ''}
      description={license?.licenseKey}
      size="xl"
      footer={
        <div className="flex justify-end">
          <Button variant="ghost" onClick={onClose}>إغلاق</Button>
        </div>
      }
    >
      {license && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-1 border-b border-line pb-2">
            {(['overview', 'devices', 'activations', 'changes'] as DrawerTab[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                className={`rounded-lg px-3 py-1.5 text-[11.5px] font-bold transition ${
                  tab === value ? 'bg-primary text-white' : 'text-muted hover:bg-surface-muted'
                }`}
              >
                {value === 'overview' ? 'نظرة عامة' : value === 'devices' ? 'الأجهزة' : value === 'activations' ? 'سجل التفعيلات' : 'سجل التغييرات'}
              </button>
            ))}
            <StatusBadge value={license.status} label={LICENSE_STATUS_LABELS[license.status]} />
          </div>

          {tab === 'overview' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-line bg-surface-muted/40 p-3">
                <InfoRow label="مفتاح الترخيص" mono><span dir="ltr">{license.licenseKey}</span></InfoRow>
                <InfoRow label="العميل">{license.tenantName ?? '—'}</InfoRow>
                <InfoRow label="الخطة">{license.planName ?? '—'}</InfoRow>
                <InfoRow label="تاريخ الإصدار">{formatDate(license.issuedAt)}</InfoRow>
                <InfoRow label="يبدأ من">{formatDate(license.startsAt)}</InfoRow>
                <InfoRow label="ينتهي في">{formatDate(license.expiresAt)}</InfoRow>
                <InfoRow label="الحالة"><StatusBadge value={license.status} label={LICENSE_STATUS_LABELS[license.status]} /></InfoRow>
                <InfoRow label="نوع الربط">{COUPLING_LABELS[(license.couplingMode ?? 'FULL') as keyof typeof COUPLING_LABELS]}</InfoRow>
              </div>
              <div className="rounded-xl border border-line bg-surface-muted/40 p-3">
                <InfoRow label="المستخدمون">{license.seats}</InfoRow>
                <InfoRow label="حد الأجهزة">{license.deviceLimit}</InfoRow>
                <InfoRow label="الفروع">{license.branchesLimit}</InfoRow>
                <InfoRow label="السماح أوفلاين">{license.offlineGracePeriodDays ?? '—'} يوم</InfoRow>
                <InfoRow label="معرف الجهاز" mono>{license.hardwareId ? <span dir="ltr">{license.hardwareId}</span> : 'غير مرتبط'}</InfoRow>
                <InfoRow label="عدد مرات النقل">{license.transferCount ?? 0}</InfoRow>
                <InfoRow label="آخر تحديث">{formatDateTime(license.updatedAt)}</InfoRow>
              </div>
              <div className="rounded-xl border border-line p-3 sm:col-span-2">
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-[11px] font-bold text-ink-secondary">الوحدات المشمولة</h4>
                  <span className="text-[10px] text-muted">{license.modules.length} وحدة</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {license.modules.length === 0 && <span className="text-[11px] text-muted">لا توجد وحدات مسجلة</span>}
                  {license.modules.map((moduleKey) => (
                    <span key={moduleKey} className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-bold text-primary" dir="ltr">{moduleKey}</span>
                  ))}
                </div>
                {license.features.length > 0 && (
                  <>
                    <h4 className="mb-2 mt-3 text-[11px] font-bold text-ink-secondary">المميزات</h4>
                    <div className="flex flex-wrap gap-1">
                      {license.features.map((feature) => (
                        <span key={feature} className="rounded-full bg-surface-sunken px-2 py-0.5 text-[10px] font-bold text-ink-secondary" dir="ltr">{feature}</span>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <div className="rounded-xl border border-line p-3 sm:col-span-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-[11px] font-bold text-ink-secondary">كود التفعيل</h4>
                  {license.activationCode && <CopyButton value={license.activationCode} label="كود التفعيل" />}
                </div>
                <p className="mt-1 font-mono text-[11px] text-ink" dir="ltr">{license.activationCode ?? '—'}</p>
                {license.certificate && (
                  <>
                    <div className="mt-3 flex items-center justify-between">
                      <h4 className="text-[11px] font-bold text-ink-secondary">الشهادة الموقعة</h4>
                      <CopyButton value={typeof license.certificate === 'string' ? license.certificate : JSON.stringify(license.certificate)} label="الشهادة" />
                    </div>
                    <pre className="mt-1 max-h-32 overflow-auto rounded-lg bg-surface-sunken p-2 text-[10px] text-ink-secondary" dir="ltr">
                      {typeof license.certificate === 'string' ? license.certificate : JSON.stringify(license.certificate, null, 2)}
                    </pre>
                  </>
                )}
              </div>
              {license.notes && (
                <div className="rounded-xl border border-line p-3 sm:col-span-2">
                  <h4 className="mb-1 text-[11px] font-bold text-ink-secondary">ملاحظات</h4>
                  <p className="whitespace-pre-wrap text-[11.5px] text-ink-secondary">{license.notes}</p>
                </div>
              )}
            </div>
          )}

          {tab === 'devices' && (
            <div>
              {loadingDevices ? (
                <div className="py-10 text-center text-sm font-semibold text-muted">جارٍ تحميل الأجهزة...</div>
              ) : devices.length === 0 ? (
                <EmptyState icon={<Cpu className="h-5 w-5" />} title="لا توجد أجهزة مرتبطة" description="اربط الترخيص بجهاز عبر زر الربط في الجدول." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b border-line text-right text-[10px] font-bold text-muted">
                        <th className="px-2 py-2">المعرف العتادي</th>
                        <th className="px-2 py-2">الاسم</th>
                        <th className="px-2 py-2">النظام</th>
                        <th className="px-2 py-2">الحالة</th>
                        <th className="px-2 py-2">آخر ظهور</th>
                        <th className="px-2 py-2">اشتباه استنساخ</th>
                        {canManage && <th className="px-2 py-2">إجراءات</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {devices.map((device) => (
                        <tr key={device.id} className="border-b border-line/60 last:border-0">
                          <td className="px-2 py-2 font-mono text-[10px]" dir="ltr">{device.hardwareId}</td>
                          <td className="px-2 py-2">{device.name ?? '—'}</td>
                          <td className="px-2 py-2">{device.os ?? '—'}</td>
                          <td className="px-2 py-2"><StatusBadge value={device.status} label={DEVICE_STATUS_LABELS[device.status] ?? device.status} /></td>
                          <td className="px-2 py-2">{formatDateTime(device.lastSeenAt)}</td>
                          <td className="px-2 py-2">{device.cloneSuspected ? <span className="font-bold text-warning">مشبوه</span> : '—'}</td>
                          {canManage && (
                            <td className="px-2 py-2">
                              <span className="flex items-center gap-1">
                                <button type="button" disabled={busyDeviceId === device.id} onClick={() => void runDeviceAction(device, 'suspend')} className={`${iconBtn} hover:text-warning`} title="إيقاف">
                                  <Ban className="h-3.5 w-3.5" />
                                </button>
                                <button type="button" disabled={busyDeviceId === device.id} onClick={() => void runDeviceAction(device, 'release')} className={`${iconBtn} hover:text-primary`} title="تحرير">
                                  <Link2 className="h-3.5 w-3.5" />
                                </button>
                                <button type="button" disabled={busyDeviceId === device.id} onClick={() => void runDeviceAction(device, 'revoke')} className={`${iconBtn} hover:text-danger`} title="إلغاء">
                                  <ShieldX className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  disabled={busyDeviceId === device.id || reassignCandidates.length === 0}
                                  onClick={() => setReassignTarget({ device, licenseId: reassignCandidates[0]?.id ?? '' })}
                                  className={`${iconBtn} hover:text-primary`}
                                  title={reassignCandidates.length === 0 ? 'لا توجد تراخيص أخرى لنقل الجهاز إليها' : 'نقل إلى ترخيص آخر'}
                                >
                                  <RefreshCw className="h-3.5 w-3.5" />
                                </button>
                                {device.cloneSuspected ? (
                                  <button type="button" disabled={busyDeviceId === device.id} onClick={() => void runDeviceAction(device, 'clear-clone')} className={`${iconBtn} hover:text-success`} title="إزالة الاشتباه">
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                  </button>
                                ) : (
                                  <button type="button" disabled={busyDeviceId === device.id} onClick={() => void runDeviceAction(device, 'clone')} className={`${iconBtn} hover:text-warning`} title="تمييز كمشبوه">
                                    <ShieldAlert className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                <button type="button" disabled={busyDeviceId === device.id} onClick={() => void runDeviceAction(device, 'delete')} className={`${iconBtn} hover:text-danger`} title="حذف">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </span>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === 'activations' && (
            <div>
              {loadingActivations ? (
                <div className="py-10 text-center text-sm font-semibold text-muted">جارٍ تحميل السجل...</div>
              ) : activations.length === 0 ? (
                <EmptyState icon={<Eye className="h-5 w-5" />} title="لا يوجد سجل تفعيلات" description="ستظهر هنا عمليات التفعيل والتجديد والنقل المرتبطة بهذا الترخيص." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b border-line text-right text-[10px] font-bold text-muted">
                        <th className="px-2 py-2">التاريخ</th>
                        <th className="px-2 py-2">الإجراء</th>
                        <th className="px-2 py-2">الحالة</th>
                        <th className="px-2 py-2">الوضع</th>
                        <th className="px-2 py-2">عنوان IP</th>
                        <th className="px-2 py-2">ملاحظات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activations.map((activation) => (
                        <tr key={activation.id} className="border-b border-line/60 last:border-0">
                          <td className="px-2 py-2 whitespace-nowrap">{formatDateTime(activation.createdAt)}</td>
                          <td className="px-2 py-2 font-semibold">{ACTIVATION_ACTION_LABELS[activation.action] ?? activation.action}</td>
                          <td className="px-2 py-2"><StatusBadge value={activation.status} label={ACTIVATION_STATUS_LABELS[activation.status] ?? activation.status} /></td>
                          <td className="px-2 py-2">{activation.mode === 'ONLINE' ? 'متصل' : 'غير متصل'}</td>
                          <td className="px-2 py-2 font-mono text-[10px]" dir="ltr">{activation.ipAddress ?? '—'}</td>
                          <td className="px-2 py-2 text-muted">{activation.notes ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          {tab === 'changes' && (
            <div>
              {loadingChanges ? (
                <div className="py-10 text-center text-sm font-semibold text-muted">جارٍ تحميل سجل التغييرات...</div>
              ) : changes.length === 0 ? (
                <EmptyState icon={<Eye className="h-5 w-5" />} title="لا توجد تغييرات مسجلة" description="ستظهر هنا تعديلات وحدود وحالات هذا الترخيص." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b border-line text-right text-[10px] font-bold text-muted">
                        <th className="px-2 py-2">التاريخ</th>
                        <th className="px-2 py-2">نوع التغيير</th>
                        <th className="px-2 py-2">القيم</th>
                        <th className="px-2 py-2">بواسطة</th>
                        <th className="px-2 py-2">السبب</th>
                      </tr>
                    </thead>
                    <tbody>
                      {changes.map((change) => (
                        <tr key={change.id} className="border-b border-line/60 last:border-0 align-top">
                          <td className="px-2 py-2 whitespace-nowrap">{formatDateTime(change.createdAt)}</td>
                          <td className="px-2 py-2 font-semibold">{LICENSE_CHANGE_TYPE_LABELS[change.changeType] ?? change.changeType}</td>
                          <td className="px-2 py-2 max-w-[280px]">
                            {change.oldValues || change.newValues ? (
                              <details className="text-[10px] text-muted">
                                <summary className="cursor-pointer font-bold text-primary">عرض التفاصيل</summary>
                                <pre className="mt-1 max-h-32 overflow-auto rounded bg-surface-sunken p-2 text-[9.5px]" dir="ltr">
                                  {JSON.stringify({ old: change.oldValues, new: change.newValues }, null, 2)}
                                </pre>
                              </details>
                            ) : '—'}
                          </td>
                          <td className="px-2 py-2">{change.actorName ?? '—'}</td>
                          <td className="px-2 py-2 text-muted">{change.reason ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Reassign device modal */}
      <Modal
        open={Boolean(reassignTarget)}
        onClose={() => setReassignTarget(null)}
        title="نقل الجهاز إلى ترخيص آخر"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setReassignTarget(null)}>إلغاء</Button>
            <Button variant="primary" onClick={() => void confirmReassign()} disabled={!reassignTarget?.licenseId || busyDeviceId !== null}>
              نقل الجهاز
            </Button>
          </div>
        }
      >
        {reassignTarget && (
          <div className="space-y-3">
            <p className="text-[11px] text-ink-secondary">
              الجهاز: <span className="font-mono text-[10px] text-ink" dir="ltr">{reassignTarget.device.hardwareId}</span>
            </p>
            <Field label="الترخيص الهدف" required>
              <select
                className={inputClass}
                value={reassignTarget.licenseId}
                onChange={(event) => setReassignTarget({ ...reassignTarget, licenseId: event.target.value })}
              >
                <option value="">اختر الترخيص</option>
                {reassignCandidates.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.tenantName ?? item.tenantId} — {item.licenseKey} ({LICENSE_STATUS_LABELS[item.status]})
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
      </Modal>
    </Modal>
  );
};
