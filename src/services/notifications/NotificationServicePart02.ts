import { addLocalDays, localDateString } from '../../utils/shared/date';
import { NotificationServicePart01 } from './NotificationServicePart01';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { BranchAccessService } from '../auth/BranchAccessService';

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

      const currentActor = AuthService.getCurrentUser();
      const canViewFinance = PermissionService.hasRoleGrant(currentActor, 'finance.view');
      const currentBranchId = currentActor && canViewFinance
        ? new BranchAccessService().getCurrentBranchId(currentActor)
        : '';
      const financialEvents = currentBranchId ? this.db.query<any>(`
        SELECT id, branch_id AS branchId, title, due_date AS dueDate, amount, paid_amount AS paidAmount,
          currency, reminder_days AS reminderDays, reminder_at AS reminderAt
        FROM financial_calendar_events
        WHERE branch_id = ? AND status NOT IN ('PAID', 'COLLECTED', 'CANCELLED')
          AND amount > paid_amount AND due_date <= ?
        ORDER BY due_date ASC LIMIT 500
      `, [currentBranchId, horizon]) : [];
      const currentDay = new Date(`${today}T00:00:00.000Z`);
      for (const event of financialEvents) {
        const dueDay = Math.round(
          (Date.parse(`${event.dueDate}T00:00:00.000Z`) - currentDay.getTime()) / 86_400_000
        );
        let reminderDays: number[] = [];
        try {
          const parsed = JSON.parse(event.reminderDays || '[]');
          if (Array.isArray(parsed)) reminderDays = parsed.filter((day) => [1, 3, 7].includes(Number(day))).map(Number);
        } catch (error) {
          console.warn(`Invalid financial calendar reminder configuration for ${event.id}:`, error);
        }
        const reminderTimeDue = event.reminderAt && Number.isFinite(Date.parse(event.reminderAt))
          && Date.parse(event.reminderAt) <= Date.now();
        if (dueDay < 0) {
          this.notifyFinancialEventOnce(
            currentActor?.id || '',
            event.id,
            'OVERDUE',
            'حدث مالي متأخر',
            `${event.title} — الرصيد المتبقي ${Number(event.amount - event.paidAmount).toFixed(2)} ${event.currency}، وكان الاستحقاق ${event.dueDate}`
          );
        } else if (dueDay === 0 || reminderDays.includes(dueDay) || reminderTimeDue) {
          const key = dueDay === 0 ? 'DUE_TODAY' : `REMINDER_${dueDay}`;
          this.notifyFinancialEventOnce(
            currentActor?.id || '',
            event.id,
            key,
            dueDay === 0 ? 'حدث مالي مستحق اليوم' : 'تذكير بموعد مالي قريب',
            `${event.title} — ${Number(event.amount - event.paidAmount).toFixed(2)} ${event.currency}، تاريخ الاستحقاق ${event.dueDate}`
          );
        }
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

private notifyFinancialEventOnce(userId: string, eventId: string, reminderKey: string, title: string, message: string): void {
    if (!userId) return;
    const referenceId = `${eventId}:${reminderKey}`;
    const exists = this.db.query<{ id: string }>(
      `SELECT id FROM notifications
       WHERE user_id = ? AND type = 'PAYMENT_DUE'
         AND reference_type = 'FINANCIAL_CALENDAR_EVENT' AND reference_id = ?
       LIMIT 1`,
      [userId, referenceId]
    )[0];
    if (!exists) this.createNotification('PAYMENT_DUE', title, message, userId, 'FINANCIAL_CALENDAR_EVENT', referenceId);
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
