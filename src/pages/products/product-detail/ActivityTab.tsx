import React from 'react';
import { ActivityRow } from '../../../types/products/productDetailPage';

interface ActivityTabProps {
  activity: ActivityRow[];
}

export const ActivityTab: React.FC<ActivityTabProps> = ({ activity }) => {
  return (
    <div className="bg-surface rounded-xl border border-line overflow-hidden">
      <div className="p-4 border-b border-line"><h3 className="text-sm font-bold text-ink">سجل النشاط</h3></div>
      {activity.length === 0 ? <div className="text-center text-muted py-12 text-sm">لا توجد سجلات</div> : (
        <ul className="divide-y divide-line-strong">
          {activity.map((a, i) => (
            <li key={i} className="px-4 py-3 flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-bold text-ink">{a.action}</div>
                <div className="text-[11px] text-muted mt-0.5">{a.user || '—'}</div>
              </div>
              <span className="text-[10px] font-mono text-muted shrink-0">{a.at ? new Date(a.at).toLocaleString('ar-EG') : ''}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
