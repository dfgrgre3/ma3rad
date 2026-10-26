import React from 'react';
import { BarChart3, HardHat, Landmark, UserCheck } from 'lucide-react';
import type { EmployeeTab } from './types';

interface EmployeeTabsProps {
  activeTab: EmployeeTab;
  canManageEmployees: boolean;
  onTabChange: (tab: EmployeeTab) => void;
}

export const EmployeeTabs: React.FC<EmployeeTabsProps> = ({
  activeTab,
  canManageEmployees,
  onTabChange,
}) => {
  return (
    <div className="bg-white border-b border-slate-200 px-6 py-2 flex flex-wrap gap-2">
      <button
        onClick={() => onTabChange('directory')}
        className={`px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2 ${activeTab === 'directory' ? 'bg-orange-600 text-slate-900 shadow-md' : 'text-slate-500 hover:text-slate-800 bg-white'
 }`}
      >
        <HardHat className="w-4 h-4" />
        دليل العمال وتوزيعهم
      </button>
      <button
        onClick={() => onTabChange('finance')}
        disabled={!canManageEmployees}
        className={`px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2 ${activeTab === 'finance' ? 'bg-orange-600 text-slate-900 shadow-md' : 'text-slate-500 hover:text-slate-800 bg-white'
 }`}
      >
        <Landmark className="w-4 h-4" />
        حسابات الأجور والرواتب
      </button>
      <button
        onClick={() => onTabChange('attendance')}
        className={`px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2 ${activeTab === 'attendance' ? 'bg-orange-600 text-slate-900 shadow-md' : 'text-slate-500 hover:text-slate-800 bg-white'
 }`}
      >
        <UserCheck className="w-4 h-4" />
        سجل الحضور اليومي
      </button>
      <button
        onClick={() => onTabChange('analytics')}
        disabled={!canManageEmployees}
        className={`px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2 ${activeTab === 'analytics' ? 'bg-orange-600 text-slate-900 shadow-md' : 'text-slate-500 hover:text-slate-800 bg-white'
 }`}
      >
        <BarChart3 className="w-4 h-4" />
        تقارير المراقبة والتحليلات
      </button>
    </div>
  );
};
