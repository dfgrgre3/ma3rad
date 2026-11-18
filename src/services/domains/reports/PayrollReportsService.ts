import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { round2 } from '../finance/financials';
import { ReportCacheService, ReportResult, ReportParams } from './ReportCacheService';

const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export class PayrollReportsService {
  private db = DatabaseManager.getInstance();
  private branchAccess = new BranchAccessService();

  private actor() {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'reports.view', '/reports');
    return actor;
  }

  private payrollScope() {
    return this.branchAccess.sqlScope(
      'e.branch_id',
      undefined,
      this.actor(),
    );
  }

  public payrollSummary({ from, to }: ReportParams): ReportResult {
    const scope = this.payrollScope();
    const rows = this.db.query<any>(`
      SELECT e.id AS employeeId, e.name AS employeeName, e.baseSalary / 100.0 AS baseSalary,
        e.salary_type AS salaryType, e.status AS employeeStatus,
        COALESCE(SUM(pt.amount), 0) / 100.0 AS totalTransactions
      FROM employees e
      LEFT JOIN payroll_transactions pt ON pt.employee_id = e.id
        AND pt.date >= ? AND pt.date <= ?
      WHERE e.status = 'ACTIVE' AND ${scope.clause}
      GROUP BY e.id
      ORDER BY e.name
    `, [from, to, ...scope.params]);
    const result = rows.map((row) => ({
      employeeId: row.employeeId,
      employeeName: row.employeeName,
      baseSalary: round2(num(row.baseSalary)),
      salaryType: row.salaryType,
      status: row.employeeStatus,
      totalTransactions: round2(num(row.totalTransactions)),
    }));
    return {
      kpis: [
        { label: 'إجمالي الموظفين', value: result.length, tone: 'info' },
        { label: 'إجمالي الرواتب الأساسية', value: round2(result.reduce((t, r) => t + r.baseSalary, 0)), tone: 'warning' },
        { label: 'إجمالي المعاملات', value: round2(result.reduce((t, r) => t + r.totalTransactions, 0)), tone: 'info' },
      ],
      columns: [
        { key: 'employeeName', label: 'اسم الموظف' },
        { key: 'baseSalary', label: 'الراتب الأساسي', type: 'currency' },
        { key: 'salaryType', label: 'نوع الراتب' },
        { key: 'status', label: 'الحالة', type: 'badge' },
        { key: 'totalTransactions', label: 'إجمالي المعاملات', type: 'currency' },
      ],
      rows: result,
    };
  }

  public payrollPayouts({ from, to }: ReportParams): ReportResult {
    const scope = this.payrollScope();
    const rows = this.db.query<any>(`
      SELECT pt.id, e.name AS employeeName, pt.type, pt.amount / 100.0 AS amount, pt.date, pt.notes,
        pt.paymentMethod, pt.createdAt
      FROM payroll_transactions pt
      JOIN employees e ON e.id = pt.employee_id
      WHERE pt.date >= ? AND pt.date <= ? AND ${scope.clause}
      ORDER BY pt.date DESC, pt.createdAt DESC
    `, [from, to, ...scope.params]);
    const result = rows.map((row) => ({
      id: row.id,
      employeeName: row.employeeName,
      type: row.type,
      amount: round2(num(row.amount)),
      date: row.date,
      notes: row.notes,
      paymentMethod: row.paymentMethod,
      createdAt: row.createdAt,
    }));
    return {
      kpis: [
        { label: 'إجمالي المعاملات', value: result.length, tone: 'info' },
        { label: 'إجمالي المبالغ', value: round2(result.reduce((t, r) => t + r.amount, 0)), tone: 'warning' },
      ],
      columns: [
        { key: 'employeeName', label: 'اسم الموظف' },
        { key: 'type', label: 'النوع' },
        { key: 'amount', label: 'المبلغ', type: 'currency' },
        { key: 'date', label: 'التاريخ', type: 'date' },
        { key: 'paymentMethod', label: 'طريقة الدفع' },
        { key: 'notes', label: 'ملاحظات' },
      ],
      rows: result,
    };
  }
}