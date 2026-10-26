import React from 'react';
import { AlertCircle, HardHat, Plus } from 'lucide-react';

interface EmployeesHeaderProps {
  loading: boolean;
  dbError: string | null;
  onAddEmployee: () => void;
  onRetry: () => void;
}

export const EmployeesHeader: React.FC<EmployeesHeaderProps> = ({
  loading,
  dbError,
  onAddEmployee,
  onRetry,
}) => {
  return (
    <>
      {/* Header Banner */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
            <HardHat className="w-6 h-6 text-orange-600" />
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-900">إدارة شؤون وأجور العمال</h1>
            <p className="text-xs text-slate-500 font-medium">تصنيف وتوزيع العمال في المستودعات والمعارض ومتابعة السلفيات، الرواتب، والأجور اليومية</p>
          </div>
        </div>
        <button
          onClick={onAddEmployee}
          className="flex items-center gap-2 px-4 py-2.5 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-orange-600/10 transition-all transform active:scale-95 shrink-0"
        >
          <Plus className="w-4 h-4" />
          إضافة عامل / موظف جديد
        </button>
      </div>

      {loading && (
        <div className="px-6 py-2 text-xs font-bold text-slate-500">جارٍ تحميل بيانات الموظفين...</div>
      )}

      {dbError && (
        <div className="mx-6 mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-bold text-rose-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {dbError}
          <button onClick={onRetry} className="mr-auto underline">إعادة المحاولة</button>
        </div>
      )}
    </>
  );
};
