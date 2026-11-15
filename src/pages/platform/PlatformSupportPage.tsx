import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  LifeBuoy,
  Search,
  MessageSquare,
  Send,
  Lock,
  Unlock,
  Monitor,
  UserCheck,
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileText,
  Star,
  RefreshCw,
  Plus,
  ArrowRight,
  ShieldAlert,
  Paperclip,
  Check,
  ChevronDown,
  X,
  ExternalLink,
} from 'lucide-react';
import { platformAdminService } from '../../services/domains/platform/PlatformAdminService';
import { canPlatform } from '../../hooks/platform/usePlatformPermission';
import type {
  PlatformSupportTicket,
  PlatformSupportTicketDetails,
  PlatformTenant,
  PlatformCannedReply,
} from '../../services/domains/platform/platformTypes';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import {
  EmptyState,
  StatusBadge,
  formatDateTime,
  inputClass,
} from './components/PlatformUI';

export const PlatformSupportPage: React.FC = () => {
  const canManageSupport = canPlatform('support', 'platform.support.update');
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
  }, [search, statusFilter]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  // Load ticket details when selected
  const loadTicketDetails = useCallback((id: string) => {
    setDetailsLoading(true);
    try {
      const data = platformAdminService.getSupportTicketDetails(id);
      setDetails(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل تفاصيل التذكرة.');
    } finally {
      setDetailsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedTicketId) {
      loadTicketDetails(selectedTicketId);
    } else {
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
    if (!canManageSupport) { alert('لا تملك صلاحية إدارة الدعم'); return; }
    if (!selectedTicketId || !messageBody.trim()) return;
    setSendingMessage(true);
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
      alert(err instanceof Error ? err.message : 'فشل إرسال الرسالة.');
    } finally {
      setSendingMessage(false);
    }
  };

  // Status Change
  const handleStatusChange = (newStatus: PlatformSupportTicket['status']) => {
    if (!canManageSupport) return;
    if (!selectedTicketId) return;
    try {
      platformAdminService.setSupportTicketStatus(selectedTicketId, newStatus);
      loadTicketDetails(selectedTicketId);
      loadTickets();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'تعذر تغيير حالة التذكرة.');
    }
  };

  // Priority Change
  const handlePriorityChange = (priority: PlatformSupportTicket['priority']) => {
    if (!canManageSupport) return;
    if (!selectedTicketId) return;
    try {
      platformAdminService.setSupportTicketPriority(selectedTicketId, priority);
      loadTicketDetails(selectedTicketId);
      loadTickets();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'تعذر تغيير أولوية التذكرة.');
    }
  };

  // Assignee Change
  const handleAssignChange = (assignee: string) => {
    if (!canManageSupport) return;
    if (!selectedTicketId) return;
    try {
      platformAdminService.assignSupportTicket(selectedTicketId, assignee || null);
      loadTicketDetails(selectedTicketId);
      loadTickets();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'تعذر إسناد التذكرة.');
    }
  };

  // Remote Access Toggle / Approve
  const handleToggleRemoteRequest = (requested: boolean) => {
    if (!canManageSupport) { alert('لا تملك صلاحية إدارة الدعم'); return; }
    if (!selectedTicketId) return;
    try {
      platformAdminService.requestRemoteAccess(selectedTicketId, requested, 60);
      loadTicketDetails(selectedTicketId);
      loadTickets();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'تعذر طلب الوصول عن بُعد للتذكرة.');
    }
  };

  const handleApproveRemoteAccess = (approved: boolean) => {
    if (!canManageSupport) { alert('لا تملك صلاحية إدارة الدعم'); return; }
    if (!selectedTicketId) return;
    try {
      platformAdminService.approveRemoteAccess(selectedTicketId, approved);
      loadTicketDetails(selectedTicketId);
      loadTickets();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'تعذر الموافقة على الوصول عن بُعد.');
    }
  };

  // Start Remote Session
  const handleStartRemoteSession = () => {
    if (!canManageSupport) { alert('لا تملك صلاحية إدارة الدعم'); return; }
    if (!selectedTicketId) return;
    try {
      platformAdminService.startRemoteSession({
        ticketId: selectedTicketId,
        technicianName,
        durationMinutes: sessionDuration,
      });
      setIsRemoteSessionOpen(false);
      loadTicketDetails(selectedTicketId);
      loadTickets();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'تعذر بدء جلسة الوصول عن بُعد.');
    }
  };

  // End Remote Session
  const handleEndRemoteSession = (sessionId: string) => {
    if (!canManageSupport) { alert('لا تملك صلاحية إدارة الدعم'); return; }
    const summary = prompt('أدخل ملخص إنهاء جلسة الوصول عن بُعد:');
    try {
      platformAdminService.endRemoteSession(sessionId, summary || undefined);
      if (selectedTicketId) loadTicketDetails(selectedTicketId);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'تعذر إنهاء جلسة الوصول.');
    }
  };

  // Create Ticket
  const handleCreateTicket = () => {
    if (!canManageSupport) { alert('لا تملك صلاحية إدارة الدعم'); return; }
    if (!newTenantId || !newSubject.trim()) {
      alert('يرجى اختيار العميل وكتابة عنوان التذكرة.');
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
      alert(err instanceof Error ? err.message : 'تعذر إنشاء التذكرة.');
    }
  };

  // Rate Ticket
  const handleRateTicket = () => {
    if (!canManageSupport) { alert('لا تملك صلاحية إدارة الدعم'); return; }
    if (!selectedTicketId) return;
    try {
      platformAdminService.rateSupportTicket(selectedTicketId, ratingStars, ratingFeedback);
      setIsRateModalOpen(false);
      loadTicketDetails(selectedTicketId);
      loadTickets();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'تعذر تقييم التذكرة.');
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
        icon={<LifeBuoy className="h-6 w-6 text-emerald-400" />}
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
        <div role="alert" className="rounded-xl border border-rose-800 bg-rose-950/40 p-4 text-rose-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-rose-400" />
            <span className="font-bold">{error}</span>
          </div>
        </div>
      )}

      {/* Main Container - Split View (Master / Detail) */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 min-h-[680px]">
        {/* Left/Right Column: Ticket List & Filters (5 cols) */}
        <div className="space-y-3 lg:col-span-5">
          {/* Search and Filters Bar */}
          <div className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900/80 p-3 shadow-sm">
            <div className="relative">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث برقم التذكرة أو عنوانها..."
                className={`${inputClass} pr-9 text-xs`}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
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
                onChange={(e) => setPriorityFilter(e.target.value)}
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
              <div className="py-16 text-center text-sm font-semibold text-slate-500">
                <RefreshCw className="inline-block h-5 w-5 animate-spin mb-2" />
                <p>جارٍ تحميل التذاكر...</p>
              </div>
            ) : filteredTickets.length === 0 ? (
              <EmptyState
                icon={<LifeBuoy className="h-6 w-6 text-slate-400" />}
                title="لا توجد تذاكر دعم لعرضها"
                description="لا توجد تذاكر مطابقة لعوامل التصفية الحالية. جرّب تعديل البحث أو الفلاتر."
              />
            ) : (
              filteredTickets.map((ticket) => {
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
                    onClick={() => setSelectedTicketId(ticket.id)}
                    className={`cursor-pointer rounded-xl border p-3.5 transition-all ${
                      isSelected
                        ? 'border-emerald-500/80 bg-slate-800/90 shadow-md ring-1 ring-emerald-500/50'
                        : 'border-slate-800 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wide">
                          {tenant?.name || ticket.tenantId}
                        </span>
                        <h4 className="text-xs font-bold text-slate-100 truncate mt-0.5">
                          {ticket.subject}
                        </h4>
                      </div>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[9.5px] font-black shrink-0 ${
                          isUrgent
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            : isHigh
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {ticket.priority}
                      </span>
                    </div>

                    <div className="mt-2.5 flex items-center justify-between text-[10.5px] text-slate-400">
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
                                ? 'bg-emerald-500/15 text-emerald-300'
                                : 'bg-amber-500/15 text-amber-300'
                            }`}
                          >
                            <Monitor className="h-3 w-3" />
                            {ticket.remoteAccessApproved ? 'دخول معتمد' : 'بانتظار الموافقة'}
                          </span>
                        )}
                      </div>

                      {isSlaBreached ? (
                        <span className="flex items-center gap-1 text-rose-400 font-bold">
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

        {/* Right/Left Column: Ticket Details & Live Chat (7 cols) */}
        <div className="lg:col-span-7 flex flex-col rounded-xl border border-slate-800 bg-slate-900/90 shadow-sm overflow-hidden min-h-[620px]">
          {!selectedTicketId ? (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-slate-400">
              <LifeBuoy className="h-12 w-12 text-slate-600 mb-3 animate-pulse" />
              <h3 className="text-base font-bold text-slate-200">اختر تذكرة لعرض تفاصيلها</h3>
              <p className="mt-1 text-xs text-slate-500 max-w-sm">
                اختر تذكرة من القائمة لعرض تفاصيلها بالكامل، ومتابعة المحادثة مع العميل، وإدارة جلسات الوصول عن بُعد وتقييم الخدمة.
              </p>
            </div>
          ) : detailsLoading || !details ? (
            <div className="flex flex-1 items-center justify-center p-8 text-slate-400">
              <RefreshCw className="h-6 w-6 animate-spin text-emerald-400" />
            </div>
          ) : (
            <div className="flex flex-col h-full">
              {/* Header / Ticket Summary */}
              <div className="border-b border-slate-800 p-4 bg-slate-950/60">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-emerald-500/20 text-emerald-300 px-2 py-0.5 text-xs font-bold">
                        {details.ticket.tenantName || details.ticket.tenantId}
                      </span>
                      <span className="text-xs text-slate-400">#{details.ticket.id}</span>
                      {details.ticket.rating && (
                        <span className="flex items-center gap-1 rounded bg-amber-500/20 text-amber-300 px-2 py-0.5 text-xs font-bold">
                          <Star className="h-3 w-3 fill-amber-300" /> {details.ticket.rating} نجوم
                        </span>
                      )}
                    </div>
                    <h2 className="mt-1 text-base font-black text-slate-100">{details.ticket.subject}</h2>
                    {details.ticket.description && (
                      <p className="mt-1 text-xs text-slate-300 leading-relaxed bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                        {details.ticket.description}
                      </p>
                    )}
                  </div>

                  {/* Actions Bar */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <select
                      value={details.ticket.status}
                      disabled={!canManageSupport}
                      onChange={(e) => handleStatusChange(e.target.value as any)}
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
                      onChange={(e) => handlePriorityChange(e.target.value as any)}
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
                        onClick={() => setIsRateModalOpen(true)}
                        leadingIcon={<Star className="h-3.5 w-3.5 text-amber-400" />}
                      >
                        تقييم
                      </Button>
                    )}
                  </div>
                </div>

                {/* Sub-bar: SLA & Assignee */}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400 pt-3 border-t border-slate-800/80">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <UserCheck className="h-3.5 w-3.5 text-slate-400" />
                      مسؤول:
                    </span>
                    <input
                      type="text"
                      defaultValue={details.ticket.assignedTo || ''}
                      disabled={!canManageSupport}
                      onBlur={(e) => handleAssignChange(e.target.value)}
                      placeholder="اسم الموظف (منصة الدعم)"
                      className="rounded border border-transparent hover:border-slate-700 bg-transparent px-2 py-0.5 text-xs text-slate-200 focus:border-emerald-500 focus:bg-slate-900"
                    />
                  </div>

                  {details.ticket.slaDueAt && (
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-slate-400" />
                      <span>موعد SLA:</span>
                      <span
                        className={`font-bold ${
                          new Date(details.ticket.slaDueAt).getTime() < Date.now()
                            ? 'text-rose-400'
                            : 'text-emerald-400'
                        }`}
                      >
                        {formatDateTime(details.ticket.slaDueAt)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Remote Access Banner / Panel */}
              <div className="border-b border-slate-800 bg-slate-950/40 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Monitor className="h-4 w-4 text-sky-400" />
                    <span className="text-xs font-bold text-slate-200">الوصول عن بُعد للعميل:</span>
                    <span className="text-xs text-slate-400">
                      {details.ticket.remoteAccessRequested ? (
                        details.ticket.remoteAccessApproved ? (
                          <span className="text-emerald-400 font-bold">معتمد من العميل</span>
                        ) : (
                          <span className="text-amber-400 font-bold">بانتظار موافقة العميل</span>
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
                        onClick={() => handleToggleRemoteRequest(true)}
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
                            onClick={() => handleApproveRemoteAccess(true)}
                            leadingIcon={<Unlock className="h-3 w-3" />}
                          >
                            الموافقة على الوصول
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="primary"
                            disabled={!canManageSupport}
                            onClick={() => setIsRemoteSessionOpen(true)}
                            leadingIcon={<Monitor className="h-3 w-3" />}
                          >
                            بدء جلسة الاتصال
                          </Button>
                        )}
                        {canManageSupport && (<button
                          onClick={() => handleToggleRemoteRequest(false)}
                          className="text-xs text-rose-400 hover:underline"
                        >
                          إلغاء الطلب
                        </button>)}
                      </>
                    )}
                  </div>
                </div>

                {/* Active Remote Sessions List */}
                {details.remoteSessions.length > 0 && (
                  <div className="mt-2.5 space-y-1.5 border-t border-slate-800/60 pt-2">
                    <p className="text-[11px] font-bold text-slate-400">جلسات الوصول النشطة:</p>
                    {details.remoteSessions.map((session) => (
                      <div
                        key={session.id}
                        className="flex items-center justify-between rounded-lg bg-slate-900 p-2 text-xs border border-slate-800"
                      >
                        <div>
                          <span className="font-bold text-slate-200">{session.technicianName}</span>
                          <span className="text-slate-400 text-[11px] mr-2">
                            {formatDateTime(session.startedAt)} ({session.durationMinutes} دقيقة)
                          </span>
                          {session.actionsSummary && (
                            <p className="text-[11px] text-slate-400 mt-0.5">{session.actionsSummary}</p>
                          )}
                        </div>

                        {session.status === 'ACTIVE' ? (
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={!canManageSupport}
                            onClick={() => handleEndRemoteSession(session.id)}
                          >
                            إنهاء الجلسة
                          </Button>
                        ) : (
                          <span className="text-emerald-400 text-[11px] font-bold">منتهية</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Chat Timeline (Scrollable) */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3.5 max-h-[380px]">
                {details.messages.length === 0 ? (
                  <div className="py-12 text-center text-xs text-slate-500">
                    لا توجد رسائل بعد. ابدأ المحادثة مع العميل من نافذة المحادثة.
                  </div>
                ) : (
                  details.messages.map((msg) => {
                    const isInternalMsg = Boolean(msg.isInternal);
                    const isSystem = msg.authorRole === 'SYSTEM';
                    const isSupport = msg.authorRole === 'SUPPORT';

                    if (isSystem) {
                      return (
                        <div key={msg.id} className="flex justify-center my-2">
                          <span className="rounded-full bg-slate-800/80 px-3 py-1 text-[11px] text-slate-400 border border-slate-700/50">
                            {msg.body} • {formatDateTime(msg.createdAt)}
                          </span>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${
                          isInternalMsg
                            ? 'items-center'
                            : isSupport
                            ? 'items-start'
                            : 'items-end'
                        }`}
                      >
                        <div
                          className={`max-w-[85%] rounded-xl p-3 text-xs shadow-sm ${
                            isInternalMsg
                              ? 'border border-amber-500/40 bg-amber-950/30 text-amber-200 w-full'
                              : isSupport
                              ? 'border border-slate-700 bg-slate-800 text-slate-100'
                              : 'border border-emerald-800/60 bg-emerald-950/40 text-emerald-100'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3 text-[10.5px] mb-1.5 opacity-80">
                            <span className="font-bold flex items-center gap-1">
                              {isInternalMsg && <Lock className="h-3 w-3 text-amber-400" />}
                              {msg.authorName} {isInternalMsg && '(رسالة داخلية — لا تظهر للعميل)'}
                            </span>
                            <span>{formatDateTime(msg.createdAt)}</span>
                          </div>

                          <p className="leading-relaxed whitespace-pre-wrap">{msg.body}</p>

                          {msg.attachmentUrl && (
                            <div className="mt-2 pt-2 border-t border-white/10">
                              <a
                                href={msg.attachmentUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-400 hover:underline"
                              >
                                <Paperclip className="h-3 w-3" />
                                {msg.attachmentName || 'مرفق'}
                              </a>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Message Composer & Canned Replies Strip */}
              <div className="border-t border-slate-800 p-3 bg-slate-950/70 space-y-2">
                {/* Canned replies pill list */}
                {cannedReplies.length > 0 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px]">
                    <span className="text-slate-500 shrink-0 font-semibold">ردود جاهزة:</span>
                    {cannedReplies.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => insertCannedReply(c.body)}
                        className="shrink-0 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 px-2 py-0.5 text-slate-300 hover:text-white transition-colors"
                      >
                        {c.title}
                      </button>
                    ))}
                  </div>
                )}

                {/* Textarea */}
                <div className="relative">
                  <textarea
                    rows={3}
                    value={messageBody}
                    onChange={(e) => setMessageBody(e.target.value)}
                    placeholder={
                      isInternal
                        ? 'اكتب ملاحظة داخلية لفريق الدعم فقط (لا تظهر للعميل)...'
                        : 'اكتب ردًا للعميل...'
                    }
                    className={`${inputClass} text-xs resize-none ${
                      isInternal ? 'border-amber-500/50 focus:border-amber-500' : ''
                    }`}
                  />
                </div>

                {/* Composer controls */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={isInternal}
                        onChange={(e) => setIsInternal(e.target.checked)}
                        className="rounded border-slate-700 bg-slate-800 text-amber-500 focus:ring-amber-500"
                      />
                      <span className={isInternal ? 'text-amber-400 font-bold' : ''}>
                        رسالة داخلية فقط
                      </span>
                    </label>

                    <input
                      type="text"
                      value={attachmentUrl}
                      onChange={(e) => setAttachmentUrl(e.target.value)}
                      placeholder="رابط المرفق (اختياري)"
                      className="rounded border border-slate-800 bg-slate-900 px-2 py-1 text-[11px] text-slate-300 max-w-[160px]"
                    />
                  </div>

                  <Button
                    size="sm"
                    onClick={handleSendMessage}
                    disabled={sendingMessage || !messageBody.trim()}
                    variant={isInternal ? 'secondary' : 'primary'}
                    leadingIcon={<Send className="h-3.5 w-3.5" />}
                  >
                    {isInternal ? 'إرسال داخلي' : 'إرسال للعميل'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal: New Ticket */}
      <Modal
        open={isNewTicketOpen}
        onClose={() => setIsNewTicketOpen(false)}
        title="إنشاء تذكرة دعم جديدة"
      >
        <div className="space-y-3.5 text-right">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">العميل / المتجر *</label>
            <select
              value={newTenantId}
              onChange={(e) => setNewTenantId(e.target.value)}
              className={inputClass}
            >
              <option value="">اختر العميل...</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.id})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">عنوان التذكرة *</label>
            <input
              type="text"
              value={newSubject}
              onChange={(e) => setNewSubject(e.target.value)}
              placeholder="مثال: مشكلة في طباعة الفاتورة..."
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">الأولوية</label>
              <select
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value as any)}
                className={inputClass}
              >
                <option value="LOW">منخفضة (SLA: 48h)</option>
                <option value="MEDIUM">متوسطة (SLA: 24h)</option>
                <option value="HIGH">مرتفعة (SLA: 8h)</option>
                <option value="URGENT">عاجلة (SLA: 2h)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">الموظف المسؤول</label>
              <input
                type="text"
                value={newAssignedTo}
                onChange={(e) => setNewAssignedTo(e.target.value)}
                placeholder="اسم الموظف المكلّف"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">وصف المشكلة</label>
            <textarea
              rows={3}
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="اشرح المشكلة وخطوات إعادة الإنتاج..."
              className={inputClass}
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
            <Button variant="secondary" size="sm" onClick={() => setIsNewTicketOpen(false)}>
              إلغاء
            </Button>
            <Button size="sm" onClick={handleCreateTicket} disabled={!canManageSupport}>
              إنشاء التذكرة
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Start Remote Session */}
      <Modal
        open={isRemoteSessionOpen}
        onClose={() => setIsRemoteSessionOpen(false)}
        title="بدء جلسة وصول عن بُعد"
      >
        <div className="space-y-3.5 text-right">
          <p className="text-xs text-slate-300">
            سيتم إبلاغ العميل ببدء الجلسة. يجب الحصول على موافقة العميل خطيًا قبل البدء. تُسجَّل كل الجلسات في سجل التدقيق الأمني للمنصة.
          </p>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">اسم الفني / المسؤول</label>
            <input
              type="text"
              value={technicianName}
              onChange={(e) => setTechnicianName(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">مدة الجلسة (بالدقائق)</label>
            <input
              type="number"
              value={sessionDuration}
              onChange={(e) => setSessionDuration(Number(e.target.value))}
              min={15}
              max={180}
              className={inputClass}
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
            <Button variant="secondary" size="sm" onClick={() => setIsRemoteSessionOpen(false)}>
              إلغاء
            </Button>
            <Button size="sm" onClick={handleStartRemoteSession} disabled={!canManageSupport}>
              بدء جلسة الاتصال
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: CSAT Rating */}
      <Modal
        open={isRateModalOpen}
        onClose={() => setIsRateModalOpen(false)}
        title="تقييم رضا العميل"
      >
        <div className="space-y-3.5 text-right">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">عدد النجوم (1 - 5)</label>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRatingStars(star)}
                  className="p-1 hover:scale-110 transition-transform"
                >
                  <Star
                    className={`h-7 w-7 ${
                      star <= ratingStars ? 'text-amber-400 fill-amber-400' : 'text-slate-600'
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">ملاحظات العميل</label>
            <textarea
              rows={3}
              value={ratingFeedback}
              onChange={(e) => setRatingFeedback(e.target.value)}
              placeholder="اكتب ملاحظات العميل أو ملخص ما تم حله..."
              className={inputClass}
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
            <Button variant="secondary" size="sm" onClick={() => setIsRateModalOpen(false)}>
              إلغاء
            </Button>
            <Button size="sm" onClick={handleRateTicket} disabled={!canManageSupport}>
              حفظ التقييم
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default PlatformSupportPage;
