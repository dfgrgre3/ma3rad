import React from 'react';
import { BarChart3, HardHat, Landmark, UserCheck } from 'lucide-react';
import { ActivityGate } from '../../../components/ui/ActivityGate';
import type { EmployeeTab } from '../../../types/hr/employeesPage';

interface EmployeeTabsProps {
  activeTab: EmployeeTab;
  canManageEmployees: boolean;
  canViewAttendance: boolean;
  onTabChange: (tab: EmployeeTab) => void;
}

export const EmployeeTabs: React.FC<EmployeeTabsProps> = ({
  activeTab,
  canManageEmployees,
  canViewAttendance,
  onTabChange,
}) => {
  return (
    <div className="bg-surface border-b border-line px-6 py-2 flex flex-wrap gap-2">
      <button
        onClick={() => onTabChange('directory')}
        className={`px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2 ${activeTab === 'directory' ? 'bg-warning text-ink shadow-md' : 'text-muted hover:text-ink bg-surface'
}`}
      >
        <HardHat className="w-4 h-4" />
        دليل العمال وتوزيعهم
      </button>
      {canManageEmployees && (
        <ActivityGate element="payroll"><button
          onClick={() => onTabChange('finance')}
          className={`px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2 ${activeTab === 'finance' ? 'bg-warning text-ink shadow-md' : 'text-muted hover:text-ink bg-surface'
}`}
        >
          <Landmark className="w-4 h-4" />
          حسابات الأجور والرواتب
        </button></ActivityGate>
      )}
      {canViewAttendance && (
        <ActivityGate element="attendance"><button
          onClick={() => onTabChange('attendance')}
          className={`px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2 ${activeTab === 'attendance' ? 'bg-warning text-ink shadow-md' : 'text-muted hover:text-ink bg-surface'
}`}
        >
          <UserCheck className="w-4 h-4" />
          سجل الحضور اليومي
        </button></ActivityGate>
      )}
      {canManageEmployees && (
        <button
          onClick={() => onTabChange('analytics')}
          className={`px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2 ${activeTab === 'analytics' ? 'bg-warning text-ink shadow-md' : 'text-muted hover:text-ink bg-surface'
}`}
        >
          <BarChart3 className="w-4 h-4" />
          تقارير المراقبة والتحليلات
        </button>
      )}
    </div>
  );
};
