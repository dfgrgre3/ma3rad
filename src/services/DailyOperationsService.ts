import { DatabaseManager } from '../database/db';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
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
  supplierInvoiceNumber?: string | null;
  date: string;
  createdAt: string;
  supplierId?: string | null;
  supplierName: string;
  supplierPhone?: string | null;
  warehouseName?: string | null;
  itemsCount: number;
  subtotal: number;
  total: number;
  paid: number;
  remaining: number;
  tax: number;
  discount: number;
  shippingCost: number;
  paymentType: string;
  paymentStatus: string;
  notes?: string | null;
  createdByName?: string | null;
}

export interface DailyPurchaseItemRow {
  id: string;
  purchaseId: string;
  invoiceNumber: string;
  supplierId?: string | null;
  supplierName: string;
  productId: string;
  productName: string;
  sku?: string | null;
  grade: string;
  quantityM2: number;
  boxesCount: number;
  unitCost: number;
  totalCost: number;
  productType?: 'CERAMIC' | 'GENERAL';
  baseUnit?: string;
  customUnit?: string;
}

export interface DailySupplierPaymentRow {
  id: string;
  receiptNumber: string;
  supplierId: string;
  supplierName: string;
  amount: number;
  paymentType: string;
  notes?: string | null;
  performedByName?: string | null;
  createdAt?: string | null;
  invoiceNumbers?: string | null;
}

export interface DailyPurchaseTrendPoint {
  date: string;
  count: number;
  total: number;
}

export interface DailyPurchaseResult {
  date: string;
  rows: DailyPurchaseRow[];
  items: DailyPurchaseItemRow[];
  payments: DailySupplierPaymentRow[];
  trend: DailyPurchaseTrendPoint[];
  summary: {
    count: number;
    total: number;
    paid: number;
    remaining: number;
    tax: number;
    discount: number;
    shipping: number;
    subtotal: number;
    itemsCount: number;
    quantityM2: number;
    boxesCount: number;
    suppliersCount: number;
    cashPaid: number;
    bankPaid: number;
    creditTotal: number;
    averageInvoice: number;
    supplierOutstanding: number;
    paymentsTotal: number;
    paymentsCount: number;
  };
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

  private requireView(permission: string): void {
    PermissionService.require(AuthService.requireAuth(), permission);
  }

  public today(): string {
    return localDateString();
  }

  public getSales(date = this.today()): DailySalesResult {
    this.requireView('sales.view');
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
    this.requireView('purchases.view');
    const day = dateOnly(date);
    const rows = this.db.query<DailyPurchaseRow>(
      `SELECT pi.id, pi.invoice_number AS invoiceNumber, pi.supplier_invoice_number AS supplierInvoiceNumber,
              pi.date, pi.created_at AS createdAt,
              pi.supplier_id AS supplierId, s.name AS supplierName, s.phone AS supplierPhone,
              w.name AS warehouseName,
              (SELECT COUNT(*) FROM purchase_invoice_items pii WHERE pii.purchase_id = pi.id) AS itemsCount,
              pi.subtotal, pi.total_amount AS total, pi.paid_amount AS paid, pi.remaining_amount AS remaining,
              pi.tax_amount AS tax, pi.discount_amount AS discount, pi.shipping_cost AS shippingCost,
              pi.payment_type AS paymentType, pi.payment_status AS paymentStatus, pi.notes,
              u.full_name AS createdByName
       FROM purchase_invoices pi
       LEFT JOIN suppliers s ON s.id = pi.supplier_id
       LEFT JOIN warehouses w ON w.id = pi.warehouse_id
       LEFT JOIN users u ON u.id = pi.created_by
       WHERE pi.date = ?
       ORDER BY pi.created_at DESC`,
      [day]
    );

    const items = this.db.query<DailyPurchaseItemRow>(
      `SELECT pii.id, pii.purchase_id AS purchaseId, pi.invoice_number AS invoiceNumber,
              pi.supplier_id AS supplierId, s.name AS supplierName,
              pii.product_id AS productId, pii.product_name AS productName, p.sku AS sku,
              pii.grade, pii.quantity_m2 AS quantityM2, pii.boxes_count AS boxesCount,
              p.product_type AS productType, p.base_unit AS baseUnit, p.custom_unit AS customUnit,
              pii.unit_cost AS unitCost, pii.total_cost AS totalCost
       FROM purchase_invoice_items pii
       JOIN purchase_invoices pi ON pi.id = pii.purchase_id
       LEFT JOIN suppliers s ON s.id = pi.supplier_id
       LEFT JOIN products p ON p.id = pii.product_id
       WHERE pi.date = ?
       ORDER BY pii.total_cost DESC`,
      [day]
    );

    const payments = this.db.query<DailySupplierPaymentRow>(
      `SELECT sp.id, sp.receipt_number AS receiptNumber, sp.supplier_id AS supplierId,
              s.name AS supplierName, sp.amount, sp.payment_type AS paymentType,
              sp.notes, sp.created_at AS createdAt, u.full_name AS performedByName,
              (SELECT GROUP_CONCAT(pi.invoice_number, '، ')
                 FROM supplier_payment_allocations spa
                 JOIN purchase_invoices pi ON pi.id = spa.purchase_invoice_id
                WHERE spa.payment_id = sp.id) AS invoiceNumbers
       FROM supplier_payments sp
       LEFT JOIN suppliers s ON s.id = sp.supplier_id
       LEFT JOIN users u ON u.id = sp.performed_by
       WHERE sp.date = ?
       ORDER BY sp.created_at DESC`,
      [day]
    );

    const start = new Date(`${day}T12:00:00`);
    start.setDate(start.getDate() - 6);
    const startDay = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
    const trendRows = this.db.query<{ date: string; count: number; total: number }>(
      `SELECT date, COUNT(*) AS count, COALESCE(SUM(total_amount), 0) AS total
       FROM purchase_invoices
       WHERE date BETWEEN ? AND ?
       GROUP BY date`,
      [startDay, day]
    );
    const trendMap = new Map(trendRows.map((row) => [row.date, row]));
    const trend: DailyPurchaseTrendPoint[] = Array.from({ length: 7 }, (_, index) => {
      const cursor = new Date(`${startDay}T12:00:00`);
      cursor.setDate(cursor.getDate() + index);
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
      const match = trendMap.get(key);
      return { date: key, count: num(match?.count), total: round2(num(match?.total)) };
    });

    const supplierOutstanding = this.db.query<{ total: number }>(
      `SELECT COALESCE(SUM(current_balance), 0) AS total FROM suppliers WHERE current_balance > 0`
    )[0]?.total || 0;

    const sumByPaymentType = (type: string) => round2(rows
      .filter((row) => row.paymentType === type)
      .reduce((sum, row) => sum + num(row.paid), 0));

    const total = round2(rows.reduce((sum, row) => sum + num(row.total), 0));
    const suppliers = new Set(rows.map((row) => row.supplierId).filter(Boolean));

    return {
      date: day,
      rows,
      items,
      payments,
      trend,
      summary: {
        count: rows.length,
        total,
        paid: round2(rows.reduce((sum, row) => sum + num(row.paid), 0)),
        remaining: round2(rows.reduce((sum, row) => sum + num(row.remaining), 0)),
        tax: round2(rows.reduce((sum, row) => sum + num(row.tax), 0)),
        discount: round2(rows.reduce((sum, row) => sum + num(row.discount), 0)),
        shipping: round2(rows.reduce((sum, row) => sum + num(row.shippingCost), 0)),
        subtotal: round2(rows.reduce((sum, row) => sum + num(row.subtotal), 0)),
        itemsCount: items.length,
        quantityM2: round2(items.reduce((sum, item) => sum + num(item.quantityM2), 0)),
        boxesCount: round2(items.reduce((sum, item) => sum + num(item.boxesCount), 0)),
        suppliersCount: suppliers.size,
        cashPaid: sumByPaymentType('CASH'),
        bankPaid: round2(sumByPaymentType('BANK_TRANSFER') + sumByPaymentType('CARD')),
        creditTotal: round2(rows.filter((row) => row.paymentStatus !== 'PAID').reduce((sum, row) => sum + num(row.total), 0)),
        averageInvoice: rows.length ? round2(total / rows.length) : 0,
        supplierOutstanding: round2(num(supplierOutstanding)),
        paymentsTotal: round2(payments.reduce((sum, payment) => sum + num(payment.amount), 0)),
        paymentsCount: payments.length,
      },
    };
  }

  public getExpenses(date = this.today()): DailyExpenseResult {
    this.requireView('cashier.view');
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
    this.requireView('finance.debts.view');
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
