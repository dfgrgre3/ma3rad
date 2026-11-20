import React from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { FileText, MapPin } from 'lucide-react';
import { EmployeeFinanceStatCards } from './EmployeeFinanceStatCards';
import { fmtCurrency, getEmployeeFinancials } from './helpers';
import type { Employee, FinancialTransaction, PayrollPayable } from '../../../types/hr/employeesPage';

interface EmployeeFinanceTabProps {
  employees: Employee[];
  allEmployees: Employee[];
  transactions: FinancialTransaction[];
  payrollPayables: PayrollPayable[];
  payrollPeriod: string;
  totalWagesBill: number;
  canManageEmployees: boolean;
  onPayrollPeriodChange: (value: string) => void;
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
  onOpenTransaction,
  onOpenHistory,
}) => {
  const periodTransactions = transactions.filter((transaction) => transaction.date.slice(0, 7) === payrollPeriod);
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 rounded-xl border border-line bg-surface p-4">
        <label className="text-xs font-bold text-ink-secondary">
          فترة الاستحقاق
          <input
            type="month"
            value={payrollPeriod}
            onChange={(e) => onPayrollPeriodChange(e.target.value)}
            className="mt-1 block px-3 py-2 rounded-lg border border-line bg-surface-muted"
          />
        </label>
        <p className="text-xs text-muted">هذه مؤشرات حركات الفترة فقط؛ كشف الراتب الرسمي يشمل الحضور والبدلات من دورة الرواتب.</p>
      </div>

      <div className="bg-surface border border-line rounded-xl overflow-hidden">
        <div className="p-4 border-b border-line">
          <h3 className="text-sm font-black text-ink">أرصدة الرواتب المفتوحة في دفتر الأستاذ</h3>
          <p className="text-xs text-muted mt-1">هذه أرصدة تراكمية غير مرتبطة بفترة؛ كشف الفترة التفصيلي موجود في دورة الرواتب.</p>
        </div>
        <div className="overflow-x-auto">
          <DataTable
            ariaLabel="أرصدة الرواتب المستحقة"
            rows={payrollPayables}
            rowKey={(row) => row.employeeId || 'unassigned'}
            columns={[
              { key: 'employee', header: 'الموظف', render: (row) => <span className="font-bold">{row.employeeName}</span> },
              { key: 'balance', header: 'الرصيد المستحق', align: 'end', render: (row) => <span className="font-mono">{fmtCurrency(row.balance)}</span> },
            ]}
            emptyTitle="لا توجد مستحقات رواتب مفتوحة في دفتر الأستاذ."
          />
        </div>
      </div>

      {/* Financial Quick Summaries */}
      <EmployeeFinanceStatCards totalWagesBill={totalWagesBill} transactions={periodTransactions} />

      {/* Table list of wages ledger */}
      <div className="bg-surface border border-line rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <DataTable
          ariaLabel="حركة حسابات العمال"
          rows={employees.map((emp) => ({ emp, fin: getEmployeeFinancials(allEmployees, transactions, emp.id, payrollPeriod) }))}
          rowKey={(row) => row.emp.id}
          rowClassName={() => 'hover:bg-surface-sunken transition'}
          columns={[
            {
              key: 'employee', header: 'العامل والموقع',
              render: ({ emp }) => (
                <span>
                  <span className="block font-extrabold text-ink">{emp.name}</span>
                  <span className="mt-0.5 flex items-center gap-1 text-xs text-muted"><MapPin className="w-3 h-3 text-ink-secondary" />{emp.location} — {emp.role}</span>
                </span>
              ),
            },
            { key: 'base', header: 'الراتب الأساسي', render: ({ emp }) => canManageEmployees ? <span>{fmtCurrency(emp.baseSalary)}<span className="block text-[10px] text-muted font-normal">{emp.salaryType === 'MONTHLY' ? 'شهري' : 'يومي'}</span></span> : '—' },
            { key: 'advances', header: 'إجمالي السلف', render: ({ fin }) => <span className="font-bold text-warning">{fmtCurrency(fin.advances)}</span> },
            { key: 'bonuses', header: 'المكافآت (+)', render: ({ fin }) => <span className="font-bold text-success">{fmtCurrency(fin.bonuses)}</span> },
            { key: 'deductions', header: 'الخصومات (-)', render: ({ fin }) => <span className="font-bold text-danger">{fmtCurrency(fin.deductions)}</span> },
            { key: 'payouts', header: 'المدفوع / المصروف', render: ({ fin }) => <span className="font-bold text-primary">{fmtCurrency(fin.payouts)}</span> },
            { key: 'net', header: 'صافي المستحق', align: 'end', render: ({ fin }) => <span className={`font-black ${fin.netDue >= 0 ? 'text-success' : 'text-danger'}`}>{fmtCurrency(fin.netDue)}</span> },
            {
              key: 'actions', header: 'عمليات الحسابات', align: 'center',
              render: ({ emp }) => (
                <div className="flex items-center justify-center gap-2">
                  <button
                    onClick={() => onOpenTransaction(emp.id)}
                    className="px-3 py-1.5 bg-surface-muted hover:bg-surface-sunken border border-line text-xs font-bold text-warning rounded-lg transition"
                  >
                    تسجيل حركة مالية
                  </button>
                  <button
                    onClick={() => onOpenHistory(emp.id)}
                    className="p-1.5 bg-surface-muted hover:bg-surface-sunken border border-line rounded-lg text-muted hover:text-ink transition"
                    title="عرض حركة الحساب"
                  >
                    <FileText className="w-4 h-4" />
                  </button>
                </div>
              ),
            },
          ]}
          emptyTitle="لا يوجد عمال مسجلين حالياً."
        />
        </div>
      </div>
    </div>
  );
};
