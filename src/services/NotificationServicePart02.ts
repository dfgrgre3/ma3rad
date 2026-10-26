import { DatabaseManager } from '../database/db';
import { v4 as uuidv4 } from 'uuid';
import { addLocalDays, localDateString } from '../utils/date';
import type { Notification, NotificationType } from './notificationTypes';
import { NotificationServicePart01 } from './NotificationServicePart01';

export abstract class NotificationServicePart02 extends NotificationServicePart01 {
public runScheduledChecks(): { created: number } {
    const before = this.getUnreadCount();

    try {
      this.checkLowStockAlerts();

      const today = localDateString();
      const horizon = localDateString(addLocalDays(new Date(), 3));

      const dueInstallments = this.db.query<any>(`
        SELECT i.id, i.sequence_number AS seq, i.due_date AS dueDate, i.remaining_amount AS remaining,
               c.name AS customerName
        FROM installments i
        JOIN installment_plans pl ON pl.id = i.plan_id
        JOIN customers c ON c.id = pl.customer_id
        WHERE i.status IN ('DUE', 'OVERDUE', 'UPCOMING', 'PARTIAL')
          AND i.remaining_amount > 0.009 AND i.due_date <= ?
        ORDER BY i.due_date ASC LIMIT 100
      `, [horizon]);

      for (const row of dueInstallments) {
        const overdue = row.dueDate < today;
        this.notifyOnce(
          'PAYMENT_DUE',
          overdue ? 'قسط متأخر' : 'قسط مستحق قريبًا',
          `القسط رقم ${row.seq} للعميل ${row.customerName} بمبلغ ${Number(row.remaining).toFixed(2)} ج.م — تاريخ الاستحقاق ${row.dueDate}`,
          'INSTALLMENT',
          row.id
        );
      }

      const dueCheques = this.db.query<any>(`
        SELECT id, cheque_number AS chequeNumber, party_name AS partyName, amount, due_date AS dueDate, type
        FROM cheques
        WHERE status = 'PENDING' AND due_date <= ?
        ORDER BY due_date ASC LIMIT 100
      `, [horizon]);

      for (const cheque of dueCheques) {
        this.notifyOnce(
          'PAYMENT_DUE',
          cheque.type === 'ISSUED' ? 'شيك صادر مستحق' : 'شيك وارد للتحصيل',
          `الشيك ${cheque.chequeNumber} من ${cheque.partyName} بمبلغ ${Number(cheque.amount).toFixed(2)} ج.م — الاستحقاق ${cheque.dueDate}`,
          'CHEQUE',
          cheque.id
        );
      }

      const pendingApprovals = this.db.query<any>(`
        SELECT id, request_number AS requestNumber, title, requested_value AS requestedValue
        FROM approval_requests WHERE status = 'PENDING' ORDER BY created_at ASC LIMIT 100
      `);

      for (const request of pendingApprovals) {
        this.notifyOnce(
          'SYSTEM',
          'طلب موافقة معلّق',
          `${request.requestNumber}: ${request.title}${request.requestedValue ? ` — القيمة ${Number(request.requestedValue).toFixed(2)} ج.م` : ''}`,
          'APPROVAL',
          request.id
        );
      }

      const overdueInvoices = this.db.query<any>(`
        SELECT si.id, si.invoice_number AS invoiceNumber, si.date, si.remaining_amount AS remaining,
               c.name AS customerName
        FROM sales_invoices si JOIN customers c ON c.id = si.customer_id
        WHERE si.invoice_status != 'VOID' AND si.remaining_amount > 0.009
          AND si.date < date('now', '-30 day')
        ORDER BY si.date ASC LIMIT 100
      `);

      for (const invoice of overdueInvoices) {
        this.notifyOnce(
          'PAYMENT_DUE',
          'فاتورة متأخرة السداد',
          `الفاتورة ${invoice.invoiceNumber} للعميل ${invoice.customerName} متأخرة بمبلغ ${Number(invoice.remaining).toFixed(2)} ج.م منذ ${invoice.date}`,
          'SALES_INVOICE',
          invoice.id
        );
      }
    } catch (error) {
      console.warn('Scheduled notification checks failed:', error);
    }

    return { created: Math.max(0, this.getUnreadCount() - before) };
  }

public notifyIncompleteCustomer(customerId: string, customerName: string, missingFields: string[]): void {
    const existing = this.db.query<any>(
      `SELECT id FROM notifications WHERE type = 'INCOMPLETE_CUSTOMER' AND reference_id = ? AND is_read = 0`,
      [customerId]
    );
    if (existing.length > 0) return; // already notified
    this.createNotification(
      'INCOMPLETE_CUSTOMER',
      `بيانات العميل غير مكتملة`,
      `العميل "${customerName}" تم استيراده ببيانات ناقصة: ${missingFields.join('، ')}. اضغط هنا لإكمال البيانات.`,
      undefined,
      'CUSTOMER',
      customerId
    );
  }
}
