function registerAppHandlers({
  ipcMain, validateIpcSender, app, path, fs, shell, dialog, BrowserWindow,
  appDataDir, DATA_DIR, BACKUP_DIR, ensureDirs,
}) {
  ipcMain.handle('app:info', async (event) => {
    validateIpcSender(event);
    return {
      version: app.getVersion(),
      packaged: app.isPackaged,
      dataDir: appDataDir,
      backupDir: BACKUP_DIR,
    };
  });

  // Full application restart. The renderer flushes the SQLite snapshot to disk
  // before calling this, so a relaunch never loses the newest writes.
  ipcMain.handle('app:relaunch', async (event) => {
    validateIpcSender(event);
    app.relaunch();
    app.exit(0);
    return { ok: true };
  });

  ipcMain.handle('app:openFolder', async (event, target) => {
    validateIpcSender(event);
    try {
      const resolved = target === 'backups' ? BACKUP_DIR : DATA_DIR;
      ensureDirs();
      await shell.openPath(resolved);
      return { ok: true, path: resolved };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  });

  // ─── PDF export ───────────────────────────────────────────────────────────────
  ipcMain.handle('export:pdf', async (event, { html, fileName, landscape }) => {
    validateIpcSender(event);
    if (typeof html !== 'string' || html.length > 20 * 1024 * 1024) {
      throw new Error('محتوى المستند غير صالح أو يتجاوز الحد المسموح به للطباعة والتصدير.');
    }
    const renderer = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
    });

    try {
      await renderer.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(String(html || '')));
      const pdf = await renderer.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        landscape: Boolean(landscape),
        margins: { marginType: 'default' }
      });

      const safeName = String(fileName || 'document').replace(/[\\/:*?"<>|]/g, '-');
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: 'حفظ الملف بصيغة PDF',
        defaultPath: `${safeName}.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      });

      if (canceled || !filePath) return null;
      await fs.writeFile(filePath, pdf);
      return filePath;
    } catch (error) {
      console.error('PDF export failed:', error);
      return null;
    } finally {
      renderer.destroy();
    }
  });

  // ─── Direct / ESC-POS thermal printing ────────────────────────────────────────
}

module.exports = { registerAppHandlers };
