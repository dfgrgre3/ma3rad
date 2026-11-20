import React from 'react';
import { Star, UserCheck, Clock } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import type { PlatformSupportTicket, PlatformSupportTicketDetails } from '../../../services/domains/platform/platformTypes';
import { formatDateTime, inputClass } from '../components/PlatformUI';

interface TicketDetailHeaderProps {
  details: PlatformSupportTicketDetails;
  canManageSupport: boolean;
  onStatusChange: (status: PlatformSupportTicket['status']) => void;
  onPriorityChange: (priority: PlatformSupportTicket['priority']) => void;
  onAssignChange: (assignee: string) => void;
  onOpenRateModal: () => void;
}

export const TicketDetailHeader: React.FC<TicketDetailHeaderProps> = ({
  details,
  canManageSupport,
  onStatusChange,
  onPriorityChange,
  onAssignChange,
  onOpenRateModal,
}) => (
  <div className="border-b border-line-strong p-4 bg-primary/60">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2">
          <span className="rounded bg-success/20 text-success px-2 py-0.5 text-xs font-bold">
            {details.ticket.tenantName || details.ticket.tenantId}
          </span>
          <span className="text-xs text-muted">#{details.ticket.id}</span>
          {details.ticket.rating && (
            <span className="flex items-center gap-1 rounded bg-warning/20 text-warning px-2 py-0.5 text-xs font-bold">
              <Star className="h-3 w-3 fill-warning" /> {details.ticket.rating} نجوم
            </span>
          )}
        </div>
        <h2 className="mt-1 text-base font-black text-muted">{details.ticket.subject}</h2>
        {details.ticket.description && (
          <p className="mt-1 text-xs text-muted leading-relaxed bg-primary/80 p-2.5 rounded-lg border border-line-strong">
            {details.ticket.description}
          </p>
        )}
      </div>

      {/* Actions Bar */}
      <div className="flex flex-wrap items-center gap-1.5">
        <select
          value={details.ticket.status}
          disabled={!canManageSupport}
          onChange={(e) => onStatusChange(e.target.value as PlatformSupportTicket['status'])}
          className={`${inputClass} text-xs py-1 h-8 max-w-[130px] font-bold`}
        >
          <option value="OPEN">مفتوحة</option>
          <option value="IN_PROGRESS">قيد المعالجة</option>
          <option value="WAITING_CUSTOMER">بانتظار العميل</option>
          <option value="RESOLVED">تم الحل</option>
          <option value="CLOSED">مغلقة</option>
        </select>

        <select
          value={details.ticket.priority}
          disabled={!canManageSupport}
          onChange={(e) => onPriorityChange(e.target.value as PlatformSupportTicket['priority'])}
          className={`${inputClass} text-xs py-1 h-8 max-w-[110px]`}
        >
          <option value="LOW">منخفض</option>
          <option value="MEDIUM">متوسط</option>
          <option value="HIGH">مرتفع</option>
          <option value="URGENT">عاجل</option>
        </select>

        {details.ticket.status === 'RESOLVED' && !details.ticket.rating && (
          <Button
            size="sm"
            variant="secondary"
            disabled={!canManageSupport}
            onClick={onOpenRateModal}
            leadingIcon={<Star className="h-3.5 w-3.5 text-warning" />}
          >
            تقييم
          </Button>
        )}
      </div>
    </div>

    {/* Sub-bar: SLA & Assignee */}
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted pt-3 border-t border-line-strong/80">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1">
          <UserCheck className="h-3.5 w-3.5 text-muted" />
          مسؤول:
        </span>
        <input
          type="text"
          defaultValue={details.ticket.assignedTo || ''}
          disabled={!canManageSupport}
          onBlur={(e) => onAssignChange(e.target.value)}
          placeholder="اسم الموظف (منصة الدعم)"
          className="rounded border border-transparent hover:border-line-strong bg-transparent px-2 py-0.5 text-xs text-muted focus:border-success focus:bg-primary"
        />
      </div>

      {details.ticket.slaDueAt && (
        <div className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-muted" />
          <span>موعد SLA:</span>
          <span
            className={`font-bold ${
              new Date(details.ticket.slaDueAt).getTime() < Date.now()
                ? 'text-danger'
                : 'text-success'
            }`}
          >
            {formatDateTime(details.ticket.slaDueAt)}
          </span>
        </div>
      )}
    </div>
  </div>
);
