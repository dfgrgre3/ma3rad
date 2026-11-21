import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  LifeBuoy,
  Plus,
  AlertTriangle,
} from 'lucide-react';
import { platformAdminService } from '../../services/domains/platform/PlatformAdminService';
import { centralPlatformClient } from '../../services/domains/platform/CentralPlatformClient';
import { getCentralDataSourceState } from '../../hooks/platform/useCentralDataSource';
import { canPlatform } from '../../hooks/platform/usePlatformPermission';
import type {
  PlatformSupportTicket,
  PlatformSupportTicketDetails,
  PlatformTenant,
  PlatformCannedReply,
} from '../../services/domains/platform/platformTypes';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import type { PlatformRemoteSession } from '../../services/domains/platform/platformTypes';
import {
  mapPriorityToCentral,
  mapCentralTicket,
  mapCentralMessage,
  type CentralTicketRow,
  type CentralMessageRow,
} from './PlatformSupportPage/mappers';
import { Modal } from '../../components/ui/Modal';
import { inputClass } from './components/PlatformUI';
import { TicketListPanel } from './PlatformSupportPage/TicketListPanel';
import { TicketDetailPanel } from './PlatformSupportPage/TicketDetailPanel';
import { NewTicketModal } from './PlatformSupportPage/NewTicketModal';
import { RemoteSessionModal } from './PlatformSupportPage/RemoteSessionModal';
import { RatingModal } from './PlatformSupportPage/RatingModal';

export const PlatformSupportPage: React.FC = () => {
  const toast = useToast();
  const canManageSupport = canPlatform('support', 'platform.support.update');
  const centralActive = getCentralDataSourceState().active;
  const [tickets, setTickets] = useState<PlatformSupportTicket[]>([]);
  const [tenants, setTenants] = useState<PlatformTenant[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [details, setDetails] = useState<PlatformSupportTicketDetails | null>(null);
  const [cannedReplies, setCannedReplies] = useState<PlatformCannedReply[]>([]);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Message composer state
  const [messageBody, setMessageBody] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [attachmentName, setAttachmentName] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  // Modals state
  const [isNewTicketOpen, setIsNewTicketOpen] = useState(false);
  const [isRemoteSessionOpen, setIsRemoteSessionOpen] = useState(false);
  const [isRateModalOpen, setIsRateModalOpen] = useState(false);
  const [endSessionModal, setEndSessionModal] = useState<{ sessionId: string } | null>(null);
  const [endSessionSummary, setEndSessionSummary] = useState('');

  // New ticket form
  const [newTenantId, setNewTenantId] = useState('');
  const [newSubject, setNewSubject] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newPriority, setNewPriority] = useState<PlatformSupportTicket['priority']>('MEDIUM');
  const [newAssignedTo, setNewAssignedTo] = useState('');

  // Remote session form
  const [technicianName, setTechnicianName] = useState('فني الدعم الخارجي');
  const [sessionDuration, setSessionDuration] = useState(60);

  // Rating form
  const [ratingStars, setRatingStars] = useState(5);
  const [ratingFeedback, setRatingFeedback] = useState('');

  // Load list of tickets & tenants
  const loadTickets = useCallback(() => {
    setLoading(true);
    if (centralActive) {
      Promise.all([
        centralPlatformClient.listSupportTickets({ q: search || undefined, status: statusFilter || undefined }),
        centralPlatformClient.listTenants('', '', ''),
      ])
        .then(([rows, tens]) => {
          setTickets((rows as CentralTicketRow[]).map(mapCentralTicket));
          setTenants(tens as PlatformTenant[]);
          setCannedReplies([]);
          setError(null);
        })
        .catch((err) => setError(err instanceof Error ? err.message : 'تعذر تحميل تذاكر الدعم.'))
        .finally(() => setLoading(false));
      return;
    }
    try {
      setTickets(platformAdminService.listSupportTickets(search, statusFilter));
      setTenants(platformAdminService.listTenants());
      setCannedReplies(platformAdminService.listCannedReplies());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل تذاكر الدعم.');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, centralActive]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  // Load ticket details when selected — with a stale-response guard so a slow
  // response for a previously selected ticket cannot overwrite the current one.
  const detailsRequestRef = React.useRef(0);
  const selectedTicketIdRef = React.useRef<string | null>(null);
  selectedTicketIdRef.current = selectedTicketId;

  const loadTicketDetails = useCallback((id: string) => {
    const requestId = ++detailsRequestRef.current;
    const isCurrent = () => requestId === detailsRequestRef.current && selectedTicketIdRef.current === id;
    setDetailsLoading(true);
    setDetails(null);
    if (centralActive) {
      centralPlatformClient.getSupportTicket(id)
        .then(async (data) => {
          if (!isCurrent()) return;
          // Remote sessions are fetched separately so a session-endpoint failure
          // surfaces as a warning instead of hiding the whole ticket detail.
          let sessions: Array<Record<string, unknown>> = [];
          let sessionsError: string | null = null;
          try {
            sessions = (await centralPlatformClient.listRemoteSessions(id)) as Array<Record<string, unknown>>;
          } catch (e) {
            sessionsError = e instanceof Error ? e.message : 'تعذر تحميل جلسات الوصول عن بُعد.';
          }
          if (!isCurrent()) return;
          if (sessionsError) toast.warning(sessionsError);
          const ticket = mapCentralTicket({ ...(data.ticket ?? data), messages: data.messages } as CentralTicketRow);
          setDetails({
            ticket,
            messages: (Array.isArray(data.messages) ? data.messages : []).map((m: unknown) => mapCentralMessage(m as CentralMessageRow)),
            remoteSessions: sessions.map((s) => ({
              id: String(s.id ?? ''),
              ticketId: String(s.ticket_id ?? s.ticketId ?? ''),
              tenantId: String(s.tenant_id ?? s.tenantId ?? ''),
              staffId: String(s.staff_id ?? s.staffId ?? ''),
              technicianName: String(s.technician_name ?? s.technicianName ?? ''),
              status: (s.status === 'ENDED' ? 'COMPLETED' : s.status === 'EXPIRED' ? 'TERMINATED' : 'ACTIVE') as PlatformRemoteSession['status'],
              startedAt: String(s.started_at ?? s.startedAt ?? ''),
              endedAt: (s.ended_at ?? s.endedAt ?? null) as string | null,
              durationMinutes: Number(s.duration_minutes ?? s.durationMinutes ?? 60) || 60,
              actionsSummary: (s.summary ?? null) as string | null,
            })),
            tenant: data.tenantName ? {
              id: String(data.tenantId ?? ticket.tenantId),
              code: String(data.tenantCode ?? ''),
              name: String(data.tenantName),
              email: (data.requesterEmail ?? null) as string | null,
              phone: (data.requesterPhone ?? null) as string | null,
              status: 'ACTIVE',
            } : null,
            assignedStaff: null,
          });
        })
        .catch((err) => { if (isCurrent()) setError(err instanceof Error ? err.message : 'تعذر تحميل تفاصيل التذكرة.'); })
        .finally(() => { if (isCurrent()) setDetailsLoading(false); });
      return;
    }
    try {
      const data = platformAdminService.getSupportTicketDetails(id);
      if (!isCurrent()) return;
      setDetails(data);
    } catch (err) {
      if (isCurrent()) setError(err instanceof Error ? err.message : 'تعذر تحميل تفاصيل التذكرة.');
    } finally {
      if (isCurrent()) setDetailsLoading(false);
    }
  }, [centralActive]);

  useEffect(() => {
    if (selectedTicketId) {
      loadTicketDetails(selectedTicketId);
    } else {
      detailsRequestRef.current += 1;
      setDetails(null);
    }
  }, [selectedTicketId, loadTicketDetails]);

  // Filtered tickets
  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (priorityFilter && t.priority !== priorityFilter) return false;
      return true;
    });
  }, [tickets, priorityFilter]);

  // Handle send message
  const handleSendMessage = () => {
    if (!canManageSupport) { toast.warning('لا تملك صلاحية إدارة الدعم'); return; }
    if (!selectedTicketId || !messageBody.trim()) return;
    // Reject malformed attachment links instead of storing junk in the body.
    if (attachmentUrl.trim() && !/^https?:\/\//i.test(attachmentUrl.trim())) {
      toast.error('رابط المرفق يجب أن يبدأ بـ http:// أو https://');
      return;
    }
    setSendingMessage(true);
    if (centralActive) {
      const attachmentNote = [attachmentUrl.trim(), attachmentName.trim()].filter(Boolean).join(' — ');
      const body = attachmentNote ? `${messageBody.trim()}\n\n[مرفق] ${attachmentNote}` : messageBody.trim();
      centralPlatformClient.addSupportTicketMessage(selectedTicketId, body, isInternal)
        .then(() => {
          setMessageBody('');
          setAttachmentUrl('');
          setAttachmentName('');
          setIsInternal(false);
          loadTicketDetails(selectedTicketId);
          loadTickets();
        })
        .catch((err) => toast.error(err instanceof Error ? err.message : 'فشل إرسال الرسالة.'))
        .finally(() => setSendingMessage(false));
      return;
    }
    try {
      platformAdminService.addSupportMessage({
        ticketId: selectedTicketId,
        authorName: 'مالك المنصة (Super Admin)',
        authorRole: 'SUPPORT',
        body: messageBody.trim(),
        isInternal,
        attachmentUrl: attachmentUrl.trim() || undefined,
        attachmentName: attachmentName.trim() || undefined,
      });
      setMessageBody('');
      setAttachmentUrl('');
      setAttachmentName('');
      setIsInternal(false);
      loadTicketDetails(selectedTicketId);
      loadTickets();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشل إرسال الرسالة.');
    } finally {
      setSendingMessage(false);
    }
  };

  // Status Change
  const handleStatusChange = (newStatus: PlatformSupportTicket['status']) => {
    if (!canManageSupport) return;
    if (!selectedTicketId) return;
    if (centralActive) {
      centralPlatformClient.updateSupportTicket(selectedTicketId, { status: newStatus })
        .then(() => { loadTicketDetails(selectedTicketId); loadTickets(); })
        .catch((err) => toast.error(err instanceof Error ? err.message : 'تعذر تغيير حالة التذكرة.'));
      return;
    }
    try {
      platformAdminService.setSupportTicketStatus(selectedTicketId, newStatus);
      loadTicketDetails(selectedTicketId);
      loadTickets();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذر تغيير حالة التذكرة.');
    }
  };

  // Priority Change
  const handlePriorityChange = (priority: PlatformSupportTicket['priority']) => {
    if (!canManageSupport) return;
    if (!selectedTicketId) return;
    if (centralActive) {
      centralPlatformClient.updateSupportTicket(selectedTicketId, { priority: mapPriorityToCentral(priority) })
        .then(() => { loadTicketDetails(selectedTicketId); loadTickets(); })
        .catch((err) => toast.error(err instanceof Error ? err.message : 'تعذر تغيير أولوية التذكرة.'));
      return;
    }
    try {
      platformAdminService.setSupportTicketPriority(selectedTicketId, priority);
      loadTicketDetails(selectedTicketId);
      loadTickets();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذر تغيير أولوية التذكرة.');
    }
  };

  // Assignee Change
  const handleAssignChange = (assignee: string) => {
    if (!canManageSupport) return;
    if (!selectedTicketId) return;
    if (centralActive) {
      centralPlatformClient.updateSupportTicket(selectedTicketId, { assigneeName: assignee || null })
        .then(() => { loadTicketDetails(selectedTicketId); loadTickets(); })
        .catch((err) => toast.error(err instanceof Error ? err.message : 'تعذر إسناد التذكرة.'));
      return;
    }
    try {
      platformAdminService.assignSupportTicket(selectedTicketId, assignee || null);
      loadTicketDetails(selectedTicketId);
      loadTickets();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذر إسناد التذكرة.');
    }
  };

  // Remote Access Toggle / Approve
  const handleToggleRemoteRequest = async (requested: boolean) => {
    if (!canManageSupport) { toast.warning('لا تملك صلاحية إدارة الدعم'); return; }
    if (!selectedTicketId) return;
    try {
      if (centralActive) {
        await centralPlatformClient.requestRemoteAccess(selectedTicketId, requested, 60);
      } else {
        platformAdminService.requestRemoteAccess(selectedTicketId, requested, 60);
      }
      loadTicketDetails(selectedTicketId);
      loadTickets();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذر طلب الوصول عن بُعد للتذكرة.');
    }
  };

  const handleApproveRemoteAccess = async (approved: boolean) => {
    if (!canManageSupport) { toast.warning('لا تملك صلاحية إدارة الدعم'); return; }
    if (!selectedTicketId) return;
    try {
      if (centralActive) {
        await centralPlatformClient.approveRemoteAccess(selectedTicketId, approved);
      } else {
        platformAdminService.approveRemoteAccess(selectedTicketId, approved);
      }
      loadTicketDetails(selectedTicketId);
      loadTickets();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذر الموافقة على الوصول عن بُعد.');
    }
  };

  // Start Remote Session
  const handleStartRemoteSession = async () => {
    if (!canManageSupport) { toast.warning('لا تملك صلاحية إدارة الدعم'); return; }
    if (!selectedTicketId) return;
    try {
      if (centralActive) {
        await centralPlatformClient.startRemoteSession(selectedTicketId, technicianName, sessionDuration);
      } else {
        platformAdminService.startRemoteSession({
          ticketId: selectedTicketId,
          technicianName,
          durationMinutes: sessionDuration,
        });
      }
      setIsRemoteSessionOpen(false);
      loadTicketDetails(selectedTicketId);
      loadTickets();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذر بدء جلسة الوصول عن بُعد.');
    }
  };

  // End Remote Session — confirm via modal (was window.prompt).
  const handleConfirmEndSession = async () => {
    if (!endSessionModal) return;
    if (!canManageSupport) { toast.warning('لا تملك صلاحية إدارة الدعم'); return; }
    const { sessionId } = endSessionModal;
    const summary = endSessionSummary.trim() || undefined;
    try {
      if (centralActive) {
        await centralPlatformClient.endRemoteSession(sessionId, summary);
      } else {
        platformAdminService.endRemoteSession(sessionId, summary);
      }
      setEndSessionModal(null);
      setEndSessionSummary('');
      if (selectedTicketId) loadTicketDetails(selectedTicketId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذر إنهاء جلسة الوصول.');
    }
  };

  // Create Ticket
  const handleCreateTicket = () => {
    if (!canManageSupport) { toast.warning('لا تملك صلاحية إدارة الدعم'); return; }
    if (!newTenantId || !newSubject.trim()) {
      toast.warning('يرجى اختيار العميل وكتابة عنوان التذكرة.');
      return;
    }
    if (centralActive) {
      centralPlatformClient.createSupportTicket({
        tenantId: newTenantId,
        subject: newSubject.trim(),
        category: 'GENERAL',
        priority: mapPriorityToCentral(newPriority),
        body: newDescription.trim() || undefined,
        assigneeName: newAssignedTo.trim() || undefined,
      })
        .then((created: { id?: string; data?: { id?: string } }) => {
          setIsNewTicketOpen(false);
          setNewSubject('');
          setNewDescription('');
          loadTickets();
          setSelectedTicketId(created?.id ?? created?.data?.id ?? null);
        })
        .catch((err) => toast.error(err instanceof Error ? err.message : 'تعذر إنشاء التذكرة.'));
      return;
    }
    try {
      const created = platformAdminService.createSupportTicket({
        tenantId: newTenantId,
        subject: newSubject.trim(),
        description: newDescription.trim() || undefined,
        priority: newPriority,
        assignedTo: newAssignedTo.trim() || undefined,
      });
      setIsNewTicketOpen(false);
      setNewSubject('');
      setNewDescription('');
      loadTickets();
      setSelectedTicketId(created.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذر إنشاء التذكرة.');
    }
  };

  // Rate Ticket
  const handleRateTicket = () => {
    if (!canManageSupport) { toast.warning('لا تملك صلاحية إدارة الدعم'); return; }
    if (!selectedTicketId) return;
    if (centralActive) {
      centralPlatformClient.rateSupportTicket(selectedTicketId, ratingStars, ratingFeedback.trim() || undefined)
        .then(() => {
          setIsRateModalOpen(false);
          loadTicketDetails(selectedTicketId);
          loadTickets();
        })
        .catch((err) => toast.error(err instanceof Error ? err.message : 'تعذر تقييم التذكرة.'));
      return;
    }
    try {
      platformAdminService.rateSupportTicket(selectedTicketId, ratingStars, ratingFeedback);
      setIsRateModalOpen(false);
      loadTicketDetails(selectedTicketId);
      loadTickets();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذر تقييم التذكرة.');
    }
  };

  // Insert canned reply into message body
  const insertCannedReply = (replyBody: string) => {
    setMessageBody((prev) => (prev ? `${prev}\n${replyBody}` : replyBody));
  };

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <PageHeader
        title="مركز الدعم الفني للمنصة"
        description="إدارة تذاكر الدعم الفني، جلسات الوصول عن بُعد، تقييم رضا العملاء، ومتابعة التزامات SLA داخل لوحة المنصة."
        icon={<LifeBuoy className="h-6 w-6 text-success" />}
        actions={
          <Button
            size="sm"
            disabled={!canManageSupport}
            onClick={() => { if(!canManageSupport) return; setIsNewTicketOpen(true); }}
            leadingIcon={<Plus className="h-4 w-4" />}
          >
            تذكرة دعم جديدة
          </Button>
        }
      />

      {error && (
        <div role="alert" className="rounded-xl border border-danger bg-danger/40 p-4 text-danger">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-danger" />
            <span className="font-bold">{error}</span>
          </div>
        </div>
      )}

      {/* Main Container - Split View (Master / Detail) */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 min-h-[680px]">
        <TicketListPanel
          search={search}
          onSearchChange={setSearch}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          priorityFilter={priorityFilter}
          onPriorityFilterChange={setPriorityFilter}
          loading={loading}
          tickets={filteredTickets}
          tenants={tenants}
          selectedTicketId={selectedTicketId}
          onSelectTicket={setSelectedTicketId}
        />

        <TicketDetailPanel
          selectedTicketId={selectedTicketId}
          detailsLoading={detailsLoading}
          details={details}
          canManageSupport={canManageSupport}
          cannedReplies={cannedReplies}
          messageBody={messageBody}
          onMessageBodyChange={setMessageBody}
          isInternal={isInternal}
          onIsInternalChange={setIsInternal}
          attachmentUrl={attachmentUrl}
          onAttachmentUrlChange={setAttachmentUrl}
          sendingMessage={sendingMessage}
          onSendMessage={handleSendMessage}
          onInsertCannedReply={insertCannedReply}
          onStatusChange={handleStatusChange}
          onPriorityChange={handlePriorityChange}
          onAssignChange={handleAssignChange}
          onOpenRateModal={() => setIsRateModalOpen(true)}
          onToggleRemoteRequest={handleToggleRemoteRequest}
          onApproveRemoteAccess={handleApproveRemoteAccess}
          onStartSession={() => setIsRemoteSessionOpen(true)}
          onEndRemoteSession={(sessionId) => setEndSessionModal({ sessionId })}
        />
      </div>

      {/* Modal: New Ticket */}
      <NewTicketModal
        open={isNewTicketOpen}
        onClose={() => setIsNewTicketOpen(false)}
        tenants={tenants}
        tenantId={newTenantId}
        setTenantId={setNewTenantId}
        subject={newSubject}
        setSubject={setNewSubject}
        description={newDescription}
        setDescription={setNewDescription}
        priority={newPriority}
        setPriority={setNewPriority}
        assignedTo={newAssignedTo}
        setAssignedTo={setNewAssignedTo}
        canManageSupport={canManageSupport}
        onSubmit={handleCreateTicket}
      />

      {/* Modal: Start Remote Session */}
      <RemoteSessionModal
        open={isRemoteSessionOpen}
        onClose={() => setIsRemoteSessionOpen(false)}
        technicianName={technicianName}
        setTechnicianName={setTechnicianName}
        sessionDuration={sessionDuration}
        setSessionDuration={setSessionDuration}
        canManageSupport={canManageSupport}
        onSubmit={handleStartRemoteSession}
      />

      {/* Modal: CSAT Rating */}
      <RatingModal
        open={isRateModalOpen}
        onClose={() => setIsRateModalOpen(false)}
        ratingStars={ratingStars}
        setRatingStars={setRatingStars}
        ratingFeedback={ratingFeedback}
        setRatingFeedback={setRatingFeedback}
        canManageSupport={canManageSupport}
        onSubmit={handleRateTicket}
      />

      {/* Modal: End Remote Session */}
      <Modal
        open={endSessionModal !== null}
        onClose={() => { setEndSessionModal(null); setEndSessionSummary(''); }}
        title="إنهاء جلسة الوصول عن بُعد"
      >
        <div className="space-y-3.5 text-right">
          <p className="text-xs text-muted">سيتم تسجيل ملخص الجلسة في سجل التدقيق.</p>
          <div>
            <label className="block text-xs font-semibold text-muted mb-1">ملخص الجلسة (اختياري)</label>
            <textarea
              rows={3}
              value={endSessionSummary}
              onChange={(e) => setEndSessionSummary(e.target.value)}
              placeholder="ما الذي تم إنجازه خلال الجلسة؟"
              className={inputClass}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setEndSessionModal(null); setEndSessionSummary(''); }}>
              إلغاء
            </Button>
            <Button variant="primary" onClick={handleConfirmEndSession}>
              إنهاء الجلسة
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default PlatformSupportPage;
