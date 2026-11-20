import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckSquare, Search, Check, X, Clock, Loader2, Plus, Filter } from 'lucide-react';
import { ApprovalService, ApprovalRequest, ApprovalType } from '../../../services/domains/approvals/ApprovalService';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';
import { SyncChangeApprovalsPanel } from '../../../components/sync/SyncChangeApprovalsPanel';
import { useToast } from '../../../components/ui/Toast';
import { PageHeader } from '../../../components/ui/PageHeader';

const TYPE_CONFIG: Record<ApprovalType, { label: string; color: string }> = {
  DISCOUNT: { label: 'خصم استثنائي', color: 'text-warning bg-warning-soft border-warning-border' },
  PRICE_CHANGE: { label: 'تعديل سعر', color: 'text-warning bg-warning-soft border-warning-border' },
  PRICE_OVERRIDE: { label: 'بيع تحت الحد الأدنى', color: 'text-warning bg-warning-soft border-warning-border' },
  SALES_RETURN: { label: 'مرتجع بيع', color: 'text-danger bg-danger-soft border-danger-border' },
  PURCHASE_RETURN: { label: 'مرتجع شراء', color: 'text-danger bg-danger-soft border-danger-border' },
  STOCK_ADJUSTMENT: { label: 'تسوية مخزنية', color: 'text-primary bg-accent-soft border-accent-border' },
  PURCHASE_ORDER: { label: 'أمر شراء', color: 'text-primary bg-accent-soft border-accent-border' },
  EXPENSE: { label: 'مصروف', color: 'text-success bg-success-soft border-success-border' },
  SUPPLIER_PAYMENT: { label: 'دفعة مورد', color: 'text-primary bg-accent-soft border-accent-border' },
  INVOICE_VOID: { label: 'إلغاء فاتورة', color: 'text-danger bg-danger-soft border-danger-border' },
  DATA_DELETE: { label: 'حذف بيانات', color: 'text-ink bg-surface-sunken border-line' },
  CREDIT_LIMIT: { label: 'تجاوز حد الائتمان', color: 'text-primary bg-accent-soft border-accent-border' },
  LEAVE: { label: 'إجازة', color: 'text-ink bg-surface-sunken border-line' },
  OTHER: { label: 'أخرى', color: 'text-ink bg-surface-sunken border-line' },
};

const PRIORITY: Record<string, { label: string; color: string }> = {
  LOW: { label: 'منخفضة', color: 'text-muted' },
  NORMAL: { label: 'عادية', color: 'text-primary' },
  HIGH: { label: 'عالية', color: 'text-warning' },
  URGENT: { label: 'عاجلة', color: 'text-danger' },
};

const STATUS_CONFIG: Record<ApprovalRequest['status'], { label: string; color: string }> = {
  PENDING: { label: 'قيد الانتظار', color: 'bg-warning-soft text-warning border-warning-border' },
  APPROVED: { label: 'تمت الموافقة', color: 'bg-success-soft text-success border-success-border' },
  REJECTED: { label: 'مرفوض', color: 'bg-danger-soft text-danger border-danger-border' },
  CANCELLED: { label: 'ملغي', color: 'bg-surface-sunken text-muted border-line' },
  EXPIRED: { label: 'قيد الانتظار', color: 'bg-warning-soft text-warning border-warning-border' },
};

interface ApprovalRequestCardProps {
  request: ApprovalRequest;
  canApprove: boolean;
  canReject: boolean;
  canCancel: boolean;
  onDecide: (request: ApprovalRequest, approved: boolean) => void;
  onCancel: (request: ApprovalRequest) => void;
}

const ApprovalRequestCard: React.FC<ApprovalRequestCardProps> = ({
  request,
  canApprove,
  canReject,
  canCancel,
  onDecide,
  onCancel,
}) => {
  const config = TYPE_CONFIG[request.requestType] || TYPE_CONFIG.OTHER;
  const priority = PRIORITY[request.priority] || PRIORITY.NORMAL;
  const status = STATUS_CONFIG[request.status];
  const showActions = request.status === 'PENDING' && (canApprove || canReject || canCancel);

  return (
    <div className="bg-surface border border-line rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition hover:border-line-strong">
      <div className="space-y-1.5 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[10px] px-2 py-0.5 rounded font-bold border ${config.color}`}>{config.label}</span>
          <span className={`text-[10px] font-bold ${priority.color}`}>{priority.label}</span>
          <span className="text-xs text-muted font-bold">{request.requestedByName || '—'}</span>
          <span className="text-[10px] text-muted font-mono flex items-center gap-1">
            <Clock className="w-3 h-3" />{request.createdAt?.replace('T', ' ').slice(0, 16)}
          </span>
          <span className="text-[10px] text-muted font-mono">{request.requestNumber}</span>
        </div>
        <p className="text-sm font-semibold text-ink">{request.title}</p>
        {request.description && <p className="text-xs text-muted">{request.description}</p>}
        {request.status === 'PENDING' && request.payload && (() => {
          try {
            const payload = JSON.parse(request.payload) as { operationCode?: string; policy?: { minApprovals?: number; approvalMode?: string }; details?: { updates?: Record<string, unknown>; product?: Record<string, unknown> } };
            const required = payload.policy?.approvalMode === 'MULTI' ? payload.policy.minApprovals || 1 : 1;
            return <p className="text-xs font-semibold text-primary">الموافقات: {request.approvalCount || 0} / {required}{payload.operationCode ? ` · ${payload.operationCode}` : ''}{payload.details?.updates ? ` · التعديلات: ${Object.keys(payload.details.updates).join('، ')}` : ''}</p>;
          } catch { return null; }
        })()}
        {request.decisionHistory && (() => {
          try { const history = JSON.parse(request.decisionHistory) as Array<{ decision: string; user: string; notes?: string; at: string }>; return history.length > 0 ? <p className="text-xs text-muted">سجل القرارات: {history.map((item) => `${item.user || '—'}: ${item.decision}${item.notes ? ` (${item.notes})` : ''}`).join(' · ')}</p> : null; } catch { return null; }
        })()}
        {request.requestType === 'STOCK_ADJUSTMENT' && request.payload && (() => {
          try {
            const details = JSON.parse(request.payload) as { productName?: string; warehouseName?: string; quantity?: number; reason?: string };
            return <p className="text-xs font-semibold text-ink">الصنف: {details.productName || '—'} · المخزن: {details.warehouseName || '—'} · الكمية: {details.quantity ?? '—'}{details.reason ? ` · السبب: ${details.reason}` : ''}</p>;
          } catch { return <p className="text-xs text-warning">تعذر قراءة تفاصيل الطلب؛ افتح التسوية المرتبطة للمراجعة.</p>; }
        })()}
        {request.requestedValue != null && (
          <p className="text-[11px] font-bold text-primary">
            القيمة: {new Intl.NumberFormat('ar-EG').format(request.requestedValue)} ج
            {request.currentValue != null && <span className="text-muted"> (الحالي: {new Intl.NumberFormat('ar-EG').format(request.currentValue)} ج)</span>}
          </p>
        )}
        {request.decisionNotes && <p className="text-[11px] text-muted italic">ملاحظات القرار: {request.decisionNotes}</p>}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {showActions ? (
          <>
            {canApprove && <button onClick={() => onDecide(request, true)} className="px-3.5 py-2 bg-success hover:bg-success text-white rounded-lg text-xs font-bold transition flex items-center gap-1">
              <Check className="w-3.5 h-3.5" /> موافقة
            </button>}
            {canReject && <button onClick={() => onDecide(request, false)} className="px-3.5 py-2 bg-danger-soft hover:bg-danger-soft text-danger border border-danger-border rounded-lg text-xs font-bold transition flex items-center gap-1">
              <X className="w-3.5 h-3.5" /> رفض
            </button>}
            {canCancel && <button onClick={() => onCancel(request)} className="px-3 py-2 bg-surface-sunken text-ink-secondary rounded-lg text-xs font-bold" title="إلغاء الطلب">
              إلغاء
            </button>}
          </>
        ) : (
          <span className={`text-xs font-extrabold px-3 py-1.5 rounded-lg border ${status.color}`}>
            {status.label}
          </span>
        )}
      </div>
    </div>
  );
};

export const ApprovalsPage: React.FC = () => {
  const toast = useToast();
  const service = useMemo(() => new ApprovalService(), []);
  const user = AuthService.getCurrentUser();
  // صلاحيات دقيقة لكل زر مع توافق خلفي مع أكواد approvals.* القديمة.
  const canApprove = PermissionService.can(user, 'ui.approvals.inbox.approve');
  const canReject = PermissionService.can(user, 'ui.approvals.inbox.reject');
  const canCancel = PermissionService.can(user, 'ui.approvals.inbox.cancel');
  const canCreate = PermissionService.can(user, 'ui.approvals.inbox.create');
  const isOwner = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [stats, setStats] = useState({ pending: 0, approved: 0, rejected: 0, cancelled: 0, expired: 0 });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ requestType: 'DISCOUNT', title: '', description: '', requestedValue: '', priority: 'NORMAL' });

  const load = useCallback(() => {
    setLoading(true);
    try {
      setRequests(service.getRequests(statusFilter, search));
      setStats(service.getStats());
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل الطلبات.');
    } finally {
      setLoading(false);
    }
  }, [search, service, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const decide = (req: ApprovalRequest, approved: boolean) => {
    const notes = prompt(approved ? 'ملاحظات الاعتماد (اختياري):' : (req.requestType === 'STOCK_ADJUSTMENT' ? 'سبب رفض طلب المخزون (مطلوب):' : 'سبب الرفض (اختياري):')) || undefined;
    if (!approved && req.requestType === 'STOCK_ADJUSTMENT' && !notes?.trim()) return;
    try {
      service.decide(req.id, approved, notes);
      load();
    } catch (e: any) {
      toast.error(e?.message || 'تعذر تنفيذ القرار.');
    }
  };

  const cancel = (req: ApprovalRequest) => {
    try {
      service.cancel(req.id);
      load();
    } catch (e: any) {
      toast.error(e?.message || 'تعذر إلغاء الطلب.');
    }
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      service.createRequest({
        requestType: form.requestType as ApprovalType,
        title: form.title,
        description: form.description || undefined,
        requestedValue: form.requestedValue ? Number(form.requestedValue) : undefined,
        priority: form.priority as any,
      });
      setModalOpen(false);
      setForm({ requestType: 'DISCOUNT', title: '', description: '', requestedValue: '', priority: 'NORMAL' });
      setStatusFilter('PENDING');
      load();
    } catch (err: any) {
      toast.error(err?.message || 'تعذر إنشاء الطلب.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-surface-muted text-ink overflow-hidden">
      <div className="bg-surface border-b border-line px-6 pt-4">
        <PageHeader
          icon={<CheckSquare className="w-5 h-5" />}
          title="صندوق الموافقات والاعتمادات"
          description="مراجعة واعتماد طلبات الخصم، تسويات الجرد، وتجاوز الحدود الائتمانية"
          actions={canCreate && (
            <button onClick={() => setModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-warning hover:bg-warning text-white rounded-xl text-sm font-semibold transition self-start sm:self-auto">
              <Plus className="w-4 h-4" /> طلب اعتماد جديد
            </button>
          )}
        />
      </div>

      <div className="p-4 grid grid-cols-1 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        {[ 
          { label: 'قيد الانتظار', value: stats.pending, color: 'text-warning bg-warning-soft border-warning-border' },
          { label: 'تم اعتمادها', value: stats.approved, color: 'text-success bg-success-soft border-success-border' },
          { label: 'مرفوضة', value: stats.rejected, color: 'text-danger bg-danger-soft border-danger-border' },
          { label: 'ملغاة', value: stats.cancelled, color: 'text-ink-secondary bg-surface-sunken border-line' },
          { label: 'منتهية', value: stats.expired, color: 'text-ink-secondary bg-surface-sunken border-line' },
        ].map((c) => (
          <div key={c.label} className={`rounded-xl border p-3.5 ${c.color}`}>
            <p className="text-[10px] font-bold opacity-80">{c.label}</p>
            <p className="text-xl font-black">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Branch / linked-account edits awaiting the business owner's decision */}
      <div className="px-4 pb-3">
        <div className="rounded-2xl border border-line bg-surface p-4">
          <SyncChangeApprovalsPanel
            canDecide={isOwner}
            requestedBy={isOwner ? undefined : user?.id}
          />
        </div>
      </div>

      <div className="px-4 pb-3 flex flex-col md:flex-row gap-3">
        <form onSubmit={(e) => { e.preventDefault(); load(); }} className="relative flex-1">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالطلب أو رقمه ثم اضغط إدخال..." className="w-full pl-4 pr-10 py-2.5 bg-surface border border-line rounded-xl text-sm focus:outline-none focus:border-warning" />
        </form>
        <div className="relative">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="appearance-none pl-10 pr-4 py-2.5 bg-surface border border-line rounded-xl text-sm font-bold text-ink focus:outline-none focus:border-warning min-w-[160px]">
            <option value="ALL">جميع الحالات</option>
            <option value="PENDING">قيد الانتظار</option>
            <option value="APPROVED">معتمدة</option>
            <option value="REJECTED">مرفوضة</option>
            <option value="CANCELLED">ملغاة</option>
            <option value="EXPIRED">منتهية</option>
          </select>
          <Filter className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {error && <div className="mb-3 px-4 py-2.5 rounded-xl bg-danger-soft border border-danger-border text-danger text-xs font-semibold">{error}</div>}
        {loading ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-warning" /></div>
        ) : (
          <div className="w-full space-y-3">
            {requests.map((request) => (
              <ApprovalRequestCard
                key={request.id}
                request={request}
                canApprove={canApprove}
                canReject={canReject}
                canCancel={canCancel}
                onDecide={decide}
                onCancel={cancel}
              />
            ))}
            {requests.length === 0 && (
              <div className="py-16 text-center text-muted border-2 border-dashed border-line rounded-2xl bg-surface">
                <CheckSquare className="w-12 h-12 text-muted mx-auto mb-3" />
                <p className="text-sm">لا توجد طلبات في هذه القائمة</p>
              </div>
            )}
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-primary/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-2xl border border-line shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-extrabold text-ink">طلب اعتماد جديد</h3>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg text-muted hover:bg-surface-sunken"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleCreate} className="space-y-3 text-xs">
              <div>
                <label htmlFor="approval-request-type" className="font-bold text-ink block mb-1">نوع الطلب</label>
                <select id="approval-request-type" value={form.requestType} onChange={(e) => setForm({ ...form, requestType: e.target.value })} className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line font-bold">
                  {Object.entries(TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="approval-title" className="font-bold text-ink block mb-1">العنوان *</label>
                <input id="approval-title" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line font-semibold" />
              </div>
              <div>
                <label htmlFor="approval-description" className="font-bold text-ink block mb-1">الوصف</label>
                <textarea id="approval-description" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label htmlFor="approval-requested-value" className="font-bold text-ink block mb-1">القيمة المطلوبة (ج)</label>
                  <input id="approval-requested-value" type="number" min="0" step="0.01" value={form.requestedValue} onChange={(e) => setForm({ ...form, requestedValue: e.target.value })} className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line font-mono" />
                </div>
                <div>
                  <label htmlFor="approval-priority" className="font-bold text-ink block mb-1">الأولوية</label>
                  <select id="approval-priority" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line font-bold">
                    {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-line">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 bg-surface-sunken text-ink font-bold rounded-xl">إلغاء</button>
                <button type="submit" disabled={saving} className="px-5 py-2 bg-warning hover:bg-warning disabled:opacity-60 text-white font-bold rounded-xl flex items-center gap-2">
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} إرسال الطلب
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
