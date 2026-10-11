import React, { useState } from 'react';
import { Percent, Plus, Search, Tag, DollarSign, CheckCircle2, ChevronRight } from 'lucide-react';

interface PriceList {
  id: string;
  name: string;
  category: 'RETAIL' | 'WHOLESALE' | 'CONTRACTOR' | 'VIP';
  discountPercent: number;
  isActive: boolean;
  itemsCount: number;
}

const INITIAL_PRICE_LISTS: PriceList[] = [
  { id: '1', name: 'قائمة أسعار المعرض (التجزئة)', category: 'RETAIL', discountPercent: 0, isActive: true, itemsCount: 145 },
  { id: '2', name: 'أسعار المقاولين والشركاء', category: 'CONTRACTOR', discountPercent: 12, isActive: true, itemsCount: 145 },
  { id: '3', name: 'قائمة الجملة للموزعين', category: 'WHOLESALE', discountPercent: 18, isActive: true, itemsCount: 120 },
  { id: '4', name: 'كبار العملاء والـ VIP', category: 'VIP', discountPercent: 7, isActive: false, itemsCount: 85 },
];

const CATEGORY_LABELS: Record<PriceList['category'], { label: string; color: string }> = {
  RETAIL: { label: 'بيع قطاعي', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  WHOLESALE: { label: 'جملة الموزعين', color: 'bg-violet-500/10 text-violet-400 border-violet-500/20' },
  CONTRACTOR: { label: 'سعر المقاولين', color: 'bg-sky-500/10 text-sky-400 border-sky-500/20' },
  VIP: { label: 'عملاء VIP', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
};

export const PricingPage: React.FC = () => {
  const [priceLists] = useState<PriceList[]>(INITIAL_PRICE_LISTS);
  const [search, setSearch] = useState('');

  const filtered = priceLists.filter(p =>
    p.name.includes(search)
  );

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden" dir="rtl">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <Percent className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-base font-black text-white">قوائم تسعير السيراميك والمواد</h1>
            <p className="text-xs text-slate-400 font-medium">إعداد الخصومات وقوائم الأسعار المخصصة للمقاولين والتجار وكبار العملاء</p>
          </div>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold transition shrink-0">
          <Plus className="w-4 h-4" />
          إنشاء قائمة أسعار
        </button>
      </div>

      {/* Toolbar */}
      <div className="p-4 bg-slate-900/50 border-b border-slate-900 flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="بحث باسم القائمة..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-4 pr-10 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 transition"
          />
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((list) => {
            const st = CATEGORY_LABELS[list.category];
            return (
              <div key={list.id} className="bg-slate-900 border border-slate-800 hover:border-slate-700/80 rounded-xl p-5 transition flex flex-col justify-between group">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold border ${st.color}`}>
                      {st.label}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${list.isActive ? 'bg-emerald-500/10 text-emerald-450 border border-emerald-500/20' : 'bg-slate-800 text-slate-500 border border-slate-750'}`}>
                      {list.isActive ? 'نشطة' : 'معطلة'}
                    </span>
                  </div>

                  <h3 className="font-extrabold text-white group-hover:text-emerald-450 transition mb-2">{list.name}</h3>

                  <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-850/60 mb-2 flex items-center justify-between">
                    <span className="text-xs text-slate-400">الخصم الافتراضي للقائمة</span>
                    <span className="text-sm font-black text-rose-450">%{list.discountPercent} خصم</span>
                  </div>

                  <div className="text-xs text-slate-500 font-semibold">تضم {list.itemsCount} صنف بأسعار مخصصة.</div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-850 flex justify-end gap-2">
                  <button className="px-3 py-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-850 rounded-lg text-xs font-bold text-slate-300 transition">
                    عرض الأسعار
                  </button>
                  <button className="px-3 py-1.5 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 border border-emerald-500/20 rounded-lg text-xs font-bold transition">
                    تعديل الخصومات
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