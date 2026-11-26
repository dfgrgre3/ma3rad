/**
 * Shows an OS-level notification (Windows toast / Chromium notification).
 * Prefers the Electron bridge which uses the native Notification API in the
 * main process; falls back to the Web Notifications API in browsers.
 */
export async function showSystemNotification(title: string, body?: string): Promise<void> {
  const safeTitle = String(title || 'سيراميسيس').slice(0, 200);
  const safeBody = body ? String(body).slice(0, 1000) : undefined;

  try {
    const bridge = typeof window !== 'undefined' ? window.ceramisys?.notifications?.show : undefined;
    if (bridge) {
      const result = await bridge({ title: safeTitle, body: safeBody });
      if (result?.ok) return;
    }
  } catch {
    // Bridge unavailable — try the Web Notifications API.
  }

  try {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'default') {
      await Notification.requestPermission();
    }
    if (Notification.permission === 'granted') {
      new Notification(safeTitle, { body: safeBody, silent: false });
    }
  } catch {
    // Notifications unsupported or blocked — in-app toast already covers this.
  }
}
