// electron/security/auditLogger.js
// Secure audit and security event logger with secret redaction.
const fs = require('node:fs');
const path = require('node:path');

const SECRET_PATTERNS = /password|token|secret|credential|privkey|privatekey|authorization/i;

function redactSecrets(data) {
  if (data === null || typeof data !== 'object') {
    return data;
  }
  if (Array.isArray(data)) {
    return data.map(redactSecrets);
  }
  const result = {};
  for (const [key, val] of Object.entries(data)) {
    if (SECRET_PATTERNS.test(key)) {
      result[key] = '[REDACTED]';
    } else if (typeof val === 'object' && val !== null) {
      result[key] = redactSecrets(val);
    } else {
      result[key] = val;
    }
  }
  return result;
}

class SecurityAuditLogger {
  constructor(logDirectory) {
    this.logDirectory = logDirectory;
    this.logFile = path.join(logDirectory, 'security-audit.log');
  }

  ensureDir() {
    try {
      fs.mkdirSync(this.logDirectory, { recursive: true });
    } catch {
      // logEvent reports the failure if the audit file cannot be written.
    }
  }

  logEvent(eventType, details = {}) {
    this.ensureDir();
    const entry = {
      timestamp: new Date().toISOString(),
      eventType,
      details: redactSecrets(details),
    };

    const line = JSON.stringify(entry) + '\n';
    try {
      fs.appendFileSync(this.logFile, line, { mode: 0o600 });
    } catch (err) {
      console.error('Failed to append security audit log:', err.message);
    }
    return entry;
  }
}

module.exports = {
  SecurityAuditLogger,
  redactSecrets,
};
