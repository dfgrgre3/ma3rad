import React from 'react';
import { ArrowLeftRight, Landmark, MapPin } from 'lucide-react';
import { fmtCurrency } from './helpers';
import { DEFAULT_LOCATIONS, TX_TYPES, type Employee, type FinancialTransaction } from './types';

interface EmployeeAnalyticsTabProps {
  employees: Employee[];
  transactions: FinancialTransaction[];
}

export const EmployeeAnalyticsTab: React.FC<EmployeeAnalyticsTabProps> = ({
  employees,
  transactions,
}) => {
  return (
    <div className="space-y-6">

      {/* Distribution of Workers by Location */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Visual Location distribution */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="text-sm font-black text-slate-900 mb-4 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-orange-600" />
            توزيع العمال حسب موقع العمل
          </h3>

          <div className="space-y-4">
            {DEFAULT_LOCATIONS.map(loc => {
              const count = employees.filter(e => e.location === loc).length;
              const percentage = employees.length > 0 ? (count / employees.length) * 100 : 0;

              return (
                <div key={loc}>
                  <div className="flex justify-between items-center text-xs mb-1">
                    <span className="font-extrabold text-slate-600">{loc}</span>
                    <span className="text-slate-500 font-bold">{count} عمال ({Math.round(percentage)}%)</span>
                  </div>
                  <div className="w-full bg-slate-50 h-2.5 rounded-full overflow-hidden border border-slate-200">
                    <div
                      className="bg-gradient-to-l from-orange-500 to-amber-500 h-full rounded-full transition-all duration-500"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Payroll Type & Status Distribution */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="text-sm font-black text-slate-900 mb-4 flex items-center gap-2">
            <Landmark className="w-4 h-4 text-emerald-600" />
            نظام تعاقد العمل والرواتب
          </h3>

          <div className="space-y-6">
            <div>
              <h4 className="text-xs text-slate-500 font-black mb-3">حسب نوع الراتب:</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-center">
                  <span className="text-[10px] text-slate-500 font-bold block mb-1">راتب شهري ثابت</span>
                  <span className="text-lg font-black text-slate-900">
                    {employees.filter(e => e.salaryType === 'MONTHLY').length} عمال
                  </span>
                </div>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-center">
                  <span className="text-[10px] text-slate-500 font-bold block mb-1">أجر يومي / باليومية</span>
                  <span className="text-lg font-black text-slate-900">
                    {employees.filter(e => e.salaryType === 'DAILY').length} عمال
                  </span>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-4">
              <h4 className="text-xs text-slate-500 font-black mb-3">حالات العمال حالياً:</h4>
              <div className="flex gap-2">
                <span className="text-[11px] font-bold px-3 py-1 bg-emerald-500/10 text-emerald-600 rounded-lg border border-emerald-500/20">
                  {employees.filter(e => e.status === 'ACTIVE').length} على رأس العمل
                </span>
                <span className="text-[11px] font-bold px-3 py-1 bg-amber-500/10 text-amber-600 rounded-lg border border-amber-500/20">
                  {employees.filter(e => e.status === 'ON_LEAVE').length} إجازات رسمية
                </span>
                <span className="text-[11px] font-bold px-3 py-1 bg-rose-500/10 text-rose-600 rounded-lg border border-rose-500/20">
                  {employees.filter(e => e.status === 'SUSPENDED').length} موقوف
                </span>
              </div>
            </div>

          </div>
        </div>

      </div>

      {/* Transactions log overview */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h3 className="text-sm font-black text-slate-900 mb-4 flex items-center gap-2">
          <ArrowLeftRight className="w-4 h-4 text-sky-600" />
          أحدث العمليات المالية المسجلة (المكافآت، الخصومات، السُلف، الصرف)
        </h3>

        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {transactions.slice(0, 10).map((t) => {
            const emp = employees.find(e => e.id === t.employeeId);
            const typeDetails = TX_TYPES[t.type];
            return (
              <div key={t.id} className="bg-slate-50 border border-slate-200 p-3 rounded-lg flex items-center justify-between text-xs hover:border-slate-200 transition">
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded font-black border text-[10px] ${typeDetails.color}`}>
                    {typeDetails.label}
                  </span>
                  <div>
                    <span className="font-extrabold text-slate-900">{emp ? emp.name : 'موظف محذوف'}</span>
                    <span className="text-slate-500 block text-[10px] mt-0.5">{t.notes || 'بدون ملاحظات'}</span>
                  </div>
                </div>
                <div className="text-left">
                  <span className="font-black text-slate-800 block">{fmtCurrency(t.amount)}</span>
                  <span className="text-slate-550 text-[10px] block mt-0.5">{t.date}</span>
                </div>
              </div>
            );
          })}
          {transactions.length === 0 && (
            <div className="text-center py-6 text-slate-500">لا يوجد عمليات مالية مسجلة.</div>
          )}
        </div>
      </div>

    </div>
  );
};
