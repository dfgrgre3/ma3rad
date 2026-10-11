import React, { useState } from 'react';
import { Package2, Plus, Search, Calendar, CheckCircle2, AlertTriangle, User, ChevronRight } from 'lucide-react';

interface Order {
  id: string;
  code: string;
  customerName: string;
  amount: number;
  date: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'CANCELLED';
  reservationActive: boolean;
}

const INITIAL_ORDERS: Order[] = [
  { id: '1', code: 'ORD-5401', customerName: 'أحمد رأفت جلال', amount: 35000, date: '2026-08-21', status: 'PROCESSING', reservationActive: true },
  { id: '2', code: 'ORD-5398', customerName: 'معتز محمود', amount: 62000, date: '2026-08-20', status: 'COMPLETED', reservationActive: false },
  { id: '3', code: 'ORD-5412', customerName: 'مؤسسة الصفوة', amount: 154000, date: '2026-08-21', status: 'PENDING', reservationActive: true },
];

const STATUS_LABELS: Record<Order['status'], { label: string; color: string }> = {
  PENDING: { label: 'بانتظار التحضير', color: 'bg-slate-500/10 text-slate-400 border-slate-500/20' },
  PROCESSING: { label: 'قيد التجهيز والشحن', color: 'bg-sky-500/10 text-sky-400 border-sky-500/20' },
  COMPLETED: { label: 'تم التسليم بالكامل', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  CANCELLED: { label: 'ملغي', color: 'bg-rose-500/10 text-rose-400 border-rose-500/20' },
};

export const OrdersPage: React.FC = () => {
  const [orders] = useState<Order[]>(INITIAL_ORDERS);
  const [search, setSearch] = useState('');

  const filtered = orders.filter(o =>
    o.code.toLowerCase().includes(search.toLowerCase()) || o.customerName.includes(search)
  );

  const fmt = (n: number) => new Intl.NumberFormat('ar-EG').format(n) + ' ج';

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden" dir="rtl">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
            <Package2 className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-base font-black text-white">إدارة طلبات وحجوزات العملاء</h1>
            <p className="text-xs text-slate-400 font-medium">متابعة تجهيز فواتير المبيعات المحجوزة وطلبات الشحن وسحب البضائع من المعرض</p>
          </div>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-sm font-semibold transition shrink-0">
          <Plus className="w-4 h-4" />
          إنشاء طلب حجز بضاعة
        </button>
      </div>

      {/* Toolbar */}
      <div className="p-4 bg-slate-900/50 border-b border-slate-900 flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="بحث برقم الطلب أو اسم العميل..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-4 pr-10 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500/50 transition"
          />
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((o) => {
            const st = STATUS_LABELS[o.status];
            return (
              <div key={o.id} className="bg-slate-900 border border-slate-800 hover:border-slate-700/80 rounded-xl p-5 transition flex flex-col justify-between group">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-mono font-bold text-sky-400">#{o.code}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${st.color}`}>
                      {st.label}
                    </span>
                  </div>

                  <h3 className="font-extrabold text-white group-hover:text-violet-405 transition mb-2">{o.customerName}</h3>

                  <div className="space-y-1.5 text-xs text-slate-400 mb-3">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-500" />
                      <span>تاريخ الطلب: {o.date}</span>
                    </div>
                  </div>

                  {o.reservationActive && (
                    <div className="mb-3 px-2.5 py-1 bg-violet-500/10 text-violet-400 text-[10px] font-bold border border-violet-500/20 rounded-md w-fit">
                      البضاعة محجوزة ومخصومة من الرصيد المتاح
                    </div>
                  )}

                  <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-850/60 flex items-center justify-between">
                    <span className="text-xs text-slate-450">قيمة الطلب الكلية</span>
                    <span className="text-sm font-black text-sky-400">{fmt(o.amount)}</span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-850 flex justify-end gap-2">
                  <button className="px-3 py-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-850 rounded-lg text-xs font-bold text-slate-300 transition">
                    تفاصيل التحضير
                  </button>
                  <button className="px-3 py-1.5 bg-violet-600/10 hover:bg-violet-600/20 text-violet-400 border border-violet-500/20 rounded-lg text-xs font-bold transition flex items-center gap-1">
                    <span>إصدار إذن صرف</span>
                    <ChevronRight className="w-3 h-3" />
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