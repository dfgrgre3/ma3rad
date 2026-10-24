import { DatabaseManager } from '../database/db';
import { v4 as uuidv4 } from 'uuid';
import { addLocalDays, localDateString } from '../utils/date';

export type NotificationType = 'LOW_STOCK' | 'PAYMENT_DUE' | 'SHIFT_REMINDER' | 'SYSTEM' | 'STOCK_ALERT' | 'INVOICE_CREATED' | 'EXPENSE_RECORDED';

export interface Notification {
  id: string;
  userId?: string;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  referenceType?: string;
  referenceId?: string;
  createdAt: string;
}

export class NotificationService {
  private db = DatabaseManager.getInstance();

  public getNotifications(userId?: string, unreadOnly = false): Notification[] {
    let sql = 'SELECT * FROM notifications WHERE 1=1';
    const params: any[] = [];

    if (userId) {
      sql += ' AND (user_id = ? OR user_id IS NULL)';
      params.push(userId);
    }
    if (unreadOnly) {
      sql += ' AND is_read = 0';
    }

    sql += ' ORDER BY created_at DESC LIMIT 100';

    return this.db.query<Notification>(sql, params).map(r => ({
      ...r,
      isRead: Boolean(r.isRead)
    }));
  }

  public getUnreadCount(userId?: string): number {
    let sql = 'SELECT COUNT(*) as cnt FROM notifications WHERE is_read = 0';
    const params: any[] = [];

    if (userId) {
      sql += ' AND (user_id = ? OR user_id IS NULL)';
      params.push(userId);
    }

    const result = this.db.query<any>(sql, params);
    return result[0]?.cnt || 0;
  }

  public markAsRead(notificationId: string): void {
    this.db.run('UPDATE notifications SET is_read = 1 WHERE id = ?', [notificationId]);
  }

  public markAllAsRead(userId?: string): void {
    if (userId) {
      this.db.run('UPDATE notifications SET is_read = 1 WHERE (user_id = ? OR user_id IS NULL)', [userId]);
    } else {
      this.db.run('UPDATE notifications SET is_read = 1');
    }
  }

  public createNotification(
    type: NotificationType,
    title: string,
    message: string,
    userId?: string,
    referenceType?: string,
    referenceId?: string
  ): void {
    const id = `ntf_${uuidv4().substring(0, 8)}`;
    this.db.run(
      `INSERT INTO notifications (id, user_id, type, title, message, is_read, reference_type, reference_id)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
      [id, userId || null, type, title, message, referenceType || null, referenceId || null]
    );
  }

  public deleteNotification(id: string): void {
    this.db.run('DELETE FROM notifications WHERE id = ?', [id]);
  }

  public deleteAllNotifications(userId?: string): void {
    if (userId) {
      this.db.run('DELETE FROM notifications WHERE user_id = ?', [userId]);
    } else {
      this.db.run('DELETE FROM notifications');
    }
  }

  public checkLowStockAlerts(): void {
    const lowStockProducts = this.db.query<any>(`
      SELECT p.id, p.name, ws.quantity_m2, p.min_stock_level, w.name as warehouseName
      FROM warehouse_stock ws
      JOIN products p ON ws.product_id = p.id
      JOIN warehouses w ON ws.warehouse_id = w.id
      WHERE p.is_active = 1 AND ws.quantity_m2 <= p.min_stock_level AND ws.quantity_m2 > 0
    `);

    for (const product of lowStockProducts) {
      const existing = this.db.query<any>(
        `SELECT id FROM notifications 
         WHERE type = 'LOW_STOCK' AND reference_id = ? AND is_read = 0`,
        [product.id]
      );
      if (existing.length === 0) {
        this.createNotification(
          'LOW_STOCK',
          'تنبيه: مخزون منخفض',
          `الصنف "${product.name}" في مخزن "${product.warehouseName}" وصل إلى ${product.quantityM2} م² (الحد الأدنى: ${product.min_stock_level} م²)`,
          undefined,
          'PRODUCT',
          product.id
        );
      }
    }

    const outOfStockProducts = this.db.query<any>(`
      SELECT p.id, p.name, w.name as warehouseName
      FROM warehouse_stock ws
      JOIN products p ON ws.product_id = p.id
      JOIN warehouses w ON ws.warehouse_id = w.id
      WHERE p.is_active = 1 AND ws.quantity_m2 <= 0
    `);

    for (const product of outOfStockProducts) {
      const existing = this.db.query<any>(
        `SELECT id FROM notifications 
         WHERE type = 'STOCK_ALERT' AND reference_id = ? AND is_read = 0`,
        [product.id]
      );
      if (existing.length === 0) {
        this.createNotification(
          'STOCK_ALERT',
          'تنبيه: نفاد المخزون',
          `الصنف "${product.name}" في مخزن "${product.warehouseName}" نفد من المخزون`,
          undefined,
          'PRODUCT',
          product.id
        );
      }
    }
  }

  /** Creates a notification only when no unread notification exists for the same reference. */
  private notifyOnce(type: NotificationType, title: string, message: string, referenceType: string, referenceId: string): void {
    const existing = this.db.query<any>(
      `SELECT id FROM notifications WHERE type = ? AND reference_type = ? AND reference_id = ? AND is_read = 0`,
      [type, referenceType, referenceId]
    );
    if (existing.length === 0) this.createNotification(type, title, message, undefined, referenceType, referenceId);
  }

  /**
   * Scheduled business checks. Safe to call repeatedly: every alert is deduplicated
   * against unread notifications for the same reference.
   */
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
}
