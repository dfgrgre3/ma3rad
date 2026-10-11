import React, { useState } from 'react';
import { Building2, Plus, Search, MapPin, Users, TrendingUp, Phone, ChevronRight } from 'lucide-react';

interface Branch {
  id: string;
  name: string;
  location: string;
  phone: string;
  manager: string;
  employeeCount: number;
  monthlyRevenue: number;
}

const INITIAL_BRANCHES: Branch[] = [
  { id: '1', name: 'فرع الهرم الرئيسي', location: 'ش الهرم الرئيسي، أمام سباتس، الجيزة', phone: '02-3580010', manager: 'يوسف سليم', employeeCount: 14, monthlyRevenue: 450000 },
  { id: '2', name: 'معرض مدينة نصر', location: 'طريق النصر، بجوار النادي الأهلي، القاهرة', phone: '02-2401050', manager: 'حسام حسن', employeeCount: 9, monthlyRevenue: 280000 },
  { id: '3', name: 'فرع أكتوبر والشيخ زايد', location: 'محور 26 يوليو، هايجراند مول، أكتوبر', phone: '02-3835060', manager: 'شريف مصطفى', employeeCount: 11, monthlyRevenue: 390000 },
];

export const BranchesPage: React.FC = () => {
  const [branches] = useState<Branch[]>(INITIAL_BRANCHES);
  const [search, setSearch] = useState('');

  const filtered = branches.filter(b =>
    b.name.includes(search) || b.location.includes(search) || b.manager.includes(search)
  );

  const fmt = (n: number) => new Intl.NumberFormat('ar-EG').format(n) + ' ج';

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden" dir="rtl">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-sky-400" />
          </div>
          <div>
            <h1 className="text-base font-black text-white">إدارة الفروع والمعارض</h1>
            <p className="text-xs text-slate-400 font-medium">متابعة مبيعات الفروع المختلفة وتوزيع الموظفين والإشراف العام</p>
          </div>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-sm font-semibold transition shrink-0">
          <Plus className="w-4 h-4" />
          إضافة فرع جديد
        </button>
      </div>

      {/* Toolbar */}
      <div className="p-4 bg-slate-900/50 border-b border-slate-900 flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="بحث باسم الفرع، العنوان، أو المدير المسؤول..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-4 pr-10 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500/50 transition"
          />
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((b) => (
            <div key={b.id} className="bg-slate-900 border border-slate-800 hover:border-slate-700/80 rounded-xl p-5 transition flex flex-col justify-between group">
              <div>
                <h3 className="font-extrabold text-white group-hover:text-sky-400 transition mb-2 text-base">{b.name}</h3>

                <div className="space-y-2 text-xs text-slate-400 mb-4">
                  <div className="flex items-start gap-1.5">
                    <MapPin className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                    <span>{b.location}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Phone className="w-4 h-4 text-slate-500" />
                    <a href={`tel:${b.phone}`} className="hover:text-sky-400 transition">{b.phone}</a>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-slate-500" />
                    <span>المدير: <span className="text-slate-300 font-bold">{b.manager}</span> — {b.employeeCount} موظف</span>
                  </div>
                </div>

                <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-850/60 flex items-center justify-between">
                  <span className="text-xs text-slate-450 flex items-center gap-1">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                    مبيعات الشهر الحالية
                  </span>
                  <span className="text-sm font-black text-emerald-450">{fmt(b.monthlyRevenue)}</span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-850 flex justify-end gap-2">
                <button className="px-3 py-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-850 rounded-lg text-xs font-bold text-slate-300 transition flex items-center gap-1">
                  <span>الأداء والتقارير</span>
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};