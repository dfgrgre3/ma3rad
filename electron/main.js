const { app, BrowserWindow, ipcMain, dialog, shell, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');
const { execFile } = require('child_process');
const net = require('net');
const lanServer = require('./server');

// Keep application data in the OS-standard roaming profile. This is always
// writable, even when the app itself is installed under Program Files.
const APP_DATA_DIR = path.join(app.getPath('appData'), 'CeramiSysERP');
app.setPath('userData', APP_DATA_DIR);
const DATA_DIR = path.join(APP_DATA_DIR, 'data');
const BACKUP_DIR = path.join(APP_DATA_DIR, 'backups');
const DB_FILE = path.join(DATA_DIR, 'ceramisys.sqlite');
const REMEMBERED_CREDENTIALS_FILE = path.join(APP_DATA_DIR, 'remembered-login.enc');

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

ipcMain.handle('credentials:get', async () => {
  if (!fsSync.existsSync(REMEMBERED_CREDENTIALS_FILE)) return null;
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('التخزين الآمن لكلمات المرور غير متاح على هذا الجهاز.');
  }
  const encrypted = await fs.readFile(REMEMBERED_CREDENTIALS_FILE);
  const credentials = JSON.parse(safeStorage.decryptString(encrypted));
  if (typeof credentials.username !== 'string' || typeof credentials.password !== 'string') {
    throw new Error('بيانات الدخول المحفوظة غير صالحة.');
  }
  return credentials;
});

ipcMain.handle('credentials:set', async (_event, { username, password }) => {
  if (typeof username !== 'string' || typeof password !== 'string') {
    throw new Error('بيانات الدخول غير صالحة للحفظ.');
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('التخزين الآمن لكلمات المرور غير متاح على هذا الجهاز.');
  }
  ensureDirs();
  const encrypted = safeStorage.encryptString(JSON.stringify({ username, password }));
  const temporaryFile = `${REMEMBERED_CREDENTIALS_FILE}.tmp`;
  await fs.writeFile(temporaryFile, encrypted);
  await fs.rename(temporaryFile, REMEMBERED_CREDENTIALS_FILE);
  return { ok: true };
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

// ─── Direct / ESC-POS thermal printing ────────────────────────────────────────

function runPowerShell(script) {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true, timeout: 15000, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) reject(new Error(String(stderr || error.message)));
        else resolve(String(stdout));
      }
    );
  });
}

ipcMain.handle('print:listPrinters', async () => {
  try {
    if (process.platform === 'win32') {
      const out = await runPowerShell('Get-Printer | Select-Object -ExpandProperty Name');
      const names = out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      return { ok: true, printers: names };
    }
    // macOS / Linux: CUPS lists printers via lpstat.
    const out = await new Promise((resolve, reject) => {
      execFile('lpstat', ['-e'], { timeout: 10000 }, (err, stdout) => {
        if (err) reject(err); else resolve(String(stdout));
      });
    });
    const names = out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    return { ok: true, printers: names };
  } catch (error) {
    return { ok: false, printers: [], error: String(error) };
  }
});

// Sends raw bytes to a network ESC/POS printer over TCP port 9100 —
// works on every OS and is the most common way receipt printers are wired.
function sendRawToNetworkPrinter(bytes, host, port) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port: Number(port) || 9100 });
    let settled = false;
    const done = (err) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      err ? reject(err) : resolve();
    };
    socket.setTimeout(10000, () => done(new Error('انتهت مهلة الاتصال بالطابعة')));
    socket.on('error', (err) => done(err));
    socket.on('connect', () => {
      socket.end(Buffer.from(bytes), () => done(null));
    });
  });
}

ipcMain.handle('print:raw', async (_event, { bytes, printerName, transport, host, port }) => {
  let tempFile = null;
  try {
    if (!Array.isArray(bytes) || (!printerName && transport !== 'network')) {
      return { ok: false, error: 'معطيات الطباعة غير مكتملة' };
    }
    const buf = Buffer.from(bytes);

    // Network (TCP 9100) transport — cross-platform by definition.
    if (transport === 'network') {
      if (!host) return { ok: false, error: 'عنوان الطابعة الشبكية غير محدد' };
      await sendRawToNetworkPrinter(buf, host, port);
      return { ok: true };
    }

    if (process.platform === 'win32') {
      tempFile = path.join(APP_DATA_DIR, `escpos-${Date.now()}.bin`);
      await fs.writeFile(tempFile, buf);
    // RawPrinterHelper: writes a RAW job directly to the printer via winspool.
    const ps = `
      Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class RawPrinterHelper {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct DOCINFOW {
    [MarshalAs(UnmanagedType.LPWStr)] public string DocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string OutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string DataType;
  }
  [DllImport("winspool.Drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);
  [DllImport("winspool.Drv", SetLastError = true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, int level, ref DOCINFOW di);
  [DllImport("winspool.Drv", SetLastError = true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", SetLastError = true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", SetLastError = true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", SetLastError = true)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);
}
'@
      $bytes = [System.IO.File]::ReadAllBytes('${tempFile.replace(/\\/g, '\\\\').replace(/'/g, "''")}')
      $h = [System.IntPtr]::Zero
      if (-not [RawPrinterHelper]::OpenPrinter('${String(printerName).replace(/'/g, "''")}', [ref]$h, [System.IntPtr]::Zero)) { throw 'فشل فتح الطابعة' }
      try {
        $di = New-Object RawPrinterHelper+DOCINFOW
        $di.DocName = 'CeramiSys Receipt'
        $di.DataType = 'RAW'
        if (-not [RawPrinterHelper]::StartDocPrinter($h, 1, [ref]$di)) { throw 'فشل بدء مهمة الطباعة' }
        try {
          [RawPrinterHelper]::StartPagePrinter($h) | Out-Null
          $ptr = [System.Runtime.InteropServices.Marshal]::AllocHGlobal($bytes.Length)
          try {
            [System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $ptr, $bytes.Length)
            $written = 0
            [RawPrinterHelper]::WritePrinter($h, $ptr, $bytes.Length, [ref]$written) | Out-Null
          } finally { [System.Runtime.InteropServices.Marshal]::FreeHGlobal($ptr) }
          [RawPrinterHelper]::EndPagePrinter($h) | Out-Null
        } finally { [RawPrinterHelper]::EndDocPrinter($h) | Out-Null }
      } finally { [RawPrinterHelper]::ClosePrinter($h) | Out-Null }
    `;
    await runPowerShell(ps);
    return { ok: true };
    }
  } catch (error) {
    return { ok: false, error: String(error) };
  } finally {
    if (tempFile) fsSync.rmSync(tempFile, { force: true });
  }
});

// macOS / Linux: spool a RAW job through CUPS.
ipcMain.handle('print:rawCups', async (_event, { bytes, printerName }) => {
  const tempFile = path.join(APP_DATA_DIR, `escpos-${Date.now()}.bin`);
  try {
    if (!Array.isArray(bytes) || !printerName) {
      return { ok: false, error: 'معطيات الطباعة غير مكتملة' };
    }
    await fs.writeFile(tempFile, Buffer.from(bytes));
    await new Promise((resolve, reject) => {
      // -o raw sends the bytes untouched (ESC/POS passthrough).
      execFile('lp', ['-d', printerName, '-o', 'raw', tempFile], { timeout: 15000 }, (err) => {
        err ? reject(err) : resolve();
      });
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error) };
  } finally {
    fsSync.rmSync(tempFile, { force: true });
  }
});

app.whenReady().then(() => {
  ensureDirs();
  lanServer.registerIpc(() => BrowserWindow.getAllWindows()[0]);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  lanServer.stop();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
