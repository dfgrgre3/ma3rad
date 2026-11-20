import React from 'react';
import { DataTable } from '../../components/ui/DataTable';
import { Cpu, Search, ShieldAlert, ShieldX, Link } from 'lucide-react';
import { platformAdminService } from '../../services/domains/platform/PlatformAdminService';
import { centralPlatformClient } from '../../services/domains/platform/CentralPlatformClient';
import { getCentralDataSourceState } from '../../hooks/platform/useCentralDataSource';
import { canPlatform } from '../../hooks/platform/usePlatformPermission';
import type { PlatformDevice, PlatformTenant } from '../../services/domains/platform/platformTypes';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState, formatDateTime, inputClass } from './components/PlatformUI';

import { useToast } from '../../components/ui/Toast';
export const PlatformDevicesPage: React.FC = () => {
  const toast = useToast();
  const canManageDevices = canPlatform('devices');
  const [devices, setDevices] = React.useState<PlatformDevice[]>([]);
  const [tenants, setTenants] = React.useState<PlatformTenant[]>([]);
  const [search, setSearch] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [deviceTarget, setDeviceTarget] = React.useState<{ id: string; hardwareId: string; tenantId: string; status: string } | null>(null);
  const [deviceAction, setDeviceAction] = React.useState<'suspend' | 'release' | 'revoke' | 'toggle' | 'delete' | null>(null);
  const [cloneAlerts, setCloneAlerts] = React.useState<string[]>([]);
  const [centralMode, setCentralMode] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setCloneAlerts([]);
    try {
      const central = getCentralDataSourceState();
      setCentralMode(central.active);
      if (central.misconfigured) {
        throw new Error('مصدر البيانات مضبوط على «المركزي» لكن جسر الاتصال بالسيرفر غير متاح في هذا الإصدار.');
      }
      if (central.active) {
        const [centralDevices, centralTenants] = await Promise.all([
          centralPlatformClient.listDevices(),
          centralPlatformClient.listTenants(),
        ]);
        setDevices(centralDevices);
        setTenants(centralTenants);
      } else {
        setDevices(platformAdminService.listDevices());
        setTenants(platformAdminService.listTenants());
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل الأجهزة.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const filtered = devices.filter((device) =>
    !search.trim() ||
    device.hardwareId.toLowerCase().includes(search.toLowerCase()) ||
    (device.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (device.os || '').toLowerCase().includes(search.toLowerCase())
  );

  const detectClones = async () => {
    if (!canManageDevices) { toast.error('لا تملك صلاحية إدارة الأجهزة'); return; }
    const central = getCentralDataSourceState();
    if (central.misconfigured) {
      toast.error('مصدر البيانات مضبوط على «المركزي» لكن جسر الاتصال بالسيرفر غير متاح في هذا الإصدار.');
      return;
    }
    if (central.active) {
      try {
        const result = await centralPlatformClient.detectCloneDevices();
        setCloneAlerts(result.alerts);
        if (result.alerts.length > 0) {
          toast.warning(`تم اكتشاف ${result.alerts.length} حالة اشتباه استنساخ`);
        } else {
          toast.success('لا يوجد اشتباه استنساخ بين الأجهزة');
        }
        await load();
      } catch (err) {
        toast.error('تعذر الكشف عن الاستنساخ', err instanceof Error ? err.message : undefined);
      }
      return;
    }
    try {
      // Use the license page's detection by listing devices and checking for duplicates
      const hwids = new Map<string, PlatformDevice[]>();
      // Scan the FULL device list — clone detection must not be limited to
      // whatever rows happen to be visible under the current search filter.
      for (const d of devices) {
        const list = hwids.get(d.hardwareId) ?? [];
        list.push(d);
        hwids.set(d.hardwareId, list);
      }
      const duplicates: string[] = [];
      for (const [hwid, list] of hwids.entries()) {
        if (list.length > 1) {
          duplicates.push(`بصمة العتاد ${hwid} مستخدمة على ${list.length} أجهزة`);
        }
      }
      setCloneAlerts(duplicates);
      if (duplicates.length > 0) {
        toast.warning(`تم اكتشاف ${duplicates.length} حالة اشتباه استنساخ`);
      } else {
        toast.success('لا يوجد اشتباه استنساخ بين جميع الأجهزة');
      }
    } catch (err) {
      toast.error('تعذر الكشف عن الاستنساخ', err instanceof Error ? err.message : undefined);
    }
  };

  const openDeviceAction = (action: 'suspend' | 'release' | 'revoke' | 'toggle' | 'delete', device: { id: string; hardwareId: string; tenantId: string; status: string }) => {
    setDeviceTarget(device);
    setDeviceAction(action);
  };

  const executeDeviceAction = async () => {
    if (!deviceTarget || !deviceAction) return;
    if (!canManageDevices) { toast.error('لا تملك صلاحية إدارة الأجهزة'); return; }
    const central = getCentralDataSourceState();
    if (central.misconfigured) {
      toast.error('مصدر البيانات مضبوط على «المركزي» لكن جسر الاتصال بالسيرفر غير متاح في هذا الإصدار.');
      return;
    }
    if (central.active && (deviceAction === 'toggle' || deviceAction === 'delete')) {
      toast.warning('تبديل الحالة والحذف متاحان في الوضع المحلي فقط — استخدم إيقاف/تحرير/إلغاء للأجهزة المركزية.');
      return;
    }
    try {
      if (central.active) {
        const reason = `إجراء ${deviceAction} عبر لوحة الأجهزة`;
        if (deviceAction === 'suspend') {
          await centralPlatformClient.suspendDevice(deviceTarget.id, reason);
        } else if (deviceAction === 'release') {
          await centralPlatformClient.releaseDevice(deviceTarget.id, reason);
        } else {
          await centralPlatformClient.revokeDevice(deviceTarget.id, reason);
        }
      } else if (deviceAction === 'suspend') {
        platformAdminService.suspendDevice(deviceTarget.id, 'إيقاف عبر لوحة الأجهزة');
      } else if (deviceAction === 'release') {
        platformAdminService.releaseDevice(deviceTarget.id, 'تحرير عبر لوحة الأجهزة');
      } else if (deviceAction === 'revoke') {
        platformAdminService.revokeDevice(deviceTarget.id, 'إلغاء عبر لوحة الأجهزة');
      } else if (deviceAction === 'toggle') {
        platformAdminService.setDeviceStatus(deviceTarget.id, deviceTarget.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE');
      } else if (deviceAction === 'delete') {
        platformAdminService.deleteDevice(deviceTarget.id);
      }
      toast.success(
        deviceAction === 'suspend' ? 'تم إيقاف الجهاز'
        : deviceAction === 'release' ? 'تم تحرير الجهاز'
        : deviceAction === 'revoke' ? 'تم إلغاء الجهاز'
        : deviceAction === 'toggle' ? 'تم تبديل حالة الجهاز'
        : 'تم حذف تفعيل الجهاز'
      );
      setDeviceTarget(null);
      setDeviceAction(null);
      await load();
    } catch (err) {
      toast.error('تعذر تنفيذ الإجراء', err instanceof Error ? err.message : undefined);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="الأجهزة"
        description="إدارة الأجهزة المفعلة: Hardware ID، حالة الربط، الإيقاف عن بُعد، الكشف عن الاستنساخ."
        icon={<Cpu className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap gap-2">
            {canManageDevices && (
              <Button variant="ghost" size="sm" leadingIcon={<ShieldAlert className="h-3.5 w-3.5" />} onClick={() => void detectClones()}>
                كشف الاستنساخ
              </Button>
            )}
          </div>
        }
      />
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-3 shadow-sm">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث بـ Hardware ID أو الاسم أو نظام التشغيل..." className={`${inputClass} pr-8`} />
        </div>
        <span className="rounded-full bg-surface-sunken px-2.5 py-1 text-[11px] font-bold text-ink-secondary">{filtered.length} جهاز</span>
      </div>
      {error && <div role="alert" className="rounded-lg border border-danger-border bg-danger-soft px-4 py-2.5 text-xs font-semibold text-danger">{error}</div>}
      {cloneAlerts.length > 0 && (
        <section className="rounded-lg border border-warning-border bg-warning-soft p-4">
          <h3 className="text-sm font-bold text-warning mb-2">تنبيهات الاستنساخ</h3>
          <ul className="text-[11px] text-warning space-y-1 list-disc list-inside">
            {cloneAlerts.map((alert, i) => (
              <li key={i}>{alert}</li>
            ))}
          </ul>
        </section>
      )}
      <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
        {loading ? (
          <div className="py-16 text-center text-sm font-semibold text-muted">جارٍ تحميل الأجهزة...</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={<Cpu className="h-5 w-5" />} title="لا توجد أجهزة مسجلة" description="ستُسجّل الأجهزة عند ربط التراخيص." />
        ) : (
          <div className="overflow-x-auto">
            <DataTable
              ariaLabel="أجهزة العملاء"
              rows={filtered}
              rowKey={(device) => String(device.id)}
              minWidth={1000}
              dense
              tableClassName="text-[11px]"
              rowClassName={() => 'transition hover:bg-surface-muted/60'}
              columns={[
                { key: 'tenant', header: 'العميل', render: (device) => { const tenant = tenants.find((item) => item.id === device.tenantId); return <span className="text-[11.5px] font-semibold text-ink">{tenant?.name || device.tenantId}</span>; } },
                { key: 'hw', header: 'Hardware ID', render: (device) => <span className="font-mono text-[10.5px]" dir="ltr">{device.hardwareId}</span> },
                { key: 'name', header: 'الاسم', render: (device) => <span className="text-[11px] text-ink-secondary">{device.name || '—'}</span> },
                { key: 'os', header: 'نظام التشغيل', render: (device) => <span className="text-[11px] text-ink-secondary">{device.os || '—'}</span> },
                { key: 'ver', header: 'الإصدار', render: (device) => <span className="text-[11px] text-ink-secondary">{device.appVersion || '—'}</span> },
                { key: 'ip', header: 'IP', render: (device) => <span className="font-mono text-[10.5px]" dir="ltr">{device.ipAddress || '—'}</span> },
                { key: 'first', header: 'أول تفعيل', render: (device) => <span className="text-[10.5px] text-ink-secondary">{formatDateTime(device.firstActivatedAt)}</span> },
                { key: 'seen', header: 'آخر اتصال', render: (device) => <span className="text-[10.5px] text-ink-secondary">{formatDateTime(device.lastSeenAt)}</span> },
                {
                  key: 'status', header: 'الحالة',
                  render: (device) => (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${device.status === 'ACTIVE' ? 'bg-success-soft text-success' : device.status === 'SUSPENDED' ? 'bg-warning-soft text-warning' : 'bg-danger-soft text-danger'}`}>
                      {device.status}{device.cloneSuspected ? ' · استنساخ' : ''}
                    </span>
                  ),
                },
                {
                  key: 'actions', header: 'إجراءات',
                  render: (device) => (
                    <span className="flex items-center gap-1">
                      {canManageDevices && (
                        <>
                          {!centralMode && (
                            <button type="button" onClick={() => openDeviceAction('toggle', { id: device.id, hardwareId: device.hardwareId, tenantId: device.tenantId, status: device.status })} className="rounded p-1.5 text-muted hover:bg-warning-soft hover:text-warning" title="إيقاف/تفعيل">
                              <Cpu className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {device.status === 'ACTIVE' && (
                            <button type="button" onClick={() => openDeviceAction('suspend', { id: device.id, hardwareId: device.hardwareId, tenantId: device.tenantId, status: device.status })} className="rounded p-1.5 text-muted hover:bg-warning-soft hover:text-warning" title="إيقاف عن بُعد">
                              <ShieldAlert className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {device.licenseId && (
                            <button type="button" onClick={() => openDeviceAction('release', { id: device.id, hardwareId: device.hardwareId, tenantId: device.tenantId, status: device.status })} className="rounded p-1.5 text-muted hover:bg-accent-soft hover:text-primary" title="تحرير الربط">
                              <Link className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {device.status !== 'REVOKED' && (
                            <button type="button" onClick={() => openDeviceAction('revoke', { id: device.id, hardwareId: device.hardwareId, tenantId: device.tenantId, status: device.status })} className="rounded p-1.5 text-muted hover:bg-danger-soft hover:text-danger" title="إلغاء الجهاز">
                              <ShieldX className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {!centralMode && (
                            <button type="button" onClick={() => openDeviceAction('delete', { id: device.id, hardwareId: device.hardwareId, tenantId: device.tenantId, status: device.status })} className="rounded p-1.5 text-muted hover:bg-danger-soft hover:text-danger" title="حذف التفعيل">
                              <Cpu className="h-3.5 w-3.5" />
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

      {/* Device action modal */}
      <Modal
        open={Boolean(deviceTarget)}
        onClose={() => { setDeviceTarget(null); setDeviceAction(null); }}
        title={
          deviceAction === 'suspend' ? 'إيقاف الجهاز عن بُعد'
          : deviceAction === 'release' ? 'تحرير الجهاز عن بُعد'
          : deviceAction === 'revoke' ? 'إلغاء الجهاز عن بُعد'
          : deviceAction === 'toggle' ? 'تبديل حالة الجهاز'
          : 'حذف تفعيل الجهاز'
        }
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setDeviceTarget(null); setDeviceAction(null); }}>إلغاء</Button>
            <Button
              variant={deviceAction === 'delete' || deviceAction === 'revoke' ? 'danger' : 'primary'}
              onClick={() => void executeDeviceAction()}
              disabled={!canManageDevices}
            >
              {deviceAction === 'suspend' ? 'تأكيد الإيقاف'
                : deviceAction === 'release' ? 'تأكيد التحرير'
                : deviceAction === 'revoke' ? 'تأكيد الإلغاء'
                : deviceAction === 'toggle' ? 'تأكيد التبديل'
                : 'تأكيد الحذف'}
            </Button>
          </div>
        }
      >
        {deviceTarget && (
          <>
            <p className="text-[11px] text-ink-secondary mb-3">
              الجهاز: <span className="font-mono text-[10px] text-ink" dir="ltr">{deviceTarget.hardwareId}</span>
              {' · '}الحالة الحالية: <span className="font-bold text-ink">{deviceTarget.status}</span>
            </p>
            <p className="text-[11px] font-bold text-ink mb-1">
              الإجراء: {deviceAction === 'suspend' ? 'إيقاف' : deviceAction === 'release' ? 'تحرير' : deviceAction === 'revoke' ? 'إلغاء' : deviceAction === 'toggle' ? 'تبديل الحالة' : 'حذف'}
            </p>
            <p className="text-[11px] text-ink-secondary leading-relaxed">
              {deviceAction === 'suspend' && 'سيتم منع هذا الجهاز من الاتصال بالمنصة فوراً حتى إعادة تفعيله.'}
              {deviceAction === 'release' && 'سيتم فك ارتباط هذا الجهاز بالتراخيص النشطة — سيتطلب تفعيلاً جديداً برخصة صالحة.'}
              {deviceAction === 'revoke' && 'إجراء نهائي: لن يتمكن الجهاز من العمل مع أي ترخيص على المنصة.'}
              {deviceAction === 'toggle' && (deviceTarget.status === 'ACTIVE'
                ? 'سيتم تعليق الجهاز (SUSPENDED) — يمكن إعادة تفعيله لاحقاً.'
                : 'سيتم إعادة تفعيل الجهاز (ACTIVE) وسماحه بالاتصال بالمنصة.')}
              {deviceAction === 'delete' && 'سيتم حذف سجل التفعيل نهائياً من قاعدة البيانات المحلية — لا يمكن التراجع عن هذا الإجراء.'}
            </p>
          </>
        )}
      </Modal>
    </div>
  );
};

export default PlatformDevicesPage;
