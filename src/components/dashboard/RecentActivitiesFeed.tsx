import React from 'react';
import { Activity, CheckCircle, Package, PackagePlus } from 'lucide-react';
import type { RecentActivityItem } from '../../types/dashboard/components';

const getActivityIcon = (type: string) => {
  switch (type) {
    case 'sale': return <CheckCircle className="w-3.5 h-3.5 text-success" />;
    case 'purchase': return <PackagePlus className="w-3.5 h-3.5 text-primary" />;
    case 'inventory': return <Package className="w-3.5 h-3.5 text-warning" />;
    default: return <Activity className="w-3.5 h-3.5 text-muted" />;
  }
};

// Format timestamp for display
const formatTimestamp = (timestamp: string): string => {
  try {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return timestamp;
    return new Intl.DateTimeFormat('ar-EG', { 
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    }).format(date);
  } catch {
    return timestamp;
  }
};

interface RecentActivitiesFeedProps {
  recentActivities: RecentActivityItem[];
}

export const RecentActivitiesFeed: React.FC<RecentActivitiesFeedProps> = ({ recentActivities }) => {
  return (
    <div className="bg-surface p-3.5 rounded-xl border border-line shadow-xs">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold text-ink dark:text-white">الأنشطة الأخيرة بالنظام</h3>
        <span className="text-[10px] text-muted">آخر العمليات المعتمدة</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
        {recentActivities.length === 0 ? (
          <div className="col-span-2 text-center py-4 text-xs text-muted">لا توجد عمليات مسجلة حديثاً</div>
        ) : (
          // Activities are already sorted by date (newest first) from the service
          recentActivities.map((activity, idx) => (
            <div key={idx} className="flex items-center gap-2.5 p-2 rounded-lg bg-surface-muted dark:bg-primary/50 border border-line text-xs">
              {getActivityIcon(activity.type)}
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-ink truncate">{activity.description}</div>
                <div className="text-[10px] text-muted">{formatTimestamp(activity.timestamp)}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
