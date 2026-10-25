import { DatabaseManager } from '../database/db';
import type { NotificationPreference, UpdateNotificationPreferencesDTO } from '../types';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';

export class NotificationPreferencesService {
  private db = DatabaseManager.getInstance();

  public getPreferences(userId: string): NotificationPreference | null {
    const rows = this.db.query<NotificationPreference>(
      'SELECT * FROM notification_preferences WHERE user_id = ?',
      [userId]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  public createOrUpdatePreferences(userId: string, dto: UpdateNotificationPreferencesDTO): NotificationPreference {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'settings.update');

    const existing = this.getPreferences(userId);
    const now = new Date().toISOString();

    const boolVal = (v: boolean | undefined): number => (v === undefined ? 1 : v ? 1 : 0);

    if (existing) {
      const fields: string[] = [];
      const params: any[] = [];
      if (dto.emailEnabled !== undefined) { fields.push('email_enabled = ?'); params.push(boolVal(dto.emailEnabled)); }
      if (dto.pushEnabled !== undefined) { fields.push('push_enabled = ?'); params.push(boolVal(dto.pushEnabled)); }
      if (dto.lowStockAlerts !== undefined) { fields.push('low_stock_alerts = ?'); params.push(boolVal(dto.lowStockAlerts)); }
      if (dto.paymentDueAlerts !== undefined) { fields.push('payment_due_alerts = ?'); params.push(boolVal(dto.paymentDueAlerts)); }
      if (dto.systemAlerts !== undefined) { fields.push('system_alerts = ?'); params.push(boolVal(dto.systemAlerts)); }

      if (fields.length > 0) {
        fields.push('updated_at = CURRENT_TIMESTAMP');
        params.push(userId);
        this.db.run(`UPDATE notification_preferences SET ${fields.join(', ')} WHERE user_id = ?`, params);
      }
    } else {
      const id = `np_${Date.now().toString().slice(-6)}`;
      this.db.run(`
        INSERT INTO notification_preferences (id, user_id, email_enabled, push_enabled, low_stock_alerts, payment_due_alerts, system_alerts)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        id, userId,
        boolVal(dto.emailEnabled),
        boolVal(dto.pushEnabled),
        boolVal(dto.lowStockAlerts),
        boolVal(dto.paymentDueAlerts),
        boolVal(dto.systemAlerts),
      ]);
    }

    return this.getPreferences(userId)!;
  }

  public getDefaultPreferences(): UpdateNotificationPreferencesDTO {
    return {
      emailEnabled: false,
      pushEnabled: true,
      lowStockAlerts: true,
      paymentDueAlerts: true,
      systemAlerts: true,
    };
  }
}