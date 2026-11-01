import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/db.ts';
import { AuthService } from '../src/services/AuthService.ts';
import { NotificationPreferencesService } from '../src/services/NotificationPreferencesService.ts';
import { NotificationService } from '../src/services/NotificationService.ts';

test('notification preferences are self-service and filter in-app notifications', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  AuthService.login('admin', 'admin123');
  const userId = AuthService.requireAuth().id;
  db.run('DELETE FROM notifications WHERE user_id = ?', [userId]);

  const preferences = new NotificationPreferencesService();
  assert.equal(preferences.getPreferences(), null);
  const saved = preferences.updatePreferences({
    lowStockAlerts: false,
    paymentDueAlerts: true,
    systemAlerts: false,
  });
  assert.equal(saved.lowStockAlerts, false);
  assert.equal(saved.paymentDueAlerts, true);
  assert.equal(saved.systemAlerts, false);

  const notifications = new NotificationService();
  notifications.createNotification('LOW_STOCK', 'low', 'low stock', userId);
  notifications.createNotification('PAYMENT_DUE', 'due', 'payment due', userId);
  notifications.createNotification('SYSTEM', 'system', 'system update', userId);

  assert.deepEqual(notifications.getNotifications(userId).map((row) => row.type), ['PAYMENT_DUE']);
  assert.equal(notifications.getUnreadCount(userId), 1);
});
