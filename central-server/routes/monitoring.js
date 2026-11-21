'use strict';
const express = require('express');
const { getDb } = require('../lib/db');
const { nowIso } = require('../lib/time');
const { recordAuditEvent } = require('../lib/audit');
const {
  authenticatePlatformUser,
  requirePlatformPermission,
  getScopedTenantIds,
  assertTenantAccess,
} = require('../middleware/auth');

const router = express.Router();

const ERROR_STATUSES = ['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'IGNORED'];
const SEVERITIES = ['low', 'medium', 'high', 'critical'];

function mapErrorRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id ?? null,
    tenantName: row.tenant_name ?? null,
    deviceId: row.device_id ?? null,
    fingerprint: row.fingerprint,
    title: row.title,
    description: row.description ?? null,
    stack: row.stack ?? null,
    issueType: row.issue_type ?? null,
    severity: row.severity,
    appVersion: row.app_version ?? null,
    os: row.os ?? null,
    occurrences: row.occurrences,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    status: row.status,
    acknowledgedBy: row.acknowledged_by ?? null,
    resolvedBy: row.resolved_by ?? null,
    resolvedAt: row.resolved_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

router.get(
  '/errors',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.platform-health.view', 'platform.operations.view', 'platform.system-health.view']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { status = '', severity = '', tenantId = '', q = '' } = req.query;
      const clauses = [];
      const params = [];
      const scoped = await getScopedTenantIds(req);
      if (Array.isArray(scoped)) {
        const visible = scoped.filter(Boolean);
        if (tenantId) {
          if (!visible.includes(String(tenantId))) {
            return res.status(403).json({ error: 'Tenant is outside your data scope' });
          }
          clauses.push('e.tenant_id = ?');
          params.push(tenantId);
        } else if (visible.length) {
          clauses.push(`e.tenant_id IN (${visible.map(() => '?').join(',')})`);
          params.push(...visible);
        } else {
          clauses.push('e.tenant_id IS NULL');
        }
      } else if (tenantId) {
        clauses.push('e.tenant_id = ?');
        params.push(tenantId);
      }
      if (status) { clauses.push('e.status = ?'); params.push(status); }
      if (severity) { clauses.push('e.severity = ?'); params.push(severity); }
      if (q) {
        clauses.push('(e.title LIKE ? OR e.description LIKE ? OR e.device_id LIKE ?)');
        params.push(`%${q}%`, `%${q}%`, `%${q}%`);
      }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const rows = await db.all(
        `SELECT e.*, t.name AS tenant_name FROM platform_error_reports e
         LEFT JOIN platform_tenants t ON t.id = e.tenant_id
         ${where} ORDER BY e.last_seen_at DESC LIMIT 500`,
        params
      );
      res.json({ data: rows.map(mapErrorRow), meta: { total: rows.length }, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

router.get(
  '/errors/summary',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.platform-health.view', 'platform.operations.view', 'platform.system-health.view']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const scoped = await getScopedTenantIds(req);
      const clauses = [];
      const params = [];
      if (Array.isArray(scoped)) {
        const visible = scoped.filter(Boolean);
        if (!visible.length) {
          return res.json({ data: { byStatus: {}, bySeverity: {}, total: 0, last24h: 0 }, requestId: req.requestId });
        }
        clauses.push(`tenant_id IN (${visible.map(() => '?').join(',')})`);
        params.push(...visible);
      }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const [byStatus, bySeverity, totals, recent] = await Promise.all([
        db.all(`SELECT status, COUNT(*) AS count FROM platform_error_reports ${where} GROUP BY status`, params),
        db.all(`SELECT severity, COUNT(*) AS count, COALESCE(SUM(occurrences),0) AS occurrences FROM platform_error_reports ${where} GROUP BY severity`, params),
        db.get(`SELECT COUNT(*) AS count, COALESCE(SUM(occurrences),0) AS occurrences FROM platform_error_reports ${where}`, params),
        db.get(`SELECT COUNT(*) AS count FROM platform_error_reports ${where ? where + ' AND' : 'WHERE'} last_seen_at >= datetime('now', '-1 day')`, params),
      ]);
      res.json({
        data: {
          byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r.count])),
          bySeverity: Object.fromEntries(bySeverity.map((r) => [r.severity, { count: r.count, occurrences: r.occurrences }])),
          total: totals?.count || 0,
          occurrences: totals?.occurrences || 0,
          last24h: recent?.count || 0,
        },
        requestId: req.requestId,
      });
    } catch (err) { next(err); }
  }
);

async function setErrorStatus(req, res, next, status) {
  try {
    const db = getDb();
    const row = await db.get('SELECT * FROM platform_error_reports WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Error report not found' });
    if (row.tenant_id && !(await assertTenantAccess(req, res, row.tenant_id))) return;
    if (!ERROR_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of ${ERROR_STATUSES.join(', ')}` });
    }
    const now = nowIso();
    const actor = req.platformUser?.full_name ?? req.platformUser?.id ?? null;
    if (status === 'ACKNOWLEDGED') {
      await db.run(
        `UPDATE platform_error_reports SET status = 'ACKNOWLEDGED', acknowledged_by = ?, updated_at = ? WHERE id = ?`,
        [actor, now, row.id]
      );
    } else if (status === 'RESOLVED') {
      await db.run(
        `UPDATE platform_error_reports SET status = 'RESOLVED', resolved_by = ?, resolved_at = ?, updated_at = ? WHERE id = ?`,
        [actor, now, now, row.id]
      );
    } else {
      await db.run('UPDATE platform_error_reports SET status = ?, updated_at = ? WHERE id = ?', [status, now, row.id]);
    }
    await recordAuditEvent({
      actorId: req.platformUser?.id, actorName: req.platformUser?.full_name, tenantId: row.tenant_id ?? undefined,
      action: `ERROR_REPORT_${status}`, resourceType: 'platform_error_reports', resourceId: row.id,
      ipAddress: req.ip, userAgent: req.headers['user-agent'],
    });
    const updated = await db.get('SELECT * FROM platform_error_reports WHERE id = ?', [row.id]);
    res.json({ data: mapErrorRow(updated), requestId: req.requestId });
  } catch (err) { next(err); }
}

router.post(
  '/errors/:id/acknowledge',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.platform-health.update', 'platform.operations.update', 'platform.system-health.update']),
  (req, res, next) => setErrorStatus(req, res, next, 'ACKNOWLEDGED')
);

router.post(
  '/errors/:id/resolve',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.platform-health.update', 'platform.operations.update', 'platform.system-health.update']),
  (req, res, next) => setErrorStatus(req, res, next, 'RESOLVED')
);

router.post(
  '/errors/:id/ignore',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.platform-health.update', 'platform.operations.update', 'platform.system-health.update']),
  (req, res, next) => setErrorStatus(req, res, next, 'IGNORED')
);

router.post(
  '/errors/:id/reopen',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.platform-health.update', 'platform.operations.update', 'platform.system-health.update']),
  (req, res, next) => setErrorStatus(req, res, next, 'OPEN')
);

// ─── Technical health & metrics ──────────────────────────────────────────────

const HEALTH_PERMISSIONS = [
  'platform.platform-health.view',
  'platform.system-health.view',
  'platform.operations.view',
];

const METRIC_ROW_LIMIT = 500;

function mapMetricRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id ?? null,
    tenantName: row.tenant_name ?? null,
    deviceId: row.device_id ?? null,
    deviceName: row.device_name ?? null,
    metricName: row.metric_name,
    metricValue: row.metric_value,
    metricUnit: row.metric_unit ?? null,
    status: row.status,
    details: typeof row.details === 'string' ? safeJson(row.details) : (row.details ?? null),
    recordedAt: row.recorded_at,
  };
}

function safeJson(value) {
  if (value == null) return null;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
}

/**
 * Builds a tenant-scope SQL fragment. Returns { clause, params } where clause
 * is '' for unrestricted callers, or a condition limiting rows to the
 * caller's visible tenants (plus platform-level rows with NULL tenant_id).
 */
async function tenantScopeClause(req, column) {
  const scoped = await getScopedTenantIds(req);
  if (!Array.isArray(scoped)) return { clause: '', params: [] };
  const visible = scoped.filter(Boolean);
  if (!visible.length) return { clause: `${column} IS NULL`, params: [] };
  return {
    clause: `(${column} IN (${visible.map(() => '?').join(',')}) OR ${column} IS NULL)`,
    params: visible,
  };
}

router.get(
  '/metrics',
  authenticatePlatformUser,
  requirePlatformPermission(HEALTH_PERMISSIONS),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { tenantId = '', deviceId = '', metricName = '', since = '' } = req.query;
      const limit = Math.min(METRIC_ROW_LIMIT, Math.max(1, Number(req.query.limit) || 200));
      const clauses = [];
      const params = [];

      const scoped = await getScopedTenantIds(req);
      if (Array.isArray(scoped)) {
        const visible = scoped.filter(Boolean);
        if (tenantId) {
          if (!visible.includes(String(tenantId))) {
            return res.status(403).json({ error: 'Tenant is outside your data scope' });
          }
          clauses.push('m.tenant_id = ?');
          params.push(tenantId);
        } else if (visible.length) {
          clauses.push(`m.tenant_id IN (${visible.map(() => '?').join(',')})`);
          params.push(...visible);
        } else {
          clauses.push('m.tenant_id IS NULL');
        }
      } else if (tenantId) {
        clauses.push('m.tenant_id = ?');
        params.push(tenantId);
      }
      if (deviceId) { clauses.push('m.device_id = ?'); params.push(deviceId); }
      if (metricName) { clauses.push('m.metric_name = ?'); params.push(metricName); }
      if (since) { clauses.push('m.recorded_at >= ?'); params.push(since); }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const rows = await db.all(
        `SELECT m.*, t.name AS tenant_name FROM platform_health_metrics m
         LEFT JOIN platform_tenants t ON t.id = m.tenant_id
         ${where} ORDER BY m.recorded_at DESC LIMIT ?`,
        [...params, limit]
      );
      res.json({ data: rows.map(mapMetricRow), meta: { total: rows.length }, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

router.get(
  '/health',
  authenticatePlatformUser,
  requirePlatformPermission(HEALTH_PERMISSIONS),
  async (req, res, next) => {
    try {
      const db = getDb();

      // ── Server vitals ────────────────────────────────────────────────────
      const dbStart = Date.now();
      await db.get('SELECT 1');
      const dbLatencyMs = Date.now() - dbStart;
      const sizeRow = await db.get('SELECT page_count * page_size AS size FROM pragma_page_count, pragma_page_size');
      const tableRow = await db.get("SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'table'");
      const server = {
        uptimeSeconds: Math.floor(process.uptime()),
        nodeVersion: process.version,
        dbSizeMb: Math.round((sizeRow?.size || 0) / 1024 / 1024),
        dbLatencyMs,
        tableCount: tableRow?.c || 0,
      };

      // ── Devices ──────────────────────────────────────────────────────────
      const deviceScope = await tenantScopeClause(req, 'd.tenant_id');
      const deviceWhere = deviceScope.clause ? `WHERE ${deviceScope.clause}` : '';
      const [deviceStatusRows, onlineRow, staleRow, deviceRows] = await Promise.all([
        db.all(
          `SELECT d.status, COUNT(*) AS count FROM platform_devices d ${deviceWhere} GROUP BY d.status`,
          deviceScope.params
        ),
        db.get(
          `SELECT COUNT(*) AS c FROM platform_devices d ${deviceWhere ? deviceWhere + ' AND' : 'WHERE'} d.last_seen_at >= datetime('now', '-15 minutes')`,
          deviceScope.params
        ),
        db.get(
          `SELECT COUNT(*) AS c FROM platform_devices d ${deviceWhere ? deviceWhere + ' AND' : 'WHERE'} d.status = 'ACTIVE' AND d.last_seen_at < datetime('now', '-24 hours')`,
          deviceScope.params
        ),
        db.all(
          `SELECT d.id, d.tenant_id, d.name, d.hardware_id, d.status, d.last_seen_at, d.app_version, d.os,
                  t.name AS tenant_name
           FROM platform_devices d LEFT JOIN platform_tenants t ON t.id = d.tenant_id
           ${deviceWhere} ORDER BY d.last_seen_at DESC LIMIT 500`,
          deviceScope.params
        ),
      ]);
      const devices = {
        total: deviceStatusRows.reduce((sum, r) => sum + (r.count || 0), 0),
        byStatus: Object.fromEntries(deviceStatusRows.map((r) => [r.status, r.count])),
        onlineCount: onlineRow?.c || 0,
        staleCount: staleRow?.c || 0,
        rows: deviceRows.map((d) => ({
          id: d.id, tenantId: d.tenant_id, tenantName: d.tenant_name ?? null,
          name: d.name ?? null, hardwareId: d.hardware_id, status: d.status,
          lastSeenAt: d.last_seen_at ?? null, appVersion: d.app_version ?? null, os: d.os ?? null,
        })),
      };

      // Latest metric value per (device, metric) for the listed devices.
      const latestMetricRows = await db.all(
        `SELECT m.device_id, m.metric_name, m.metric_value, m.metric_unit, m.status, m.recorded_at
         FROM platform_health_metrics m
         JOIN (
           SELECT device_id, metric_name, MAX(recorded_at) AS mx
           FROM platform_health_metrics
           WHERE device_id IS NOT NULL
           GROUP BY device_id, metric_name
         ) latest ON latest.device_id = m.device_id AND latest.metric_name = m.metric_name AND latest.mx = m.recorded_at
         ORDER BY m.recorded_at DESC LIMIT 2000`
      );
      const latestByDevice = {};
      for (const row of latestMetricRows) {
        const bucket = (latestByDevice[row.device_id] ||= {});
        bucket[row.metric_name] = {
          value: row.metric_value, unit: row.metric_unit ?? null,
          status: row.status, recordedAt: row.recorded_at,
        };
      }
      for (const d of devices.rows) d.metrics = latestByDevice[d.id] || {};

      // ── Error reports summary (same aggregation as /errors/summary) ──────
      const errScope = await tenantScopeClause(req, 'tenant_id');
      const errWhere = errScope.clause ? `WHERE ${errScope.clause}` : '';
      const [errByStatus, errBySeverity, errTotals, errRecent] = await Promise.all([
        db.all(`SELECT status, COUNT(*) AS count FROM platform_error_reports ${errWhere} GROUP BY status`, errScope.params),
        db.all(`SELECT severity, COUNT(*) AS count, COALESCE(SUM(occurrences),0) AS occurrences FROM platform_error_reports ${errWhere} GROUP BY severity`, errScope.params),
        db.get(`SELECT COUNT(*) AS count, COALESCE(SUM(occurrences),0) AS occurrences FROM platform_error_reports ${errWhere}`, errScope.params),
        db.get(`SELECT COUNT(*) AS count FROM platform_error_reports ${errWhere ? errWhere + ' AND' : 'WHERE'} last_seen_at >= datetime('now', '-1 day')`, errScope.params),
      ]);
      const errors = {
        byStatus: Object.fromEntries(errByStatus.map((r) => [r.status, r.count])),
        bySeverity: Object.fromEntries(errBySeverity.map((r) => [r.severity, { count: r.count, occurrences: r.occurrences }])),
        total: errTotals?.count || 0,
        occurrences: errTotals?.occurrences || 0,
        last24h: errRecent?.count || 0,
      };

      // ── Ops jobs ─────────────────────────────────────────────────────────
      const jobScope = await tenantScopeClause(req, 'tenant_id');
      const jobWhere = jobScope.clause ? `WHERE ${jobScope.clause}` : '';
      const jobStatusRows = await db.all(
        `SELECT status, COUNT(*) AS count FROM platform_ops_jobs ${jobWhere} GROUP BY status`,
        jobScope.params
      );
      const jobFailedRow = await db.get(
        `SELECT COUNT(*) AS c FROM platform_ops_jobs ${jobWhere ? jobWhere + ' AND' : 'WHERE'} status = 'FAILED' AND updated_at >= datetime('now', '-1 day')`,
        jobScope.params
      );
      const jobs = {
        total: jobStatusRows.reduce((sum, r) => sum + (r.count || 0), 0),
        byStatus: Object.fromEntries(jobStatusRows.map((r) => [r.status, r.count])),
        failedLast24h: jobFailedRow?.c || 0,
      };

      // ── Backups ──────────────────────────────────────────────────────────
      const backupScope = await tenantScopeClause(req, 'tenant_id');
      const backupWhere = backupScope.clause ? `WHERE ${backupScope.clause}` : '';
      const [backupStatusRows, latestBackup] = await Promise.all([
        db.all(`SELECT status, COUNT(*) AS count FROM platform_backups ${backupWhere} GROUP BY status`, backupScope.params),
        db.get(
          `SELECT id, name, type, status, trigger_source, created_at, completed_at, size_bytes, error
           FROM platform_backups ${backupWhere} ORDER BY created_at DESC LIMIT 1`,
          backupScope.params
        ),
      ]);
      const backups = {
        total: backupStatusRows.reduce((sum, r) => sum + (r.count || 0), 0),
        byStatus: Object.fromEntries(backupStatusRows.map((r) => [r.status, r.count])),
        latest: latestBackup ? {
          id: latestBackup.id, name: latestBackup.name ?? null, type: latestBackup.type,
          status: latestBackup.status, triggerSource: latestBackup.trigger_source,
          createdAt: latestBackup.created_at, completedAt: latestBackup.completed_at ?? null,
          sizeBytes: latestBackup.size_bytes ?? null, error: latestBackup.error ?? null,
        } : null,
      };

      // ── Latest platform/device metric rows ───────────────────────────────
      const metricScope = await tenantScopeClause(req, 'm.tenant_id');
      const metricWhere = metricScope.clause ? `WHERE ${metricScope.clause}` : '';
      const metricRows = await db.all(
        `SELECT m.*, t.name AS tenant_name FROM platform_health_metrics m
         LEFT JOIN platform_tenants t ON t.id = m.tenant_id
         ${metricWhere} ORDER BY m.recorded_at DESC LIMIT 50`,
        metricScope.params
      );

      res.json({
        data: {
          generatedAt: nowIso(),
          server,
          devices,
          errors,
          jobs,
          backups,
          metrics: metricRows.map(mapMetricRow),
        },
        requestId: req.requestId,
      });
    } catch (err) { next(err); }
  }
);

module.exports = router;
