import React, { useState } from 'react';
import { CheckSquare, Search, Check, X, ShieldAlert, Clock, ChevronRight } from 'lucide-react';

interface ApprovalRequest {
  id: string;
  type: 'DISCOUNT' | 'RETURN' | 'STOCK_ADJUSTMENT' | 'CREDIT_LIMIT';
  requestedBy: string;
  details: string;
  date: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
}

const INITIAL_REQUESTS: ApprovalRequest[] = [
  { id: '1', type: 'DISCOUNT', requestedBy: 'يوسف سليم', details: 'طلب خصم إضافي 5% على فاتورة عميل كاشير بقيمة 45,000 ج', date: '2026-08-21 10:15', status: 'PENDING' },
  { id: '2', type: 'STOCK_ADJUSTMENT', requestedBy: 'محمود عبد الفتاح', details: 'طلب تسوية عجز بمقدار 15 كرتونة بورسلين تالف', date: '2026-08-21 09:30', status: 'PENDING' },
  { id: '3', type: 'CREDIT_LIMIT', requestedBy: 'سناء ممدوح', details: 'زيادة حد الائتمان لشركة مقاولات النيل إلى 250,000 ج', date: '2026-08-20', status: 'APPROVED' },
];

const TYPE_CONFIG: Record<ApprovalRequest['type'], { label: string; color: string }> = {
  DISCOUNT: { label: 'خصم استثنائي', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  RETURN: { label: 'مرتجع بدون فاتورة', color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' },
  STOCK_ADJUSTMENT: { label: 'تسوية مخزنية', color: 'text-violet-400 bg-violet-500/10 border-violet-500/20' },
  CREDIT_LIMIT: { label: 'تجاوز حد الائتمان', color: 'text-sky-400 bg-sky-500/10 border-sky-500/20' },
};

export const ApprovalsPage: React.FC = () => {
  const [requests, setRequests] = useState<ApprovalRequest[]>(INITIAL_REQUESTS);
  const [search, setSearch] = useState('');

  const filtered = requests.filter(r =>
    r.details.includes(search) || r.requestedBy.includes(search)
  );

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden" dir="rtl">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center">
            <CheckSquare className="w-5 h-5 text-yellow-400" />
          </div>
          <div>
            <h1 className="text-base font-black text-white">صندوق الموافقات والاعتمادات</h1>
            <p className="text-xs text-slate-400 font-medium">مراجعة واعتماد طلبات الخصم، تسويات الجرد، وتجاوز الحدود الائتمانية</p>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="p-4 bg-slate-900/50 border-b border-slate-900 flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="بحث بالطلب، أو اسم مقدم الطلب..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-4 pr-10 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-yellow-500/50 transition"
          />
        </div>
      </div>

      {/* Request list */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-4xl mx-auto space-y-3">
          {filtered.map((req) => {
            const config = TYPE_CONFIG[req.type];
            return (
              <div key={req.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition hover:border-slate-700/80">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold border ${config.color}`}>
                      {config.label}
                    </span>
                    <span className="text-xs text-slate-400 font-bold">{req.requestedBy}</span>
                    <span className="text-[10px] text-slate-550 font-mono flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {req.date}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-white">{req.details}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {req.status === 'PENDING' ? (
                    <>
                      <button
                        onClick={() => {
                          setRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: 'APPROVED' } : r));
                        }}
                        className="px-3.5 py-2 bg-emerald-650 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold transition flex items-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" /> موافقة
                      </button>
                      <button
                        onClick={() => {
                          setRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: 'REJECTED' } : r));
                        }}
                        className="px-3.5 py-2 bg-rose-650/10 hover:bg-rose-650/20 text-rose-450 border border-rose-500/20 rounded-lg text-xs font-bold transition flex items-center gap-1"
                      >
                        <X className="w-3.5 h-3.5" /> رفض
                      </button>
                    </>
                  ) : (
                    <span className={`text-xs font-extrabold px-3 py-1.5 rounded-lg border ${
                      req.status === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                    }`}>
                      {req.status === 'APPROVED' ? 'تمت الموافقة' : 'مرفوض'}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};