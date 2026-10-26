import React from 'react';
import { ActivityRow } from './types';

interface ActivityTabProps {
  activity: ActivityRow[];
}

export const ActivityTab: React.FC<ActivityTabProps> = ({ activity }) => {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="p-4 border-b border-slate-200"><h3 className="text-sm font-bold text-slate-900">سجل النشاط</h3></div>
      {activity.length === 0 ? <div className="text-center text-slate-500 py-12 text-sm">لا توجد سجلات</div> : (
        <ul className="divide-y divide-slate-100">
          {activity.map((a, i) => (
            <li key={i} className="px-4 py-3 flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-bold text-slate-800">{a.action}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">{a.user || '—'}</div>
              </div>
              <span className="text-[10px] font-mono text-slate-400 shrink-0">{a.at ? new Date(a.at).toLocaleString('ar-EG') : ''}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
