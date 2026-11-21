import React from 'react';
import { BarChart3, HardHat, Landmark, UserCheck } from 'lucide-react';
import { ActivityGate } from '../../../components/ui/ActivityGate';
import type { EmployeeTab } from '../../../types/hr/employeesPage';

interface EmployeeTabsProps {
  activeTab: EmployeeTab;
  /** Per-tab visibility — combines role grants and central section restrictions. */
  canViewTab: (tab: EmployeeTab) => boolean;
  onTabChange: (tab: EmployeeTab) => void;
}

const TAB_STYLE = (active: boolean) =>
  `px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2 ${active ? 'bg-warning text-ink shadow-md' : 'text-muted hover:text-ink bg-surface'}`;

export const EmployeeTabs: React.FC<EmployeeTabsProps> = ({
  activeTab,
  canViewTab,
  onTabChange,
}) => {
  return (
    <div className="bg-surface border-b border-line px-6 py-2 flex flex-wrap gap-2">
      {canViewTab('directory') && (
        <button onClick={() => onTabChange('directory')} className={TAB_STYLE(activeTab === 'directory')}>
          <HardHat className="w-4 h-4" />
          دليل العمال وتوزيعهم
        </button>
      )}
      {canViewTab('finance') && (
        <ActivityGate element="payroll"><button onClick={() => onTabChange('finance')} className={TAB_STYLE(activeTab === 'finance')}>
          <Landmark className="w-4 h-4" />
          حسابات الأجور والرواتب
        </button></ActivityGate>
      )}
      {canViewTab('attendance') && (
        <ActivityGate element="attendance"><button onClick={() => onTabChange('attendance')} className={TAB_STYLE(activeTab === 'attendance')}>
          <UserCheck className="w-4 h-4" />
          سجل الحضور اليومي
        </button></ActivityGate>
      )}
      {canViewTab('analytics') && (
        <button onClick={() => onTabChange('analytics')} className={TAB_STYLE(activeTab === 'analytics')}>
          <BarChart3 className="w-4 h-4" />
          تقارير المراقبة والتحليلات
        </button>
      )}
    </div>
  );
};
