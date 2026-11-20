import React from 'react';
import { Monitor, Lock, Unlock } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import type { PlatformSupportTicketDetails } from '../../../services/domains/platform/platformTypes';
import { formatDateTime } from '../components/PlatformUI';

interface RemoteAccessSectionProps {
  details: PlatformSupportTicketDetails;
  canManageSupport: boolean;
  onToggleRemoteRequest: (requested: boolean) => void;
  onApproveRemoteAccess: (approved: boolean) => void;
  onStartSession: () => void;
  onEndRemoteSession: (sessionId: string) => void;
}

export const RemoteAccessSection: React.FC<RemoteAccessSectionProps> = ({
  details,
  canManageSupport,
  onToggleRemoteRequest,
  onApproveRemoteAccess,
  onStartSession,
  onEndRemoteSession,
}) => (
  <div className="border-b border-line-strong bg-primary/40 p-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Monitor className="h-4 w-4 text-primary" />
        <span className="text-xs font-bold text-muted">الوصول عن بُعد للعميل:</span>
        <span className="text-xs text-muted">
          {details.ticket.remoteAccessRequested ? (
            details.ticket.remoteAccessApproved ? (
              <span className="text-success font-bold">معتمد — جاهز لبدء الجلسة</span>
            ) : (
              <span className="text-warning font-bold">بانتظار الاعتماد</span>
            )
          ) : (
            'غير مطلوب'
          )}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {!details.ticket.remoteAccessRequested ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={!canManageSupport}
            onClick={() => onToggleRemoteRequest(true)}
            leadingIcon={<Lock className="h-3 w-3" />}
          >
            طلب وصول عن بُعد
          </Button>
        ) : (
          <>
            {!details.ticket.remoteAccessApproved ? (
              <Button
                size="sm"
                variant="primary"
                disabled={!canManageSupport}
                onClick={() => onApproveRemoteAccess(true)}
                leadingIcon={<Unlock className="h-3 w-3" />}
              >
                اعتماد الوصول
              </Button>
            ) : (
              <Button
                size="sm"
                variant="primary"
                disabled={!canManageSupport}
                onClick={onStartSession}
                leadingIcon={<Monitor className="h-3 w-3" />}
              >
                بدء جلسة الاتصال
              </Button>
            )}
            {canManageSupport && (<button
              onClick={() => onToggleRemoteRequest(false)}
              className="text-xs text-danger hover:underline"
            >
              إلغاء الطلب
            </button>)}
          </>
        )}
      </div>
    </div>

    {/* Active Remote Sessions List */}
    {details.remoteSessions.length > 0 && (
      <div className="mt-2.5 space-y-1.5 border-t border-line-strong/60 pt-2">
        <p className="text-[11px] font-bold text-muted">جلسات الوصول النشطة:</p>
        {details.remoteSessions.map((session) => (
          <div
            key={session.id}
            className="flex items-center justify-between rounded-lg bg-primary p-2 text-xs border border-line-strong"
          >
            <div>
              <span className="font-bold text-muted">{session.technicianName}</span>
              <span className="text-muted text-[11px] mr-2">
                {formatDateTime(session.startedAt)} ({session.durationMinutes} دقيقة)
              </span>
              {session.actionsSummary && (
                <p className="text-[11px] text-muted mt-0.5">{session.actionsSummary}</p>
              )}
            </div>

            {session.status === 'ACTIVE' ? (
              <Button
                size="sm"
                variant="danger"
                disabled={!canManageSupport}
                onClick={() => onEndRemoteSession(session.id)}
              >
                إنهاء الجلسة
              </Button>
            ) : (
              <span className="text-success text-[11px] font-bold">منتهية</span>
            )}
          </div>
        ))}
      </div>
    )}
  </div>
);
