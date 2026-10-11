import React, { useState } from 'react';
import { Car, Plus, Search, CheckCircle2, AlertTriangle, PenTool, ShieldAlert, Calendar } from 'lucide-react';

interface Vehicle {
  id: string;
  plateNumber: string;
  model: string;
  type: string;
  status: 'ACTIVE' | 'MAINTENANCE' | 'OUT_OF_SERVICE';
  lastService: string;
  assignedDriver: string;
}

const INITIAL_VEHICLES: Vehicle[] = [
  { id: '1', plateNumber: 'أ ج د 5421', model: 'شيفروليه جامبو 2023', type: 'نقل متوسط', status: 'ACTIVE', lastService: '2026-08-01', assignedDriver: 'سعيد عبد المولى' },
  { id: '2', plateNumber: 'ق ر ب 9865', model: 'إيسوزو ديماكس 2022', type: 'نقل خفيف', status: 'ACTIVE', lastService: '2026-07-15', assignedDriver: 'رمضان حسن' },
  { id: '3', plateNumber: 'ط س ع 1234', model: 'ميتسوبيشي كانتر 2021', type: 'نقل ثقيل', status: 'MAINTENANCE', lastService: '2026-08-20', assignedDriver: 'غير معين' },
];

const STATUS_LABELS: Record<Vehicle['status'], { label: string; color: string }> = {
  ACTIVE: { label: 'جاهزة للعمل', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  MAINTENANCE: { label: 'في الصيانة الدوريّة', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  OUT_OF_SERVICE: { label: 'خارج الخدمة', color: 'bg-rose-500/10 text-rose-400 border-rose-500/20' },
};

export const VehiclesPage: React.FC = () => {
  const [vehicles] = useState<Vehicle[]>(INITIAL_VEHICLES);
  const [search, setSearch] = useState('');

  const filtered = vehicles.filter(v =>
    v.plateNumber.includes(search) || v.model.includes(search) || v.type.includes(search)
  );

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden" dir="rtl">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
            <Car className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-base font-black text-white">أسطول سيارات المعرض</h1>
            <p className="text-xs text-slate-400 font-medium">متابعة مركبات النقل والشحن وتواريخ الفحص والصيانة الدورية</p>
          </div>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-sm font-semibold transition shrink-0">
          <Plus className="w-4 h-4" />
          تسجيل مركبة جديدة
        </button>
      </div>

      {/* Toolbar */}
      <div className="p-4 bg-slate-900/50 border-b border-slate-900 flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="بحث برقم اللوحة، الموديل، أو النوع..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-4 pr-10 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500/50 transition"
          />
        </div>
      </div>

      {/* Grid of Vehicles */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((v) => {
            const st = STATUS_LABELS[v.status];
            return (
              <div key={v.id} className="bg-slate-900 border border-slate-800 hover:border-slate-700/80 rounded-xl p-5 transition flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-sky-400 font-mono">
                      {v.plateNumber}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${st.color}`}>
                      {st.label}
                    </span>
                  </div>

                  <h3 className="font-extrabold text-white mb-1">{v.model}</h3>
                  <div className="text-xs text-slate-400 font-semibold mb-3">{v.type}</div>

                  <div className="space-y-1.5 text-xs text-slate-450">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-500" />
                      <span>آخر صيانة: {v.lastService}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Car className="w-3.5 h-3.5 text-slate-500" />
                      <span>السائق المعين: <span className="text-slate-300 font-bold">{v.assignedDriver}</span></span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-850 flex justify-end gap-2">
                  <button className="px-3 py-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-850 rounded-lg text-xs font-bold text-slate-300 transition flex items-center gap-1">
                    <PenTool className="w-3 h-3" />
                    سجل الصيانة
                  </button>
                  <button className="px-3 py-1.5 bg-violet-600/10 hover:bg-violet-600/20 text-violet-400 border border-violet-500/20 rounded-lg text-xs font-bold transition">
                    تعديل المركبة
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