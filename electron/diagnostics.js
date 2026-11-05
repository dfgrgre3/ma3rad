const DEFAULT_MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ENTRY_LENGTH = 16 * 1024;

function formatValue(value) {
  if (value instanceof Error) return value.stack || `${value.name}: ${value.message}`;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function redactSensitiveValues(value) {
  return value.replace(
    /((?:password|token|secret|api[_-]?key)\s*["']?\s*[:=]\s*["']?)[^,\s"'&}]+/gi,
    '$1[REDACTED]',
  ).replace(
    /(authorization\s*["']?\s*[:=]\s*["']?)[^,\r\n}"'&]+/gi,
    '$1[REDACTED]',
  );
}

function createFileLogger({
  fs,
  path,
  logDirectory,
  maxFileBytes = DEFAULT_MAX_FILE_BYTES,
}) {
  const logFile = path.join(logDirectory, 'app.log');
  const previousLogFile = `${logFile}.1`;
  const fallbackConsoleError = console.error.bind(console);

  function write(level, ...values) {
    const message = redactSensitiveValues(values.map(formatValue).join(' ')).slice(0, MAX_ENTRY_LENGTH);
    const entry = `${new Date().toISOString()} ${level.toUpperCase()} ${message}\n`;

    try {
      fs.mkdirSync(logDirectory, { recursive: true });
      const currentSize = fs.existsSync(logFile) ? fs.statSync(logFile).size : 0;
      if (currentSize + Buffer.byteLength(entry, 'utf8') > maxFileBytes && currentSize > 0) {
        if (fs.existsSync(previousLogFile)) fs.unlinkSync(previousLogFile);
        fs.renameSync(logFile, previousLogFile);
      }
      fs.appendFileSync(logFile, entry, { encoding: 'utf8', mode: 0o600 });
      return true;
    } catch (error) {
      fallbackConsoleError('Persistent application logging failed:', error);
      return false;
    }
  }

  function installConsole(target = console) {
    for (const level of ['log', 'info', 'warn', 'error']) {
      const original = target[level].bind(target);
      target[level] = (...values) => {
        write(level, ...values);
        original(...values);
      };
    }
  }

  return { logFile, write, installConsole };
}

function registerProcessErrorHandlers(processObject, app, logger) {
  let handlingUncaughtException = false;
  processObject.on('uncaughtException', (error) => {
    logger.write('error', '[main] Uncaught exception:', error);
    if (handlingUncaughtException) return;
    handlingUncaughtException = true;
    app.quit();
  });
  processObject.on('unhandledRejection', (reason) => {
    logger.write('error', '[main] Unhandled promise rejection:', reason);
  });
}

module.exports = { createFileLogger, registerProcessErrorHandlers };
