import React from 'react';
import { LifeBuoy, Search } from 'lucide-react';
import { platformAdminService } from '../../services/domains/platform/PlatformAdminService';
import type { PlatformSupportTicket, PlatformTenant } from '../../services/domains/platform/platformTypes';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState, StatusBadge, formatDateTime, inputClass } from './components/PlatformUI';

export const PlatformSupportPage: React.FC = () => {
  const [tickets, setTickets] = React.useState<PlatformSupportTicket[]>([]);
  const [tenants, setTenants] = React.useState<PlatformTenant[]>([]);
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setLoading(true);
    try {
      setTickets(platformAdminService.listSupportTickets(search, status));
      setTenants(platformAdminService.listTenants());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل تذاكر الدعم.');
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  React.useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <PageHeader title="الدعم الفني" description="تذاكر الدعم، الأولوية، الحالة، المرفقات، والوصول عن بعد (بموافقة العميل)." icon={<LifeBuoy className="h-5 w-5" />} />
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث بالعنوان أو العميل..." className={`${inputClass} pr-8`} />
        </div>
        <select value={status} onChange={(event) => setStatus(event.target.value)} className={`${inputClass} max-w-[170px]`}>
          <option value="">كل الحالات</option>
          <option value="OPEN">مفتوحة</option>
          <option value="IN_PROGRESS">قيد المعالجة</option>
          <option value="WAITING_CUSTOMER">بانتظار العميل</option>
          <option value="RESOLVED">محلولة</option>
          <option value="CLOSED">مغلقة</option>
        </select>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">{tickets.length} تذكرة</span>
      </div>
      {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-700">{error}</div>}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="py-16 text-center text-sm font-semibold text-slate-500">جارٍ تحميل التذاكر...</div>
        ) : tickets.length === 0 ? (
          <EmptyState icon={<LifeBuoy className="h-5 w-5" />} title="لا توجد تذاكر دعم" description="ستظهر هنا تذاكر العملاء." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-right">
              <thead className="bg-slate-50 text-[10.5px] text-slate-500">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">العميل</th>
                  <th className="px-3 py-2.5 font-semibold">الموضوع</th>
                  <th className="px-3 py-2.5 font-semibold">الأولوية</th>
                  <th className="px-3 py-2.5 font-semibold">الحالة</th>
                  <th className="px-3 py-2.5 font-semibold">وصول عن بعد</th>
                  <th className="px-3 py-2.5 font-semibold">تاريخ الإنشاء</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => {
                  const tenant = tenants.find((item) => item.id === ticket.tenantId);
                  return (
                    <tr key={ticket.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                      <td className="px-3 py-2.5 text-[11.5px] font-semibold text-slate-700">{tenant?.name || ticket.tenantId}</td>
                      <td className="px-3 py-2.5 text-[11.5px] text-slate-800">{ticket.subject}</td>
                      <td className="px-3 py-2.5 text-[10.5px] font-bold text-slate-600">{ticket.priority}</td>
                      <td className="px-3 py-2.5"><StatusBadge value={ticket.status === 'RESOLVED' ? 'ACTIVE' : ticket.status === 'CLOSED' ? 'CANCELLED' : 'TRIAL'} label={ticket.status} /></td>
                      <td className="px-3 py-2.5 text-[10.5px] text-slate-600">
                        {ticket.remoteAccessRequested ? (ticket.remoteAccessApproved ? 'موافق' : 'بانتظار موافقة') : 'لا'}
                      </td>
                      <td className="px-3 py-2.5 text-[10.5px] text-slate-600">{formatDateTime(ticket.createdAt)}</td>
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

export default PlatformSupportPage;
