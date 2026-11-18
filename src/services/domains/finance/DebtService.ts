import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { localDateString } from '../../../utils/shared/date';

export interface DebtRow {
  id: string;
  name: string;
  phone?: string | null;
  type: 'CUSTOMER_RECEIVABLE' | 'SUPPLIER_PAYABLE';
  amount: number;
  creditLimit?: number;
  updatedAt?: string | null;
  overdue: boolean;
  invoiceCount?: number;
  invoiceRemaining?: number;
  paidFromInvoices?: number;
  oldestDueDate?: string | null;
  daysOverdue?: number;
  lastPaymentDate?: string | null;
}

export class DebtService {
  private db = DatabaseManager.getInstance();
  private branches = new BranchAccessService();

  private requireView(): void {
    PermissionService.require(AuthService.requireAuth(), 'finance.debts.view');
  }

  private buildDebtsQueries(search: string, actor: ReturnType<typeof AuthService.requireAuth>): { customers: { sql: string; params: any[] }; suppliers: { sql: string; params: any[] } } {
    const invoiceScope = this.branches.sqlScope('si.branch_id', undefined, actor);
    const paymentScope = this.branches.sqlScope('cp.branch_id', undefined, actor);
    const purchaseScope = this.branches.sqlScope('pi.branch_id', undefined, actor);
    const term = `%${search.trim()}%`;
    const customers = {
      sql: `SELECT c.id,c.name,c.phone,inv.invoiceRemaining AS amount,c.credit_limit / 100.0 AS creditLimit,c.current_balance / 100.0 AS currentBalance, c.updated_at AS updatedAt,
         COALESCE(inv.invoiceCount,0) AS invoiceCount,COALESCE(inv.invoiceRemaining,0) AS invoiceRemaining,
         COALESCE(inv.paidFromInvoices,0) AS paidFromInvoices,inv.oldestDueDate,
         CASE WHEN inv.oldestDueDate < date('now','localtime') THEN CAST(julianday(date('now','localtime'))-julianday(inv.oldestDueDate) AS INTEGER) ELSE 0 END AS daysOverdue,
         (SELECT MAX(cp.date) FROM customer_payments cp WHERE cp.customer_id=c.id AND ${paymentScope.clause}) AS lastPaymentDate
       FROM customers c LEFT JOIN (
         SELECT si.customer_id,COUNT(*) AS invoiceCount,SUM(si.total_amount) / 100.0 AS invoiceTotal,
           SUM(si.paid_amount) / 100.0 AS paidFromInvoices,SUM(si.remaining_amount) / 100.0 AS invoiceRemaining,
           MIN(CASE WHEN si.remaining_amount>1 AND si.due_date IS NOT NULL THEN si.due_date END) AS oldestDueDate
         FROM sales_invoices si WHERE si.invoice_status <> 'VOID' AND ${invoiceScope.clause} GROUP BY si.customer_id
       ) inv ON inv.customer_id=c.id
       WHERE COALESCE(inv.invoiceRemaining,0)>0.009
       ${search.trim() ? `AND (c.name LIKE ? OR c.phone LIKE ? OR c.code LIKE ? OR EXISTS (SELECT 1 FROM sales_invoices sx WHERE sx.customer_id=c.id AND sx.invoice_number LIKE ? AND ${this.branches.sqlScope('sx.branch_id', undefined, actor).clause}))` : ''}
       ORDER BY inv.invoiceRemaining DESC`,
      params: [...paymentScope.params, ...invoiceScope.params, ...(search.trim() ? [term,term,term,term, ...this.branches.sqlScope('sx.branch_id', undefined, actor).params] : [])] as any[],
    };
    const suppliers = {
      sql: `SELECT s.id,s.name,s.phone,inv.amount,s.updated_at AS updatedAt,0 AS creditLimit
       FROM suppliers s JOIN (SELECT pi.supplier_id,SUM(pi.remaining_amount) / 100.0 AS amount FROM purchase_invoices pi WHERE ${purchaseScope.clause} GROUP BY pi.supplier_id) inv ON inv.supplier_id=s.id
       WHERE inv.amount > 0.009 ${search.trim() ? 'AND (s.name LIKE ? OR s.phone LIKE ? OR s.code LIKE ?)' : ''} ORDER BY inv.amount DESC`,
      params: [...purchaseScope.params, ...(search.trim() ? [term,term,term] : [])] as any[],
    };
    return { customers, suppliers };
  }

  private mergeDebts(customerRows: DebtRow[], supplierRows: DebtRow[]): DebtRow[] {
    const customers = customerRows.map((c) => ({ ...c, type: 'CUSTOMER_RECEIVABLE' as const, overdue: Boolean(c.oldestDueDate && c.oldestDueDate < localDateString()) }));
    const suppliers = supplierRows.map((s) => ({ ...s, type: 'SUPPLIER_PAYABLE' as const, overdue: false }));
    return [...customers, ...suppliers].map((d) => ({
      ...d,
      overdue: d.type === 'CUSTOMER_RECEIVABLE' ? Boolean(d.overdue) : false,
    }));
  }

  public getDebts(search = ''): DebtRow[] {
    this.requireView();
    const actor = AuthService.requireAuth();
    const { customers, suppliers } = this.buildDebtsQueries(search, actor);
    return this.mergeDebts(
      this.db.query<DebtRow>(customers.sql, customers.params),
      this.db.query<DebtRow>(suppliers.sql, suppliers.params),
    );
  }

  public async getDebtsAsync(search = ''): Promise<DebtRow[]> {
    this.requireView();
    const actor = AuthService.requireAuth();
    const { customers, suppliers } = this.buildDebtsQueries(search, actor);
    const [customerRows, supplierRows] = await Promise.all([
      this.db.queryAsync<DebtRow>(customers.sql, customers.params),
      this.db.queryAsync<DebtRow>(suppliers.sql, suppliers.params),
    ]);
    return this.mergeDebts(customerRows, supplierRows);
  }

  private buildTotalsQueries(actor: ReturnType<typeof AuthService.requireAuth>): { receivable: { sql: string; params: any[] }; payable: { sql: string; params: any[] } } {
    const invoiceScope = this.branches.sqlScope('si.branch_id', undefined, actor);
    const purchaseScope = this.branches.sqlScope('pi.branch_id', undefined, actor);
    return {
      receivable: {
        sql: `SELECT COALESCE(SUM(si.remaining_amount),0) / 100.0 AS v FROM sales_invoices si WHERE si.invoice_status <> 'VOID' AND si.remaining_amount > 1 AND ${invoiceScope.clause}`,
        params: invoiceScope.params,
      },
      payable: {
        sql: `SELECT COALESCE(SUM(pi.remaining_amount),0) / 100.0 AS v FROM purchase_invoices pi WHERE pi.remaining_amount > 1 AND ${purchaseScope.clause}`,
        params: purchaseScope.params,
      },
    };
  }

  private computeTotals(receivableRows: { v: number }[], payableRows: { v: number }[]): { receivable: number; payable: number; net: number } {
    const receivable = Number(receivableRows[0]?.v || 0);
    const payable = Number(payableRows[0]?.v || 0);
    return { receivable, payable, net: receivable - payable };
  }

  public getTotals(): { receivable: number; payable: number; net: number } {
    this.requireView();
    const actor = AuthService.requireAuth();
    const { receivable, payable } = this.buildTotalsQueries(actor);
    return this.computeTotals(
      this.db.query<{ v: number }>(receivable.sql, receivable.params),
      this.db.query<{ v: number }>(payable.sql, payable.params),
    );
  }

  public async getTotalsAsync(): Promise<{ receivable: number; payable: number; net: number }> {
    this.requireView();
    const actor = AuthService.requireAuth();
    const { receivable, payable } = this.buildTotalsQueries(actor);
    const [receivableRows, payableRows] = await Promise.all([
      this.db.queryAsync<{ v: number }>(receivable.sql, receivable.params),
      this.db.queryAsync<{ v: number }>(payable.sql, payable.params),
    ]);
    return this.computeTotals(receivableRows, payableRows);
  }
}
