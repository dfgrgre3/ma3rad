import React from 'react';
import { LifeBuoy, Search, Monitor, AlertTriangle, RefreshCw } from 'lucide-react';
import type { PlatformSupportTicket, PlatformTenant } from '../../../services/domains/platform/platformTypes';
import { EmptyState, StatusBadge, formatDateTime, inputClass } from '../components/PlatformUI';

interface TicketListPanelProps {
  search: string;
  onSearchChange: (v: string) => void;
  statusFilter: string;
  onStatusFilterChange: (v: string) => void;
  priorityFilter: string;
  onPriorityFilterChange: (v: string) => void;
  loading: boolean;
  tickets: PlatformSupportTicket[];
  tenants: PlatformTenant[];
  selectedTicketId: string | null;
  onSelectTicket: (id: string) => void;
}

export const TicketListPanel: React.FC<TicketListPanelProps> = ({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  priorityFilter,
  onPriorityFilterChange,
  loading,
  tickets,
  tenants,
  selectedTicketId,
  onSelectTicket,
}) => (
  <div className="space-y-3 lg:col-span-5">
    {/* Search and Filters Bar */}
    <div className="flex flex-col gap-2 rounded-xl border border-line-strong bg-primary/80 p-3 shadow-sm">
      <div className="relative">
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="ابحث برقم التذكرة أو عنوانها..."
          className={`${inputClass} pr-9 text-xs`}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value)}
          className={`${inputClass} text-xs`}
        >
          <option value="">كل الحالات</option>
          <option value="OPEN">مفتوحة</option>
          <option value="IN_PROGRESS">قيد المعالجة</option>
          <option value="WAITING_CUSTOMER">بانتظار العميل</option>
          <option value="RESOLVED">تم الحل</option>
          <option value="CLOSED">مغلقة</option>
        </select>

        <select
          value={priorityFilter}
          onChange={(e) => onPriorityFilterChange(e.target.value)}
          className={`${inputClass} text-xs`}
        >
          <option value="">كل الأولويات</option>
          <option value="URGENT">عاجل (Urgent)</option>
          <option value="HIGH">مرتفع (High)</option>
          <option value="MEDIUM">متوسط (Medium)</option>
          <option value="LOW">منخفض (Low)</option>
        </select>
      </div>
    </div>

    {/* Ticket Card List */}
    <div className="space-y-2 overflow-y-auto max-h-[620px] pr-1">
      {loading ? (
        <div className="py-16 text-center text-sm font-semibold text-muted">
          <RefreshCw className="inline-block h-5 w-5 animate-spin mb-2" />
          <p>جارٍ تحميل التذاكر...</p>
        </div>
      ) : tickets.length === 0 ? (
        <EmptyState
          icon={<LifeBuoy className="h-6 w-6 text-muted" />}
          title="لا توجد تذاكر دعم لعرضها"
          description="لا توجد تذاكر مطابقة لعوامل التصفية الحالية. جرّب تعديل البحث أو الفلاتر."
        />
      ) : (
        tickets.map((ticket) => {
          const tenant = tenants.find((t) => t.id === ticket.tenantId);
          const isSelected = selectedTicketId === ticket.id;
          const isUrgent = ticket.priority === 'URGENT';
          const isHigh = ticket.priority === 'HIGH';

          // Check SLA breached
          const isSlaBreached =
            ticket.slaDueAt &&
            new Date(ticket.slaDueAt).getTime() < Date.now() &&
            ticket.status !== 'RESOLVED' &&
            ticket.status !== 'CLOSED';

          return (
            <div
              key={ticket.id}
              onClick={() => onSelectTicket(ticket.id)}
              className={`cursor-pointer rounded-xl border p-3.5 transition-all ${
                isSelected
                  ? 'border-success/80 bg-primary/90 shadow-md ring-1 ring-success/50'
                  : 'border-line-strong bg-primary/60 hover:border-line-strong hover:bg-primary'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-[10px] font-bold text-success uppercase tracking-wide">
                    {tenant?.name || ticket.tenantId}
                  </span>
                  <h4 className="text-xs font-bold text-muted truncate mt-0.5">
                    {ticket.subject}
                  </h4>
                </div>
                <span
                  className={`rounded px-1.5 py-0.5 text-[9.5px] font-black shrink-0 ${
                    isUrgent
                      ? 'bg-danger/20 text-danger border border-danger/30'
                      : isHigh
                      ? 'bg-warning/20 text-warning border border-warning/30'
                      : 'bg-primary text-muted'
                  }`}
                >
                  {ticket.priority}
                </span>
              </div>

              <div className="mt-2.5 flex items-center justify-between text-[10.5px] text-muted">
                <div className="flex items-center gap-2">
                  <StatusBadge
                    value={
                      ticket.status === 'RESOLVED'
                        ? 'ACTIVE'
                        : ticket.status === 'CLOSED'
                        ? 'CANCELLED'
                        : 'TRIAL'
                    }
                    label={ticket.status}
                  />
                  {ticket.remoteAccessRequested && (
                    <span
                      className={`flex items-center gap-0.5 rounded px-1.5 py-0.5 font-bold ${
                        ticket.remoteAccessApproved
                          ? 'bg-success/15 text-success'
                          : 'bg-warning/15 text-warning'
                      }`}
                    >
                      <Monitor className="h-3 w-3" />
                      {ticket.remoteAccessApproved ? 'دخول معتمد' : 'بانتظار الموافقة'}
                    </span>
                  )}
                </div>

                {isSlaBreached ? (
                  <span className="flex items-center gap-1 text-danger font-bold">
                    <AlertTriangle className="h-3 w-3" /> SLA متجاوز
                  </span>
                ) : (
                  <span>{formatDateTime(ticket.createdAt)}</span>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  </div>
);
