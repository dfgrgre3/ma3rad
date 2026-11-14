import React from 'react';
import { Cpu, Search } from 'lucide-react';
import { platformAdminService } from '../../services/domains/platform/PlatformAdminService';
import type { PlatformDevice, PlatformTenant } from '../../services/domains/platform/platformTypes';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState, formatDateTime, inputClass } from './components/PlatformUI';

export const PlatformDevicesPage: React.FC = () => {
  const [devices, setDevices] = React.useState<PlatformDevice[]>([]);
  const [tenants, setTenants] = React.useState<PlatformTenant[]>([]);
  const [search, setSearch] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setLoading(true);
    try {
      setDevices(platformAdminService.listDevices());
      setTenants(platformAdminService.listTenants());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل الأجهزة.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const filtered = devices.filter((device) =>
    !search.trim() ||
    device.hardwareId.toLowerCase().includes(search.toLowerCase()) ||
    (device.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (device.os || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <PageHeader title="الأجهزة" description="الأجهزة المفعلة لكل عميل: Hardware ID، نظام التشغيل، الإصدار، آخر اتصال، الحالة." icon={<Cpu className="h-5 w-5" />} />
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث بـ Hardware ID أو الاسم أو نظام التشغيل..." className={`${inputClass} pr-8`} />
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">{filtered.length} جهاز</span>
      </div>
      {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-700">{error}</div>}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="py-16 text-center text-sm font-semibold text-slate-500">جارٍ تحميل الأجهزة...</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={<Cpu className="h-5 w-5" />} title="لا توجد أجهزة مسجلة" description="ستُسجّل الأجهزة عند ربط التراخيص." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-right">
              <thead className="bg-slate-50 text-[10.5px] text-slate-500">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">العميل</th>
                  <th className="px-3 py-2.5 font-semibold">Hardware ID</th>
                  <th className="px-3 py-2.5 font-semibold">الاسم</th>
                  <th className="px-3 py-2.5 font-semibold">نظام التشغيل</th>
                  <th className="px-3 py-2.5 font-semibold">الإصدار</th>
                  <th className="px-3 py-2.5 font-semibold">IP</th>
                  <th className="px-3 py-2.5 font-semibold">أول تفعيل</th>
                  <th className="px-3 py-2.5 font-semibold">آخر اتصال</th>
                  <th className="px-3 py-2.5 font-semibold">الحالة</th>
                  <th className="px-3 py-2.5 font-semibold">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((device) => {
                  const tenant = tenants.find((item) => item.id === device.tenantId);
                  return (
                    <tr key={device.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                      <td className="px-3 py-2.5 text-[11.5px] font-semibold text-slate-700">{tenant?.name || device.tenantId}</td>
                      <td className="px-3 py-2.5 font-mono text-[10.5px]" dir="ltr">{device.hardwareId}</td>
                      <td className="px-3 py-2.5 text-[11px] text-slate-600">{device.name || '—'}</td>
                      <td className="px-3 py-2.5 text-[11px] text-slate-600">{device.os || '—'}</td>
                      <td className="px-3 py-2.5 text-[11px] text-slate-600">{device.appVersion || '—'}</td>
                      <td className="px-3 py-2.5 font-mono text-[10.5px]" dir="ltr">{device.ipAddress || '—'}</td>
                      <td className="px-3 py-2.5 text-[10.5px] text-slate-600">{formatDateTime(device.firstActivatedAt)}</td>
                      <td className="px-3 py-2.5 text-[10.5px] text-slate-600">{formatDateTime(device.lastSeenAt)}</td>
                      <td className="px-3 py-2.5">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${device.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : device.status === 'SUSPENDED' ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'}`}>
                          {device.status}{device.cloneSuspected ? ' · استنساخ' : ''}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => { platformAdminService.setDeviceStatus(device.id, device.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE'); load(); }} className="rounded p-1.5 text-slate-500 hover:bg-amber-50 hover:text-amber-700" title="إيقاف/تفعيل">
                            <Cpu className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" onClick={() => { if (window.confirm('حذف تفعيل هذا الجهاز؟')) { platformAdminService.deleteDevice(device.id); load(); } }} className="rounded p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-700" title="حذف التفعيل">
                            <Cpu className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

export default PlatformDevicesPage;
