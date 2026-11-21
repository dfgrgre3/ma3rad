import React from 'react';
import { DataTable } from '../../components/ui/DataTable';
import { Cpu, Download, Search, ShieldAlert } from 'lucide-react';
import { canPlatform } from '../../hooks/platform/usePlatformPermission';
import type { PlatformDevice, PlatformLicense, PlatformTenant } from '../../services/domains/platform/platformTypes';
import { Button } from '../../components/ui/Button';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState, StatusBadge, downloadCsv, formatDateTime, inputClass } from './components/PlatformUI';
import { useToast } from '../../components/ui/Toast';
import {
  detectCloneDevices,
  isCentralMode,
  listDevices,
  listLicenses,
  listTenants,
} from './PlatformDevicesPage/deviceData';
import { DEVICE_STATUS_LABELS, DeviceDetailsDrawer } from './PlatformDevicesPage/DeviceDetailsDrawer';

const DEVICE_STATUSES = ['ACTIVE', 'SUSPENDED', 'REVOKED', 'OFFLINE', 'RELEASED', 'INACTIVE'] as const;

export const PlatformDevicesPage: React.FC = () => {
  const toast = useToast();
  const canManageDevices = canPlatform('devices');
  const [devices, setDevices] = React.useState<PlatformDevice[]>([]);
  const [tenants, setTenants] = React.useState<PlatformTenant[]>([]);
  const [licenses, setLicenses] = React.useState<PlatformLicense[]>([]);
  const [search, setSearch] = React.useState('');
  const [tenantFilter, setTenantFilter] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('');
  const [cloneOnly, setCloneOnly] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [cloneAlerts, setCloneAlerts] = React.useState<string[]>([]);
  const [detailsTarget, setDetailsTarget] = React.useState<PlatformDevice | null>(null);
  const [centralMode, setCentralMode] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const central = isCentralMode();
      setCentralMode(central);
      const [deviceRows, tenantRows, licenseRows] = await Promise.all([
        listDevices({ tenantId: tenantFilter || undefined, status: statusFilter || undefined }),
        listTenants(),
        listLicenses(),
      ]);
      setDevices(deviceRows);
      setTenants(tenantRows);
      setLicenses(licenseRows);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل الأجهزة.');
    } finally {
      setLoading(false);
    }
  }, [tenantFilter, statusFilter]);

  React.useEffect(() => { void load(); }, [load]);

  const filtered = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    return devices.filter((device) => {
      if (cloneOnly && !device.cloneSuspected) return false;
      if (!term) return true;
      return (
        device.hardwareId.toLowerCase().includes(term) ||
        (device.name || '').toLowerCase().includes(term) ||
        (device.os || '').toLowerCase().includes(term) ||
        (device.appVersion || '').toLowerCase().includes(term) ||
        (device.ipAddress || '').toLowerCase().includes(term)
      );
    });
  }, [devices, search, cloneOnly]);

  const stats = React.useMemo(() => {
    const count = (status: string) => devices.filter((device) => device.status === status).length;
    return {
      total: devices.length,
      active: count('ACTIVE'),
      suspended: count('SUSPENDED'),
      revoked: count('REVOKED'),
      offline: count('OFFLINE') + count('RELEASED') + count('INACTIVE'),
      suspected: devices.filter((device) => device.cloneSuspected).length,
    };
  }, [devices]);

  const runCloneDetection = async () => {
    if (!canManageDevices) {
      toast.error('لا تملك صلاحية إدارة الأجهزة');
      return;
    }
    try {
      const result = await detectCloneDevices();
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
  };

  const exportRows = () => {
    if (!canManageDevices) {
      toast.error('لا تملك صلاحية إدارة الأجهزة');
      return;
    }
    const tenantName = (device: PlatformDevice) => tenants.find((item) => item.id === device.tenantId)?.name ?? device.tenantId;
    const licenseKey = (device: PlatformDevice) =>
      device.licenseId ? licenses.find((item) => item.id === device.licenseId)?.licenseKey ?? '' : '';
    downloadCsv('platform-devices.csv', [
      ['العميل', 'Hardware ID', 'الاسم', 'نظام التشغيل', 'الإصدار', 'IP', 'الترخيص', 'الحالة', 'اشتباه استنساخ', 'أول تفعيل', 'آخر ظهور'],
      ...filtered.map((device) => [
        tenantName(device),
        device.hardwareId,
        device.name ?? '',
        device.os ?? '',
        device.appVersion ?? '',
        device.ipAddress ?? '',
        licenseKey(device),
        DEVICE_STATUS_LABELS[device.status] ?? device.status,
        device.cloneSuspected ? 'نعم' : 'لا',
        device.firstActivatedAt ?? '',
        device.lastSeenAt ?? '',
      ]),
    ]);
    toast.success(`تم تصدير ${filtered.length} جهاز`);
  };

  const statCard = (label: string, value: number, tone = 'text-ink') => (
    <div className="rounded-xl border border-line bg-surface px-3 py-2.5 shadow-sm">
      <p className="text-[10px] font-bold text-muted">{label}</p>
      <p className={`mt-0.5 text-lg font-black ${tone}`}>{value}</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="الأجهزة"
        description="إدارة الأجهزة المفعلة: Hardware ID، حالة الربط، الإيقاف عن بُعد، الكشف عن الاستنساخ."
        icon={<Cpu className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap gap-2">
            {canManageDevices && (
              <>
                <Button variant="ghost" size="sm" leadingIcon={<Download className="h-3.5 w-3.5" />} onClick={exportRows}>
                  تصدير CSV
                </Button>
                <Button variant="ghost" size="sm" leadingIcon={<ShieldAlert className="h-3.5 w-3.5" />} onClick={() => void runCloneDetection()}>
                  كشف الاستنساخ
                </Button>
              </>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {statCard('الإجمالي', stats.total)}
        {statCard('نشط', stats.active, 'text-success')}
        {statCard('موقوف', stats.suspended, 'text-warning')}
        {statCard('ملغي', stats.revoked, 'text-danger')}
        {statCard('غير متصل', stats.offline, 'text-muted')}
        {statCard('مشتبه', stats.suspected, stats.suspected > 0 ? 'text-warning' : 'text-ink')}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-3 shadow-sm">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث بـ Hardware ID أو الاسم أو النظام أو IP..." className={`${inputClass} pr-8`} />
        </div>
        <select value={tenantFilter} onChange={(event) => setTenantFilter(event.target.value)} className={`${inputClass} max-w-[180px]`}>
          <option value="">كل العملاء</option>
          {tenants.map((tenant) => (
            <option key={tenant.id} value={tenant.id}>{tenant.name}</option>
          ))}
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={`${inputClass} max-w-[150px]`}>
          <option value="">كل الحالات</option>
          {DEVICE_STATUSES.map((status) => (
            <option key={status} value={status}>{DEVICE_STATUS_LABELS[status]}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setCloneOnly((value) => !value)}
          className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition ${cloneOnly ? 'bg-warning-soft text-warning' : 'bg-surface-sunken text-muted hover:text-ink'}`}
        >
          المشتبه فقط
        </button>
        <span className="rounded-full bg-surface-sunken px-2.5 py-1 text-[11px] font-bold text-ink-secondary">{filtered.length} جهاز</span>
      </div>

      {error && <div role="alert" className="rounded-lg border border-danger-border bg-danger-soft px-4 py-2.5 text-xs font-semibold text-danger">{error}</div>}

      {cloneAlerts.length > 0 && (
        <section className="rounded-lg border border-warning-border bg-warning-soft p-4">
          <h3 className="mb-2 text-sm font-bold text-warning">تنبيهات الاستنساخ</h3>
          <ul className="list-inside list-disc space-y-1 text-[11px] text-warning">
            {cloneAlerts.map((alert, index) => (
              <li key={index}>{alert}</li>
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
              rowClassName={() => 'cursor-pointer transition hover:bg-surface-muted/60'}
              onRowClick={(device) => setDetailsTarget(device)}
              columns={[
                { key: 'tenant', header: 'العميل', render: (device) => { const tenant = tenants.find((item) => item.id === device.tenantId); return <span className="text-[11.5px] font-semibold text-ink">{tenant?.name || device.tenantId}</span>; } },
                { key: 'hw', header: 'Hardware ID', render: (device) => <span className="font-mono text-[10.5px]" dir="ltr">{device.hardwareId}</span> },
                { key: 'name', header: 'الاسم', render: (device) => <span className="text-[11px] text-ink-secondary">{device.name || '—'}</span> },
                { key: 'os', header: 'نظام التشغيل', render: (device) => <span className="text-[11px] text-ink-secondary">{device.os || '—'}</span> },
                { key: 'ver', header: 'الإصدار', render: (device) => <span className="text-[11px] text-ink-secondary">{device.appVersion || '—'}</span> },
                { key: 'ip', header: 'IP', render: (device) => <span className="font-mono text-[10.5px]" dir="ltr">{device.ipAddress || '—'}</span> },
                { key: 'license', header: 'الترخيص', render: (device) => { const license = device.licenseId ? licenses.find((item) => item.id === device.licenseId) : null; return <span className="font-mono text-[10px] text-muted" dir="ltr">{license?.licenseKey ?? (device.licenseId ? '—' : 'غير مرتبط')}</span>; } },
                { key: 'first', header: 'أول تفعيل', render: (device) => <span className="text-[10.5px] text-ink-secondary">{formatDateTime(device.firstActivatedAt)}</span> },
                { key: 'seen', header: 'آخر اتصال', render: (device) => <span className="text-[10.5px] text-ink-secondary">{device.lastSeenAt ? formatDateTime(device.lastSeenAt) : '—'}</span> },
                {
                  key: 'status', header: 'الحالة',
                  render: (device) => (
                    <span className="flex items-center gap-1">
                      <StatusBadge value={device.status} label={DEVICE_STATUS_LABELS[device.status] ?? device.status} />
                      {device.cloneSuspected && <span className="rounded-full bg-warning-soft px-1.5 py-0.5 text-[9px] font-bold text-warning">استنساخ</span>}
                    </span>
                  ),
                },
              ]}
            />
          </div>
        )}
      </section>

      <DeviceDetailsDrawer
        device={detailsTarget ? devices.find((item) => item.id === detailsTarget.id) ?? detailsTarget : null}
        tenants={tenants}
        licenses={licenses}
        canManage={canManageDevices}
        centralMode={centralMode}
        onClose={() => setDetailsTarget(null)}
        onChanged={() => void load()}
      />
    </div>
  );
};

export default PlatformDevicesPage;
