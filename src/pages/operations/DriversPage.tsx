import React, { useState } from 'react';
import { UserRound, Plus, Search, Phone, Shield, CheckCircle2, AlertTriangle, Car } from 'lucide-react';

interface Driver {
  id: string;
  name: string;
  phone: string;
  licenseNumber: string;
  status: 'AVAILABLE' | 'ON_TRIP' | 'OFF_DUTY';
  rating: number;
  activeVehicle: string;
}

const INITIAL_DRIVERS: Driver[] = [
  { id: '1', name: 'سعيد عبد المولى', phone: '0101234567', licenseNumber: 'LIC-76543-GP', status: 'ON_TRIP', rating: 4.8, activeVehicle: 'جامبو أ ج د 5421' },
  { id: '2', name: 'رمضان حسن', phone: '0112345678', licenseNumber: 'LIC-98765-GP', status: 'AVAILABLE', rating: 4.9, activeVehicle: 'دبابة ق ر ب 9865' },
  { id: '3', name: 'مصطفى بكري', phone: '0123456789', licenseNumber: 'LIC-11223-GP', status: 'OFF_DUTY', rating: 4.5, activeVehicle: 'بدون مركبة حالياً' },
];

const STATUS_LABELS: Record<Driver['status'], { label: string; color: string }> = {
  AVAILABLE: { label: 'متاح للعمل', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  ON_TRIP: { label: 'في رحلة توصيل', color: 'bg-sky-500/10 text-sky-400 border-sky-500/20' },
  OFF_DUTY: { label: 'خارج العمل', color: 'bg-slate-700 text-slate-400 border-slate-650' },
};

export const DriversPage: React.FC = () => {
  const [drivers] = useState<Driver[]>(INITIAL_DRIVERS);
  const [search, setSearch] = useState('');

  const filtered = drivers.filter(d =>
    d.name.includes(search) || d.phone.includes(search)
  );

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden" dir="rtl">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center">
            <UserRound className="w-5 h-5 text-teal-400" />
          </div>
          <div>
            <h1 className="text-base font-black text-white">بيانات وسجلات السائقين</h1>
            <p className="text-xs text-slate-400 font-medium">تسجيل وتوزيع المهام على السائقين ومتابعة رخص القيادة والصلاحية</p>
          </div>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-sm font-semibold transition shrink-0">
          <Plus className="w-4 h-4" />
          تسجيل سائق جديد
        </button>
      </div>

      {/* Toolbar */}
      <div className="p-4 bg-slate-900/50 border-b border-slate-900 flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="بحث باسم السائق أو الهاتف..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-4 pr-10 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-teal-500/50 transition"
          />
        </div>
      </div>

      {/* Driver cards */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((d) => {
            const st = STATUS_LABELS[d.status];
            return (
              <div key={d.id} className="bg-slate-900 border border-slate-800 hover:border-slate-700/80 rounded-xl p-5 transition flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-slate-500 flex items-center gap-1 font-mono">
                      <Shield className="w-3.5 h-3.5" />
                      {d.licenseNumber}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${st.color}`}>
                      {st.label}
                    </span>
                  </div>

                  <h3 className="font-extrabold text-white mb-2">{d.name}</h3>

                  <div className="space-y-1.5 text-xs text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-slate-500" />
                      <a href={`tel:${d.phone}`} className="hover:text-teal-400 transition">{d.phone}</a>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Car className="w-3.5 h-3.5 text-slate-500" />
                      <span>المركبة الحالية: <span className="text-slate-300 font-semibold">{d.activeVehicle}</span></span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-850 flex justify-end gap-2">
                  <button className="px-3 py-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-850 rounded-lg text-xs font-bold text-slate-300 transition">
                    سجل الرحلات
                  </button>
                  <button className="px-3 py-1.5 bg-teal-600/10 hover:bg-teal-600/20 text-teal-400 border border-teal-500/20 rounded-lg text-xs font-bold transition">
                    تعديل البيانات
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