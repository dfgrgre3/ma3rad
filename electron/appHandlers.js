const officeCrypto = require('officecrypto-tool');

const OLE_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b]);
const MAX_XLSX_BACKUP_SIZE = 700 * 1024 * 1024;

function toOfficeFileBuffer(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > MAX_XLSX_BACKUP_SIZE) {
    throw new Error('حجم ملف XLSX فارغ أو يتجاوز الحد المسموح.');
  }
  return Buffer.from(bytes);
}

function hasSignature(bytes, signature) {
  return bytes.length >= signature.length && signature.every((byte, index) => bytes[index] === byte);
}

function registerAppHandlers({
  ipcMain, validateIpcSender, app, path, fs, shell, dialog, BrowserWindow,
  appDataDir, DATA_DIR, BACKUP_DIR, ensureDirs,
}) {
  ipcMain.handle('db:encrypt-xlsx-backup', async (event, bytes, password) => {
    validateIpcSender(event);
    const workbook = toOfficeFileBuffer(bytes);
    if (!hasSignature(workbook, ZIP_SIGNATURE)) {
      throw new Error('محتوى ملف النسخة ليس مصنف XLSX صالحًا.');
    }
    if (typeof password !== 'string' || password.length < 12 || password.length > 255) {
      throw new Error('يجب أن تتراوح كلمة مرور ملف XLSX بين 12 و255 حرفًا.');
    }
    return new Uint8Array(officeCrypto.encrypt(workbook, { password }));
  });

  ipcMain.handle('db:decrypt-xlsx-backup', async (event, bytes, password) => {
    validateIpcSender(event);
    const encrypted = toOfficeFileBuffer(bytes);
    if (!hasSignature(encrypted, OLE_SIGNATURE)) {
      throw new Error('الملف ليس نسخة XLSX مشفرة.');
    }
    if (typeof password !== 'string' || !password || password.length > 255) {
      throw new Error('كلمة مرور ملف XLSX غير صالحة.');
    }
    try {
      if (!officeCrypto.isEncrypted(encrypted)) throw new Error('الملف ليس نسخة XLSX مشفرة.');
      const workbook = await officeCrypto.decrypt(encrypted, { password });
      if (!hasSignature(workbook, ZIP_SIGNATURE)) {
        throw new Error('محتوى الملف بعد فك التشفير ليس مصنف XLSX صالحًا.');
      }
      return new Uint8Array(workbook);
    } catch (error) {
      if (error instanceof Error && error.message === 'الملف ليس نسخة XLSX مشفرة.') throw error;
      if (error instanceof Error && error.message === 'محتوى الملف بعد فك التشفير ليس مصنف XLSX صالحًا.') throw error;
      if (error instanceof Error && error.message === 'The password is incorrect') {
        throw new Error('كلمة المرور غير صحيحة أو ملف XLSX تالف.');
      }
      throw new Error(`تعذر فك تشفير ملف XLSX: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

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
