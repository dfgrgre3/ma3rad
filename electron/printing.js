const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');
const { execFile } = require('child_process');
const net = require('net');

function registerPrintingHandlers({ ipcMain, validateIpcSender, appDataDir }) {
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

  ipcMain.handle('print:raw', async (event, { bytes, printerName, transport, host, port }) => {
    validateIpcSender(event);
    let tempFile = null;
    try {
      if (!Array.isArray(bytes) || (!printerName && transport !== 'network')) {
        return { ok: false, error: 'معطيات الطباعة غير مكتملة' };
      }
      if (bytes.length > MAX_PRINT_DATA) {
        return { ok: false, error: 'حجم بيانات الطباعة يتجاوز الحد المسموح به' };
      }
      const buf = Buffer.from(bytes);

      // Network (TCP 9100) transport — validate host and port strictly
      if (transport === 'network') {
        if (!host || typeof host !== 'string' || !/^[a-zA-Z0-9.-]+$/.test(host)) {
          return { ok: false, error: 'عنوان الطابعة الشبكية غير صحيح أو يحتوي على رموز غير مسموحة' };
        }
        const portNum = Number(port) || 9100;
        if (portNum < 1 || portNum > 65535) {
          return { ok: false, error: 'منفذ الطابعة الشبكية غير صحيح' };
        }
        await sendRawToNetworkPrinter(buf, host, portNum);
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
}

module.exports = { registerPrintingHandlers };
