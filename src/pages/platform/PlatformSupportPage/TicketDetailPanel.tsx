import React from 'react';
import { LifeBuoy, RefreshCw } from 'lucide-react';
import type {
  PlatformCannedReply,
  PlatformSupportTicket,
  PlatformSupportTicketDetails,
} from '../../../services/domains/platform/platformTypes';
import { TicketDetailHeader } from './TicketDetailHeader';
import { RemoteAccessSection } from './RemoteAccessSection';
import { ChatTimeline } from './ChatTimeline';
import { MessageComposer } from './MessageComposer';

interface TicketDetailPanelProps {
  selectedTicketId: string | null;
  detailsLoading: boolean;
  details: PlatformSupportTicketDetails | null;
  canManageSupport: boolean;
  cannedReplies: PlatformCannedReply[];
  messageBody: string;
  onMessageBodyChange: (v: string) => void;
  isInternal: boolean;
  onIsInternalChange: (v: boolean) => void;
  attachmentUrl: string;
  onAttachmentUrlChange: (v: string) => void;
  sendingMessage: boolean;
  onSendMessage: () => void;
  onInsertCannedReply: (body: string) => void;
  onStatusChange: (status: PlatformSupportTicket['status']) => void;
  onPriorityChange: (priority: PlatformSupportTicket['priority']) => void;
  onAssignChange: (assignee: string) => void;
  onOpenRateModal: () => void;
  onToggleRemoteRequest: (requested: boolean) => void;
  onApproveRemoteAccess: (approved: boolean) => void;
  onStartSession: () => void;
  onEndRemoteSession: (sessionId: string) => void;
}

export const TicketDetailPanel: React.FC<TicketDetailPanelProps> = ({
  selectedTicketId,
  detailsLoading,
  details,
  canManageSupport,
  cannedReplies,
  messageBody,
  onMessageBodyChange,
  isInternal,
  onIsInternalChange,
  attachmentUrl,
  onAttachmentUrlChange,
  sendingMessage,
  onSendMessage,
  onInsertCannedReply,
  onStatusChange,
  onPriorityChange,
  onAssignChange,
  onOpenRateModal,
  onToggleRemoteRequest,
  onApproveRemoteAccess,
  onStartSession,
  onEndRemoteSession,
}) => (
  <div className="lg:col-span-7 flex flex-col rounded-xl border border-line-strong bg-primary/90 shadow-sm overflow-hidden min-h-[620px]">
    {!selectedTicketId ? (
      <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-muted">
        <LifeBuoy className="h-12 w-12 text-ink-secondary mb-3 animate-pulse" />
        <h3 className="text-base font-bold text-muted">اختر تذكرة لعرض تفاصيلها</h3>
        <p className="mt-1 text-xs text-muted max-w-sm">
          اختر تذكرة من القائمة لعرض تفاصيلها بالكامل، ومتابعة المحادثة مع العميل، وإدارة جلسات الوصول عن بُعد وتقييم الخدمة.
        </p>
      </div>
    ) : detailsLoading || !details ? (
      <div className="flex flex-1 items-center justify-center p-8 text-muted">
        <RefreshCw className="h-6 w-6 animate-spin text-success" />
      </div>
    ) : (
      <div className="flex flex-col h-full">
        {/* Header / Ticket Summary */}
        <TicketDetailHeader
          details={details}
          canManageSupport={canManageSupport}
          onStatusChange={onStatusChange}
          onPriorityChange={onPriorityChange}
          onAssignChange={onAssignChange}
          onOpenRateModal={onOpenRateModal}
        />

        {/* Remote Access Banner / Panel */}
        <RemoteAccessSection
          details={details}
          canManageSupport={canManageSupport}
          onToggleRemoteRequest={onToggleRemoteRequest}
          onApproveRemoteAccess={onApproveRemoteAccess}
          onStartSession={onStartSession}
          onEndRemoteSession={onEndRemoteSession}
        />

        {/* Chat Timeline (Scrollable) */}
        <ChatTimeline messages={details.messages} />

        {/* Message Composer & Canned Replies Strip */}
        <MessageComposer
          cannedReplies={cannedReplies}
          onInsertCannedReply={onInsertCannedReply}
          messageBody={messageBody}
          onMessageBodyChange={onMessageBodyChange}
          isInternal={isInternal}
          onIsInternalChange={onIsInternalChange}
          attachmentUrl={attachmentUrl}
          onAttachmentUrlChange={onAttachmentUrlChange}
          sendingMessage={sendingMessage}
          onSend={onSendMessage}
        />
      </div>
    )}
  </div>
);
