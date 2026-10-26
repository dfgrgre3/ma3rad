import React from 'react';
import { Activity, CheckCircle, Package, PackagePlus, XCircle } from 'lucide-react';

const getActivityIcon = (type: string) => {
  switch (type) {
    case 'sale': return <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />;
    case 'purchase': return <PackagePlus className="w-3.5 h-3.5 text-sky-600" />;
    case 'return': return <XCircle className="w-3.5 h-3.5 text-rose-600" />;
    case 'inventory': return <Package className="w-3.5 h-3.5 text-amber-600" />;
    default: return <Activity className="w-3.5 h-3.5 text-slate-500" />;
  }
};

interface RecentActivitiesFeedProps {
  recentActivities: any[];
}

export const RecentActivitiesFeed: React.FC<RecentActivitiesFeedProps> = ({ recentActivities }) => {
  return (
    <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold text-slate-900 dark:text-white">الأنشطة الأخيرة بالنظام</h3>
        <span className="text-[10px] text-slate-400">آخر العمليات المعتمدة</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
        {recentActivities.length === 0 ? (
          <div className="col-span-2 text-center py-4 text-xs text-slate-400">لا توجد عمليات مسجلة حديثاً</div>
        ) : (
          recentActivities.map((activity, idx) => (
            <div key={idx} className="flex items-center gap-2.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-xs">
              {getActivityIcon(activity.type)}
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">{activity.description}</div>
                <div className="text-[10px] text-slate-400">{activity.timestamp}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
