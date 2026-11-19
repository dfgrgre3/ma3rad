import React from 'react';
import { Shield, Laptop, Clock, Key, FileWarning } from 'lucide-react';
import type { SecurityTab } from './constants';

interface TabsBarProps {
  tab: SecurityTab;
  onTabChange: (tab: SecurityTab) => void;
  sessionsCount: number;
  incidentsCount: number;
}

export const TabsBar: React.FC<TabsBarProps> = ({ tab, onTabChange, sessionsCount, incidentsCount }) => (
  <div className="flex border-b border-slate-800 pb-0">
    <button
      onClick={() => onTabChange('OVERVIEW')}
      className={`flex items-center gap-2 px-5 py-3 text-xs font-bold border-b-2 transition-all ${
        tab === 'OVERVIEW'
          ? 'border-emerald-500 text-emerald-400 bg-slate-900/60'
          : 'border-transparent text-slate-400 hover:text-slate-200'
      }`}
    >
      <Shield className="h-4 w-4" />
      <span>نظرة عامة والإنذارات</span>
    </button>

    <button
      onClick={() => onTabChange('SESSIONS')}
      className={`flex items-center gap-2 px-5 py-3 text-xs font-bold border-b-2 transition-all ${
        tab === 'SESSIONS'
          ? 'border-emerald-500 text-emerald-400 bg-slate-900/60'
          : 'border-transparent text-slate-400 hover:text-slate-200'
      }`}
    >
      <Laptop className="h-4 w-4" />
      <span>الجلسات المركزية والأجهزة الموثوقة ({sessionsCount})</span>
    </button>

    <button
      onClick={() => onTabChange('LOGINS')}
      className={`flex items-center gap-2 px-5 py-3 text-xs font-bold border-b-2 transition-all ${
        tab === 'LOGINS'
          ? 'border-emerald-500 text-emerald-400 bg-slate-900/60'
          : 'border-transparent text-slate-400 hover:text-slate-200'
      }`}
    >
      <Clock className="h-4 w-4" />
      <span>سجل محاولات الدخول والأنشطة</span>
    </button>

    <button
      onClick={() => onTabChange('KEYS')}
      className={`flex items-center gap-2 px-5 py-3 text-xs font-bold border-b-2 transition-all ${
        tab === 'KEYS'
          ? 'border-emerald-500 text-emerald-400 bg-slate-900/60'
          : 'border-transparent text-slate-400 hover:text-slate-200'
      }`}
    >
      <Key className="h-4 w-4" />
      <span>مفاتيح API والتوقيع الرقمي</span>
    </button>

    <button
      onClick={() => onTabChange('INCIDENTS')}
      className={`flex items-center gap-2 px-5 py-3 text-xs font-bold border-b-2 transition-all ${
        tab === 'INCIDENTS'
          ? 'border-emerald-500 text-emerald-400 bg-slate-900/60'
          : 'border-transparent text-slate-400 hover:text-slate-200'
      }`}
    >
      <FileWarning className="h-4 w-4" />
      <span>سجل الحوادث والاستجابة ({incidentsCount})</span>
    </button>
  </div>
);
