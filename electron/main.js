const { app, BrowserWindow, ipcMain, dialog, shell, safeStorage, session } = require('electron');
const path = require('path');
const os = require('node:os');
const fs = require('fs/promises');
const fsSync = require('fs');
const { randomBytes } = require('node:crypto');
const { createFileLogger, registerProcessErrorHandlers } = require('./diagnostics');

// Show all Chromium/Electron diagnostics in the terminal when running from CLI.
try { app.commandLine.appendSwitch('enable-logging'); } catch { /* app may be unavailable */ }
const safeStorageCompat = require('./safeStorageCompat');
const { registerPrintingHandlers } = require('./printing');
const { registerDatabaseHandlers } = require('./databaseHandlers');
const { registerAppHandlers } = require('./appHandlers');
const { registerDocumentHandlers } = require('./documentHandlers');
const { isAllowedAppUrl, isAllowedIpcSender, openExternalUrl } = require('./security');
const { installGracefulClose } = require('./gracefulShutdown');
const { createHttpSyncClient, createSyncRelay } = require('./syncRelay');
const { resolveCentralRequest, sanitizeCentralHeaders } = require('./centralApi');
const {
  loadSyncClientConfig,
  registerSyncClientConfigHandlers,
} = require('./syncClientConfig');
const tailscaleService = require('./tailscaleService');
const { registerLicenseHandlers } = require('./licenseGuard');
const { configureAutoUpdater, createRollbackBackup } = require('./autoUpdater');

// ───────────────────────────── Environment ────────────────────────────────────
//   LICENSE_MODE=account|hardwa   (default: hardwa)
//     "account"  -> slots are bound to the licensed account + credential only.
//                  A fresh machine activates with EDAR code + account and runs
//                  on any hardware that has the credential.
//     "hardwa"   -> existing behaviour: license is bound to this machine's
//                  hardware fingerprint (getHardwareId). Use this only when
//                  your license is issued per device.
//                 Override with the process environment (set in the target) and
//                 do not rely on .env for shipped builds: process.env is not
//                 guaranteed to be backed by a file in production.
//   CERAMISYS_USER_DATA_DIR  -> absolute path for the application data folder.
//   CENTRAL_API_URL          -> central platform base URL.
// ─────────────────────────────────────────────────────────────────────────────
let LICENSE_MODE = process.env.LICENSE_MODE || 'hardwa';
LICENSE_MODE = String(LICENSE_MODE).trim().toLowerCase();
if (LICENSE_MODE !== 'account' && LICENSE_MODE !== 'hardwa') {
  LICENSE_MODE = 'hardwa';
}
console.info(`[init] LICENSE_MODE=${LICENSE_MODE}`);

// Load the documented local .env file for development launches. Explicit
// process environment values take precedence; packaged deployments can set the
// same variables in the process environment.
try {
  const envFile = fsSync.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
  for (const line of envFile.split(/\r?\n/)) {
    const match = line.match(/^\s*(CENTRAL_API_URL|CERAMISYS_USER_DATA_DIR|VITE_DEV_SERVER_URL)\s*=\s*(.*?)\s*$/);
    if (!match || process.env[match[1]]) continue;
    const value = match[2].replace(/^(['"])(.*)\1$/, '$2');
    process.env[match[1]] = value;
  }
} catch { /* .env is optional */ }

// Keep application data in the OS-standard roaming profile. This is always
// writable, even when the app itself is installed under Program Files.
// End-to-end tests point CERAMISYS_USER_DATA_DIR at a throwaway folder so a
// test run never touches a real installation's data.
const configuredDataDir = process.env.CERAMISYS_USER_DATA_DIR;
if (configuredDataDir && !path.isAbsolute(configuredDataDir)) {
  console.warn('CERAMISYS_USER_DATA_DIR must be an absolute path; using the OS application data directory.');
}
const APP_DATA_DIR = configuredDataDir && path.isAbsolute(configuredDataDir)
  ? path.resolve(process.env.CERAMISYS_USER_DATA_DIR)
  : path.join(app.getPath('appData'), 'CeramiSysERP');
app.setPath('userData', APP_DATA_DIR);
function isIsolatedE2ERun() {
  if (process.env.CERAMISYS_E2E !== '1' || !configuredDataDir || !path.isAbsolute(configuredDataDir)) {
    return false;
  }
  try {
    if (!fsSync.existsSync(configuredDataDir)) return false;
    const tempRoot = fsSync.realpathSync(os.tmpdir());
    const dataDir = fsSync.realpathSync(configuredDataDir);
    const relative = path.relative(tempRoot, dataDir);
    return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`)
      && !path.isAbsolute(relative) && path.basename(dataDir).startsWith('ceramisys-e2e-');
  } catch (error) {
    console.warn('Could not verify isolated E2E data directory; enforcing the single-instance lock.', error);
    return false;
  }
}
const isE2EIsolated = isIsolatedE2ERun();
if (process.env.CERAMISYS_E2E && !isE2EIsolated) {
  console.warn('CERAMISYS_E2E was ignored because CERAMISYS_USER_DATA_DIR is not an isolated temporary directory.');
}
const logger = createFileLogger({
  fs: fsSync,
  path,
  logDirectory: path.join(APP_DATA_DIR, 'logs'),
});
logger.installConsole();
logger.write('info', 'Application diagnostics initialized');
registerProcessErrorHandlers(process, app, logger);
const DATA_DIR = path.join(APP_DATA_DIR, 'data');
const BACKUP_DIR = path.join(APP_DATA_DIR, 'backups');
const DB_FILE = path.join(DATA_DIR, 'ceramisys.sqlite');
const REMEMBERED_CREDENTIALS_FILE = path.join(APP_DATA_DIR, 'remembered-login.enc');

// Security: Anti-debugging & inspection switches
const dangerousSwitches = ['--inspect', '--inspect-brk', '--remote-debugging-port'];
if (app.isPackaged && dangerousSwitches.some(sw => process.argv.some(arg => arg.startsWith(sw)))) {
  app.quit();
}

app.disableHardwareAcceleration();

// تحسينات استهلاك الموارد للأجهزة الضعيفة والقديمة (Low-spec optimizations)
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=512');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

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

ipcMain.handle('diagnostics:renderer-error', (event, report) => {
  validateIpcSender(event);
  if (!report || typeof report !== 'object') throw new Error('Invalid renderer error report.');
  const kind = typeof report.kind === 'string' ? report.kind.slice(0, 80) : 'renderer-error';
  const message = typeof report.message === 'string' ? report.message.slice(0, 4000) : 'Unknown renderer error';
  const stack = typeof report.stack === 'string' ? report.stack.slice(0, 12000) : '';
  logger.write('error', `[renderer:${kind}] ${message}`, stack);
  return { ok: true };
});

// Security: Validate data size limits
const MAX_DB_SIZE = 500 * 1024 * 1024; // 500MB
const MAX_PRINT_DATA = 10 * 1024 * 1024; // 10MB for print data
let syncClient = null;
let activeSyncClientConfig = null;
let syncClientConfigSource = 'none';
let syncRelay = null;
let syncStartupError = null;
let restartAfterGracefulClose = false;
let pendingUpdateInstall = false;
let updateController = null;

// E2E runs use isolated temporary data directories and may launch multiple
// Electron instances sequentially in one worker. Keep the production single-
// instance guarantee, but do not let a stale test process block the next case.
const gotLock = isE2EIsolated ? true : app.requestSingleInstanceLock();
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
    title: 'سيراميسيس - نظام إدارة معرض السيراميك ومواد التشطيب',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false
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
    if (url === 'about:blank') {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          webPreferences: {
            preload: path.join(__dirname, 'print-preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webSecurity: true,
            allowRunningInsecureContent: false,
          },
        },
      };
    }
    openExternalUrl(shell, url);
    return { action: 'deny' };
  });

  installGracefulClose({
    win,
    ipcMain,
    dialog,
    validateIpcSender,
    onApprovedClose: async () => {
      if (pendingUpdateInstall) {
        const backupPath = await createRollbackBackup({
          fs, path, dbFile: DB_FILE, backupDir: BACKUP_DIR, version: app.getVersion(),
        });
        console.info(`[updater] Created encrypted rollback backup: ${backupPath}`);
        if (!updateController?.installNow()) {
          console.error('[updater] Downloaded update was not ready after graceful shutdown.');
          throw new Error('The downloaded update is no longer ready to install.');
        }
        pendingUpdateInstall = false;
        return;
      }
      if (!restartAfterGracefulClose) return;
      restartAfterGracefulClose = false;
      app.relaunch();
    },
    onCancelledClose: () => {
      restartAfterGracefulClose = false;
      pendingUpdateInstall = false;
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (!app.isPackaged && devServerUrl) {
    win.loadURL(devServerUrl);
    if (!isE2EIsolated) win.webContents.openDevTools();
  } else {
    win.loadFile(APP_HTML_PATH);
  }

  // Security: DevTools protection in production
  win.webContents.on('devtools-opened', () => {
    if (app.isPackaged) {
      win.webContents.closeDevTools();
    }
  });

  win.webContents.on('before-input-event', (event, input) => {
    if (app.isPackaged) {
      const isDevKey = input.key === 'F12' ||
        (input.control && input.shift && ['I', 'J', 'C', 'i', 'j', 'c'].includes(input.key)) ||
        (input.control && ['u', 'U', 'r', 'R'].includes(input.key)) ||
        input.key === 'F5';
      if (isDevKey) {
        event.preventDefault();
      }
    }
  });

    // Security: Prevent webview attachment
  win.webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
    console.warn('Security: Prevented webview attachment');
  });

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
  requestGracefulRestart: () => {
    const [win] = BrowserWindow.getAllWindows();
    if (!win) {
      app.relaunch();
      app.quit();
      return;
    }
    restartAfterGracefulClose = true;
    win.close();
  },
});
registerDocumentHandlers({
  ipcMain, validateIpcSender, path, fs, fsSync, shell, dialog, appDataDir: APP_DATA_DIR,
});
registerPrintingHandlers({ ipcMain, validateIpcSender, appDataDir: APP_DATA_DIR, MAX_PRINT_DATA });
registerLicenseHandlers({
  ipcMain,
  validateIpcSender,
  appDataDir: APP_DATA_DIR,
  licenseMode: LICENSE_MODE,
});

const { FileIntegrityChecker } = require('./security/fileIntegrity');
const integrityChecker = new FileIntegrityChecker(path.join(__dirname, '..'));
const PRELOAD_INTEGRITY_SHA256 = 'cd420a4bc152972704afa97cc5c39d1ad851c60b1e16f5d19f529caa778be599';
ipcMain.handle('security:check-integrity', async (event) => {
  validateIpcSender(event);
  return integrityChecker.verifyManifest({
    'electron/preload.js': PRELOAD_INTEGRITY_SHA256,
  });
});
registerSyncClientConfigHandlers({
  ipcMain,
  validateIpcSender,
  appDataDir: APP_DATA_DIR,
  fs,
  path,
  safeStorage,
});

async function loadOrCreateSyncJournalKey() {
  if (!(await safeStorageCompat.isEncryptionAvailable(safeStorage))) {
    throw new Error('OS secure storage is unavailable; the sync journal cannot be opened safely.');
  }
  const keyPath = path.join(APP_DATA_DIR, 'sync-journal-key.enc');
  const readKey = async () => {
    const encrypted = await fs.readFile(keyPath);
    const key = Buffer.from(await safeStorageCompat.decryptString(safeStorage, encrypted), 'base64');
    if (key.length !== 32) throw new Error('The stored sync journal encryption key is invalid.');
    return key;
  };
  try {
    return await readKey();
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error(`Could not read the sync journal key: ${error.message || error}`);
  }

  const key = randomBytes(32);
  const encrypted = await safeStorageCompat.encryptString(safeStorage, key.toString('base64'));
  try {
    await fs.writeFile(keyPath, encrypted, { flag: 'wx', mode: 0o600 });
    return key;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    return readKey();
  }
}

async function initializeSync() {
  const environmentConfig = {
    url: process.env.CERAMISYS_SYNC_URL,
    token: process.env.CERAMISYS_SYNC_TOKEN,
    tenantId: process.env.CERAMISYS_SYNC_TENANT_ID,
    branchId: process.env.CERAMISYS_SYNC_BRANCH_ID,
    deviceId: process.env.CERAMISYS_SYNC_DEVICE_ID,
    canManagePolicies: process.env.CERAMISYS_SYNC_POLICY_AUTHORITY === 'true',
  };
  const requiredClientConfig = [
    environmentConfig.url,
    environmentConfig.token,
    environmentConfig.tenantId,
    environmentConfig.branchId,
    environmentConfig.deviceId,
  ];
  const configuredClientFields = requiredClientConfig.filter(Boolean).length;
  const storedConfig = await loadSyncClientConfig({
    appDataDir: APP_DATA_DIR,
    fs,
    path,
    safeStorage,
  });
  if (storedConfig) {
    activeSyncClientConfig = storedConfig;
    syncClientConfigSource = 'secure-storage';
    syncClient = createHttpSyncClient(activeSyncClientConfig);
  } else if (configuredClientFields > 0) {
    if (configuredClientFields !== requiredClientConfig.length) {
      throw new Error('All CERAMISYS_SYNC_* client settings must be provided together.');
    }
    activeSyncClientConfig = environmentConfig;
    syncClientConfigSource = 'environment';
    syncClient = createHttpSyncClient(activeSyncClientConfig);
  }

  const configuredClients = process.env.CERAMISYS_SYNC_CLIENTS;
  if (configuredClients) {
    let clients;
    try {
      clients = JSON.parse(configuredClients);
    } catch (error) {
      throw new Error(`CERAMISYS_SYNC_CLIENTS is not valid JSON: ${error.message}`);
    }
    syncRelay = createSyncRelay({
      journalPath: path.join(DATA_DIR, 'sync', 'events.jsonl'),
      encryptionKey: await loadOrCreateSyncJournalKey(),
      host: process.env.CERAMISYS_SYNC_HOST || '127.0.0.1',
      port: process.env.CERAMISYS_SYNC_PORT ? Number(process.env.CERAMISYS_SYNC_PORT) : 47821,
      clients,
      tlsCertPath: process.env.CERAMISYS_SYNC_TLS_CERT
        ? path.resolve(process.env.CERAMISYS_SYNC_TLS_CERT)
        : undefined,
      tlsKeyPath: process.env.CERAMISYS_SYNC_TLS_KEY
        ? path.resolve(process.env.CERAMISYS_SYNC_TLS_KEY)
        : undefined,
    });
  }
}

ipcMain.handle('sync:status', async (event) => {
  validateIpcSender(event);
  return {
    clientConfigured: Boolean(syncClient),
    clientIdentity: syncClient ? {
      tenantId: activeSyncClientConfig.tenantId,
      branchId: activeSyncClientConfig.branchId,
      deviceId: activeSyncClientConfig.deviceId,
      canManagePolicies: activeSyncClientConfig.canManagePolicies,
    } : null,
    clientConfig: syncClient ? {
      url: activeSyncClientConfig.url,
      tenantId: activeSyncClientConfig.tenantId,
      branchId: activeSyncClientConfig.branchId,
      deviceId: activeSyncClientConfig.deviceId,
      canManagePolicies: activeSyncClientConfig.canManagePolicies,
      tokenConfigured: true,
    } : null,
    clientConfigSource: syncClientConfigSource,
    server: syncRelay?.status() ?? { serverEnabled: false, serverListening: false },
    error: syncStartupError,
  };
});

ipcMain.handle('sync:push', async (event, events) => {
  validateIpcSender(event);
  if (!syncClient) throw new Error('Branch synchronization is not configured.');
  if (!Array.isArray(events) || events.length > 250) throw new Error('Invalid sync event batch.');
  return syncClient.pushEvents(events);
});

ipcMain.handle('sync:pull', async (event, scope, cursor, limit) => {
  validateIpcSender(event);
  if (!syncClient) throw new Error('Branch synchronization is not configured.');
  return syncClient.pullEvents(scope, cursor, limit);
});

ipcMain.handle('tailscale:status', async (event) => {
  validateIpcSender(event);
  return tailscaleService.getStatus();
});

ipcMain.handle('tailscale:connect', async (event, authKey) => {
  validateIpcSender(event);
  return tailscaleService.connect(authKey);
});

ipcMain.handle('tailscale:disconnect', async (event) => {
  validateIpcSender(event);
  return tailscaleService.disconnect();
});

// ─── Offline guard ───────────────────────────────────────────────────────────
// The product is delivered for a single machine with no Internet access. Any
// renderer request that tries to leave the machine is cancelled so a missing
// connection can never stall the UI or leak data. The Vite dev server is the
// only permitted HTTP(S) target, and only while running unpackaged.
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
// Configure this at build/runtime with CENTRAL_API_URL. The renderer cannot
// expand its own network allowlist by changing localStorage.
const CENTRAL_API_URL = (() => {
  try {
    const url = new URL(process.env.CENTRAL_API_URL || '');
    const localDevelopmentUrl = !app.isPackaged && url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !localDevelopmentUrl) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    return url;
  } catch { return null; }
})();

ipcMain.handle('central:request', async (event, request) => {
  validateIpcSender(event);
  if (!CENTRAL_API_URL) throw new Error('Central API is not configured for this application build.');
  const target = resolveCentralRequest(CENTRAL_API_URL.origin, request, !app.isPackaged);
  const method = String(request.method || 'GET').toUpperCase();
  const headers = sanitizeCentralHeaders(request.headers);
  if (method === 'GET' && request.body !== undefined) throw new Error('GET requests cannot include a body.');
  if (request.body !== undefined && (typeof request.body !== 'string' || Buffer.byteLength(request.body, 'utf8') > 256 * 1024)) {
    throw new Error('Central API request body is invalid or too large.');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(target, {
      method,
      headers,
      ...(request.body === undefined ? {} : { body: request.body }),
      signal: controller.signal,
      redirect: 'error',
    });
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > 2 * 1024 * 1024) throw new Error('Central API response is too large.');
    let body = null;
    if (text) {
      try { body = JSON.parse(text); }
      catch { throw new Error('Central API returned a malformed JSON response.'); }
    }
    return { ok: response.ok, status: response.status, body };
  } finally {
    clearTimeout(timeout);
  }
});

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

app.whenReady().then(async () => {
  // Security: Deny all permission requests (camera, mic, etc.)
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => callback(false));

  if (!CENTRAL_API_URL) {
    console.warn('CENTRAL_API_URL is unset or invalid; central API network requests are disabled. Set an HTTPS origin without a path, query, or credentials.');
  }
  ensureDirs();
  installOfflineNetworkGuard(session.defaultSession);
  try {
    await initializeSync();
    if (syncRelay) {
      const address = await syncRelay.start();
      console.info(`Local sync relay listening on ${address.address}:${address.port}`);
    }
  } catch (error) {
    syncStartupError = error instanceof Error ? error.message : String(error);
    console.error('Branch synchronization could not start; the local ERP remains available:', syncStartupError);
  }
  createWindow();
  updateController = configureAutoUpdater({
    app,
    ipcMain,
    validateIpcSender,
    getWindow: () => BrowserWindow.getAllWindows()[0] || null,
    onInstallRequested: () => {
      const [win] = BrowserWindow.getAllWindows();
      if (!win) throw new Error('The application window is not available for a safe update.');
      pendingUpdateInstall = true;
      win.close();
    },
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  if (syncRelay) {
    void syncRelay.close().catch((error) => {
      console.error('Failed to close the local sync relay cleanly:', error);
    });
  }
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
