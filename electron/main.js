const { app, BrowserWindow, ipcMain, dialog, shell, safeStorage, session } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');
const { registerPrintingHandlers } = require('./printing');
const { registerDatabaseHandlers } = require('./databaseHandlers');
const { registerAppHandlers } = require('./appHandlers');
const { registerDocumentHandlers } = require('./documentHandlers');
const { isAllowedAppUrl, isAllowedIpcSender } = require('./security');
const { installGracefulClose } = require('./gracefulShutdown');

// Keep application data in the OS-standard roaming profile. This is always
// writable, even when the app itself is installed under Program Files.
// End-to-end tests point CERAMISYS_USER_DATA_DIR at a throwaway folder so a
// test run never touches a real installation's data.
const APP_DATA_DIR = process.env.CERAMISYS_USER_DATA_DIR
  ? path.resolve(process.env.CERAMISYS_USER_DATA_DIR)
  : path.join(app.getPath('appData'), 'CeramiSysERP');
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

  installGracefulClose({
    win,
    ipcMain,
    dialog,
    validateIpcSender,
  });

  if (!app.isPackaged) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173');
    if (!process.env.CERAMISYS_E2E) win.webContents.openDevTools();
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
registerDocumentHandlers({
  ipcMain, validateIpcSender, path, fs, fsSync, shell, dialog, appDataDir: APP_DATA_DIR,
});
registerPrintingHandlers({ ipcMain, validateIpcSender, appDataDir: APP_DATA_DIR, MAX_PRINT_DATA });

// ─── Offline guard ───────────────────────────────────────────────────────────
// The product is delivered for a single machine with no Internet access. Any
// renderer request that tries to leave the machine is cancelled so a missing
// connection can never stall the UI or leak data. The Vite dev server is the
// only permitted HTTP(S) target, and only while running unpackaged.
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function installOfflineNetworkGuard(ses) {
  ses.webRequest.onBeforeRequest((details, callback) => {
    try {
      const url = new URL(details.url);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        const isDevServer = !app.isPackaged && LOOPBACK_HOSTS.has(url.hostname);
        if (!isDevServer) {
          console.warn(`Offline guard: blocked outbound request to ${url.origin}${url.pathname}`);
          callback({ cancel: true });
          return;
        }
      }
    } catch {
      // Unparsable URLs are left to Chromium.
    }
    callback({});
  });
}

app.whenReady().then(() => {
  ensureDirs();
  installOfflineNetworkGuard(session.defaultSession);
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
