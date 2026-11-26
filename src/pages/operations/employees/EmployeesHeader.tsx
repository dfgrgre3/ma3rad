import React from 'react';
import { AlertCircle, Download, HardHat, Plus } from 'lucide-react';
import { CentralLimitGuard } from '../../../components/ui/CentralLimitGuard';
import { PageHeader } from '../../../components/ui/PageHeader';
import { ActivityGate } from '../../../components/ui/ActivityGate';
import { useBusinessTerm } from '../../../hooks/domains/config/useBusinessTerm';

interface EmployeesHeaderProps {
  loading: boolean;
  dbError: string | null;
  onAddEmployee: () => void;
  onRetry: () => void;
  canExport?: boolean;
  onExport?: () => void;
}

export const EmployeesHeader: React.FC<EmployeesHeaderProps> = ({
  loading,
  dbError,
  onAddEmployee,
  onRetry,
  canExport,
  onExport,
}) => {
  const employeeSingular = useBusinessTerm('entities.employees.singular');
  return (
    <>
      {/* Header Banner */}
      <div className="bg-surface border-b border-line px-6 pt-4">
        <PageHeader
          icon={<HardHat className="h-5 w-5" />}
          title="إدارة شؤون وأجور العمال"
          description="تصنيف وتوزيع العمال في المستودعات والمعارض ومتابعة السلفيات، الرواتب، والأجور اليومية"
          actions={<>
            <CentralLimitGuard metric="maxEmployees">
              <ActivityGate element="new-employee"><button
                onClick={onAddEmployee}
                className="flex items-center gap-2 px-4 py-2.5 bg-warning hover:bg-warning text-white rounded-xl text-sm font-bold shadow-lg shadow-warning/10 transition-all transform active:scale-95 shrink-0"
              >
                <Plus className="w-4 h-4" />
                إضافة {employeeSingular} جديد
              </button></ActivityGate>
            </CentralLimitGuard>
            {canExport && onExport && (
              <ActivityGate element="export"><button
                onClick={onExport}
                className="flex items-center gap-2 px-4 py-2.5 bg-surface border border-line text-ink rounded-xl text-sm font-bold hover:bg-surface-muted transition-all shrink-0"
              >
                <Download className="w-4 h-4" />
                تصدير
              </button></ActivityGate>
            )}
          </>}
        />
      </div>

      {loading && (
        <div className="px-6 py-2 text-xs font-bold text-muted">جارٍ تحميل بيانات الموظفين...</div>
      )}

      {dbError && (
        <div className="mx-6 mt-3 rounded-xl border border-danger-border bg-danger-soft px-4 py-2.5 text-xs font-bold text-danger flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {dbError}
          <button onClick={onRetry} className="ms-auto underline">إعادة المحاولة</button>
        </div>
      )}
    </>
  );
};
