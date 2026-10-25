import { DatabaseManager } from '../database/db';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { localDateString } from '../utils/date';

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

  private requireView(): void {
    PermissionService.require(AuthService.requireAuth(), 'finance.debts.view');
  }

  public getDebts(search = ''): DebtRow[] {
    this.requireView();
    const term = `%${search.trim()}%`;
    const customers = this.db.query<DebtRow>(
      `SELECT c.id,c.name,c.phone,CASE WHEN COALESCE(inv.invoiceRemaining,0)>0.009 THEN inv.invoiceRemaining ELSE c.current_balance END AS amount,c.credit_limit AS creditLimit,c.updated_at AS updatedAt,
         COALESCE(inv.invoiceCount,0) AS invoiceCount,COALESCE(inv.invoiceRemaining,0) AS invoiceRemaining,
         COALESCE(inv.paidFromInvoices,0) AS paidFromInvoices,inv.oldestDueDate,
         CASE WHEN inv.oldestDueDate < date('now','localtime') THEN CAST(julianday(date('now','localtime'))-julianday(inv.oldestDueDate) AS INTEGER) ELSE 0 END AS daysOverdue,
         (SELECT MAX(date) FROM customer_payments cp WHERE cp.customer_id=c.id) AS lastPaymentDate
       FROM customers c LEFT JOIN (
         SELECT customer_id,COUNT(*) AS invoiceCount,SUM(total_amount) AS invoiceTotal,
           SUM(paid_amount) AS paidFromInvoices,SUM(remaining_amount) AS invoiceRemaining,
           MIN(CASE WHEN remaining_amount>0.009 AND due_date IS NOT NULL THEN due_date END) AS oldestDueDate
         FROM sales_invoices WHERE invoice_status <> 'VOID' GROUP BY customer_id
       ) inv ON inv.customer_id=c.id
       WHERE c.current_balance > 0.009 OR COALESCE(inv.invoiceRemaining,0)>0.009
       ${search.trim() ? `AND (c.name LIKE ? OR c.phone LIKE ? OR c.code LIKE ? OR EXISTS (SELECT 1 FROM sales_invoices si WHERE si.customer_id=c.id AND si.invoice_number LIKE ?))` : ''}
       ORDER BY c.current_balance DESC`,
      search.trim() ? [term,term,term,term] : []
    ).map((c) => ({ ...c, type: 'CUSTOMER_RECEIVABLE' as const, overdue: Boolean(c.oldestDueDate && c.oldestDueDate < localDateString()) }));

    const suppliers = this.db.query<DebtRow>(
      `SELECT id, name, phone, current_balance AS amount, 0 AS creditLimit, updated_at AS updatedAt
       FROM suppliers WHERE current_balance > 0.009 ${search.trim() ? 'AND (name LIKE ? OR phone LIKE ? OR code LIKE ?)' : ''} ORDER BY current_balance DESC`,
      search.trim() ? [term,term,term] : []
    ).map((s) => ({ ...s, type: 'SUPPLIER_PAYABLE' as const, overdue: false }));

    return [...customers, ...suppliers].map((d) => ({
      ...d,
      overdue: d.type === 'CUSTOMER_RECEIVABLE' ? Boolean(d.overdue) : false,
    }));
  }

  public getTotals(): { receivable: number; payable: number; net: number } {
    this.requireView();
    const receivable = Number(this.db.query<{ v: number }>(
      `SELECT COALESCE(SUM(CASE WHEN COALESCE(inv.invoiceRemaining,0)>0.009 THEN inv.invoiceRemaining ELSE c.current_balance END),0) AS v
       FROM customers c LEFT JOIN (SELECT customer_id,SUM(remaining_amount) AS invoiceRemaining FROM sales_invoices WHERE invoice_status <> 'VOID' GROUP BY customer_id) inv ON inv.customer_id=c.id
       WHERE c.current_balance > 0.009 OR COALESCE(inv.invoiceRemaining,0)>0.009`
    )[0]?.v || 0);
    const payable = Number(this.db.query<{ v: number }>(
      `SELECT COALESCE(SUM(current_balance), 0) AS v FROM suppliers WHERE current_balance > 0`
    )[0]?.v || 0);
    return { receivable, payable, net: receivable - payable };
  }
}
