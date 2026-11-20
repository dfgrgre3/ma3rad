import React from 'react';
import { Shield, Laptop, Clock, Key, FileWarning, Ban } from 'lucide-react';
import type { SecurityTab } from './constants';

interface TabsBarProps {
  tab: SecurityTab;
  onTabChange: (tab: SecurityTab) => void;
  sessionsCount: number;
  incidentsCount: number;
}

export const TabsBar: React.FC<TabsBarProps> = ({ tab, onTabChange, sessionsCount, incidentsCount }) => (
  <div className="flex border-b border-line-strong pb-0">
    <button
      onClick={() => onTabChange('OVERVIEW')}
      className={`flex items-center gap-2 px-5 py-3 text-xs font-bold border-b-2 transition-all ${
        tab === 'OVERVIEW'
          ? 'border-success text-success bg-primary/60'
          : 'border-transparent text-muted hover:text-muted'
      }`}
    >
      <Shield className="h-4 w-4" />
      <span>نظرة عامة والإنذارات</span>
    </button>

    <button
      onClick={() => onTabChange('SESSIONS')}
      className={`flex items-center gap-2 px-5 py-3 text-xs font-bold border-b-2 transition-all ${
        tab === 'SESSIONS'
          ? 'border-success text-success bg-primary/60'
          : 'border-transparent text-muted hover:text-muted'
      }`}
    >
      <Laptop className="h-4 w-4" />
      <span>الجلسات المركزية والأجهزة الموثوقة ({sessionsCount})</span>
    </button>

    <button
      onClick={() => onTabChange('LOGINS')}
      className={`flex items-center gap-2 px-5 py-3 text-xs font-bold border-b-2 transition-all ${
        tab === 'LOGINS'
          ? 'border-success text-success bg-primary/60'
          : 'border-transparent text-muted hover:text-muted'
      }`}
    >
      <Clock className="h-4 w-4" />
      <span>سجل محاولات الدخول والأنشطة</span>
    </button>

    <button
      onClick={() => onTabChange('KEYS')}
      className={`flex items-center gap-2 px-5 py-3 text-xs font-bold border-b-2 transition-all ${
        tab === 'KEYS'
          ? 'border-success text-success bg-primary/60'
          : 'border-transparent text-muted hover:text-muted'
      }`}
    >
      <Key className="h-4 w-4" />
      <span>مفاتيح API والتوقيع الرقمي</span>
    </button>

    <button
      onClick={() => onTabChange('INCIDENTS')}
      className={`flex items-center gap-2 px-5 py-3 text-xs font-bold border-b-2 transition-all ${
        tab === 'INCIDENTS'
          ? 'border-success text-success bg-primary/60'
          : 'border-transparent text-muted hover:text-muted'
      }`}
    >
      <FileWarning className="h-4 w-4" />
      <span>سجل الحوادث والاستجابة ({incidentsCount})</span>
    </button>

    <button
      onClick={() => onTabChange('IP_BANS')}
      className={`flex items-center gap-2 px-5 py-3 text-xs font-bold border-b-2 transition-all ${
        tab === 'IP_BANS'
          ? 'border-success text-success bg-primary/60'
          : 'border-transparent text-muted hover:text-muted'
      }`}
    >
      <Ban className="h-4 w-4" />
      <span>حظر عناوين IP</span>
    </button>
  </div>
);
