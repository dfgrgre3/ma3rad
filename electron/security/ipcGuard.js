// electron/security/ipcGuard.js
// Strict input validation and sanitization for Electron IPC handlers.
const path = require('node:path');

/**
 * Ensures target path resolves strictly inside baseDirectory (preventing path traversal).
 */
function validateSafePath(baseDirectory, candidatePath) {
  if (typeof candidatePath !== 'string' || !candidatePath.trim()) {
    throw new Error('Invalid path argument: path must be a non-empty string.');
  }
  // Reject null bytes and path traversal patterns
  if (candidatePath.includes('\0') || candidatePath.includes('%00')) {
    throw new Error('Invalid path: null bytes are forbidden.');
  }

  const resolvedBase = path.resolve(baseDirectory);
  const resolvedTarget = path.resolve(resolvedBase, candidatePath);

  // Normalize casing on Windows
  const baseCompare = process.platform === 'win32' ? resolvedBase.toLowerCase() : resolvedBase;
  const targetCompare = process.platform === 'win32' ? resolvedTarget.toLowerCase() : resolvedTarget;

  const baseWithSep = baseCompare.endsWith(path.sep) ? baseCompare : baseCompare + path.sep;
  if (!targetCompare.startsWith(baseWithSep) && targetCompare !== baseCompare) {
    throw new Error('Path traversal detected: target path is outside allowed directory.');
  }

  return resolvedTarget;
}

/**
 * Validates a string parameter.
 */
function validateString(value, { minLength = 0, maxLength = 1000, pattern = null, field = 'Field' } = {}) {
  if (typeof value !== 'string') {
    throw new TypeError(`${field} must be a string.`);
  }
  const len = value.length;
  if (len < minLength) {
    throw new RangeError(`${field} is too short (min ${minLength} chars).`);
  }
  if (len > maxLength) {
    throw new RangeError(`${field} exceeds maximum length of ${maxLength} chars.`);
  }
  if (pattern && !pattern.test(value)) {
    throw new Error(`${field} format is invalid.`);
  }
  return value;
}

/**
 * Validates an integer or number.
 */
function validateNumber(value, { min = -Infinity, max = Infinity, integer = false, field = 'Number' } = {}) {
  const num = Number(value);
  if (Number.isNaN(num)) {
    throw new TypeError(`${field} must be a valid number.`);
  }
  if (integer && !Number.isInteger(num)) {
    throw new TypeError(`${field} must be an integer.`);
  }
  if (num < min || num > max) {
    throw new RangeError(`${field} must be between ${min} and ${max}.`);
  }
  return num;
}

/**
 * Validates a byte array (Uint8Array or Array of byte integers).
 */
function validateByteArray(bytes, { maxBytes = 50 * 1024 * 1024, field = 'Byte payload' } = {}) {
  if (!(bytes instanceof Uint8Array) && !Array.isArray(bytes)) {
    throw new TypeError(`${field} must be a byte array or Buffer.`);
  }
  const length = bytes.length ?? bytes.byteLength ?? 0;
  if (length > maxBytes) {
    throw new RangeError(`${field} exceeds maximum allowed size of ${maxBytes} bytes.`);
  }
  return bytes;
}

/**
 * Validates external web URLs (strictly HTTP and HTTPS only).
 */
function validateExternalUrl(urlString) {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { allowed: false, reason: 'Protocol must be http: or https:' };
    }
    // Block localhost / private IP from external launcher to avoid SSRF
    const host = parsed.hostname.toLowerCase();
    if (['localhost', '127.0.0.1', '::1'].includes(host) || host.endsWith('.local')) {
      return { allowed: false, reason: 'Loopback and local addresses are blocked for external browsing.' };
    }
    return { allowed: true, url: parsed.href };
  } catch {
    return { allowed: false, reason: 'Invalid URL format.' };
  }
}

module.exports = {
  validateSafePath,
  validateString,
  validateNumber,
  validateByteArray,
  validateExternalUrl,
};
