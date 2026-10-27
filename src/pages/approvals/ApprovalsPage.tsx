import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckSquare, Search, Check, X, Clock, Loader2, Plus, Filter } from 'lucide-react';
import { ApprovalService, ApprovalRequest, ApprovalType } from '../../services/ApprovalService';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';

const TYPE_CONFIG: Record<ApprovalType, { label: string; color: string }> = {
  DISCOUNT: { label: 'خصم استثنائي', color: 'text-amber-700 bg-amber-50 border-amber-200' },
  PRICE_CHANGE: { label: 'تعديل سعر', color: 'text-orange-700 bg-orange-50 border-orange-200' },
  SALES_RETURN: { label: 'مرتجع بيع', color: 'text-rose-700 bg-rose-50 border-rose-200' },
  PURCHASE_RETURN: { label: 'مرتجع شراء', color: 'text-rose-700 bg-rose-50 border-rose-200' },
  STOCK_ADJUSTMENT: { label: 'تسوية مخزنية', color: 'text-violet-700 bg-violet-50 border-violet-200' },
  PURCHASE_ORDER: { label: 'أمر شراء', color: 'text-sky-700 bg-sky-50 border-sky-200' },
  EXPENSE: { label: 'مصروف', color: 'text-teal-700 bg-teal-50 border-teal-200' },
  CREDIT_LIMIT: { label: 'تجاوز حد الائتمان', color: 'text-indigo-700 bg-indigo-50 border-indigo-200' },
  LEAVE: { label: 'إجازة', color: 'text-slate-700 bg-slate-100 border-slate-200' },
  OTHER: { label: 'أخرى', color: 'text-slate-700 bg-slate-100 border-slate-200' },
};

const PRIORITY: Record<string, { label: string; color: string }> = {
  LOW: { label: 'منخفضة', color: 'text-slate-500' },
  NORMAL: { label: 'عادية', color: 'text-sky-600' },
  HIGH: { label: 'عالية', color: 'text-amber-600' },
  URGENT: { label: 'عاجلة', color: 'text-rose-600' },
};

const STATUS_CONFIG: Record<ApprovalRequest['status'], { label: string; color: string }> = {
  PENDING: { label: 'قيد الانتظار', color: 'bg-amber-50 text-amber-600 border-amber-200' },
  APPROVED: { label: 'تمت الموافقة', color: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
  REJECTED: { label: 'مرفوض', color: 'bg-rose-50 text-rose-600 border-rose-200' },
  CANCELLED: { label: 'ملغي', color: 'bg-slate-100 text-slate-500 border-slate-200' },
  EXPIRED: { label: 'قيد الانتظار', color: 'bg-amber-50 text-amber-600 border-amber-200' },
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
    <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition hover:border-slate-300">
      <div className="space-y-1.5 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[10px] px-2 py-0.5 rounded font-bold border ${config.color}`}>{config.label}</span>
          <span className={`text-[10px] font-bold ${priority.color}`}>{priority.label}</span>
          <span className="text-xs text-slate-500 font-bold">{request.requestedByName || '—'}</span>
          <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
            <Clock className="w-3 h-3" />{request.createdAt?.replace('T', ' ').slice(0, 16)}
          </span>
          <span className="text-[10px] text-slate-400 font-mono">{request.requestNumber}</span>
        </div>
        <p className="text-sm font-semibold text-slate-900">{request.title}</p>
        {request.description && <p className="text-xs text-slate-500">{request.description}</p>}
        {request.requestedValue != null && (
          <p className="text-[11px] font-bold text-sky-600">
            القيمة: {new Intl.NumberFormat('ar-EG').format(request.requestedValue)} ج
            {request.currentValue != null && <span className="text-slate-400"> (الحالي: {new Intl.NumberFormat('ar-EG').format(request.currentValue)} ج)</span>}
          </p>
        )}
        {request.decisionNotes && <p className="text-[11px] text-slate-500 italic">ملاحظات القرار: {request.decisionNotes}</p>}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {showActions ? (
          <>
            {canApprove && <button onClick={() => onDecide(request, true)} className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1">
              <Check className="w-3.5 h-3.5" /> موافقة
            </button>}
            {canReject && <button onClick={() => onDecide(request, false)} className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-lg text-xs font-bold transition flex items-center gap-1">
              <X className="w-3.5 h-3.5" /> رفض
            </button>}
            {canCancel && <button onClick={() => onCancel(request)} className="px-3 py-2 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold" title="إلغاء الطلب">
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
  const service = useMemo(() => new ApprovalService(), []);
  const user = AuthService.getCurrentUser();
  const canApprove = PermissionService.can(user, 'approvals.approve');
  const canReject = PermissionService.can(user, 'approvals.reject');
  const canCancel = PermissionService.can(user, 'approvals.cancel');
  const canCreate = PermissionService.can(user, 'approvals.create');

  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [stats, setStats] = useState({ pending: 0, approved: 0, rejected: 0 });
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
    const notes = prompt(approved ? 'ملاحظات الاعتماد (اختياري):' : 'سبب الرفض (اختياري):') || undefined;
    try {
      service.decide(req.id, approved, notes);
      load();
    } catch (e: any) {
      alert(e?.message || 'تعذر تنفيذ القرار.');
    }
  };

  const cancel = (req: ApprovalRequest) => {
    try {
      service.cancel(req.id);
      load();
    } catch (e: any) {
      alert(e?.message || 'تعذر إلغاء الطلب.');
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
      alert(err?.message || 'تعذر إنشاء الطلب.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-yellow-50 border border-yellow-200 flex items-center justify-center">
            <CheckSquare className="w-5 h-5 text-yellow-600" />
          </div>
          <div>
            <h1 className="text-base font-black text-slate-900">صندوق الموافقات والاعتمادات</h1>
            <p className="text-xs text-slate-500">مراجعة واعتماد طلبات الخصم، تسويات الجرد، وتجاوز الحدود الائتمانية</p>
          </div>
        </div>
        {canCreate && (
          <button onClick={() => setModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-xl text-sm font-semibold transition self-start sm:self-auto">
            <Plus className="w-4 h-4" /> طلب اعتماد جديد
          </button>
        )}
      </div>

      <div className="p-4 grid grid-cols-3 gap-3">
        {[
          { label: 'قيد الانتظار', value: stats.pending, color: 'text-amber-600 bg-amber-50 border-amber-200' },
          { label: 'تم اعتمادها', value: stats.approved, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
          { label: 'مرفوضة', value: stats.rejected, color: 'text-rose-600 bg-rose-50 border-rose-200' },
        ].map((c) => (
          <div key={c.label} className={`rounded-xl border p-3.5 ${c.color}`}>
            <p className="text-[10px] font-bold opacity-80">{c.label}</p>
            <p className="text-xl font-black">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="px-4 pb-3 flex flex-col md:flex-row gap-3">
        <form onSubmit={(e) => { e.preventDefault(); load(); }} className="relative flex-1">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالطلب أو رقمه ثم Enter..." className="w-full pl-4 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-yellow-400" />
        </form>
        <div className="relative">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="appearance-none pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:border-yellow-400 min-w-[160px]">
            <option value="ALL">جميع الحالات</option>
            <option value="PENDING">قيد الانتظار</option>
            <option value="APPROVED">معتمدة</option>
            <option value="REJECTED">مرفوضة</option>
            <option value="CANCELLED">ملغاة</option>
          </select>
          <Filter className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {error && <div className="mb-3 px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">{error}</div>}
        {loading ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-yellow-500" /></div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-3">
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
              <div className="py-16 text-center text-slate-500 border-2 border-dashed border-slate-200 rounded-2xl bg-white">
                <CheckSquare className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-sm">لا توجد طلبات في هذه القائمة</p>
              </div>
            )}
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-extrabold text-slate-900">طلب اعتماد جديد</h3>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleCreate} className="space-y-3 text-xs">
              <div>
                <label htmlFor="approval-request-type" className="font-bold text-slate-700 block mb-1">نوع الطلب</label>
                <select id="approval-request-type" value={form.requestType} onChange={(e) => setForm({ ...form, requestType: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold">
                  {Object.entries(TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="approval-title" className="font-bold text-slate-700 block mb-1">العنوان *</label>
                <input id="approval-title" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-semibold" />
              </div>
              <div>
                <label htmlFor="approval-description" className="font-bold text-slate-700 block mb-1">الوصف</label>
                <textarea id="approval-description" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="approval-requested-value" className="font-bold text-slate-700 block mb-1">القيمة المطلوبة (ج)</label>
                  <input id="approval-requested-value" type="number" min="0" step="0.01" value={form.requestedValue} onChange={(e) => setForm({ ...form, requestedValue: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" />
                </div>
                <div>
                  <label htmlFor="approval-priority" className="font-bold text-slate-700 block mb-1">الأولوية</label>
                  <select id="approval-priority" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold">
                    {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl">إلغاء</button>
                <button type="submit" disabled={saving} className="px-5 py-2 bg-yellow-500 hover:bg-yellow-600 disabled:opacity-60 text-white font-bold rounded-xl flex items-center gap-2">
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
