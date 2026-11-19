import { ReportCenterContext } from './context';
import type { ReportParams, ReportResult } from './types';
import { num } from './helpers';
import { round2 } from '../../finance/financials';

type Constructor<T = object> = new (...args: any[]) => T;

export function ReceivablesReports<TBase extends Constructor<ReportCenterContext>>(Base: TBase) {
  return class ReceivablesReports extends Base {
  public async arAging({ to }: ReportParams): Promise<ReportResult> {
    const scope = this.salesScope();
    const docs = await this.db.queryAsync<any>(`
      SELECT c.id AS customerId, c.name AS customer, c.phone,
        COALESCE(c.credit_limit, 0) / 100.0 AS creditLimit,
        COALESCE(si.due_date, si.date) AS dueDate,
        MAX(0, si.total_amount / 100.0
          - MAX(0, si.paid_amount / 100.0 - COALESCE((
            SELECT SUM(cpa0.amount) / 100.0 FROM customer_payment_allocations cpa0
            WHERE cpa0.sales_invoice_id = si.id
          ), 0))
          - COALESCE((
            SELECT SUM(cpa.amount) / 100.0 FROM customer_payment_allocations cpa
            JOIN customer_payments cp ON cp.id = cpa.payment_id
            WHERE cpa.sales_invoice_id = si.id AND cp.date <= ?
          ), 0)
          - COALESCE((
            SELECT SUM(sr.remaining_to_balance) / 100.0 FROM sales_returns sr
            WHERE sr.original_invoice_id = si.id AND sr.date <= ?
          ), 0)
        ) AS outstanding
      FROM sales_invoices si
      JOIN customers c ON c.id = si.customer_id
      WHERE si.date <= ? AND si.invoice_status != 'VOID' AND ${scope.clause}
      ORDER BY c.name, dueDate
    `, [to, to, to, ...scope.params]);
    const referenceDay = Date.UTC(
      Number(to.slice(0, 4)),
      Number(to.slice(5, 7)) - 1,
      Number(to.slice(8, 10)),
    ) / 86_400_000;
    const byCustomer = new Map<string, Record<string, any>>();
    for (const doc of docs) {
      if (num(doc.outstanding) <= 0.01) continue;
      const dueDate = String(doc.dueDate);
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
  public async creditExposure({ to }: ReportParams): Promise<ReportResult> {
    const scope = this.salesScope();
    const rows = await this.db.queryAsync<any>(`
      SELECT c.id AS customerId, c.name AS customer, c.phone,
        COALESCE(c.credit_limit, 0) / 100.0 AS creditLimit,
        COALESCE(c.current_balance, 0) AS balance,
        SUM(si.remaining_amount) / 100.0 AS outstanding,
        SUM(CASE WHEN si.due_date IS NOT NULL AND si.due_date < ? THEN si.remaining_amount ELSE 0 END) / 100.0 AS overdue,
        MIN(CASE WHEN si.remaining_amount > 1 THEN COALESCE(si.due_date, si.date) END) AS oldestDue
      FROM customers c
      LEFT JOIN sales_invoices si ON si.customer_id = c.id
        AND si.remaining_amount > 1 AND si.date <= ? AND si.invoice_status != 'VOID' AND ${scope.clause}
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
  public async chequeMaturity({ to }: ReportParams): Promise<ReportResult> {
    const rows = await this.db.queryAsync<any>(`
      SELECT cheque_number AS chequeNumber, type, party_name AS party, bank_name AS bank,
        amount / 100.0 AS amount, due_date AS dueDate,
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
        { key: 'type', label: 'النوع', type: 'badge' },
        { key: 'party', label: 'الطرف' },
        { key: 'bank', label: 'البنك' },
        { key: 'amount', label: 'القيمة', type: 'currency' },
        { key: 'dueDate', label: 'تاريخ الاستحقاق', type: 'date' },
        { key: 'daysLeft', label: 'أيام متبقية', type: 'number' },
        { key: 'status', label: 'الحالة', type: 'badge' },
      ],
      rows,
    };
  }
  public async bouncedCheques({ from, to }: ReportParams): Promise<ReportResult> {
    const rows = await this.db.queryAsync<any>(`
      SELECT c.cheque_number AS chequeNumber, c.type, c.party_name AS party, c.bank_name AS bank,
        c.amount / 100.0 AS amount, c.due_date AS dueDate, c.status,
        COALESCE((SELECT h.notes FROM cheque_status_history h
          WHERE h.cheque_id = c.id AND h.to_status = 'BOUNCED'
          ORDER BY h.changed_at DESC LIMIT 1), c.notes, '') AS reason,
        COALESCE((SELECT h.changed_at FROM cheque_status_history h
          WHERE h.cheque_id = c.id AND h.to_status = 'BOUNCED'
          ORDER BY h.changed_at DESC LIMIT 1), c.updated_at) AS bouncedAt
      FROM cheques c
      WHERE c.status = 'BOUNCED' AND COALESCE(c.due_date, c.created_at) >= ? AND COALESCE(c.due_date, c.created_at) <= ?
      ORDER BY c.due_date DESC
    `, [from, to]);
    return {
      kpis: [
        { label: 'شيكات مرتدة', value: rows.length, tone: 'danger' },
        { label: 'قيمة الشيكات', value: round2(rows.reduce((total, row) => total + num(row.amount), 0)), tone: 'danger' },
        { label: 'شيكات واردة مرتدة', value: rows.filter((row) => row.type === 'RECEIVED').length, tone: 'warning' },
        { label: 'شيكات صادرة مرتدة', value: rows.filter((row) => row.type === 'ISSUED').length, tone: 'warning' },
      ],
      columns: [
        { key: 'chequeNumber', label: 'رقم الشيك' },
        { key: 'type', label: 'النوع', type: 'badge' },
        { key: 'party', label: 'الطرف' },
        { key: 'bank', label: 'البنك' },
        { key: 'amount', label: 'القيمة', type: 'currency' },
        { key: 'dueDate', label: 'تاريخ الاستحقاق', type: 'date' },
        { key: 'bouncedAt', label: 'تاريخ الرد', type: 'date' },
        { key: 'reason', label: 'السبب' },
      ],
      rows,
    };
  }
  public async installmentAging({ to }: ReportParams): Promise<ReportResult> {
    const scope = this.tableScope('p.branch_id');
    const rows = await this.db.queryAsync<any>(`
      SELECT p.plan_number AS planNumber, c.name AS customer, i.sequence_number AS sequence,
        i.due_date AS dueDate, i.amount, i.paid_amount AS paid, i.remaining_amount AS remaining,
        i.status,
        CAST(julianday(?) - julianday(i.due_date) AS INTEGER) AS overdueDays
      FROM installments i
      JOIN installment_plans p ON p.id = i.plan_id
      LEFT JOIN customers c ON c.id = p.customer_id
      WHERE i.remaining_amount > 0.01 AND i.due_date <= ? AND ${scope.clause}
      ORDER BY i.due_date ASC
    `, [to, to, ...scope.params]);
    const withBucket = rows.map((row) => {
      const overdueDays = num(row.overdueDays);
      const bucket = overdueDays <= 0 ? 'غير مستحق' : overdueDays <= 30 ? '0-30' : overdueDays <= 60 ? '31-60' : overdueDays <= 90 ? '61-90' : 'أكثر من 90';
      return { ...row, overdueDays, bucket };
    });
    return {
      kpis: [
        { label: 'أقساط مستحقة', value: withBucket.length, tone: 'info' },
        { label: 'إجمالي المتبقي', value: round2(withBucket.reduce((total, row) => total + num(row.remaining), 0)), tone: 'warning' },
        { label: 'متأخر السداد', value: round2(withBucket.reduce((total, row) => total + (num(row.overdueDays) > 0 ? num(row.remaining) : 0), 0)), tone: 'danger' },
        { label: 'خطط متأخرة', value: new Set(withBucket.filter((row) => num(row.overdueDays) > 0).map((row) => row.planNumber)).size, tone: 'danger' },
      ],
      columns: [
        { key: 'planNumber', label: 'رقم الخطة' },
        { key: 'customer', label: 'العميل' },
        { key: 'sequence', label: 'القسط', type: 'number' },
        { key: 'dueDate', label: 'الاستحقاق', type: 'date' },
        { key: 'amount', label: 'القيمة', type: 'currency' },
        { key: 'paid', label: 'المدفوع', type: 'currency' },
        { key: 'remaining', label: 'المتبقي', type: 'currency' },
        { key: 'overdueDays', label: 'أيام التأخير', type: 'number' },
        { key: 'bucket', label: 'الشريحة', type: 'badge' },
        { key: 'status', label: 'الحالة', type: 'badge' },
      ],
      rows: withBucket,
    };
  }
  };
}
