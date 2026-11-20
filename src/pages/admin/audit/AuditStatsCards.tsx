import React from 'react';
import { Activity, Box, FileText, Users } from 'lucide-react';
import type { AuditStats } from '../../../services/domains/security/AuditService';

interface Props {
  stats: AuditStats | null;
}

export const AuditStatsCards: React.FC<Props> = ({ stats }) => {
  if (!stats) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="bg-surface p-4 rounded-2xl border border-line shadow-sm flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-surface-sunken text-ink-secondary flex items-center justify-center">
          <FileText className="w-5 h-5" />
        </div>
        <div>
          <div className="text-[11px] font-bold text-muted uppercase tracking-wider">إجمالي السجلات</div>
          <div className="text-xl font-black text-ink">{stats.totalLogs.toLocaleString('ar')}</div>
        </div>
      </div>

      <div className="bg-surface p-4 rounded-2xl border border-line shadow-sm flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-accent-soft text-primary flex items-center justify-center">
          <Activity className="w-5 h-5" />
        </div>
        <div>
          <div className="text-[11px] font-bold text-muted uppercase tracking-wider">عمليات اليوم</div>
          <div className="text-xl font-black text-primary">{stats.todayActions.toLocaleString('ar')}</div>
        </div>
      </div>

      <div className="bg-surface p-4 rounded-2xl border border-line shadow-sm flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-accent-soft text-primary flex items-center justify-center">
          <Box className="w-5 h-5" />
        </div>
        <div>
          <div className="text-[11px] font-bold text-muted uppercase tracking-wider">الوحدات النشطة</div>
          <div className="text-xl font-black text-primary">{stats.byModule.length}</div>
        </div>
      </div>

      <div className="bg-surface p-4 rounded-2xl border border-line shadow-sm flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-success-soft text-success flex items-center justify-center">
          <Users className="w-5 h-5" />
        </div>
        <div>
          <div className="text-[11px] font-bold text-muted uppercase tracking-wider">المستخدمين النشطين</div>
          <div className="text-xl font-black text-success">{stats.byUser.length}</div>
        </div>
      </div>
    </div>
  );
};
