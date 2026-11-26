import React, { useEffect, useRef } from 'react';
import { useToast } from '../ui/Toast';
import { notificationBus } from '../../services/domains/notifications/notificationBus';
import type { NotificationCreatedPayload } from '../../services/domains/notifications/notificationBus';
import { showSystemNotification } from '../../utils/shared/systemNotification';
import type { User } from '../../types';
import type { ToastKind } from '../ui/Toast_part01';

const BURST_WINDOW_MS = 1200;
const BURST_TOAST_THRESHOLD = 3;

function toastKindFor(type: string): ToastKind {
  if (/(LOW_STOCK|STOCK_ALERT|PAYMENT_DUE|EXPIRING|EXPIRED|OVERDUE|DUE)/.test(type)) return 'warning';
  if (/(CLONE|CRITICAL|SECURITY|AUDIT_|SUSPENDED|FAILED|DENIED)/.test(type)) return 'error';
  if (/(INVOICE_CREATED|EXPENSE_RECORDED|SYNC_APPROVAL$)/.test(type)) return 'success';
  return 'info';
}

function windowFocused(): boolean {
  try {
    return typeof document !== 'undefined' && !document.hidden && document.hasFocus();
  } catch {
    return true;
  }
}

/**
 * Global notification surface: turns every persisted notification — no matter
 * which module created it — into an instant in-app toast plus an OS-level
 * notification when the window is not focused.
 *
 * Scheduled checks can create dozens of rows in one pass, so events are
 * coalesced into a short burst window: a handful show individually, larger
 * bursts collapse into a single summary toast.
 */
export const NotificationCenter: React.FC<{ currentUser?: User | null }> = ({ currentUser }) => {
  const toast = useToast();
  const userIdRef = useRef<string | undefined>(currentUser?.id);
  userIdRef.current = currentUser?.id;
  const burstRef = useRef<NotificationCreatedPayload[]>([]);
  const burstTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const flushBurst = () => {
      burstTimerRef.current = null;
      const items = burstRef.current;
      burstRef.current = [];
      if (!items.length) return;

      if (items.length === 1) {
        const item = items[0];
        toast.show(toastKindFor(String(item.type)), item.title, item.message || undefined);
        if (!windowFocused()) void showSystemNotification(item.title, item.message);
        return;
      }

      if (items.length <= BURST_TOAST_THRESHOLD) {
        for (const item of items) {
          toast.show(toastKindFor(String(item.type)), item.title, item.message || undefined);
        }
        const first = items[0];
        if (!windowFocused()) void showSystemNotification(`لديك ${items.length} إشعارات جديدة`, first?.title);
        return;
      }

      toast.info('إشعارات جديدة', `لديك ${items.length} إشعارات جديدة — راجع مركز الإشعارات.`);
      if (!windowFocused()) {
        void showSystemNotification(`لديك ${items.length} إشعارات جديدة`, items[0]?.title);
      }
    };

    const offCreated = notificationBus.onCreated((payload) => {
      // Targeted notifications only surface for their recipient; broadcast
      // notifications (user_id NULL) reach every signed-in user.
      const uid = userIdRef.current;
      if (!uid) return;
      if (payload.userId && payload.userId !== uid) return;
      burstRef.current.push(payload);
      if (burstTimerRef.current === null) {
        burstTimerRef.current = setTimeout(flushBurst, BURST_WINDOW_MS);
      }
    });

    return () => {
      offCreated();
      if (burstTimerRef.current !== null) {
        clearTimeout(burstTimerRef.current);
        burstTimerRef.current = null;
      }
      burstRef.current = [];
    };
  }, [toast]);

  return null;
};
