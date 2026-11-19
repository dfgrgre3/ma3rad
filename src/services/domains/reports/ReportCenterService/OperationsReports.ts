import { ReportCenterContext } from './context';
import type { ReportParams, ReportResult } from './types';
import { num, fmtMoney } from './helpers';
import { round2 } from '../../finance/financials';

type Constructor<T = object> = new (...args: any[]) => T;

export function OperationsReports<TBase extends Constructor<ReportCenterContext>>(Base: TBase) {
  return class OperationsReports extends Base {
  public async operationsLog({ from, to }: ReportParams): Promise<ReportResult> {
    const sales = this.salesScope();
    const purchases = this.purchaseScope();
    const cash = this.branchAccess.sqlScope(
      '(SELECT br.branch_id FROM cash_registers br WHERE br.id = cp.register_id)',
      undefined,
      this.actor(),
    );
    const supply = this.branchAccess.sqlScope(
      '(SELECT br.branch_id FROM cash_registers br WHERE br.id = sp.register_id)',
      undefined,
      this.actor(),
    );
    const expense = this.branchAccess.sqlScope(
      '(SELECT br.branch_id FROM cash_registers br WHERE br.id = ex.register_id)',
      undefined,
      this.actor(),
    );
    const rows = await this.db.queryAsync<any>(`
      SELECT si.date AS date, si.created_at AS createdAt, 'فاتورة بيع' AS docType,
        si.invoice_number AS docNumber, c.name AS party, si.total_amount / 100.0 AS amount,
        COALESCE(u.full_name, '—') AS userName, si.invoice_status AS status
      FROM sales_invoices si
      LEFT JOIN customers c ON c.id = si.customer_id
      LEFT JOIN users u ON u.id = si.created_by
      WHERE si.date >= ? AND si.date <= ? AND ${sales.clause}
      UNION ALL
      SELECT pi.date, pi.created_at, 'فاتورة شراء', pi.invoice_number, s.name, pi.total_amount / 100.0,
        COALESCE(u.full_name, '—'), pi.payment_status
      FROM purchase_invoices pi
      LEFT JOIN suppliers s ON s.id = pi.supplier_id
      LEFT JOIN users u ON u.id = pi.created_by
      WHERE pi.date >= ? AND pi.date <= ? AND ${purchases.clause}
      UNION ALL
      SELECT sr.date, sr.created_at, 'مرتجع بيع', sr.return_number, c.name, sr.total_amount / 100.0,
        COALESCE(u.full_name, '—'), 'COMPLETED'
      FROM sales_returns sr
      JOIN sales_invoices si ON si.id = sr.original_invoice_id
      LEFT JOIN customers c ON c.id = sr.customer_id
      LEFT JOIN users u ON u.id = sr.created_by
      WHERE sr.date >= ? AND sr.date <= ? AND ${sales.clause}
      UNION ALL
      SELECT pr.date, pr.created_at, 'مرتجع شراء', pr.return_number, s.name, pr.total_amount / 100.0,
        COALESCE(u.full_name, '—'), 'COMPLETED'
      FROM purchase_returns pr
      JOIN purchase_invoices pi ON pi.id = pr.original_purchase_id
      LEFT JOIN suppliers s ON s.id = pr.supplier_id
      LEFT JOIN users u ON u.id = pr.created_by
      WHERE pr.date >= ? AND pr.date <= ? AND ${purchases.clause}
      UNION ALL
      SELECT cp.date, cp.created_at, 'سند قبض', cp.receipt_number, c.name, cp.amount / 100.0,
        COALESCE(u.full_name, '—'), 'POSTED'
      FROM customer_payments cp
      LEFT JOIN customers c ON c.id = cp.customer_id
      LEFT JOIN users u ON u.id = cp.performed_by
      WHERE cp.date >= ? AND cp.date <= ? AND ${cash.clause}
      UNION ALL
      SELECT sp.date, sp.created_at, 'سند صرف', sp.receipt_number, s.name, sp.amount / 100.0,
        COALESCE(u.full_name, '—'), 'POSTED'
      FROM supplier_payments sp
      LEFT JOIN suppliers s ON s.id = sp.supplier_id
      LEFT JOIN users u ON u.id = sp.performed_by
      WHERE sp.date >= ? AND sp.date <= ? AND ${supply.clause}
      UNION ALL
      SELECT ex.date, ex.created_at, 'مصروف', COALESCE(ex.recipient, ex.description), ex.description, ex.amount / 100.0,
        COALESCE(u.full_name, '—'), ex.payment_type
      FROM expenses ex
      LEFT JOIN users u ON u.id = ex.performed_by
      WHERE ex.date >= ? AND ex.date <= ? AND ${expense.clause}
      ORDER BY date DESC, createdAt DESC
    `, [
      from, to, ...sales.params,
      from, to, ...purchases.params,
      from, to, ...sales.params,
      from, to, ...purchases.params,
      from, to, ...cash.params,
      from, to, ...supply.params,
      from, to, ...expense.params,
    ]);
    const byType = rows.reduce<Record<string, { count: number; total: number }>>((acc, row) => {
      const bucket = acc[row.docType] || { count: 0, total: 0 };
      bucket.count += 1;
      bucket.total += num(row.amount);
      acc[row.docType] = bucket;
      return acc;
    }, {});
    return {
      kpis: [
        { label: 'إجمالي الحركات', value: rows.length, hint: 'فاتورة وسند ومصروف', tone: 'info' },
        { label: 'فواتير البيع', value: byType['فاتورة بيع']?.count || 0, hint: fmtMoney(byType['فاتورة بيع']?.total), tone: 'success' },
        { label: 'فواتير الشراء', value: byType['فاتورة شراء']?.count || 0, hint: fmtMoney(byType['فاتورة شراء']?.total), tone: 'warning' },
        { label: 'سندات القبض', value: byType['سند قبض']?.count || 0, hint: fmtMoney(byType['سند قبض']?.total), tone: 'success' },
        { label: 'سندات الصرف والمصروفات', value: (byType['سند صرف']?.count || 0) + (byType['مصروف']?.count || 0), hint: fmtMoney((byType['سند صرف']?.total || 0) + (byType['مصروف']?.total || 0)), tone: 'danger' },
        { label: 'المرتجعات', value: (byType['مرتجع بيع']?.count || 0) + (byType['مرتجع شراء']?.count || 0), hint: fmtMoney((byType['مرتجع بيع']?.total || 0) + (byType['مرتجع شراء']?.total || 0)), tone: 'warning' },
      ],
      columns: [
        { key: 'date', label: 'التاريخ', type: 'date' },
        { key: 'createdAt', label: 'الوقت', type: 'text' },
        { key: 'docType', label: 'نوع الحركة', type: 'badge' },
        { key: 'docNumber', label: 'رقم المستند' },
        { key: 'party', label: 'الطرف الآخر' },
        { key: 'amount', label: 'القيمة', type: 'currency' },
        { key: 'userName', label: 'المستخدم' },
        { key: 'status', label: 'الحالة', type: 'badge' },
      ],
      rows,
    };
  }
  public async userActivity({ from, to }: ReportParams): Promise<ReportResult> {
    const log = await this.operationsLog({ from, to });
    const grouped = new Map<string, { userName: string; types: Record<string, number>; total: number; count: number }>();
    for (const row of log.rows) {
      const key = String(row.userName || '—');
      const entry = grouped.get(key) || { userName: key, types: {}, total: 0, count: 0 };
      entry.types[row.docType] = (entry.types[row.docType] || 0) + 1;
      entry.total += num(row.amount);
      entry.count += 1;
      grouped.set(key, entry);
    }
    const rows = Array.from(grouped.values())
      .map((entry) => ({
        userName: entry.userName,
        invoices: entry.types['فاتورة بيع'] || 0,
        purchases: entry.types['فاتورة شراء'] || 0,
        receipts: entry.types['سند قبض'] || 0,
        payments: entry.types['سند صرف'] || 0,
        expenses: entry.types['مصروف'] || 0,
        returns: (entry.types['مرتجع بيع'] || 0) + (entry.types['مرتجع شراء'] || 0),
        count: entry.count,
        total: round2(entry.total),
      }))
      .sort((a, b) => b.count - a.count);
    return {
      kpis: [
        { label: 'عدد المستخدمين', value: rows.length, tone: 'info' },
        { label: 'إجمالي الحركات', value: log.rows.length, tone: 'neutral' },
        { label: 'أكثر مستخدم نشاطًا', value: rows[0]?.userName || '—', hint: `${rows[0]?.count || 0} حركة`, tone: 'success' },
      ],
      columns: [
        { key: 'userName', label: 'المستخدم' },
        { key: 'invoices', label: 'فواتير بيع', type: 'number' },
        { key: 'purchases', label: 'فواتير شراء', type: 'number' },
        { key: 'receipts', label: 'سندات قبض', type: 'number' },
        { key: 'payments', label: 'سندات صرف', type: 'number' },
        { key: 'expenses', label: 'مصروفات', type: 'number' },
        { key: 'returns', label: 'مرتجعات', type: 'number' },
        { key: 'count', label: 'إجمالي الحركات', type: 'number' },
        { key: 'total', label: 'إجمالي القيمة', type: 'currency' },
      ],
      rows,
    };
  }
  public async dailyMovements({ from, to }: ReportParams): Promise<ReportResult> {
    const log = await this.operationsLog({ from, to });
    const grouped = new Map<string, { date: string; userName: string; docType: string; count: number; total: number }>();
    for (const row of log.rows) {
      const key = `${row.date}|${row.userName}|${row.docType}`;
      const entry = grouped.get(key) || { date: row.date, userName: row.userName, docType: row.docType, count: 0, total: 0 };
      entry.count += 1;
      entry.total += num(row.amount);
      grouped.set(key, entry);
    }
    const rows = Array.from(grouped.values())
      .map((row) => ({ ...row, total: round2(row.total) }))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.count - a.count);
    return {
      kpis: [
        { label: 'أيام بها حركة', value: new Set(rows.map((row) => row.date)).size, tone: 'info' },
        { label: 'إجمالي الحركات', value: log.rows.length, tone: 'neutral' },
        { label: 'قيمة الحركة', value: round2(rows.reduce((total, row) => total + row.total, 0)), tone: 'success' },
      ],
      columns: [
        { key: 'date', label: 'التاريخ', type: 'date' },
        { key: 'userName', label: 'المستخدم' },
        { key: 'docType', label: 'نوع الحركة', type: 'badge' },
        { key: 'count', label: 'عدد الحركات', type: 'number' },
        { key: 'total', label: 'القيمة', type: 'currency' },
      ],
      rows,
      notes: ['استخدم البحث أو الفرز لتصفية التقرير حسب التاريخ أو المستخدم أو نوع الحركة.'],
    };
  }
  };
}
