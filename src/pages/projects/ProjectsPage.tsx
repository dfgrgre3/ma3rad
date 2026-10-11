import React from 'react';
import { Boxes, Plus, Calendar, User, DollarSign, Building2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const DEMO_PROJECTS = [
  { id: '1', name: 'مشروع فيلا النرجس', client: 'أحمد محمد', value: 350000, status: 'IN_PROGRESS', progress: 65, startDate: '2026-01-15' },
  { id: '2', name: 'كومباوند البنفسج — فيزة B', client: 'المقاولون العرب', value: 1200000, status: 'IN_PROGRESS', progress: 30, startDate: '2026-03-01' },
  { id: '3', name: 'شقة 12 — برج القاهرة', client: 'سارة عبدالله', value: 85000, status: 'COMPLETED', progress: 100, startDate: '2025-11-10' },
  { id: '4', name: 'فندق الغروب — الطابق 3', client: 'فنادق الريف', value: 2500000, status: 'PENDING', progress: 0, startDate: '2026-09-01' },
];

const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  PENDING:     { label: 'قيد الانتظار', color: 'text-amber-400', bg: 'bg-amber-500/10' },
  IN_PROGRESS: { label: 'جاري',         color: 'text-sky-400',   bg: 'bg-sky-500/10' },
  COMPLETED:   { label: 'منتهي',        color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  CANCELLED:   { label: 'ملغي',         color: 'text-rose-400',  bg: 'bg-rose-500/10' },
};

export const ProjectsPage: React.FC = () => {
  const navigate = useNavigate();
  const fmt = (n: number) => new Intl.NumberFormat('ar-EG').format(n) + ' ج';

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden" dir="rtl">
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Boxes className="w-5 h-5 text-violet-400" />
          <h1 className="text-base font-black text-white">مشاريع المقاولين والعملاء</h1>
          <span className="text-xs bg-violet-500/20 text-violet-400 px-2 py-0.5 rounded-full font-bold">{DEMO_PROJECTS.length}</span>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-sm font-semibold transition">
          <Plus className="w-4 h-4" />مشروع جديد
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {DEMO_PROJECTS.map(project => {
            const st = STATUS[project.status];
            return (
              <div
                key={project.id}
                onClick={() => navigate(`/projects/${project.id}`)}
                className="bg-slate-900 rounded-xl border border-slate-800 hover:border-slate-700 p-5 cursor-pointer transition-all hover:shadow-lg hover:shadow-slate-900/50"
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <h3 className="font-bold text-white text-sm leading-snug">{project.name}</h3>
                  <span className={`text-[10px] px-2 py-1 rounded-lg font-bold whitespace-nowrap ${st.bg} ${st.color}`}>
                    {st.label}
                  </span>
                </div>
                <div className="space-y-2 text-xs text-slate-400">
                  <div className="flex items-center gap-2"><User className="w-3.5 h-3.5" />{project.client}</div>
                  <div className="flex items-center gap-2"><DollarSign className="w-3.5 h-3.5" /><span className="text-sky-400 font-bold">{fmt(project.value)}</span></div>
                  <div className="flex items-center gap-2"><Calendar className="w-3.5 h-3.5" />{project.startDate}</div>
                </div>
                <div className="mt-4">
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1.5">
                    <span>التقدم</span><span className="font-bold text-white">{project.progress}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${project.progress === 100 ? 'bg-emerald-500' : 'bg-sky-500'}`}
                      style={{ width: `${project.progress}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
