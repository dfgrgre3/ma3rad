import React from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import { PageHeader } from '../ui/PageHeader';
import { Button } from '../ui/Button';

interface DashboardHeaderProps {
  today: string;
  onRefresh: () => void;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({ today, onRefresh }) => {
  return (
    <PageHeader
      className="px-4 pt-3"
      icon={<Activity className="h-5 w-5" />}
      eyebrow="سيراميسيس / مركز المتابعة"
      title="لوحة المعلومات"
      description={<>ملخص حركة المعرض والمؤشرات الرئيسية <span className="mx-1">·</span>{today}</>}
      actions={
        <Button
          variant="primary"
          size="sm"
          onClick={onRefresh}
          leadingIcon={<RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
          aria-label="تحديث بيانات لوحة المعلومات"
        >
          تحديث
        </Button>
      }
    />
  );
};
