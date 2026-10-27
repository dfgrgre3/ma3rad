const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');
const { execFile } = require('child_process');
const net = require('net');

const NETWORK_PRINTER_PORT = 9100;
const WINDOWS_POWERSHELL = path.win32.join(
  process.env.SystemRoot || 'C:\\Windows',
  'System32',
  'WindowsPowerShell',
  'v1.0',
  'powershell.exe'
);
const CUPS_LPSTAT = '/usr/bin/lpstat';
const CUPS_LP = '/usr/bin/lp';

function isAllowedNetworkPrinterAddress(host) {
  if (typeof host !== 'string' || net.isIP(host) !== 4) return false;
  const [first, second] = host.split('.').map(Number);
  return first === 10
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
    || (first === 169 && second === 254);
}

function isAllowedNetworkPrinterPort(port) {
  return Number(port) === NETWORK_PRINTER_PORT;
}

function isValidPrintBytes(bytes, maxSize) {
  return Array.isArray(bytes)
    && bytes.length <= maxSize
    && bytes.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255);
}

function registerPrintingHandlers({ ipcMain, validateIpcSender, appDataDir, MAX_PRINT_DATA }) {
  function runPowerShell(script) {
    return new Promise((resolve, reject) => {
      execFile(
        WINDOWS_POWERSHELL,
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
        { windowsHide: true, timeout: 15000, maxBuffer: 4 * 1024 * 1024 },
        (error, stdout, stderr) => {
          if (error) reject(new Error(String(stderr || error.message)));
          else resolve(String(stdout));
        }
      );
    });
  }

  ipcMain.handle('print:listPrinters', async (event) => {
    validateIpcSender(event);
    try {
      if (process.platform === 'win32') {
        const out = await runPowerShell('Get-Printer | Select-Object -ExpandProperty Name');
        const names = out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
        return { ok: true, printers: names };
      }
      // macOS / Linux: CUPS lists printers via lpstat.
      const out = await new Promise((resolve, reject) => {
        execFile(CUPS_LPSTAT, ['-e'], { timeout: 10000 }, (err, stdout) => {
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
      const socket = net.createConnection({ host, port });
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

  ipcMain.handle('print:raw', async (event, { bytes, printerName, transport, host, port }) => {
    validateIpcSender(event);
    let tempFile = null;
    try {
      if (!Array.isArray(bytes) || bytes.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)
        || (!printerName && transport !== 'network')) {
        return { ok: false, error: 'معطيات الطباعة غير مكتملة' };
      }
      if (bytes.length > MAX_PRINT_DATA) {
        return { ok: false, error: 'حجم بيانات الطباعة يتجاوز الحد المسموح به' };
      }
      const buf = Buffer.from(bytes);

      if (transport === 'network') {
        if (!isAllowedNetworkPrinterAddress(host)) {
          return { ok: false, error: 'عنوان الطابعة يجب أن يكون عنوان IPv4 خاصاً بالشبكة المحلية.' };
        }
        if (!isAllowedNetworkPrinterPort(port)) {
          return { ok: false, error: `اتصال الطابعة الشبكية مسموح عبر المنفذ ${NETWORK_PRINTER_PORT} فقط.` };
        }
        await sendRawToNetworkPrinter(buf, host, NETWORK_PRINTER_PORT);
        return { ok: true };
      }

      if (process.platform === 'win32') {
        tempFile = path.join(appDataDir, `escpos-${Date.now()}.bin`);
        await fs.writeFile(tempFile, buf);
        const b64TempFile = Buffer.from(tempFile, 'utf8').toString('base64');
        const b64PrinterName = Buffer.from(String(printerName || ''), 'utf8').toString('base64');
        // RawPrinterHelper: writes a RAW job directly to the printer via winspool using safe base64 decoding.
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
        $filePath = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64TempFile}'))
        $targetPrinter = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64PrinterName}'))
        $bytes = [System.IO.File]::ReadAllBytes($filePath)
        $h = [System.IntPtr]::Zero
        if (-not [RawPrinterHelper]::OpenPrinter($targetPrinter, [ref]$h, [System.IntPtr]::Zero)) { throw 'فشل فتح الطابعة' }
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
  ipcMain.handle('print:rawCups', async (event, { bytes, printerName }) => {
    validateIpcSender(event);
    const tempFile = path.join(appDataDir, `escpos-${Date.now()}.bin`);
    try {
      if (!isValidPrintBytes(bytes, MAX_PRINT_DATA) || !printerName) {
        return { ok: false, error: 'معطيات الطباعة غير مكتملة' };
      }
      await fs.writeFile(tempFile, Buffer.from(bytes));
      await new Promise((resolve, reject) => {
        // -o raw sends the bytes untouched (ESC/POS passthrough).
        execFile(CUPS_LP, ['-d', printerName, '-o', 'raw', tempFile], { timeout: 15000 }, (err) => {
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
}

module.exports = {
  registerPrintingHandlers,
  isAllowedNetworkPrinterAddress,
  isAllowedNetworkPrinterPort,
  isValidPrintBytes,
};
