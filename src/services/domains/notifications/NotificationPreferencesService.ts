import { DatabaseManager } from '../../../database/repositories/databaseManager';
import type { NotificationPreference, UpdateNotificationPreferencesDTO } from '../../../types';
import { AuthService } from '../auth/AuthService';
import { v4 as uuidv4 } from 'uuid';

export class NotificationPreferencesService {
  private db = DatabaseManager.getInstance();

  /** Preferences are self-service; callers cannot read another user's settings. */
  public getPreferences(): NotificationPreference | null {
    const actor = AuthService.requireAuth();
    const row = this.db.query<any>(
      'SELECT * FROM notification_preferences WHERE user_id = ?',
      [actor.id]
    )[0];
    if (!row) return null;
    return {
      ...row,
      emailEnabled: Boolean(row.emailEnabled),
      pushEnabled: Boolean(row.pushEnabled),
      lowStockAlerts: Boolean(row.lowStockAlerts),
      paymentDueAlerts: Boolean(row.paymentDueAlerts),
      systemAlerts: Boolean(row.systemAlerts),
    };
  }

  public updatePreferences(dto: UpdateNotificationPreferencesDTO): NotificationPreference {
    const actor = AuthService.requireAuth();
    const current = this.getPreferences() || this.getDefaultPreferences();
    const next = { ...current, ...dto };
    this.db.run(`
      INSERT INTO notification_preferences
        (id, user_id, email_enabled, push_enabled, low_stock_alerts, payment_due_alerts, system_alerts)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        email_enabled = excluded.email_enabled,
        push_enabled = excluded.push_enabled,
        low_stock_alerts = excluded.low_stock_alerts,
        payment_due_alerts = excluded.payment_due_alerts,
        system_alerts = excluded.system_alerts
    `, [
      `np_${uuidv4().slice(0, 12)}`,
      actor.id,
      next.emailEnabled ? 1 : 0,
      next.pushEnabled ? 1 : 0,
      next.lowStockAlerts ? 1 : 0,
      next.paymentDueAlerts ? 1 : 0,
      next.systemAlerts ? 1 : 0,
    ]);
    return this.getPreferences()!;
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
