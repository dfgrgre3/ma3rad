import React from 'react';
import { Loader2 } from 'lucide-react';

export const DashboardLoader: React.FC = () => (
  <div className="flex min-h-[420px] w-full flex-col items-center justify-center gap-2">
    <div className="w-8 h-8 rounded-lg bg-surface-sunken flex items-center justify-center text-ink-secondary ">
      <Loader2 className="w-4 h-4 animate-spin" />
    </div>
    <span className="text-xs font-semibold text-muted">جاري تحميل المؤشرات...</span>
  </div>
);
