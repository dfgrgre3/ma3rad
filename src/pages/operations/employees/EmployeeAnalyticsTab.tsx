import React from 'react';
import { ArrowLeftRight, Landmark, MapPin } from 'lucide-react';
import { fmtCurrency } from './helpers';
import { TX_TYPES, type Employee, type FinancialTransaction } from '../../../types/hr/employeesPage';

interface EmployeeAnalyticsTabProps {
  employees: Employee[];
  transactions: FinancialTransaction[];
  locations: string[];
}

export const EmployeeAnalyticsTab: React.FC<EmployeeAnalyticsTabProps> = ({
  employees,
  transactions,
  locations,
}) => {
  return (
    <div className="space-y-6">

      {/* Distribution of Workers by Location */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Visual Location distribution */}
        <div className="bg-surface border border-line rounded-xl p-5">
          <h3 className="text-sm font-black text-ink mb-4 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-warning" />
            توزيع العمال حسب موقع العمل
          </h3>

          <div className="space-y-4">
            {locations.map(loc => {
              const count = employees.filter(e => e.location === loc).length;
              const percentage = employees.length > 0 ? (count / employees.length) * 100 : 0;

              return (
                <div key={loc}>
                  <div className="flex justify-between items-center text-xs mb-1">
                    <span className="font-extrabold text-ink-secondary">{loc}</span>
                    <span className="text-muted font-bold">{count} عمال ({Math.round(percentage)}%)</span>
                  </div>
                  <div className="w-full bg-surface-muted h-2.5 rounded-full overflow-hidden border border-line">
                    <div
                      className="bg-gradient-to-l from-warning to-warning h-full rounded-full transition-all duration-500"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Payroll Type & Status Distribution */}
        <div className="bg-surface border border-line rounded-xl p-5">
          <h3 className="text-sm font-black text-ink mb-4 flex items-center gap-2">
            <Landmark className="w-4 h-4 text-success" />
            نظام تعاقد العمل والرواتب
          </h3>

          <div className="space-y-6">
            <div>
              <h4 className="text-xs text-muted font-black mb-3">حسب نوع الراتب:</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-surface-muted p-4 rounded-xl border border-line text-center">
                  <span className="text-[10px] text-muted font-bold block mb-1">راتب شهري ثابت</span>
                  <span className="text-lg font-black text-ink">
                    {employees.filter(e => e.salaryType === 'MONTHLY').length} عمال
                  </span>
                </div>
                <div className="bg-surface-muted p-4 rounded-xl border border-line text-center">
                  <span className="text-[10px] text-muted font-bold block mb-1">أجر يومي / باليومية</span>
                  <span className="text-lg font-black text-ink">
                    {employees.filter(e => e.salaryType === 'DAILY').length} عمال
                  </span>
                </div>
              </div>
            </div>

            <div className="border-t border-line pt-4">
              <h4 className="text-xs text-muted font-black mb-3">حالات العمال حالياً:</h4>
              <div className="flex gap-2">
                <span className="text-[11px] font-bold px-3 py-1 bg-success/10 text-success rounded-lg border border-success/20">
                  {employees.filter(e => e.status === 'ACTIVE').length} على رأس العمل
                </span>
                <span className="text-[11px] font-bold px-3 py-1 bg-warning/10 text-warning rounded-lg border border-warning/20">
                  {employees.filter(e => e.status === 'ON_LEAVE').length} إجازات رسمية
                </span>
                <span className="text-[11px] font-bold px-3 py-1 bg-danger/10 text-danger rounded-lg border border-danger/20">
                  {employees.filter(e => e.status === 'SUSPENDED').length} موقوف
                </span>
              </div>
            </div>

          </div>
        </div>

      </div>

      {/* Transactions log overview */}
      <div className="bg-surface border border-line rounded-xl p-5">
        <h3 className="text-sm font-black text-ink mb-4 flex items-center gap-2">
          <ArrowLeftRight className="w-4 h-4 text-primary" />
          أحدث العمليات المالية المسجلة (المكافآت، الخصومات، السُلف، الصرف)
        </h3>

        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {transactions.slice(0, 10).map((t) => {
            const emp = employees.find(e => e.id === t.employeeId);
            const typeDetails = TX_TYPES[t.type];
            return (
              <div key={t.id} className="bg-surface-muted border border-line p-3 rounded-lg flex items-center justify-between text-xs hover:border-line transition">
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded font-black border text-[10px] ${typeDetails.color}`}>
                    {typeDetails.label}
                  </span>
                  <div>
                    <span className="font-extrabold text-ink">{emp ? emp.name : 'موظف محذوف'}</span>
                    <span className="text-muted block text-[10px] mt-0.5">{t.notes || 'بدون ملاحظات'}</span>
                  </div>
                </div>
                <div className="text-left">
                  <span className="font-black text-ink block">{fmtCurrency(t.amount)}</span>
                  <span className="text-ink text-[10px] block mt-0.5">{t.date}</span>
                </div>
              </div>
            );
          })}
          {transactions.length === 0 && (
            <div className="text-center py-6 text-muted">لا يوجد عمليات مالية مسجلة.</div>
          )}
        </div>
      </div>

    </div>
  );
};
