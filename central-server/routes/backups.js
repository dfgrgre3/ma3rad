'use strict';
const express = require('express');
const crypto = require('crypto');
const { getDb } = require('../lib/db');
const { nowIso } = require('../lib/time');
const { recordAuditEvent } = require('../lib/audit');
const {
  authenticatePlatformUser,
  requirePlatformPermission,
  getScopedTenantIds,
  assertTenantAccess,
} = require('../middleware/auth');
const { backupDir } = require('../lib/opsWorker');
const fs = require('node:fs');
const path = require('node:path');

const router = express.Router();

const BACKUP_TYPES = ['FULL', 'INCREMENTAL', 'PRE_RESTORE'];
const BACKUP_STATUSES = ['REQUESTED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'EXPIRED'];
const TRIGGER_SOURCES = ['MANUAL', 'SCHEDULED', 'PRE_UPDATE', 'PRE_RESTORE'];

function mapBackupRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id ?? null,
    tenantName: row.tenant_name ?? null,
    name: row.name ?? null,
    type: row.type,
    status: row.status,
    sizeBytes: row.size_bytes ?? null,
    storageUri: row.storage_uri ?? null,
    triggerSource: row.trigger_source,
    triggeredBy: row.triggered_by ?? null,
    notes: row.notes ?? null,
    error: row.error ?? null,
    checksum: row.checksum ?? null,
    completedAt: row.completed_at ?? null,
    expiresAt: row.expires_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRestoreRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    backupId: row.backup_id,
    tenantId: row.tenant_id,
    status: row.status,
    requestedBy: row.requested_by ?? null,
    notes: row.notes ?? null,
    error: row.error ?? null,
    completedAt: row.completed_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function enqueueOpsJob(db, { tenantId, type, payload }) {
  const jobId = `job_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const now = nowIso();
  await db.run(
    `INSERT INTO platform_ops_jobs (id, tenant_id, type, status, payload, attempts, created_at, updated_at)
     VALUES (?, ?, ?, 'PENDING', ?, 0, ?, ?)`,
    [jobId, tenantId ?? null, type, JSON.stringify(payload || {}), now, now]
  );
  return jobId;
}

router.get(
  '/',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.backups.view']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { tenantId = '', status = '', type = '', q = '' } = req.query;
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
          clauses.push('b.tenant_id IS NULL');
        }
      } else if (tenantId) {
        clauses.push('b.tenant_id = ?');
        params.push(tenantId);
      }

      if (status) { clauses.push('b.status = ?'); params.push(status); }
      if (type) { clauses.push('b.type = ?'); params.push(type); }
      if (q) {
        clauses.push('(b.name LIKE ? OR b.notes LIKE ? OR b.storage_uri LIKE ?)');
        params.push(`%${q}%`, `%${q}%`, `%${q}%`);
      }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const rows = await db.all(
        `SELECT b.*, t.name AS tenant_name
         FROM platform_backups b LEFT JOIN platform_tenants t ON t.id = b.tenant_id
         ${where} ORDER BY b.created_at DESC LIMIT 500`,
        params
      );
      res.json({ data: rows.map(mapBackupRow), meta: { total: rows.length }, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

router.post(
  '/',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.backups.create', 'platform.backups.approve']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { tenantId = null, name = '', type = 'FULL', notes = '', triggerSource = 'MANUAL' } = req.body || {};
      if (tenantId && !(await assertTenantAccess(req, res, tenantId))) return;
      if (!BACKUP_TYPES.includes(type)) {
        return res.status(400).json({ error: `type must be one of ${BACKUP_TYPES.join(', ')}` });
      }
      if (!TRIGGER_SOURCES.includes(triggerSource)) {
        return res.status(400).json({ error: `triggerSource must be one of ${TRIGGER_SOURCES.join(', ')}` });
      }

      const backupId = `bak_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
      const now = nowIso();
      await db.run(
        `INSERT INTO platform_backups
          (id, tenant_id, name, type, status, trigger_source, triggered_by, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'REQUESTED', ?, ?, ?, ?, ?)`,
        [
          backupId, tenantId || null,
          name || `نسخة ${type === 'FULL' ? 'كاملة' : type === 'INCREMENTAL' ? 'تزايدية' : 'ما قبل الاستعادة'}`,
          type, triggerSource, req.platformUser?.full_name ?? req.platformUser?.id ?? null,
          notes || null, now, now,
        ]
      );
      const jobId = await enqueueOpsJob(db, {
        tenantId,
        type: 'BACKUP_CREATE',
        payload: { backupId, backupType: type, triggerSource },
      });
      await recordAuditEvent({
        actorId: req.platformUser?.id, actorName: req.platformUser?.full_name, tenantId: tenantId || undefined,
        action: 'BACKUP_REQUESTED', resourceType: 'platform_backups', resourceId: backupId,
        afterData: { type, triggerSource, jobId },
        ipAddress: req.ip, userAgent: req.headers['user-agent'],
      });
      const row = await db.get(
        `SELECT b.*, t.name AS tenant_name FROM platform_backups b
         LEFT JOIN platform_tenants t ON t.id = b.tenant_id WHERE b.id = ?`, [backupId]);
      res.status(201).json({ data: mapBackupRow(row), requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

router.get(
  '/restores',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.backups.view']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { tenantId = '', status = '' } = req.query;
      const clauses = [];
      const params = [];
      const scoped = await getScopedTenantIds(req);
      if (Array.isArray(scoped)) {
        const visible = scoped.filter(Boolean);
        if (tenantId) {
          if (!visible.includes(String(tenantId))) {
            return res.status(403).json({ error: 'Tenant is outside your data scope' });
          }
          clauses.push('r.tenant_id = ?');
          params.push(tenantId);
        } else if (visible.length) {
          clauses.push(`r.tenant_id IN (${visible.map(() => '?').join(',')})`);
          params.push(...visible);
        } else {
          return res.json({ data: [], meta: { total: 0 }, requestId: req.requestId });
        }
      } else if (tenantId) {
        clauses.push('r.tenant_id = ?');
        params.push(tenantId);
      }
      if (status) { clauses.push('r.status = ?'); params.push(status); }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const rows = await db.all(
        `SELECT r.*, t.name AS tenant_name, b.name AS backup_name
         FROM platform_backup_restores r
         LEFT JOIN platform_tenants t ON t.id = r.tenant_id
         LEFT JOIN platform_backups b ON b.id = r.backup_id
         ${where} ORDER BY r.created_at DESC LIMIT 500`,
        params
      );
      res.json({
        data: rows.map((row) => ({
          ...mapRestoreRow(row),
          tenantName: row.tenant_name ?? null,
          backupName: row.backup_name ?? null,
        })),
        meta: { total: rows.length },
        requestId: req.requestId,
      });
    } catch (err) { next(err); }
  }
);

router.get(
  '/:id',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.backups.view']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const row = await db.get(
        `SELECT b.*, t.name AS tenant_name FROM platform_backups b
         LEFT JOIN platform_tenants t ON t.id = b.tenant_id WHERE b.id = ?`, [req.params.id]);
      if (!row) return res.status(404).json({ error: 'Backup not found' });
      if (row.tenant_id && !(await assertTenantAccess(req, res, row.tenant_id))) return;
      const restores = await db.all(
        'SELECT * FROM platform_backup_restores WHERE backup_id = ? ORDER BY created_at DESC', [req.params.id]);
      res.json({ data: { ...mapBackupRow(row), restores: restores.map(mapRestoreRow) }, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

router.get(
  '/:id/download',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.backups.view']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const row = await db.get('SELECT * FROM platform_backups WHERE id = ?', [req.params.id]);
      if (!row) return res.status(404).json({ error: 'Backup not found' });
      if (row.tenant_id && !(await assertTenantAccess(req, res, row.tenant_id))) return;
      if (row.status !== 'COMPLETED' || !row.storage_uri) {
        return res.status(409).json({ error: 'Backup artifact is not available for download' });
      }
      // storage_uri stores a bare file name; basename() guards against traversal.
      const filePath = path.join(backupDir(), path.basename(row.storage_uri));
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Backup artifact file is missing on the server' });
      }
      await recordAuditEvent({
        actorId: req.platformUser?.id, actorName: req.platformUser?.full_name, tenantId: row.tenant_id ?? undefined,
        action: 'BACKUP_DOWNLOADED', resourceType: 'platform_backups', resourceId: row.id,
        ipAddress: req.ip, userAgent: req.headers['user-agent'],
      });
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${path.basename(row.storage_uri)}"`);
      fs.createReadStream(filePath).pipe(res);
    } catch (err) { next(err); }
  }
);

router.post(
  '/:id/restore',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.backups.restore', 'platform.backups.approve']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const backup = await db.get('SELECT * FROM platform_backups WHERE id = ?', [req.params.id]);
      if (!backup) return res.status(404).json({ error: 'Backup not found' });
      if (!backup.tenant_id) {
        return res.status(400).json({ error: 'Platform-wide backups cannot be restored per tenant' });
      }
      if (!(await assertTenantAccess(req, res, backup.tenant_id))) return;
      if (!['COMPLETED'].includes(backup.status)) {
        return res.status(409).json({ error: `Backup is not restorable in status ${backup.status}` });
      }
      const { notes = '' } = req.body || {};

      const restoreId = `rst_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
      const now = nowIso();
      await db.run('BEGIN TRANSACTION');
      try {
        await db.run(
          `INSERT INTO platform_backup_restores (id, backup_id, tenant_id, status, requested_by, notes, created_at, updated_at)
           VALUES (?, ?, ?, 'REQUESTED', ?, ?, ?, ?)`,
          [restoreId, backup.id, backup.tenant_id, req.platformUser?.full_name ?? req.platformUser?.id ?? null, notes || null, now, now]
        );
        await db.run("UPDATE platform_backups SET status = 'IN_PROGRESS', trigger_source = 'PRE_RESTORE', updated_at = ? WHERE id = ?", [now, backup.id]);
        await db.exec('COMMIT');
      } catch (err) {
        await db.exec('ROLLBACK');
        throw err;
      }
      const jobId = await enqueueOpsJob(db, {
        tenantId: backup.tenant_id,
        type: 'BACKUP_RESTORE',
        payload: { restoreId, backupId: backup.id, notes },
      });
      await recordAuditEvent({
        actorId: req.platformUser?.id, actorName: req.platformUser?.full_name, tenantId: backup.tenant_id,
        action: 'BACKUP_RESTORE_REQUESTED', resourceType: 'platform_backup_restores', resourceId: restoreId,
        afterData: { backupId: backup.id, jobId },
        ipAddress: req.ip, userAgent: req.headers['user-agent'],
      });
      const row = await db.get('SELECT * FROM platform_backup_restores WHERE id = ?', [restoreId]);
      res.status(201).json({ data: mapRestoreRow(row), requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

module.exports = router;
