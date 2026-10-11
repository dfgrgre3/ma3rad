import React, { useState } from 'react';
import { RotateCcw, Plus, Search, Calendar, CheckCircle2, AlertTriangle, FileText, ChevronRight } from 'lucide-react';

interface ReturnInvoice {
  id: string;
  code: string;
  originalInvoice: string;
  customerName: string;
  amount: number;
  date: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
}

const INITIAL_RETURNS: ReturnInvoice[] = [
  { id: '1', code: 'RET-2026-001', originalInvoice: 'INV-5401', customerName: 'أحمد رأفت جلال', amount: 4500, date: '2026-08-21', status: 'PENDING' },
  { id: '2', code: 'RET-2026-002', originalInvoice: 'INV-5390', customerName: 'مؤسسة الصفوة', amount: 12000, date: '2026-08-19', status: 'APPROVED' },
];

const STATUS_LABELS: Record<ReturnInvoice['status'], { label: string; color: string }> = {
  PENDING: { label: 'بانتظار الفحص والموافقة', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  APPROVED: { label: 'مقبول وتم استرجاع للمخزن', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  REJECTED: { label: 'مرفوض', color: 'bg-rose-500/10 text-rose-400 border-rose-500/20' },
};

export const ReturnsPage: React.FC = () => {
  const [returns] = useState<ReturnInvoice[]>(INITIAL_RETURNS);
  const [search, setSearch] = useState('');

  const filtered = returns.filter(r =>
    r.code.toLowerCase().includes(search.toLowerCase()) || r.customerName.includes(search)
  );

  const fmt = (n: number) => new Intl.NumberFormat('ar-EG').format(n) + ' ج';

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden" dir="rtl">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
            <RotateCcw className="w-5 h-5 text-rose-400" />
          </div>
          <div>
            <h1 className="text-base font-black text-white">مرتجع مبيعات المعرض</h1>
            <p className="text-xs text-slate-400 font-medium">تسجيل وتأكيد المرتجعات واسترداد البضاعة إلى مستودع السيراميك وتحديث الأثر المالي</p>
          </div>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-rose-650 hover:bg-rose-600 text-white rounded-xl text-sm font-semibold transition shrink-0">
          <Plus className="w-4 h-4" />
          تسجيل فاتورة مرتجع
        </button>
      </div>

      {/* Toolbar */}
      <div className="p-4 bg-slate-900/50 border-b border-slate-900 flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="بحث برقم المرتجع أو اسم العميل..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-4 pr-10 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-rose-500/50 transition"
          />
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((r) => {
            const st = STATUS_LABELS[r.status];
            return (
              <div key={r.id} className="bg-slate-900 border border-slate-800 hover:border-slate-700/80 rounded-xl p-5 transition flex flex-col justify-between group">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-mono font-bold text-sky-400">{r.code}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${st.color}`}>
                      {st.label}
                    </span>
                  </div>

                  <h3 className="font-extrabold text-white group-hover:text-rose-455 transition mb-1">{r.customerName}</h3>
                  <div className="text-[11px] text-slate-450 font-semibold mb-3">الفاتورة الأصلية: <span className="font-mono text-slate-300 font-bold">#{r.originalInvoice}</span></div>

                  <div className="space-y-1.5 text-xs text-slate-400 mb-3">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-500" />
                      <span>تاريخ المرتجع: {r.date}</span>
                    </div>
                  </div>

                  <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-850/60 flex items-center justify-between">
                    <span className="text-xs text-slate-450">القيمة المستردة</span>
                    <span className="text-sm font-black text-rose-450">{fmt(r.amount)}</span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-850 flex justify-end gap-2">
                  <button className="px-3 py-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-850 rounded-lg text-xs font-bold text-slate-300 transition">
                    عرض إيصال المرتجع
                  </button>
                  {r.status === 'PENDING' && (
                    <button className="px-3 py-1.5 bg-rose-650/10 hover:bg-rose-650/20 text-rose-450 border border-rose-500/20 rounded-lg text-xs font-bold transition flex items-center gap-1">
                      <span>اعتماد الإرجاع</span>
                      <ChevronRight className="w-3 h-3" />
                    </button>
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