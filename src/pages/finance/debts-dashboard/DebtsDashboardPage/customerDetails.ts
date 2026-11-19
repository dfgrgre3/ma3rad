import { DatabaseManager } from "../../../../database/repositories/databaseManager";
import type { CustomerDetail, PromiseRow } from "./types";

export function fetchCustomerDetails(id: string): CustomerDetail {
  const db = DatabaseManager.getInstance();
  const customer = db.query<{
    address: string | null;
    city: string | null;
  }>("SELECT address, city FROM customers WHERE id = ?", [id])[0];
  const invoices = db
    .query<{
      id: string;
      invoiceNumber: string;
      date: string;
      total: number;
      paid: number;
      remaining: number;
    }>(
      `SELECT id, invoice_number AS invoiceNumber, date, total_amount / 100.0 AS total, paid_amount / 100.0 AS paid, remaining_amount / 100.0 AS remaining FROM sales_invoices WHERE customer_id = ? AND invoice_status <> 'VOID' ORDER BY date DESC`,
      [id],
    )
    .map((invoice) => ({
      ...invoice,
      items: db.query<{
        name: string;
        sku: string;
        grade: string;
        size: string;
        quantity: number;
        unit: string;
        unitPrice: number;
        discount: number;
        total: number;
        returned: number;
      }>(
        `SELECT i.product_name AS name,i.product_sku AS sku,i.product_grade AS grade,i.size,i.quantity_m2 AS quantity,
        COALESCE(p.base_unit, i.uom, i.sold_by, 'M2') AS unit,
        i.unit_price / 100.0 AS unitPrice,i.discount_amount / 100.0 AS discount,i.total_price / 100.0 AS total,
        COALESCE((SELECT SUM(sri.quantity_m2) FROM sales_return_items sri JOIN sales_returns sr ON sr.id=sri.return_id WHERE sr.original_invoice_id=i.invoice_id AND sri.product_id=i.product_id),0) AS returned
       FROM sales_invoice_items i
       LEFT JOIN products p ON p.id = i.product_id
       WHERE i.invoice_id = ?`,
        [invoice.id],
      ),
    }));
  const payments = db.query<{
    id: string;
    invoiceId: string | null;
    paymentGroupId: string | null;
    receiptNumber: string;
    date: string;
    amount: number;
    paymentType: string;
    notes: string | null;
  }>(
    `SELECT id,invoice_id AS invoiceId,payment_group_id AS paymentGroupId,receipt_number AS receiptNumber,date,amount / 100.0 AS amount,payment_type AS paymentType,notes FROM customer_payments WHERE customer_id=? ORDER BY date`,
    [id],
  );
  const promises = db.query<PromiseRow>(
    `SELECT id,promised_amount / 100.0 AS promisedAmount,promise_date AS promiseDate,followup_date AS followupDate,status,notes FROM customer_payment_promises WHERE customer_id=? ORDER BY created_at DESC`,
    [id],
  );
  return {
    address:
      [customer?.address, customer?.city].filter(Boolean).join("، ") ||
      "—",
    invoices,
    payments,
    promises,
  };
}

export function buildStatementRows(detail: CustomerDetail) {
  return [
    ...detail.invoices.map((invoice) => ({
      type: "فاتورة",
      document: invoice.invoiceNumber,
      date: invoice.date,
      debit: invoice.total,
      credit: invoice.paid,
      balance: invoice.remaining,
      details: invoice.items
        .map(
          (item) =>
            `${item.name} ${item.sku} ${item.grade} ${item.size} (${item.quantity} ${item.unit} × ${item.unitPrice}، خصم ${item.discount}، مرتجع ${item.returned})`,
        )
        .join("، "),
    })),
    ...detail.payments.map((payment) => ({
      type: "تحصيل",
      document: payment.receiptNumber,
      date: payment.date,
      debit: 0,
      credit: payment.amount,
      balance: "",
      details: [payment.paymentType, payment.notes]
        .filter(Boolean)
        .join(" · "),
    })),
  ];
}

export function queryOverdueReportRows() {
  return DatabaseManager.getInstance().query(
    `SELECT c.name AS customer,c.phone,si.invoice_number AS invoice,si.date,si.due_date AS dueDate,si.total_amount / 100.0 AS total,si.paid_amount / 100.0 AS paid,si.remaining_amount / 100.0 AS remaining,CAST(julianday(date('now','localtime'))-julianday(si.due_date) AS INTEGER) AS daysOverdue FROM sales_invoices si JOIN customers c ON c.id=si.customer_id WHERE si.invoice_status<>'VOID' AND si.due_date IS NOT NULL AND si.due_date<date('now','localtime') AND si.remaining_amount>1 ORDER BY si.due_date`,
  );
}

