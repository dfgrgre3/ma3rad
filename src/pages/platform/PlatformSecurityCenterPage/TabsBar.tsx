import React from 'react';
import { Shield, Laptop, Clock, Radar, Key, FileWarning, Ban } from 'lucide-react';
import type { SecurityTab } from './constants';

interface TabsBarProps {
  tab: SecurityTab;
  onTabChange: (tab: SecurityTab) => void;
  sessionsCount: number;
  incidentsCount: number;
  eventsCount?: number;
}

const tabClass = (active: boolean) =>
  `flex items-center gap-2 px-5 py-3 text-xs font-bold border-b-2 transition-all ${
    active
      ? 'border-success text-success bg-primary/60'
      : 'border-transparent text-muted hover:text-muted'
  }`;

export const TabsBar: React.FC<TabsBarProps> = ({ tab, onTabChange, sessionsCount, incidentsCount, eventsCount = 0 }) => (
  <div className="flex border-b border-line-strong pb-0 overflow-x-auto">
    <button onClick={() => onTabChange('OVERVIEW')} className={tabClass(tab === 'OVERVIEW')}>
      <Shield className="h-4 w-4" />
      <span>نظرة عامة والإنذارات</span>
    </button>

    <button onClick={() => onTabChange('SESSIONS')} className={tabClass(tab === 'SESSIONS')}>
      <Laptop className="h-4 w-4" />
      <span>الجلسات المركزية والأجهزة الموثوقة ({sessionsCount})</span>
    </button>

    <button onClick={() => onTabChange('LOGINS')} className={tabClass(tab === 'LOGINS')}>
      <Clock className="h-4 w-4" />
      <span>سجل محاولات الدخول والأنشطة</span>
    </button>

    <button onClick={() => onTabChange('EVENTS')} className={tabClass(tab === 'EVENTS')}>
      <Radar className="h-4 w-4" />
      <span>الأحداث الأمنية ({eventsCount})</span>
    </button>

    <button onClick={() => onTabChange('KEYS')} className={tabClass(tab === 'KEYS')}>
      <Key className="h-4 w-4" />
      <span>مفاتيح API والتوقيع الرقمي</span>
    </button>

    <button onClick={() => onTabChange('INCIDENTS')} className={tabClass(tab === 'INCIDENTS')}>
      <FileWarning className="h-4 w-4" />
      <span>سجل الحوادث والاستجابة ({incidentsCount})</span>
    </button>

    <button onClick={() => onTabChange('IP_BANS')} className={tabClass(tab === 'IP_BANS')}>
      <Ban className="h-4 w-4" />
      <span>حظر عناوين IP</span>
    </button>
  </div>
);
