import React, { useState } from 'react';
import { Star, Plus, Search, Calendar, CheckCircle2, ChevronRight, Tag } from 'lucide-react';

interface Promotion {
  id: string;
  title: string;
  description: string;
  discountRate: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

const INITIAL_PROMOTIONS: Promotion[] = [
  { id: '1', title: 'مهرجان الصيف الكليوباترا', description: 'خصم خاص على جميع مقاسات بلاط الحوائط كليوباترا فرز أول وثان.', discountRate: 15, startDate: '2026-08-01', endDate: '2026-08-31', isActive: true },
  { id: '2', title: 'عرض أطقم الحمامات الكاملة', description: 'اشتر طقم حمام روكا كامل واحصل على خصم فوري.', discountRate: 10, startDate: '2026-08-10', endDate: '2026-08-25', isActive: true },
  { id: '3', title: 'تصفية المخازن للبورسلين المستورد', description: 'عروض على الكميات المتبقية للبورسلين الهندي والإسباني.', discountRate: 25, startDate: '2026-09-01', endDate: '2026-09-15', isActive: false },
];

export const PromotionsPage: React.FC = () => {
  const [promotions] = useState<Promotion[]>(INITIAL_PROMOTIONS);
  const [search, setSearch] = useState('');

  const filtered = promotions.filter(p =>
    p.title.includes(search) || p.description.includes(search)
  );

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden" dir="rtl">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <Star className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-base font-black text-white">العروض الترويجية والخصومات</h1>
            <p className="text-xs text-slate-400 font-medium">إنشاء وجدولة الحملات الترويجية والخصومات الموسمية للمعارض</p>
          </div>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-sm font-semibold transition shrink-0">
          <Plus className="w-4 h-4" />
          إنشاء عرض جديد
        </button>
      </div>

      {/* Toolbar */}
      <div className="p-4 bg-slate-900/50 border-b border-slate-900 flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="بحث بالعروض الترويجية..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-4 pr-10 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500/50 transition"
          />
        </div>
      </div>

      {/* Promotions List */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => (
            <div key={p.id} className="bg-slate-900 border border-slate-800 hover:border-slate-700/80 rounded-xl p-5 transition flex flex-col justify-between group">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] px-2.5 py-1 rounded-full font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1">
                    <Tag className="w-3 h-3" /> خصم %{p.discountRate}
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${p.isActive ? 'bg-emerald-500/10 text-emerald-450 border border-emerald-500/20' : 'bg-slate-800 text-slate-500 border border-slate-750'}`}>
                    {p.isActive ? 'نشط حالياً' : 'مجدول'}
                  </span>
                </div>

                <h3 className="font-extrabold text-white group-hover:text-amber-450 transition mb-2">{p.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed mb-4">{p.description}</p>

                <div className="space-y-1.5 text-xs text-slate-500">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-605" />
                    <span>من: {p.startDate} — إلى: {p.endDate}</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-850 flex justify-end gap-2">
                <button className="px-3 py-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-850 rounded-lg text-xs font-bold text-slate-300 transition">
                  المنتجات المشمولة
                </button>
                <button className="px-3 py-1.5 bg-amber-600/10 hover:bg-amber-600/20 text-amber-400 border border-amber-500/20 rounded-lg text-xs font-bold transition">
                  تعديل العرض
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};