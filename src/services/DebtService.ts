import { DatabaseManager } from '../database/db';

export interface DebtRow {
  id: string;
  name: string;
  phone?: string | null;
  type: 'CUSTOMER_RECEIVABLE' | 'SUPPLIER_PAYABLE';
  amount: number;
  creditLimit?: number;
  updatedAt?: string | null;
  overdue: boolean;
}

export class DebtService {
  private db = DatabaseManager.getInstance();

  public getDebts(search = ''): DebtRow[] {
    const term = `%${search.trim()}%`;
    const like = search.trim() ? 'AND name LIKE ?' : '';
    const customers = this.db.query<DebtRow>(
      `SELECT id, name, phone, current_balance AS amount, credit_limit AS creditLimit, updated_at AS updatedAt
       FROM customers WHERE current_balance > 0.009 ${like} ORDER BY current_balance DESC`,
      search.trim() ? [term] : []
    ).map((c) => ({ ...c, type: 'CUSTOMER_RECEIVABLE' as const, overdue: false }));

    const suppliers = this.db.query<DebtRow>(
      `SELECT id, name, phone, current_balance AS amount, 0 AS creditLimit, updated_at AS updatedAt
       FROM suppliers WHERE current_balance > 0.009 ${like} ORDER BY current_balance DESC`,
      search.trim() ? [term] : []
    ).map((s) => ({ ...s, type: 'SUPPLIER_PAYABLE' as const, overdue: false }));

    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    return [...customers, ...suppliers].map((d) => ({
      ...d,
      overdue: Boolean(d.updatedAt && d.updatedAt < cutoff),
    }));
  }

  public getTotals(): { receivable: number; payable: number; net: number } {
    const receivable = Number(this.db.query<{ v: number }>(
      `SELECT COALESCE(SUM(current_balance), 0) AS v FROM customers WHERE current_balance > 0`
    )[0]?.v || 0);
    const payable = Number(this.db.query<{ v: number }>(
      `SELECT COALESCE(SUM(current_balance), 0) AS v FROM suppliers WHERE current_balance > 0`
    )[0]?.v || 0);
    return { receivable, payable, net: receivable - payable };
  }
}
