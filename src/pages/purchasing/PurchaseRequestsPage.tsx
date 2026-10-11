import React, { useState } from 'react';
import { ClipboardList, Plus, Search, CheckCircle2, Clock, AlertTriangle, FileText, ChevronRight } from 'lucide-react';

interface PurchaseRequest {
  id: string;
  code: string;
  requestedBy: string;
  department: string;
  date: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'ORDERED';
  itemsCount: number;
}

const INITIAL_REQUESTS: PurchaseRequest[] = [
  { id: '1', code: 'PRQ-2026-001', requestedBy: 'محمود عبد الفتاح', department: 'المستودعات', date: '2026-08-21', status: 'PENDING', itemsCount: 8 },
  { id: '2', code: 'PRQ-2026-002', requestedBy: 'يوسف سليم', department: 'مبيعات الهرم', date: '2026-08-19', status: 'APPROVED', itemsCount: 4 },
  { id: '3', code: 'PRQ-2026-003', requestedBy: 'سناء ممدوح', department: 'الحسابات', date: '2026-08-15', status: 'ORDERED', itemsCount: 12 },
];

const STATUS_LABELS: Record<PurchaseRequest['status'], { label: string; color: string }> = {
  PENDING: { label: 'بانتظار الاعتماد', color: 'bg-slate-500/10 text-slate-450 border-slate-500/20' },
  APPROVED: { label: 'تمت الموافقة', color: 'bg-sky-500/10 text-sky-400 border-sky-500/20' },
  REJECTED: { label: 'مرفوض', color: 'bg-rose-500/10 text-rose-400 border-rose-500/20' },
  ORDERED: { label: 'تم عمل أمر الشراء', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
};

export const PurchaseRequestsPage: React.FC = () => {
  const [requests] = useState<PurchaseRequest[]>(INITIAL_REQUESTS);
  const [search, setSearch] = useState('');

  const filtered = requests.filter(r =>
    r.code.toLowerCase().includes(search.toLowerCase()) || r.requestedBy.includes(search)
  );

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden" dir="rtl">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
            <ClipboardList className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h1 className="text-base font-black text-white">طلبات الشراء والتوريد</h1>
            <p className="text-xs text-slate-400 font-medium">تقديم ومراجعة طلبات استيراد أو توريد بضائع المعرض الناقصة لتجنب نفاد المخزون</p>
          </div>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-sm font-semibold transition shrink-0">
          <Plus className="w-4 h-4" />
          تقديم طلب توريد جديد
        </button>
      </div>

      {/* Search Toolbar */}
      <div className="p-4 bg-slate-900/50 border-b border-slate-900 flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="بحث برقم الطلب أو مقدم الطلب..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-4 pr-10 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-orange-500/50 transition"
          />
        </div>
      </div>

      {/* Requests table */}
      <div className="flex-1 overflow-auto p-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-850">
              <tr>
                {['كود الطلب', 'تاريخ الطلب', 'مقدم الطلب', 'القسم', 'عدد الأصناف', 'الحالة', 'الخيارات'].map(h => (
                  <th key={h} className="px-4 py-3 text-right text-xs font-bold text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filtered.map((req) => {
                const st = STATUS_LABELS[req.status];
                return (
                  <tr key={req.id} className="hover:bg-slate-800/30 transition">
                    <td className="px-4 py-3 font-mono text-sky-400 font-bold">{req.code}</td>
                    <td className="px-4 py-3 text-slate-400">{req.date}</td>
                    <td className="px-4 py-3 text-white font-medium">{req.requestedBy}</td>
                    <td className="px-4 py-3 text-slate-350">{req.department}</td>
                    <td className="px-4 py-3 text-slate-300 font-bold">{req.itemsCount} أصناف</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${st.color}`}>
                        {st.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 font-bold transition">
                        <FileText className="w-3.5 h-3.5" />
                        <span>عرض البنود</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};