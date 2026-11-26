'use strict';

const { Notification, BrowserWindow } = require('electron');

/**
 * OS-level notifications for the renderer. The in-app toast layer already
 * covers the focused window; this channel is used when the app is in the
 * background so alerts (low stock, payment due, central notices, ...) still
 * reach the user through the Windows notification center.
 */
function registerNotificationHandlers({ ipcMain, validateIpcSender }) {
  ipcMain.handle('notifications:show', (event, payload) => {
    validateIpcSender(event);
    if (!Notification.isSupported()) return { ok: false, supported: false };

    const title = String(payload?.title || 'سيراميسيس').slice(0, 200);
    const body = payload?.body ? String(payload.body).slice(0, 1000) : '';

    const notification = new Notification({
      title,
      body,
      silent: false,
    });

    notification.on('click', () => {
      const [win] = BrowserWindow.getAllWindows();
      if (!win || win.isDestroyed()) return;
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    });

    notification.show();
    return { ok: true, supported: true };
  });
}

module.exports = { registerNotificationHandlers };
