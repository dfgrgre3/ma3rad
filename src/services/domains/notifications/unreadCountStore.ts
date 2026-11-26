import { NotificationService } from './NotificationService';

/**
 * Shared unread-notification counter. The value is refreshed from the
 * database whenever the notification bus reports a change (new notification,
 * read, delete) and on a slow interval as a safety net for writes that come
 * from outside this process (sync worker, central poller).
 */
let count = 0;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

export function getUnreadNotificationCount(): number {
  return count;
}

export function setUnreadNotificationCount(next: number): void {
  const normalized = Number.isFinite(next) && next > 0 ? Math.floor(next) : 0;
  if (normalized === count) return;
  count = normalized;
  for (const listener of [...listeners]) {
    try { listener(); } catch { /* ignore */ }
  }
}

export function subscribeUnreadNotifications(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function refreshUnreadNotifications(userId?: string): void {
  try {
    setUnreadNotificationCount(new NotificationService().getUnreadCount(userId));
  } catch {
    // Database not ready yet — the next change/interval tick retries.
  }
}

/** Coalesced refresh used by high-frequency bus events (bulk scheduled checks). */
export function scheduleUnreadNotificationsRefresh(userId?: string): void {
  if (refreshTimer !== null) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    refreshUnreadNotifications(userId);
  }, 200);
}
