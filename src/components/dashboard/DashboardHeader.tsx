import React from 'react';
import { RefreshCw } from 'lucide-react';

interface DashboardHeaderProps {
  today: string;
  onRefresh: () => void;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({ today, onRefresh }) => {
  return (
    <header className="win-page-head">
      <div className="min-w-0">
        <h1 className="win-page-title">لوحة المعلومات</h1>
        <p className="win-page-subtitle">
          ملخص حركة المعرض والمؤشرات الرئيسية · {today}
        </p>
      </div>
      <button type="button" onClick={onRefresh} className="win-btn win-btn--primary" aria-label="تحديث بيانات لوحة المعلومات">
        <RefreshCw className="h-3.5 w-3.5" /> تحديث
      </button>
    </header>
  );
};
