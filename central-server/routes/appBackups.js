'use strict';

const express = require('express');
const crypto = require('crypto');
const fs = require('node:fs');
const path = require('node:path');
const { getDb } = require('../lib/db');
const { nowIso } = require('../lib/time');
const { recordAuditEvent } = require('../lib/audit');
const {
  authenticatePlatformUser,
  requirePlatformPermission,
  getScopedTenantIds,
  assertTenantAccess,
} = require('../middleware/auth');
const { appBackupDir } = require('../lib/opsWorker');
const { authenticateDevice: authenticateDeviceCredential } = require('../lib/deviceAuth');

const adminRouter = express.Router();
const clientRouter = express.Router();

const APP_BACKUP_TYPES = ['FULL', 'INCREMENTAL', 'MANUAL'];
const RESTORE_RESULT_STATUSES = ['IN_PROGRESS', 'COMPLETED', 'FAILED'];
// restore_status values a device may still report against.
const ACTIVE_RESTORE_STATUSES = ['REQUESTED', 'IN_PROGRESS', 'FAILED'];
const MAX_APP_BACKUP_BYTES = 2 * 1024 * 1024 * 1024; // 2 GiB

function mapAppBackupRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id ?? null,
    tenantName: row.tenant_name ?? null,
    deviceId: row.device_id ?? null,
    deviceName: row.device_name ?? null,
    name: row.name ?? null,
    type: row.type,
    status: row.status,
    sizeBytes: row.size_bytes ?? null,
    checksum: row.checksum ?? null,
    notes: row.notes ?? null,
    restoreStatus: row.restore_status ?? 'NONE',
    restoreRequestedBy: row.restore_requested_by ?? null,
    restoreRequestedAt: row.restore_requested_at ?? null,
    restoreError: row.restore_error ?? null,
    restoreCompletedAt: row.restore_completed_at ?? null,
    createdAt: row.created_at,
    completedAt: row.completed_at ?? null,
  };
}

function appBackupFilePath(storageUri) {
  // storage_uri stores a bare file name; basename() guards against traversal.
  return path.join(appBackupDir(), path.basename(String(storageUri || '')));
}

// ─── Device authentication ──────────────────────────────────────────────────
// Client devices are bound to a registered platform_devices row by
// X-Device-Id (device id or hardware id). X-Device-Credential is verified
// against the enrolled credential hash; the tenant is ALWAYS resolved from
// the device row, so request bodies/params can never claim another tenant.
async function authenticateDevice(req, res, next) {
  await authenticateDeviceCredential(req, res, (err) => {
    if (err) return next(err);
    req.deviceTenantId = req.device.tenant_id;
    next();
  });
}

// ═══ Admin router — /api/v1/admin/app-backups ═══════════════════════════════

adminRouter.get(
  '/',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.backups.view']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { tenantId = '', status = '', restoreStatus = '', q = '' } = req.query;
      const clauses = [];
      const params = [];

      const scoped = await getScopedTenantIds(req);
      if (Array.isArray(scoped)) {
        const visible = scoped.filter(Boolean);
        if (tenantId) {
          if (!visible.includes(String(tenantId))) {
            return res.status(403).json({ error: 'Tenant is outside your data scope' });
          }
          clauses.push('b.tenant_id = ?');
          params.push(tenantId);
        } else if (visible.length) {
          clauses.push(`b.tenant_id IN (${visible.map(() => '?').join(',')})`);
          params.push(...visible);
        } else {
          return res.json({ data: [], meta: { total: 0 }, requestId: req.requestId });
        }
      } else if (tenantId) {
        clauses.push('b.tenant_id = ?');
        params.push(tenantId);
      }

      if (status) { clauses.push('b.status = ?'); params.push(status); }
      if (restoreStatus) { clauses.push('b.restore_status = ?'); params.push(restoreStatus); }
      if (q) {
        clauses.push('(b.name LIKE ? OR b.notes LIKE ?)');
        params.push(`%${q}%`, `%${q}%`);
      }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const rows = await db.all(
        `SELECT b.*, t.name AS tenant_name, d.name AS device_name
         FROM platform_app_backups b
         LEFT JOIN platform_tenants t ON t.id = b.tenant_id
         LEFT JOIN platform_devices d ON d.id = b.device_id
         ${where} ORDER BY b.created_at DESC LIMIT 500`,
        params
      );
      res.json({ data: rows.map(mapAppBackupRow), meta: { total: rows.length }, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

adminRouter.get(
  '/:id',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.backups.view']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const row = await db.get(
        `SELECT b.*, t.name AS tenant_name, d.name AS device_name
         FROM platform_app_backups b
         LEFT JOIN platform_tenants t ON t.id = b.tenant_id
         LEFT JOIN platform_devices d ON d.id = b.device_id
         WHERE b.id = ?`, [req.params.id]);
      if (!row) return res.status(404).json({ error: 'Application backup not found' });
      if (row.tenant_id && !(await assertTenantAccess(req, res, row.tenant_id))) return;
      res.json({ data: mapAppBackupRow(row), requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

adminRouter.post(
  '/:id/restore',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.backups.restore', 'platform.backups.approve']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const backup = await db.get('SELECT * FROM platform_app_backups WHERE id = ?', [req.params.id]);
      if (!backup) return res.status(404).json({ error: 'Application backup not found' });
      if (!(await assertTenantAccess(req, res, backup.tenant_id))) return;
      if (backup.status !== 'COMPLETED') {
        return res.status(409).json({ error: `Backup is not restorable in status ${backup.status}` });
      }
      if (['REQUESTED', 'IN_PROGRESS'].includes(backup.restore_status)) {
        return res.status(409).json({ error: `A restore is already ${backup.restore_status.toLowerCase()} for this backup` });
      }
      const now = nowIso();
      // Conditional update guards against a concurrent request winning the race.
      const result = await db.run(
        `UPDATE platform_app_backups
         SET restore_status = 'REQUESTED', restore_requested_by = ?, restore_requested_at = ?,
             restore_error = NULL, restore_completed_at = NULL
         WHERE id = ? AND restore_status NOT IN ('REQUESTED','IN_PROGRESS')`,
        [req.platformUser?.full_name ?? req.platformUser?.id ?? null, now, backup.id]
      );
      if (!result || (result.changes ?? result.affectedRows ?? 1) === 0) {
        return res.status(409).json({ error: 'A restore is already in progress for this backup' });
      }
      await recordAuditEvent({
        actorId: req.platformUser?.id, actorName: req.platformUser?.full_name, tenantId: backup.tenant_id,
        action: 'APP_BACKUP_RESTORE_REQUESTED', resourceType: 'platform_app_backups', resourceId: backup.id,
        afterData: { deviceId: backup.device_id, checksum: backup.checksum },
        ipAddress: req.ip, userAgent: req.headers['user-agent'],
      });
      const row = await db.get(
        `SELECT b.*, t.name AS tenant_name, d.name AS device_name
         FROM platform_app_backups b
         LEFT JOIN platform_tenants t ON t.id = b.tenant_id
         LEFT JOIN platform_devices d ON d.id = b.device_id
         WHERE b.id = ?`, [backup.id]);
      res.status(201).json({ data: mapAppBackupRow(row), requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

adminRouter.post(
  '/:id/restore/cancel',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.backups.restore', 'platform.backups.approve']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const backup = await db.get('SELECT * FROM platform_app_backups WHERE id = ?', [req.params.id]);
      if (!backup) return res.status(404).json({ error: 'Application backup not found' });
      if (!(await assertTenantAccess(req, res, backup.tenant_id))) return;
      if (backup.restore_status !== 'REQUESTED') {
        return res.status(409).json({ error: 'Only a pending (REQUESTED) restore can be cancelled' });
      }
      await db.run(
        `UPDATE platform_app_backups SET restore_status = 'NONE', restore_requested_by = NULL,
           restore_requested_at = NULL, restore_error = NULL WHERE id = ?`,
        [backup.id]
      );
      await recordAuditEvent({
        actorId: req.platformUser?.id, actorName: req.platformUser?.full_name, tenantId: backup.tenant_id,
        action: 'APP_BACKUP_RESTORE_CANCELLED', resourceType: 'platform_app_backups', resourceId: backup.id,
        ipAddress: req.ip, userAgent: req.headers['user-agent'],
      });
      res.json({ data: { ok: true }, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

// ═══ Client (device) router — /api/v1/device/backups ════════════════════════

// List the tenant's application backups (metadata only — artifacts stay
// server-side until a restore is requested).
clientRouter.get(
  '/',
  authenticateDevice,
  async (req, res, next) => {
    try {
      const db = getDb();
      const rows = await db.all(
        `SELECT b.*, d.name AS device_name
         FROM platform_app_backups b
         LEFT JOIN platform_devices d ON d.id = b.device_id
         WHERE b.tenant_id = ? ORDER BY b.created_at DESC LIMIT 200`,
        [req.deviceTenantId]
      );
      res.json({ data: rows.map(mapAppBackupRow), meta: { total: rows.length }, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

// The device's pending restore work: the most recent backup whose restore was
// requested (or is mid-flight/failed so the device can retry reporting).
clientRouter.get(
  '/pending-restore',
  authenticateDevice,
  async (req, res, next) => {
    try {
      const db = getDb();
      const row = await db.get(
        `SELECT b.*, d.name AS device_name
         FROM platform_app_backups b
         LEFT JOIN platform_devices d ON d.id = b.device_id
         WHERE b.tenant_id = ? AND b.restore_status IN ('REQUESTED','IN_PROGRESS','FAILED')
         ORDER BY b.restore_requested_at DESC LIMIT 1`,
        [req.deviceTenantId]
      );
      res.json({ data: mapAppBackupRow(row), requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

// Upload an encrypted application snapshot. Raw octet-stream body; integrity
// metadata travels in headers. The server stores the blob opaquely — it is
// encrypted with the device's own safe-storage key and cannot be read here.
clientRouter.post(
  '/upload',
  authenticateDevice,
  express.raw({ type: 'application/octet-stream', limit: MAX_APP_BACKUP_BYTES }),
  async (req, res, next) => {
    try {
      const db = getDb();
      const name = String(req.get('X-Backup-Name') || '').slice(0, 200) || null;
      const type = String(req.get('X-Backup-Type') || 'FULL').toUpperCase();
      const checksum = String(req.get('X-Backup-Checksum') || '').toLowerCase();
      const declaredSize = Number(req.get('X-Backup-Size') || 0);

      if (!APP_BACKUP_TYPES.includes(type)) {
        return res.status(400).json({ error: `X-Backup-Type must be one of ${APP_BACKUP_TYPES.join(', ')}` });
      }
      if (!/^[0-9a-f]{64}$/.test(checksum)) {
        return res.status(400).json({ error: 'X-Backup-Checksum must be a sha256 hex digest' });
      }
      const body = req.body;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        return res.status(400).json({ error: 'Request body must be application/octet-stream bytes' });
      }
      if (body.length > MAX_APP_BACKUP_BYTES) {
        return res.status(413).json({ error: 'Backup artifact exceeds the maximum allowed size' });
      }
      if (Number.isFinite(declaredSize) && declaredSize > 0 && declaredSize !== body.length) {
        return res.status(400).json({ error: 'X-Backup-Size does not match the uploaded byte count' });
      }
      const actualChecksum = crypto.createHash('sha256').update(body).digest('hex');
      if (actualChecksum !== checksum) {
        return res.status(400).json({ error: 'Checksum mismatch — artifact rejected' });
      }

      const backupId = `appbak_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
      const storageUri = `${backupId}.enc`;
      const dir = appBackupDir();
      fs.mkdirSync(dir, { recursive: true });
      const tmpPath = path.join(dir, `.${storageUri}.tmp`);
      const finalPath = path.join(dir, storageUri);
      fs.writeFileSync(tmpPath, body);
      fs.renameSync(tmpPath, finalPath);

      const now = nowIso();
      await db.run(
        `INSERT INTO platform_app_backups
          (id, tenant_id, device_id, name, type, status, size_bytes, checksum, storage_uri,
           restore_status, created_at, completed_at)
         VALUES (?, ?, ?, ?, ?, 'COMPLETED', ?, ?, ?, 'NONE', ?, ?)`,
        [backupId, req.deviceTenantId, req.device.id, name, type, body.length, checksum, storageUri, now, now]
      );
      await recordAuditEvent({
        actorId: req.device.id, actorName: req.device.name || req.device.hardware_id, tenantId: req.deviceTenantId,
        action: 'APP_BACKUP_UPLOADED', resourceType: 'platform_app_backups', resourceId: backupId,
        afterData: { sizeBytes: body.length, checksum, type, deviceId: req.device.id },
        ipAddress: req.ip, userAgent: req.headers['user-agent'],
      });
      const row = await db.get('SELECT * FROM platform_app_backups WHERE id = ?', [backupId]);
      res.status(201).json({ data: mapAppBackupRow(row), requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

// Download the artifact for a pending restore. Restricted to the owning
// tenant's device and only while a restore is actually requested — a device
// cannot pull arbitrary snapshots.
clientRouter.get(
  '/:id/download',
  authenticateDevice,
  async (req, res, next) => {
    try {
      const db = getDb();
      const row = await db.get('SELECT * FROM platform_app_backups WHERE id = ?', [req.params.id]);
      if (!row || row.tenant_id !== req.deviceTenantId) {
        return res.status(404).json({ error: 'Application backup not found' });
      }
      if (!ACTIVE_RESTORE_STATUSES.includes(row.restore_status)) {
        return res.status(409).json({ error: 'No restore is pending for this backup' });
      }
      const filePath = appBackupFilePath(row.storage_uri);
      if (!filePath || !fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Backup artifact file is missing on the server' });
      }
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${path.basename(row.storage_uri)}"`);
      res.setHeader('X-Backup-Checksum', row.checksum);
      res.setHeader('X-Backup-Size', String(row.size_bytes ?? ''));
      fs.createReadStream(filePath).pipe(res);
    } catch (err) { next(err); }
  }
);

// Device reports restore progress. Idempotent: re-reporting the same terminal
// state is accepted; transitions out of COMPLETED are rejected.
clientRouter.post(
  '/:id/restore-result',
  authenticateDevice,
  async (req, res, next) => {
    try {
      const db = getDb();
      const { status, error = '' } = req.body || {};
      if (!RESTORE_RESULT_STATUSES.includes(status)) {
        return res.status(400).json({ error: `status must be one of ${RESTORE_RESULT_STATUSES.join(', ')}` });
      }
      const row = await db.get('SELECT * FROM platform_app_backups WHERE id = ?', [req.params.id]);
      if (!row || row.tenant_id !== req.deviceTenantId) {
        return res.status(404).json({ error: 'Application backup not found' });
      }
      if (row.restore_status === 'COMPLETED' && status !== 'COMPLETED') {
        return res.status(409).json({ error: 'Restore already completed' });
      }
      if (row.restore_status === 'NONE') {
        return res.status(409).json({ error: 'No restore was requested for this backup' });
      }
      const now = nowIso();
      const isTerminal = status === 'COMPLETED' || status === 'FAILED';
      await db.run(
        `UPDATE platform_app_backups
         SET restore_status = ?, restore_error = ?,
             restore_completed_at = CASE WHEN ? THEN ? ELSE restore_completed_at END
         WHERE id = ?`,
        [status, isTerminal && status === 'FAILED' ? String(error || 'unknown error').slice(0, 1000) : null,
         isTerminal ? 1 : 0, isTerminal ? now : null, row.id]
      );
      await recordAuditEvent({
        actorId: req.device.id, actorName: req.device.name || req.device.hardware_id, tenantId: req.deviceTenantId,
        action: `APP_BACKUP_RESTORE_${status}`, resourceType: 'platform_app_backups', resourceId: row.id,
        afterData: { error: status === 'FAILED' ? String(error || '').slice(0, 500) : undefined },
        ipAddress: req.ip, userAgent: req.headers['user-agent'],
      });
      const updated = await db.get('SELECT * FROM platform_app_backups WHERE id = ?', [row.id]);
      res.json({ data: mapAppBackupRow(updated), requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

module.exports = { adminRouter, clientRouter };
