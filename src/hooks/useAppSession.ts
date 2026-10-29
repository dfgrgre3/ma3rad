import { useEffect } from 'react';
import { AuthService } from '../services/AuthService';
import { SettingsService } from '../services/SettingsService';
import type { User } from '../types';

export function useAppSession(
  dbReady: boolean,
  currentUser: User | null,
  onSessionExpired: () => void
) {
  // Idle timeout
  useEffect(() => {
    if (!currentUser) return;
    let lastActivity = Date.now();
    const bump = () => { lastActivity = Date.now(); };
    const events: Array<keyof WindowEventMap> = ['mousedown', 'keydown', 'touchstart', 'scroll', 'mousemove'];
    events.forEach((event) => window.addEventListener(event, bump, { passive: true }));

    const timer = window.setInterval(() => {
      let limitMinutes = 480;
      try { limitMinutes = SettingsService.getSettings().sessionTimeoutMinutes ?? 480; } catch { /* ignore */ }
      if (!limitMinutes || limitMinutes <= 0) return;
      if (Date.now() - lastActivity >= limitMinutes * 60_000) {
        AuthService.logout();
        onSessionExpired();
      }
    }, 30_000);

    return () => {
      events.forEach((event) => window.removeEventListener(event, bump));
      window.clearInterval(timer);
    };
  }, [currentUser?.id, onSessionExpired]);

  // Scheduled shifts
  useEffect(() => {
    if (!dbReady || !currentUser) return;
    let isChecking = false;
    const checkScheduledShiftClosures = () => {
      if (isChecking) return;
      isChecking = true;
      void import('../services/CashierService')
        .then(({ CashierService }) => {
          const closedShifts = new CashierService().closeScheduledShifts();
          if (closedShifts.length > 0) {
            window.dispatchEvent(new CustomEvent('cash-shift-auto-closed', { detail: closedShifts }));
          }
        })
        .finally(() => { isChecking = false; });
    };
    checkScheduledShiftClosures();
    const timer = window.setInterval(checkScheduledShiftClosures, 30_000);
    return () => window.clearInterval(timer);
  }, [dbReady, currentUser?.id]);

  // Heartbeat & Alerts
  useEffect(() => {
    if (!currentUser) return;
    const heartbeat = window.setInterval(() => AuthService.touchSession(), 5 * 60_000);
    const alerts = window.setInterval(() => {
      void import('../services/NotificationService').then(({ NotificationService }) => {
        try { new NotificationService().runScheduledChecks(); } catch { /* ignore */ }
      });
    }, 30 * 60_000);
    return () => {
      window.clearInterval(heartbeat);
      window.clearInterval(alerts);
    };
  }, [currentUser?.id]);
}
