import { DatabaseManager } from '../database/db';
import { v4 as uuidv4 } from 'uuid';
import { addLocalDays, localDateString } from '../utils/date';
import type { Notification, NotificationType } from './notificationTypes';

export abstract class NotificationServicePart01 {
protected db = DatabaseManager.getInstance();

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

protected notifyOnce(type: NotificationType, title: string, message: string, referenceType: string, referenceId: string): void {
    const existing = this.db.query<any>(
      `SELECT id FROM notifications WHERE type = ? AND reference_type = ? AND reference_id = ? AND is_read = 0`,
      [type, referenceType, referenceId]
    );
    if (existing.length === 0) this.createNotification(type, title, message, undefined, referenceType, referenceId);
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
}
