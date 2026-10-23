const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');

// Keep application data in the OS-standard roaming profile. This is always
// writable, even when the app itself is installed under Program Files.
const APP_DATA_DIR = path.join(app.getPath('appData'), 'CeramiSysERP');
app.setPath('userData', APP_DATA_DIR);
const DATA_DIR = path.join(APP_DATA_DIR, 'data');
const BACKUP_DIR = path.join(APP_DATA_DIR, 'backups');
const DB_FILE = path.join(DATA_DIR, 'ceramisys.sqlite');

app.disableHardwareAcceleration();

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

function ensureDirs() {
  fsSync.mkdirSync(DATA_DIR, { recursive: true });
  fsSync.mkdirSync(BACKUP_DIR, { recursive: true });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 600,
    title: 'CeramiSys ERP - نظام إدارة معرض السيراميك ومواد التشطيب',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  if (!app.isPackaged) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173');
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  win.maximize();
}

// ─── Database persistence (real file on disk instead of localStorage) ────────
ipcMain.handle('db:load', async () => {
  try {
    ensureDirs();
    if (!fsSync.existsSync(DB_FILE)) return null;
    const buffer = await fs.readFile(DB_FILE);
    return new Uint8Array(buffer);
  } catch (error) {
    console.error('Failed to load database file:', error);
    return null;
  }
});

ipcMain.handle('db:save', async (_event, bytes) => {
  try {
    ensureDirs();
    const data = Buffer.from(bytes);
    const tmp = `${DB_FILE}.tmp`;
    await fs.writeFile(tmp, data);
    await fs.rename(tmp, DB_FILE);
    return { ok: true, path: DB_FILE, bytes: data.length };
  } catch (error) {
    console.error('Failed to save database file:', error);
    return { ok: false, error: error.message || String(error) };
  }
});

ipcMain.handle('db:backup', async (_event, label) => {
  try {
    ensureDirs();
    if (!fsSync.existsSync(DB_FILE)) return { ok: false, error: 'قاعدة البيانات غير موجودة بعد' };
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeLabel = String(label || 'manual').replace(/[^a-zA-Z0-9_-]/g, '-');
    const target = path.join(BACKUP_DIR, `ceramisys_${safeLabel}_${stamp}.sqlite`);
    await fs.copyFile(DB_FILE, target);
    const stat = await fs.stat(target);
    return { ok: true, path: target, bytes: stat.size };
  } catch (error) {
    console.error('Failed to create backup:', error);
    return { ok: false, error: error.message || String(error) };
  }
});

ipcMain.handle('db:info', async () => {
  try {
    ensureDirs();
    const exists = fsSync.existsSync(DB_FILE);
    const stat = exists ? await fs.stat(DB_FILE) : null;
    return { path: DB_FILE, exists, bytes: stat ? stat.size : 0, backupDir: BACKUP_DIR };
  } catch (error) {
    return { path: DB_FILE, exists: false, bytes: 0, backupDir: BACKUP_DIR, error: String(error) };
  }
});

ipcMain.handle('app:info', async () => ({
  version: app.getVersion(),
  packaged: app.isPackaged,
  dataDir: APP_DATA_DIR,
  backupDir: BACKUP_DIR,
}));

ipcMain.handle('app:openFolder', async (_event, target) => {
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
ipcMain.handle('export:pdf', async (_event, { html, fileName, landscape }) => {
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

app.whenReady().then(() => {
  ensureDirs();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
