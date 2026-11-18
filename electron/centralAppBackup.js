'use strict';

/**
 * Device ↔ central platform channel for tenant application (ERP) backups.
 *
 * The artifact is the device's own encrypted .sqlite.enc backup: the central
 * server stores it opaquely and can never read the tenant's business data.
 * This module owns the binary transfer (the generic `central:request` bridge
 * is JSON-only and capped at 256 KiB), checksum verification, decryption with
 * the local database key, and SQLite integrity validation before the bytes
 * are handed back to the renderer for the standard restore flow.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const UPLOAD_TIMEOUT_MS = 30 * 60 * 1000;
const DOWNLOAD_TIMEOUT_MS = 30 * 60 * 1000;
const JSON_TIMEOUT_MS = 60 * 1000;
const WATCHER_INTERVAL_MS = 5 * 60 * 1000;
const WATCHER_FIRST_CHECK_MS = 45 * 1000;

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

/**
 * @typedef {Object} ApiFetchOptions
 * @property {string} [method]
 * @property {Record<string, string>} [headers]
 * @property {any} [body] Raw request body (string or a readable stream for binary uploads).
 * @property {number} [timeoutMs]
 */

function createAppBackupClient({ getOrigin, getCredential, getDeviceId }) {
  async function authHeaders(extra = {}) {
    const [origin, deviceId, credential] = await Promise.all([getOrigin(), getDeviceId(), getCredential()]);
    if (!origin) throw new Error('Central API is not configured for this application build.');
    if (!deviceId || !credential) {
      throw new Error('This device is not activated with the central platform.');
    }
    return {
      ...extra,
      'X-Device-Id': deviceId,
      'X-Device-Credential': credential,
    };
  }

  /**
   * @param {string} pathname
   * @param {ApiFetchOptions} [options]
   */
  async function apiFetch(pathname, options = {}) {
    const { method = 'GET', headers = {}, body, timeoutMs = JSON_TIMEOUT_MS } = options;
    const origin = await getOrigin();
    if (!origin) throw new Error('Central API is not configured for this application build.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(new URL(pathname, origin), {
        method,
        headers: await authHeaders(headers),
        ...(body === undefined ? {} : { body, duplex: 'half' }),
        signal: controller.signal,
        redirect: 'error',
      });
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function apiJson(pathname, options = {}) {
    const response = await apiFetch(pathname, options);
    const text = await response.text();
    let parsed = null;
    if (text) {
      try { parsed = JSON.parse(text); }
      catch { throw new Error('Central API returned a malformed JSON response.'); }
    }
    if (!response.ok) {
      const message = parsed && typeof parsed.error === 'string' ? parsed.error : `Central API error (HTTP ${response.status})`;
      throw new Error(message);
    }
    return parsed && typeof parsed === 'object' && 'data' in parsed ? parsed.data : parsed;
  }

  return {
    list: () => apiJson('/api/v1/device/backups'),
    pendingRestore: () => apiJson('/api/v1/device/backups/pending-restore'),
    reportResult: (id, status, error) => apiJson(`/api/v1/device/backups/${encodeURIComponent(id)}/restore-result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, error: error || '' }),
    }),

    async upload({ filePath, name, type }) {
      const stat = await fsp.stat(filePath);
      const checksum = await sha256File(filePath);
      const response = await apiFetch('/api/v1/device/backups/upload', {
        method: 'POST',
        timeoutMs: UPLOAD_TIMEOUT_MS,
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Backup-Name': String(name || path.basename(filePath)).slice(0, 200),
          'X-Backup-Type': String(type || 'FULL').toUpperCase(),
          'X-Backup-Checksum': checksum,
          'X-Backup-Size': String(stat.size),
        },
        body: fs.createReadStream(filePath),
      });
      const text = await response.text();
      let parsed = null;
      if (text) {
        try { parsed = JSON.parse(text); }
        catch { throw new Error('Central API returned a malformed JSON response.'); }
      }
      if (!response.ok) {
        const message = parsed && typeof parsed.error === 'string' ? parsed.error : `Central API error (HTTP ${response.status})`;
        throw new Error(message);
      }
      return parsed && typeof parsed === 'object' && 'data' in parsed ? parsed.data : parsed;
    },

    async download(id, destPath) {
      const response = await apiFetch(`/api/v1/device/backups/${encodeURIComponent(id)}/download`, {
        timeoutMs: DOWNLOAD_TIMEOUT_MS,
      });
      if (!response.ok || !response.body) {
        let message = `Central API error (HTTP ${response.status})`;
        try {
          const parsed = JSON.parse(await response.text());
          if (parsed && typeof parsed.error === 'string') message = parsed.error;
        } catch { /* keep default message */ }
        throw new Error(message);
      }
      await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(destPath));
      const stat = await fsp.stat(destPath);
      const checksum = await sha256File(destPath);
      const expectedChecksum = String(response.headers.get('x-backup-checksum') || '').toLowerCase();
      const expectedSize = Number(response.headers.get('x-backup-size') || 0);
      if (expectedChecksum && expectedChecksum !== checksum) {
        throw new Error('Downloaded artifact checksum mismatch — the file was rejected.');
      }
      if (expectedSize > 0 && expectedSize !== stat.size) {
        throw new Error('Downloaded artifact size mismatch — the file was rejected.');
      }
      return { path: destPath, sizeBytes: stat.size, checksum };
    },
  };
}

function registerCentralAppBackupHandlers({
  ipcMain,
  validateIpcSender,
  client,
  getStatus,
  BACKUP_DIR,
  MAX_DB_SIZE,
  decryptArtifact,
}) {
  ipcMain.handle('central-app-backup:status', async (event) => {
    validateIpcSender(event);
    return getStatus();
  });

  ipcMain.handle('central-app-backup:list', async (event) => {
    validateIpcSender(event);
    return client.list();
  });

  ipcMain.handle('central-app-backup:pending', async (event) => {
    validateIpcSender(event);
    return client.pendingRestore();
  });

  ipcMain.handle('central-app-backup:report-result', async (event, payload) => {
    validateIpcSender(event);
    const { id, status, error } = payload || {};
    if (typeof id !== 'string' || !id) throw new Error('Restore id is required.');
    return client.reportResult(id, status, error);
  });

  ipcMain.handle('central-app-backup:upload', async (event, payload) => {
    validateIpcSender(event);
    const { fileName, name, type } = payload || {};
    if (typeof fileName !== 'string' || !fileName) throw new Error('Backup file name is required.');
    // Only files inside the local backup directory may be uploaded — never an
    // arbitrary renderer-supplied path.
    const backupRoot = path.resolve(BACKUP_DIR);
    const resolved = path.resolve(backupRoot, path.basename(fileName));
    if (path.dirname(resolved) !== backupRoot || !resolved.toLowerCase().endsWith('.enc')) {
      throw new Error('Only encrypted backup files inside the backup directory can be uploaded.');
    }
    if (!fs.existsSync(resolved)) throw new Error('Backup file does not exist.');
    return client.upload({ filePath: resolved, name: name || fileName, type });
  });

  // Downloads the pending artifact, verifies checksum + size, decrypts it with
  // the local database key and validates the SQLite payload. Returns plaintext
  // database bytes — the renderer runs the standard verified restore flow.
  ipcMain.handle('central-app-backup:fetch-restore', async (event, payload) => {
    validateIpcSender(event);
    const { id } = payload || {};
    if (typeof id !== 'string' || !id) throw new Error('Restore id is required.');

    const pending = await client.pendingRestore();
    if (!pending || pending.id !== id) {
      throw new Error('No pending application restore matches this request.');
    }

    const tmpPath = path.join(os.tmpdir(), `ceramisys-central-restore-${id.replace(/[^A-Za-z0-9_-]/g, '')}.enc`);
    try {
      await client.download(id, tmpPath);
      const encrypted = await fsp.readFile(tmpPath);
      const plaintext = await decryptArtifact(encrypted);
      if (plaintext.length > MAX_DB_SIZE) {
        throw new Error(`Database size exceeds the device limit (${Math.floor(MAX_DB_SIZE / (1024 * 1024))} MiB).`);
      }
      // Best-effort progress report; the renderer reports the terminal state.
      try { await client.reportResult(id, 'IN_PROGRESS'); } catch { /* non-fatal */ }
      return { ok: true, bytes: new Uint8Array(plaintext), checksum: pending.checksum || null };
    } catch (error) {
      try { await client.reportResult(id, 'FAILED', error instanceof Error ? error.message : String(error)); } catch { /* non-fatal */ }
      throw error;
    } finally {
      try { await fsp.unlink(tmpPath); } catch { /* best effort */ }
    }
  });
}

/**
 * Polls the pending-restore endpoint and broadcasts to all windows whenever a
 * pending (or changed) restore appears. The renderer is only notified — the
 * actual apply still requires an explicit user action because it replaces the
 * local database.
 */
function startPendingRestoreWatcher({ client, broadcast, intervalMs = WATCHER_INTERVAL_MS, firstCheckMs = WATCHER_FIRST_CHECK_MS }) {
  let lastSignature = null;
  let stopped = false;

  async function check() {
    if (stopped) return;
    try {
      const pending = await client.pendingRestore();
      const signature = pending ? `${pending.id}:${pending.restoreStatus}` : null;
      if (signature !== lastSignature) {
        lastSignature = signature;
        broadcast(pending);
      }
    } catch {
      // Central unreachable or device not activated — stay silent and retry.
    }
  }

  const firstTimer = setTimeout(() => { void check(); }, firstCheckMs);
  const interval = setInterval(() => { void check(); }, intervalMs);
  firstTimer.unref?.();
  interval.unref?.();

  return {
    checkNow: check,
    stop() {
      stopped = true;
      clearTimeout(firstTimer);
      clearInterval(interval);
    },
  };
}

module.exports = { createAppBackupClient, registerCentralAppBackupHandlers, startPendingRestoreWatcher };
