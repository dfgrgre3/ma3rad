import React from 'react';
import { Loader2 } from 'lucide-react';

export const DashboardLoader: React.FC = () => (
  <div className="flex h-32 w-full flex-col items-center justify-center gap-2">
    <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-400">
      <Loader2 className="w-4 h-4" />
    </div>
    <span className="text-xs font-semibold text-slate-500">جاري تحميل المؤشرات...</span>
  </div>
);
