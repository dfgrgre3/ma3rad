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

module.exports = router;
