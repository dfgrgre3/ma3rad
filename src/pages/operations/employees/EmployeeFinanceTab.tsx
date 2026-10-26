import React from 'react';
import { CheckCircle2, FileText, MapPin } from 'lucide-react';
import { EmployeeFinanceStatCards } from './EmployeeFinanceStatCards';
import { fmtCurrency, getEmployeeFinancials } from './helpers';
import type { Employee, FinancialTransaction, PayrollPayable } from './types';

interface EmployeeFinanceTabProps {
  employees: Employee[];
  allEmployees: Employee[];
  transactions: FinancialTransaction[];
  payrollPayables: PayrollPayable[];
  payrollPeriod: string;
  totalWagesBill: number;
  canManageEmployees: boolean;
  onPayrollPeriodChange: (value: string) => void;
  onAccruePayroll: () => void;
  onOpenTransaction: (empId: string) => void;
  onOpenHistory: (empId: string) => void;
}

export const EmployeeFinanceTab: React.FC<EmployeeFinanceTabProps> = ({
  employees,
  allEmployees,
  transactions,
  payrollPayables,
  payrollPeriod,
  totalWagesBill,
  canManageEmployees,
  onPayrollPeriodChange,
  onAccruePayroll,
  onOpenTransaction,
  onOpenHistory,
}) => {
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <label className="text-xs font-bold text-slate-600">
          فترة الاستحقاق
          <input
            type="month"
            value={payrollPeriod}
            onChange={(e) => onPayrollPeriodChange(e.target.value)}
            className="mt-1 block px-3 py-2 rounded-lg border border-slate-200 bg-slate-50"
          />
        </label>
        <button
          type="button"
          onClick={onAccruePayroll}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold"
        >
          <CheckCircle2 className="w-4 h-4" />
          ترحيل استحقاق الرواتب
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <h3 className="text-sm font-black text-slate-800">أرصدة الرواتب المستحقة في دفتر الأستاذ حسب الموظف</h3>
          <p className="text-xs text-slate-500 mt-1">من قيود حساب 2104، وتشمل الاستحقاق والسلف والخصومات والصرف والقيود العكسية.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr><th className="p-3">الموظف</th><th className="p-3 text-left">الرصيد المستحق</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payrollPayables.length ? payrollPayables.map((row) => (
                <tr key={row.employeeId || 'unassigned'}>
                  <td className="p-3 font-bold">{row.employeeName}</td>
                  <td className="p-3 text-left font-mono">{fmtCurrency(row.balance)}</td>
                </tr>
              )) : <tr><td colSpan={2} className="p-5 text-center text-slate-500">لا توجد مستحقات رواتب مفتوحة في دفتر الأستاذ.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Financial Quick Summaries */}
      <EmployeeFinanceStatCards totalWagesBill={totalWagesBill} transactions={transactions} />

      {/* Table list of wages ledger */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500">
                <th className="p-4">العامل والموقع</th>
                <th className="p-4">الراتب الأساسي</th>
                <th className="p-4">إجمالي السلف</th>
                <th className="p-4">المكافآت (+)</th>
                <th className="p-4">الخصومات (-)</th>
                <th className="p-4">المدفوع / المصروف</th>
                <th className="p-4 text-left">صافي المستحق</th>
                <th className="p-4 text-center">عمليات الحسابات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {employees.map(emp => {
                const fin = getEmployeeFinancials(allEmployees, transactions, emp.id);
                return (
                  <tr key={emp.id} className="hover:bg-slate-100 transition">
                    <td className="p-4">
                      <div className="font-extrabold text-slate-900">{emp.name}</div>
                      <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 text-slate-600" />
                        {emp.location} — {emp.role}
                      </div>
                    </td>
                    <td className="p-4 font-bold text-slate-600">
                      {canManageEmployees ? <>{fmtCurrency(emp.baseSalary)}<span className="text-[10px] text-slate-500 block font-normal">{emp.salaryType === 'MONTHLY' ? 'شهري' : 'يومي'}</span></> : '—'}
                    </td>
                    <td className="p-4 font-bold text-amber-500">{fmtCurrency(fin.advances)}</td>
                    <td className="p-4 font-bold text-emerald-500">{fmtCurrency(fin.bonuses)}</td>
                    <td className="p-4 font-bold text-rose-500">{fmtCurrency(fin.deductions)}</td>
                    <td className="p-4 font-bold text-sky-500">{fmtCurrency(fin.payouts)}</td>
                    <td className={`p-4 font-black text-left ${fin.netDue >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {fmtCurrency(fin.netDue)}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => onOpenTransaction(emp.id)}
                          className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-bold text-orange-600 rounded-lg transition"
                        >
                          تسجيل حركة مالية
                        </button>
                        <button
                          onClick={() => onOpenHistory(emp.id)}
                          className="p-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-500 hover:text-slate-900 transition"
                          title="عرض حركة الحساب"
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {employees.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-slate-500 font-bold">
                    لا يوجد عمال مسجلين حالياً.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
