import React, { useState } from 'react';
import { Warehouse, Plus, Search, MapPin, Database, Activity, ChevronRight } from 'lucide-react';

interface WarehouseData {
  id: string;
  name: string;
  location: string;
  capacityM2: number;
  currentStockM2: number;
  supervisor: string;
}

const INITIAL_WAREHOUSES: WarehouseData[] = [
  { id: '1', name: 'المستودع الرئيسي - أ', location: 'المنطقة الصناعية، السادس من أكتوبر', capacityM2: 20000, currentStockM2: 12500, supervisor: 'محمود عبد الفتاح' },
  { id: '2', name: 'مخزن الهرم الفرعي', location: 'خلف المعرض الرئيسي، الهرم', capacityM2: 5000, currentStockM2: 4300, supervisor: 'يوسف سليم' },
  { id: '3', name: 'مستودع العبور والمشتروات', location: 'منطقة المخازن، مدينة العبور', capacityM2: 15000, currentStockM2: 2100, supervisor: 'عادل منصور' },
];

export const WarehousesPage: React.FC = () => {
  const [warehouses] = useState<WarehouseData[]>(INITIAL_WAREHOUSES);
  const [search, setSearch] = useState('');

  const filtered = warehouses.filter(w =>
    w.name.includes(search) || w.location.includes(search)
  );

  const fmt = (n: number) => new Intl.NumberFormat('ar-EG').format(n) + ' م²';

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden" dir="rtl">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
            <Warehouse className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-base font-black text-white">المخازن والمستودعات</h1>
            <p className="text-xs text-slate-400 font-medium">متابعة سعة المخازن، توزيع الأصناف وأرصدة البضائع الكلية والواردات</p>
          </div>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-sm font-semibold transition shrink-0">
          <Plus className="w-4 h-4" />
          إضافة مخزن جديد
        </button>
      </div>

      {/* Toolbar */}
      <div className="p-4 bg-slate-900/50 border-b border-slate-900 flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="بحث باسم المخزن أو العنوان..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-4 pr-10 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500/50 transition"
          />
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((w) => {
            const usagePercent = Math.min(100, Math.round((w.currentStockM2 / w.capacityM2) * 100));
            return (
              <div key={w.id} className="bg-slate-900 border border-slate-800 hover:border-slate-700/80 rounded-xl p-5 transition flex flex-col justify-between group">
                <div>
                  <h3 className="font-extrabold text-white group-hover:text-violet-400 transition mb-2 text-base">{w.name}</h3>

                  <div className="space-y-2 text-xs text-slate-400 mb-4">
                    <div className="flex items-start gap-1.5">
                      <MapPin className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                      <span>{w.location}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Database className="w-4 h-4 text-slate-500" />
                      <span>أمين المخزن: <span className="text-slate-300 font-bold">{w.supervisor}</span></span>
                    </div>
                  </div>

                  {/* Stock capacity bar */}
                  <div className="space-y-1.5 mb-2">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-400 font-medium">نسبة إشغال السعة الكلية</span>
                      <span className="font-bold text-sky-400">{usagePercent}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          usagePercent > 85 ? 'bg-rose-500' : usagePercent > 50 ? 'bg-amber-500' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${usagePercent}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex justify-between text-xs text-slate-500 font-semibold pt-1">
                    <span>الرصيد: {fmt(w.currentStockM2)}</span>
                    <span>السعة: {fmt(w.capacityM2)}</span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-850 flex justify-end gap-2">
                  <button className="px-3 py-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-850 rounded-lg text-xs font-bold text-slate-300 transition flex items-center gap-1">
                    <span>إدارة محتويات الرفوف</span>
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