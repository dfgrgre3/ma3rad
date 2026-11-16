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

export class CustomerReportsService {
  private db = DatabaseManager.getInstance();
  private branchAccess = new BranchAccessService();

  private actor() {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'reports.view', '/reports');
    return actor;
  }

  private salesScope() {
    return this.branchAccess.sqlScope(
      'si.branch_id',
      '(SELECT w.branch_id FROM warehouses w WHERE w.id = si.warehouse_id)',
      this.actor(),
    );
  }

  private tableScope(expression: string, fallback?: string) {
    return this.branchAccess.sqlScope(expression, fallback, this.actor());
  }

  public creditExposure({ to }: ReportParams): ReportResult {
    const scope = this.salesScope();
    const rows = this.db.query<any>(`
      SELECT c.id AS customerId, c.name AS customer, c.phone,
        COALESCE(c.credit_limit, 0) AS creditLimit,
        COALESCE(c.current_balance, 0) AS balance,
        SUM(si.remaining_amount) AS outstanding,
        SUM(CASE WHEN si.due_date IS NOT NULL AND si.due_date < ? THEN si.remaining_amount ELSE 0 END) AS overdue,
        MIN(CASE WHEN si.remaining_amount > 0.01 THEN COALESCE(si.due_date, si.date) END) AS oldestDue
      FROM customers c
      LEFT JOIN sales_invoices si ON si.customer_id = c.id
        AND si.remaining_amount > 0.01 AND si.date <= ? AND si.invoice_status != 'VOID' AND ${scope.clause}
      GROUP BY c.id
      HAVING outstanding > 0.01 OR balance > 0.01
      ORDER BY outstanding DESC
    `, [to, to, ...scope.params]);
    const result = rows.map((row) => {
      const outstanding = round2(num(row.outstanding));
      const creditLimit = round2(num(row.creditLimit));
      const overdue = round2(num(row.overdue));
      return {
        customer: row.customer,
        phone: row.phone,
        creditLimit,
        outstanding,
        overdue,
        available: round2(Math.max(0, creditLimit - outstanding)),
        usage: creditLimit > 0 ? round2((outstanding / creditLimit) * 100) : 0,
        overLimit: creditLimit > 0 && outstanding > creditLimit,
        status: overdue > 0 ? 'متأخر' : creditLimit > 0 && outstanding > creditLimit ? 'تجاوز الحد' : 'منتظم',
        oldestDue: row.oldestDue || '',
      };
    });
    return {
      kpis: [
        { label: 'إجمالي المستحق', value: round2(result.reduce((total, row) => total + row.outstanding, 0)), tone: 'warning' },
        { label: 'المتأخرات', value: round2(result.reduce((total, row) => total + row.overdue, 0)), tone: 'danger' },
        { label: 'عملاء تجاوزوا الحد', value: result.filter((row) => row.overLimit).length, tone: 'danger' },
        { label: 'عملاء متأخرون', value: result.filter((row) => row.overdue > 0).length, tone: 'warning' },
      ],
      columns: [
        { key: 'customer', label: 'العميل' },
        { key: 'phone', label: 'الهاتف' },
        { key: 'creditLimit', label: 'حد الائتمان', type: 'currency' },
        { key: 'outstanding', label: 'المستحق', type: 'currency' },
        { key: 'overdue', label: 'المتأخر', type: 'currency' },
        { key: 'available', label: 'المتاح', type: 'currency' },
        { key: 'usage', label: 'نسبة الاستخدام', type: 'percent' },
        { key: 'status', label: 'الحالة', type: 'badge' },
      ],
      rows: result,
    };
  }

  public chequeMaturity({ to }: ReportParams): ReportResult {
    const rows = this.db.query<any>(`
      SELECT cheque_number AS chequeNumber, type, party_name AS party, bank_name AS bank,
        amount, due_date AS dueDate,
        CAST(julianday(due_date) - julianday(?) AS INTEGER) AS daysLeft,
        status
      FROM cheques
      WHERE status IN ('PENDING', 'DEPOSITED', 'RE_PRESENTED')
      ORDER BY due_date ASC
    `, [to]);
    return {
      kpis: [
        { label: 'شيكات مفتوحة', value: rows.length, tone: 'info' },
        { label: 'قيمة الشيكات', value: round2(rows.reduce((total, row) => total + num(row.amount), 0)), tone: 'warning' },
        { label: 'تستحق خلال 7 أيام', value: rows.filter((row) => num(row.daysLeft) <= 7).length, tone: 'danger' },
        { label: 'شيكات صادرة', value: round2(rows.filter((row) => row.type === 'ISSUED').reduce((total, row) => total + num(row.amount), 0)), tone: 'danger' },
      ],
      columns: [
        { key: 'chequeNumber', label: 'رقم الشيك' },
        { key: 'type', label: 'النوع' },
        { key: 'party', label: 'الطرف' },
        { key: 'bank', label: 'البنك' },
        { key: 'amount', label: 'المبلغ', type: 'currency' },
        { key: 'dueDate', label: 'تاريخ الاستحقاق', type: 'date' },
        { key: 'daysLeft', label: 'أيام متبقية', type: 'number' },
        { key: 'status', label: 'الحالة', type: 'badge' },
      ],
      rows,
    };
  }

  public customerAging({ to }: ReportParams): ReportResult {
    const scope = this.salesScope();
    const referenceDay = Date.UTC(
      Number(to.slice(0, 4)),
      Number(to.slice(5, 7)) - 1,
      Number(to.slice(8, 10)),
    ) / 86_400_000;
    const rows = this.db.query<any>(`
      SELECT c.id AS customerId, c.name AS customer, c.phone,
        COALESCE(c.credit_limit, 0) AS creditLimit,
        SUM(si.remaining_amount) AS outstanding,
        MIN(CASE WHEN si.remaining_amount > 0.01 THEN COALESCE(si.due_date, si.date) END) AS oldestDue
      FROM customers c
      LEFT JOIN sales_invoices si ON si.customer_id = c.id
        AND si.remaining_amount > 0.01 AND si.date <= ? AND si.invoice_status != 'VOID' AND ${scope.clause}
      GROUP BY c.id
      HAVING outstanding > 0.01
    `, [to, ...scope.params]);
    const byCustomer = new Map<string, any>();
    for (const doc of rows) {
      if (num(doc.outstanding) <= 0.01) continue;
      const dueDate = String(doc.oldestDue);
      const dueDay = Date.UTC(
        Number(dueDate.slice(0, 4)),
        Number(dueDate.slice(5, 7)) - 1,
        Number(dueDate.slice(8, 10)),
      ) / 86_400_000;
      const daysOverdue = Math.max(0, referenceDay - dueDay);
      const outstanding = num(doc.outstanding);
      const row = byCustomer.get(doc.customerId) || {
        customerId: doc.customerId,
        customer: doc.customer,
        phone: doc.phone,
        creditLimit: num(doc.creditLimit),
        dueDate,
        bucket0: 0,
        bucket31: 0,
        bucket61: 0,
        bucket91: 0,
        bucket120: 0,
        total: 0,
        oldestDays: '0-30',
        oldestAge: -1,
      };
      if (daysOverdue <= 30) row.bucket0 += outstanding;
      else if (daysOverdue <= 60) row.bucket31 += outstanding;
      else if (daysOverdue <= 90) row.bucket61 += outstanding;
      else if (daysOverdue <= 120) row.bucket91 += outstanding;
      else row.bucket120 += outstanding;
      row.total += outstanding;
      if (daysOverdue > row.oldestAge) {
        row.oldestAge = daysOverdue;
        row.dueDate = dueDate;
        row.oldestDays = daysOverdue <= 30 ? '0-30'
          : daysOverdue <= 60 ? '31-60'
            : daysOverdue <= 90 ? '61-90'
              : daysOverdue <= 120 ? '91-120' : '>120';
      }
      byCustomer.set(doc.customerId, row);
    }
    const result = Array.from(byCustomer.values()).map(({ oldestAge: _oldestAge, ...row }) => ({
      ...row,
      bucket0: round2(row.bucket0),
      bucket31: round2(row.bucket31),
      bucket61: round2(row.bucket61),
      bucket91: round2(row.bucket91),
      bucket120: round2(row.bucket120),
      total: round2(row.total),
    })).sort((a, b) => b.total - a.total);
    return {
      kpis: [
        { label: 'إجمالي المستحق', value: round2(result.reduce((total, row) => total + row.total, 0)), tone: 'warning' },
        { label: 'مستحق 0-30', value: round2(result.reduce((total, row) => total + row.bucket0, 0)), tone: 'success' },
        { label: 'مستحق 31-90', value: round2(result.reduce((total, row) => total + row.bucket31 + row.bucket61, 0)), tone: 'info' },
        { label: 'متأخر أكثر من 90', value: round2(result.reduce((total, row) => total + row.bucket91 + row.bucket120, 0)), tone: 'danger' },
      ],
      columns: [
        { key: 'customer', label: 'العميل' },
        { key: 'phone', label: 'الهاتف' },
        { key: 'dueDate', label: 'أقدم تاريخ استحقاق', type: 'date' },
        { key: 'bucket0', label: '0-30 يوم', type: 'currency' },
        { key: 'bucket31', label: '31-60 يوم', type: 'currency' },
        { key: 'bucket61', label: '61-90 يوم', type: 'currency' },
        { key: 'bucket91', label: '91-120 يوم', type: 'currency' },
        { key: 'bucket120', label: 'أكثر من 120', type: 'currency' },
        { key: 'total', label: 'الإجمالي', type: 'currency' },
        { key: 'oldestDays', label: 'أقدم شريحة', type: 'badge' },
      ],
      rows: result,
    };
  }
}