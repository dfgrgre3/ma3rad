const { app, BrowserWindow, ipcMain, dialog, shell, safeStorage, session } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');
const { registerPrintingHandlers } = require('./printing');
const { registerDatabaseHandlers } = require('./databaseHandlers');
const { registerAppHandlers } = require('./appHandlers');
const { isAllowedAppUrl, isAllowedIpcSender } = require('./security');

// Keep application data in the OS-standard roaming profile. This is always
// writable, even when the app itself is installed under Program Files.
const APP_DATA_DIR = path.join(app.getPath('appData'), 'CeramiSysERP');
app.setPath('userData', APP_DATA_DIR);
const DATA_DIR = path.join(APP_DATA_DIR, 'data');
const BACKUP_DIR = path.join(APP_DATA_DIR, 'backups');
const DB_FILE = path.join(DATA_DIR, 'ceramisys.sqlite');
const REMEMBERED_CREDENTIALS_FILE = path.join(APP_DATA_DIR, 'remembered-login.enc');

app.disableHardwareAcceleration();

// Security: Allowed origins for IPC communication
const ALLOWED_ORIGINS = new Set([
  'http://localhost:5173', // Vite dev server
  'http://127.0.0.1:5173', // Alternative localhost
]);

const APP_HTML_PATH = path.join(__dirname, '../dist/index.html');

// Security: Validate IPC senderFrame
function validateIpcSender(event) {
  if (isAllowedIpcSender(event, {
    isPackaged: app.isPackaged,
    appHtmlPath: APP_HTML_PATH,
    allowedOrigins: ALLOWED_ORIGINS,
  })) {
    return true;
  }

  console.error(`Security: Blocked IPC call from unauthorized senderFrame: ${event?.senderFrame?.url || 'unknown'}`);
  throw new Error('Unauthorized IPC caller');
}

// Security: Validate data size limits
const MAX_DB_SIZE = 500 * 1024 * 1024; // 500MB
const MAX_PRINT_DATA = 10 * 1024 * 1024; // 10MB for print data

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

async function databaseFileExists() {
  try {
    await fs.stat(DB_FILE);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 480,
    minHeight: 560,
    title: 'CeramiSys ERP - نظام إدارة معرض السيراميك ومواد التشطيب',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  // Security: Block internal navigation away from the application
  win.webContents.on('will-navigate', (event, navigationUrl) => {
    if (!isAllowedAppUrl(navigationUrl, {
      isPackaged: app.isPackaged,
      appHtmlPath: APP_HTML_PATH,
      allowedOrigins: ALLOWED_ORIGINS,
    })) {
      event.preventDefault();
      console.warn(`Security: Prevented navigation to ${navigationUrl}`);
    }
  });

  // Security: Prevent arbitrary new windows, open approved external web links in OS browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        shell.openExternal(url);
      }
    } catch {
      // Invalid URL ignored
    }
    return { action: 'deny' };
  });

  // Graceful shutdown: coordinate with renderer to wait for flush() before closing
  let isClosing = false;
  win.on('close', async (event) => {
    if (isClosing) return;
    event.preventDefault();
    isClosing = true;

    try {
      if (!win.isDestroyed() && win.webContents) {
        win.webContents.send('app:before-close');
        const saved = await new Promise((resolve) => {
          const onCloseReady = () => {
            clearTimeout(timeout);
            ipcMain.removeListener('app:close-ready', onCloseReady);
            resolve(true);
          };
          const timeout = setTimeout(() => {
            ipcMain.removeListener('app:close-ready', onCloseReady);
            resolve(false);
          }, 3500);
          ipcMain.once('app:close-ready', onCloseReady);
        });
        if (!saved) {
          isClosing = false;
          return;
        }
      }
    } catch (err) {
      console.error('Graceful shutdown error:', err);
    } finally {
      if (!win.isDestroyed()) {
        win.destroy();
      }
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
registerDatabaseHandlers({
  ipcMain, validateIpcSender, app, path, fs, fsSync, safeStorage,
  APP_DATA_DIR, DATA_DIR, BACKUP_DIR, DB_FILE, REMEMBERED_CREDENTIALS_FILE,
  ensureDirs, databaseFileExists, MAX_DB_SIZE,
});
registerAppHandlers({
  ipcMain, validateIpcSender, app, path, fs, shell, dialog, BrowserWindow,
  appDataDir: APP_DATA_DIR, DATA_DIR, BACKUP_DIR, ensureDirs,
});
registerPrintingHandlers({ ipcMain, validateIpcSender, appDataDir: APP_DATA_DIR, MAX_PRINT_DATA });
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

// Handle graceful shutdown - allow renderer to request controlled close
ipcMain.handle('app:requestShutdown', async (event) => {
  validateIpcSender(event);
  // In a real implementation, this would coordinate with the renderer
  // to ensure all data is flushed before closing
  return { ok: true };
});
