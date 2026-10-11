import React, { useState } from 'react';
import { Banknote, Plus, Search, Calendar, CheckCircle2, AlertTriangle, User, ChevronRight } from 'lucide-react';

interface Debt {
  id: string;
  name: string;
  type: 'CUSTOMER_RECEIVABLE' | 'SUPPLIER_PAYABLE';
  amount: number;
  dueDate: string;
  status: 'OVERDUE' | 'PENDING' | 'PAID';
}

const INITIAL_DEBTS: Debt[] = [
  { id: '1', name: 'شركة مقاولات النيل', type: 'CUSTOMER_RECEIVABLE', amount: 85000, dueDate: '2026-08-15', status: 'OVERDUE' },
  { id: '2', name: 'مصنع سيراميك رويال', type: 'SUPPLIER_PAYABLE', amount: 120000, dueDate: '2026-09-01', status: 'PENDING' },
  { id: '3', name: 'أحمد محمد علي', type: 'CUSTOMER_RECEIVABLE', amount: 15000, dueDate: '2026-08-25', status: 'PENDING' },
];

const TYPE_LABELS: Record<Debt['type'], { label: string; color: string }> = {
  CUSTOMER_RECEIVABLE: { label: 'ذمم مدينة (لنا)', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  SUPPLIER_PAYABLE: { label: 'مستحقات للموردين (علينا)', color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' },
};

export const DebtsDashboardPage: React.FC = () => {
  const [debts] = useState<Debt[]>(INITIAL_DEBTS);
  const [search, setSearch] = useState('');

  const filtered = debts.filter(d =>
    d.name.includes(search)
  );

  const fmt = (n: number) => new Intl.NumberFormat('ar-EG').format(n) + ' ج';

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden" dir="rtl">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
            <Banknote className="w-5 h-5 text-rose-400" />
          </div>
          <div>
            <h1 className="text-base font-black text-white">الديون والذمم المالية</h1>
            <p className="text-xs text-slate-400 font-medium">متابعة حسابات المديونيات الآجلة للعملاء، ومستحقات مصانع السيراميك والموردين</p>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="p-4 bg-slate-900/50 border-b border-slate-900 flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="بحث باسم الحساب..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-4 pr-10 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-rose-500/50 transition"
          />
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((d) => {
            const typeConfig = TYPE_LABELS[d.type];
            return (
              <div key={d.id} className="bg-slate-900 border border-slate-800 hover:border-slate-700/80 rounded-xl p-5 transition flex flex-col justify-between group">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-[10px] px-2.5 py-1 rounded font-bold border ${typeConfig.color}`}>
                      {typeConfig.label}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                      d.status === 'OVERDUE' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20 animate-pulse' : 'bg-slate-800 text-slate-450 border border-slate-750'
                    }`}>
                      {d.status === 'OVERDUE' ? 'متأخرة السداد' : 'قيد الانتظار'}
                    </span>
                  </div>

                  <h3 className="font-extrabold text-white group-hover:text-rose-455 transition mb-2 text-base">{d.name}</h3>

                  <div className="space-y-1.5 text-xs text-slate-400 mb-4">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-500" />
                      <span>تاريخ الاستحقاق: {d.dueDate}</span>
                    </div>
                  </div>

                  <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-850/60 flex items-center justify-between">
                    <span className="text-xs text-slate-450">المبلغ المستحق</span>
                    <span className={`text-sm font-black ${d.type === 'CUSTOMER_RECEIVABLE' ? 'text-emerald-400' : 'text-rose-400'}`}>{fmt(d.amount)}</span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-850 flex justify-end gap-2">
                  <button className="px-3 py-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-850 rounded-lg text-xs font-bold text-slate-300 transition">
                    كشف حساب تفصيلي
                  </button>
                  <button className={`px-3 py-1.5 text-white rounded-lg text-xs font-bold transition ${
                    d.type === 'CUSTOMER_RECEIVABLE' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-rose-650 hover:bg-rose-600'
                  }`}>
                    {d.type === 'CUSTOMER_RECEIVABLE' ? 'تسجيل تحصيل' : 'سداد دفعة'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};