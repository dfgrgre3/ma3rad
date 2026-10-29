import React from 'react';
import { Activity, Box, FileText, Users } from 'lucide-react';
import type { AuditStats } from '../../../services/AuditService';

interface Props {
  stats: AuditStats | null;
}

export const AuditStatsCards: React.FC<Props> = ({ stats }) => {
  if (!stats) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center">
          <FileText className="w-5 h-5" />
        </div>
        <div>
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">إجمالي السجلات</div>
          <div className="text-xl font-black text-slate-900">{stats.totalLogs.toLocaleString('ar')}</div>
        </div>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
          <Activity className="w-5 h-5" />
        </div>
        <div>
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">عمليات اليوم</div>
          <div className="text-xl font-black text-sky-600">{stats.todayActions.toLocaleString('ar')}</div>
        </div>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
          <Box className="w-5 h-5" />
        </div>
        <div>
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">الوحدات النشطة</div>
          <div className="text-xl font-black text-indigo-600">{stats.byModule.length}</div>
        </div>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
          <Users className="w-5 h-5" />
        </div>
        <div>
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">المستخدمين النشطين</div>
          <div className="text-xl font-black text-emerald-600">{stats.byUser.length}</div>
        </div>
      </div>
    </div>
  );
};
