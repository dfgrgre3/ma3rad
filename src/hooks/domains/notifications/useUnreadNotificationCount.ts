import { useEffect, useSyncExternalStore } from 'react';
import {
  getUnreadNotificationCount,
  refreshUnreadNotifications,
  scheduleUnreadNotificationsRefresh,
  subscribeUnreadNotifications,
} from '../../../services/domains/notifications/unreadCountStore';
import { notificationBus } from '../../../services/domains/notifications/notificationBus';

/**
 * Live unread-notification count for the header badge. Updates instantly when
 * any service writes/reads a notification (via notificationBus) and keeps a
 * 30s polling fallback for changes arriving from outside the renderer
 * (branch sync, central-server poller).
 */
export function useUnreadNotificationCount(userId?: string): number {
  const count = useSyncExternalStore(
    subscribeUnreadNotifications,
    getUnreadNotificationCount,
    getUnreadNotificationCount
  );

  useEffect(() => {
    refreshUnreadNotifications(userId);
    const offChanged = notificationBus.onChanged(() => scheduleUnreadNotificationsRefresh(userId));
    const timer = window.setInterval(() => refreshUnreadNotifications(userId), 30_000);
    return () => {
      offChanged();
      window.clearInterval(timer);
    };
  }, [userId]);

  return count;
}
