import React, { useState } from 'react';
import { TrendingDown, Plus, Search, Calendar, DollarSign, Tag, CheckCircle2 } from 'lucide-react';

interface Expense {
  id: string;
  code: string;
  category: string;
  description: string;
  amount: number;
  date: string;
  paymentMethod: string;
}

const INITIAL_EXPENSES: Expense[] = [
  { id: '1', code: 'EXP-2026-001', category: 'إيجار فرع', description: 'إيجار مقر معرض الهرم لشهر أغسطس', amount: 15000, date: '2026-08-01', paymentMethod: 'شيك بنكي' },
  { id: '2', code: 'EXP-2026-002', category: 'كهرباء ومياه', description: 'فاتورة الكهرباء لشهر يوليو - مخزن أكتوبر', amount: 2400, date: '2026-08-10', paymentMethod: 'خزينة رئيسية' },
  { id: '3', code: 'EXP-2026-003', category: 'صيانة وتصليح', description: 'صيانة سيارة النقل جامبو (تغيير زيوت وفلاتر)', amount: 1800, date: '2026-08-15', paymentMethod: 'خزينة رئيسية' },
];

export const ExpensesPage: React.FC = () => {
  const [expenses] = useState<Expense[]>(INITIAL_EXPENSES);
  const [search, setSearch] = useState('');

  const filtered = expenses.filter(e =>
    e.category.includes(search) || e.description.includes(search)
  );

  const total = filtered.reduce((s, e) => s + e.amount, 0);
  const fmt = (n: number) => new Intl.NumberFormat('ar-EG').format(n) + ' ج';

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden" dir="rtl">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
            <TrendingDown className="w-5 h-5 text-rose-400" />
          </div>
          <div>
            <h1 className="text-base font-black text-white">إدارة المصروفات التشغيلية</h1>
            <p className="text-xs text-slate-400 font-medium">سجل النفقات اليومية، صيانة السيارات، الإيجارات، وفواتير المرافق الحكومية</p>
          </div>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-sm font-semibold transition shrink-0">
          <Plus className="w-4 h-4" />
          تسجيل مصروف جديد
        </button>
      </div>

      {/* Stats Summary */}
      <div className="p-4 bg-slate-900/50 border-b border-slate-900 flex justify-between items-center px-6">
        <div className="text-xs text-slate-400 font-bold">إجمالي المصروفات المصنفة:</div>
        <div className="text-lg font-black text-rose-400">{fmt(total)}</div>
      </div>

      {/* Toolbar */}
      <div className="p-4 bg-slate-900/30 border-b border-slate-900 flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="بحث بالفئة أو الوصف..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-4 pr-10 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-rose-500/50 transition"
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-850">
              <tr>
                {['كود السند', 'الفئة', 'التاريخ', 'طريقة الدفع', 'الوصف والبيان', 'المبلغ'].map(h => (
                  <th key={h} className="px-4 py-3 text-right text-xs font-bold text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filtered.map((e) => (
                <tr key={e.id} className="hover:bg-slate-800/30 transition">
                  <td className="px-4 py-3 font-mono text-sky-400 font-bold">{e.code}</td>
                  <td className="px-4 py-3 text-white font-medium">
                    <span className="text-[11px] px-2.5 py-1 rounded bg-slate-800 border border-slate-750 text-slate-350">
                      {e.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{e.date}</td>
                  <td className="px-4 py-3 text-slate-300 font-semibold">{e.paymentMethod}</td>
                  <td className="px-4 py-3 text-slate-400 max-w-[250px] truncate">{e.description}</td>
                  <td className="px-4 py-3 text-rose-400 font-black">{fmt(e.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};