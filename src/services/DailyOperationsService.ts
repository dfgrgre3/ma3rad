import { DatabaseManager } from '../database/db';
import { round2 } from './financials';
import { localDateString } from '../utils/date';

export interface DailySalesRow {
  id: string;
  invoiceNumber: string;
  date: string;
  createdAt: string;
  customerName: string;
  customerPhone?: string | null;
  itemsCount: number;
  total: number;
  paid: number;
  remaining: number;
  tax: number;
  discount: number;
  profit: number;
  paymentType: string;
  paymentStatus: string;
  invoiceStatus: string;
  createdByName?: string | null;
}

export interface DailySalesResult {
  date: string;
  rows: DailySalesRow[];
  summary: { count: number; total: number; paid: number; remaining: number; profit: number; tax: number; discount: number };
}

export interface DailyPurchaseRow {
  id: string;
  invoiceNumber: string;
  date: string;
  createdAt: string;
  supplierName: string;
  supplierPhone?: string | null;
  itemsCount: number;
  total: number;
  paid: number;
  remaining: number;
  tax: number;
  discount: number;
  paymentType: string;
  paymentStatus: string;
  createdByName?: string | null;
}

export interface DailyPurchaseResult {
  date: string;
  rows: DailyPurchaseRow[];
  summary: { count: number; total: number; paid: number; remaining: number; tax: number; discount: number };
}

export interface DailyExpenseRow {
  id: string;
  category: string;
  description: string;
  amount: number;
  date: string;
  createdAt: string;
  paymentType: string;
  recipient?: string | null;
  registerName?: string | null;
  performedByName?: string | null;
}

export interface DailyExpenseResult {
  date: string;
  rows: DailyExpenseRow[];
  summary: { count: number; total: number; cash: number; topCategory: string | null; topCategoryAmount: number };
}

export interface DailyDebtRow {
  id: string;
  invoiceNumber: string;
  date: string;
  customerName: string;
  customerPhone?: string | null;
  total: number;
  paid: number;
  remaining: number;
  paymentStatus: string;
}

export interface DailyDebtPaymentRow {
  id: string;
  receiptNumber: string;
  customerName: string;
  amount: number;
  paymentType: string;
  notes?: string | null;
  performedByName?: string | null;
}

export interface DailyDueInstallmentRow {
  id: string;
  planNumber: string;
  customerName: string;
  customerPhone?: string | null;
  sequenceNumber: number;
  dueDate: string;
  amount: number;
  paidAmount: number;
  remaining: number;
  status: string;
}

export interface DailyDebtResult {
  date: string;
  rows: DailyDebtRow[];
  payments: DailyDebtPaymentRow[];
  dueInstallments: DailyDueInstallmentRow[];
  summary: { newDebt: number; invoicedCredit: number; collectedToday: number; netChange: number; totalOutstanding: number; dueInstallments: number };
}

const dateOnly = (value?: string | null) => value || localDateString();
const num = (value: unknown) => Number(value) || 0;

export class DailyOperationsService {
  private db = DatabaseManager.getInstance();

  public today(): string {
    return localDateString();
  }

  public getSales(date = this.today()): DailySalesResult {
    const day = dateOnly(date);
    const rows = this.db.query<DailySalesRow>(
      `SELECT si.id, si.invoice_number AS invoiceNumber, si.date, si.created_at AS createdAt,
              c.name AS customerName, c.phone AS customerPhone,
              (SELECT COUNT(*) FROM sales_invoice_items sii WHERE sii.invoice_id = si.id) AS itemsCount,
              si.total_amount AS total, si.paid_amount AS paid, si.remaining_amount AS remaining,
              si.tax_amount AS tax, si.discount_amount AS discount, si.gross_profit AS profit,
              si.payment_type AS paymentType, si.payment_status AS paymentStatus,
              si.invoice_status AS invoiceStatus, u.full_name AS createdByName
       FROM sales_invoices si
       LEFT JOIN customers c ON c.id = si.customer_id
       LEFT JOIN users u ON u.id = si.created_by
       WHERE si.date = ? AND si.invoice_status != 'VOID'
       ORDER BY si.created_at DESC`,
      [day]
    );

    return {
      date: day,
      rows,
      summary: {
        count: rows.length,
        total: round2(rows.reduce((sum, row) => sum + num(row.total), 0)),
        paid: round2(rows.reduce((sum, row) => sum + num(row.paid), 0)),
        remaining: round2(rows.reduce((sum, row) => sum + num(row.remaining), 0)),
        profit: round2(rows.reduce((sum, row) => sum + num(row.profit), 0)),
        tax: round2(rows.reduce((sum, row) => sum + num(row.tax), 0)),
        discount: round2(rows.reduce((sum, row) => sum + num(row.discount), 0)),
      },
    };
  }

  public getPurchases(date = this.today()): DailyPurchaseResult {
    const day = dateOnly(date);
    const rows = this.db.query<DailyPurchaseRow>(
      `SELECT pi.id, pi.invoice_number AS invoiceNumber, pi.date, pi.created_at AS createdAt,
              s.name AS supplierName, s.phone AS supplierPhone,
              (SELECT COUNT(*) FROM purchase_invoice_items pii WHERE pii.purchase_id = pi.id) AS itemsCount,
              pi.total_amount AS total, pi.paid_amount AS paid, pi.remaining_amount AS remaining,
              pi.tax_amount AS tax, pi.discount_amount AS discount,
              pi.payment_type AS paymentType, pi.payment_status AS paymentStatus,
              u.full_name AS createdByName
       FROM purchase_invoices pi
       LEFT JOIN suppliers s ON s.id = pi.supplier_id
       LEFT JOIN users u ON u.id = pi.created_by
       WHERE pi.date = ?
       ORDER BY pi.created_at DESC`,
      [day]
    );

    return {
      date: day,
      rows,
      summary: {
        count: rows.length,
        total: round2(rows.reduce((sum, row) => sum + num(row.total), 0)),
        paid: round2(rows.reduce((sum, row) => sum + num(row.paid), 0)),
        remaining: round2(rows.reduce((sum, row) => sum + num(row.remaining), 0)),
        tax: round2(rows.reduce((sum, row) => sum + num(row.tax), 0)),
        discount: round2(rows.reduce((sum, row) => sum + num(row.discount), 0)),
      },
    };
  }

  public getExpenses(date = this.today()): DailyExpenseResult {
    const day = dateOnly(date);
    const rows = this.db.query<DailyExpenseRow>(
      `SELECT e.id, e.category, e.description, e.amount, e.date, e.created_at AS createdAt,
              e.payment_type AS paymentType, e.recipient,
              r.name AS registerName, u.full_name AS performedByName
       FROM expenses e
       LEFT JOIN cash_registers r ON r.id = e.register_id
       LEFT JOIN users u ON u.id = e.performed_by
       WHERE e.date = ?
       ORDER BY e.created_at DESC`,
      [day]
    );

    const byCategory = new Map<string, number>();
    for (const row of rows) {
      byCategory.set(row.category, (byCategory.get(row.category) || 0) + num(row.amount));
    }
    const top = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0];

    return {
      date: day,
      rows,
      summary: {
        count: rows.length,
        total: round2(rows.reduce((sum, row) => sum + num(row.amount), 0)),
        cash: round2(rows.filter((row) => row.paymentType === 'CASH').reduce((sum, row) => sum + num(row.amount), 0)),
        topCategory: top?.[0] || null,
        topCategoryAmount: round2(top?.[1] || 0),
      },
    };
  }

  public getDebts(date = this.today()): DailyDebtResult {
    const day = dateOnly(date);
    const rows = this.db.query<DailyDebtRow>(
      `SELECT si.id, si.invoice_number AS invoiceNumber, si.date,
              c.name AS customerName, c.phone AS customerPhone,
              si.total_amount AS total, si.paid_amount AS paid, si.remaining_amount AS remaining,
              si.payment_status AS paymentStatus
       FROM sales_invoices si
       LEFT JOIN customers c ON c.id = si.customer_id
       WHERE si.date = ? AND si.invoice_status != 'VOID' AND si.remaining_amount > 0.009
       ORDER BY si.created_at DESC`,
      [day]
    );

    const payments = this.db.query<DailyDebtPaymentRow>(
      `SELECT cp.id, cp.receipt_number AS receiptNumber, c.name AS customerName,
              cp.amount, cp.payment_type AS paymentType, cp.notes, cp.invoice_id AS invoiceId, u.full_name AS performedByName
       FROM customer_payments cp
       LEFT JOIN customers c ON c.id = cp.customer_id
       LEFT JOIN users u ON u.id = cp.performed_by
       WHERE cp.date = ?
       ORDER BY cp.created_at DESC`,
      [day]
    );

    const dueInstallments = this.db.query<DailyDueInstallmentRow>(
      `SELECT i.id, p.plan_number AS planNumber, c.name AS customerName, c.phone AS customerPhone,
              i.sequence_number AS sequenceNumber, i.due_date AS dueDate,
              i.amount, i.paid_amount AS paidAmount, i.remaining_amount AS remaining, i.status
       FROM installments i
       JOIN installment_plans p ON p.id = i.plan_id
       LEFT JOIN customers c ON c.id = p.customer_id
       WHERE i.due_date <= ? AND i.status NOT IN ('PAID', 'WAIVED')
       ORDER BY i.due_date, p.plan_number`,
      [day]
    );

    const outstanding = this.db.query<{ total: number }>(
      `SELECT COALESCE(SUM(current_balance), 0) AS total FROM customers WHERE current_balance > 0`
    )[0]?.total || 0;

    const newDebt = round2(rows.reduce((sum, row) => sum + num(row.remaining), 0));
    const invoicedCredit = round2(rows.reduce((sum, row) => sum + num(row.total), 0));
    const collectedToday = round2(payments.reduce((sum, row) => sum + num(row.amount), 0));

    return {
      date: day,
      rows,
      payments,
      dueInstallments,
      summary: {
        newDebt,
        invoicedCredit,
        collectedToday,
        netChange: round2(newDebt - collectedToday),
        totalOutstanding: round2(outstanding),
        dueInstallments: round2(dueInstallments.reduce((sum, row) => sum + num(row.remaining), 0)),
      },
    };
  }
}
