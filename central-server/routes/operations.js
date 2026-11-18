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

const router = express.Router();

const JOB_TYPES = ['BACKUP_CREATE', 'BACKUP_RESTORE', 'REMOTE_SYNC', 'CONFIG_PUSH', 'PROVISIONING', 'MIGRATION', 'CUSTOM'];
const JOB_STATUSES = ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'];

function mapJobRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id ?? null,
    tenantName: row.tenant_name ?? null,
    type: row.type,
    status: row.status,
    payload: safeJson(row.payload),
    result: safeJson(row.result),
    error: row.error ?? null,
    attempts: row.attempts ?? 0,
    runAt: row.run_at ?? null,
    startedAt: row.started_at ?? null,
    finishedAt: row.finished_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function safeJson(value) {
  if (value == null) return null;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
}

router.get(
  '/jobs',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.operations.view']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { status = '', type = '', tenantId = '' } = req.query;
      const clauses = [];
      const params = [];
      const scoped = await getScopedTenantIds(req);
      if (Array.isArray(scoped)) {
        const visible = scoped.filter(Boolean);
        if (tenantId) {
          if (!visible.includes(String(tenantId))) {
            return res.status(403).json({ error: 'Tenant is outside your data scope' });
          }
          clauses.push('j.tenant_id = ?');
          params.push(tenantId);
        } else if (visible.length) {
          clauses.push(`j.tenant_id IN (${visible.map(() => '?').join(',')})`);
          params.push(...visible);
        } else {
          clauses.push('j.tenant_id IS NULL');
        }
      } else if (tenantId) {
        clauses.push('j.tenant_id = ?');
        params.push(tenantId);
      }
      if (status) { clauses.push('j.status = ?'); params.push(status); }
      if (type) { clauses.push('j.type = ?'); params.push(type); }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const rows = await db.all(
        `SELECT j.*, t.name AS tenant_name FROM platform_ops_jobs j
         LEFT JOIN platform_tenants t ON t.id = j.tenant_id
         ${where} ORDER BY j.created_at DESC LIMIT 500`,
        params
      );
      res.json({ data: rows.map(mapJobRow), meta: { total: rows.length }, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

router.post(
  '/jobs',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.operations.create', 'platform.operations.approve']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { tenantId = null, type, payload = {}, runAt = null } = req.body || {};
      if (!type || !JOB_TYPES.includes(type)) {
        return res.status(400).json({ error: `type must be one of ${JOB_TYPES.join(', ')}` });
      }
      if (tenantId && !(await assertTenantAccess(req, res, tenantId))) return;
      const jobId = `job_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
      const now = nowIso();
      await db.run(
        `INSERT INTO platform_ops_jobs (id, tenant_id, type, status, payload, run_at, attempts, created_at, updated_at)
         VALUES (?, ?, ?, 'PENDING', ?, ?, 0, ?, ?)`,
        [jobId, tenantId || null, type, JSON.stringify(payload || {}), runAt || null, now, now]
      );
      await recordAuditEvent({
        actorId: req.platformUser?.id, actorName: req.platformUser?.full_name, tenantId: tenantId || undefined,
        action: 'OPS_JOB_CREATED', resourceType: 'platform_ops_jobs', resourceId: jobId,
        afterData: { type },
        ipAddress: req.ip, userAgent: req.headers['user-agent'],
      });
      const row = await db.get('SELECT * FROM platform_ops_jobs WHERE id = ?', [jobId]);
      res.status(201).json({ data: mapJobRow(row), requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

router.post(
  '/jobs/:id/cancel',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.operations.update', 'platform.operations.approve']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const job = await db.get('SELECT * FROM platform_ops_jobs WHERE id = ?', [req.params.id]);
      if (!job) return res.status(404).json({ error: 'Job not found' });
      if (job.tenant_id && !(await assertTenantAccess(req, res, job.tenant_id))) return;
      if (!['PENDING'].includes(job.status)) {
        return res.status(409).json({ error: `Cannot cancel job in status ${job.status}` });
      }
      await db.run("UPDATE platform_ops_jobs SET status = 'CANCELLED', finished_at = ?, updated_at = ? WHERE id = ?",
        [nowIso(), nowIso(), job.id]);
      await recordAuditEvent({
        actorId: req.platformUser?.id, actorName: req.platformUser?.full_name, tenantId: job.tenant_id ?? undefined,
        action: 'OPS_JOB_CANCELLED', resourceType: 'platform_ops_jobs', resourceId: job.id,
        ipAddress: req.ip, userAgent: req.headers['user-agent'],
      });
      const row = await db.get('SELECT * FROM platform_ops_jobs WHERE id = ?', [job.id]);
      res.json({ data: mapJobRow(row), requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

router.post(
  '/jobs/:id/retry',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.operations.update', 'platform.operations.approve']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const job = await db.get('SELECT * FROM platform_ops_jobs WHERE id = ?', [req.params.id]);
      if (!job) return res.status(404).json({ error: 'Job not found' });
      if (job.tenant_id && !(await assertTenantAccess(req, res, job.tenant_id))) return;
      if (!['FAILED', 'CANCELLED'].includes(job.status)) {
        return res.status(409).json({ error: `Cannot retry job in status ${job.status}` });
      }
      const now = nowIso();
      await db.run(
        `UPDATE platform_ops_jobs SET status = 'PENDING', attempts = 0, error = NULL,
           result = NULL, started_at = NULL, finished_at = NULL, run_at = NULL, updated_at = ? WHERE id = ?`,
        [now, job.id]
      );
      await recordAuditEvent({
        actorId: req.platformUser?.id, actorName: req.platformUser?.full_name, tenantId: job.tenant_id ?? undefined,
        action: 'OPS_JOB_RETRIED', resourceType: 'platform_ops_jobs', resourceId: job.id,
        beforeData: { status: job.status, error: job.error },
        ipAddress: req.ip, userAgent: req.headers['user-agent'],
      });
      const row = await db.get('SELECT * FROM platform_ops_jobs WHERE id = ?', [job.id]);
      res.json({ data: mapJobRow(row), requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

// ─── Usage monitoring ────────────────────────────────────────────────────────

router.get(
  '/usage',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.operations.view', 'platform.platform-health.view', 'platform.tenants.view']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const scoped = await getScopedTenantIds(req);
      const clauses = [];
      const params = [];
      if (Array.isArray(scoped)) {
        const visible = scoped.filter(Boolean);
        if (!visible.length) {
          return res.json({ data: [], meta: { total: 0 }, requestId: req.requestId });
        }
        clauses.push(`t.id IN (${visible.map(() => '?').join(',')})`);
        params.push(...visible);
      }
      const { status = '', planId = '' } = req.query;
      if (status) { clauses.push('t.status = ?'); params.push(status); }
      if (planId) { clauses.push('t.plan_id = ?'); params.push(planId); }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

      const rows = await db.all(
        `SELECT t.id, t.code, t.name, t.status, t.plan_id,
                p.name AS plan_name,
                (SELECT COUNT(*) FROM platform_devices d WHERE d.tenant_id = t.id AND d.status = 'ACTIVE') AS devices_active,
                (SELECT COUNT(*) FROM platform_devices d WHERE d.tenant_id = t.id) AS devices_total,
                (SELECT COUNT(*) FROM platform_tenant_users u WHERE u.tenant_id = t.id AND u.is_active = 1) AS users_active,
                (SELECT COUNT(*) FROM platform_tenant_users u WHERE u.tenant_id = t.id) AS users_total,
                (SELECT COUNT(*) FROM platform_invoices i WHERE i.tenant_id = t.id) AS invoices_count,
                (SELECT COALESCE(SUM(i.total),0) FROM platform_invoices i WHERE i.tenant_id = t.id) AS invoices_total,
                (SELECT COALESCE(SUM(paid.amount),0) FROM platform_payments paid WHERE paid.tenant_id = t.id) AS payments_total,
                (SELECT COUNT(*) FROM platform_support_tickets s WHERE s.tenant_id = t.id AND s.status IN ('OPEN','IN_PROGRESS')) AS open_tickets,
                (SELECT MAX(a.created_at) FROM platform_audit_events a WHERE a.tenant_id = t.id) AS last_activity_at
         FROM platform_tenants t
         LEFT JOIN platform_plans p ON p.id = t.plan_id
         ${where}
         ORDER BY t.name ASC
         LIMIT 1000`,
        params
      );
      res.json({ data: rows, meta: { total: rows.length }, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

router.get(
  '/usage/:tenantId',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.operations.view', 'platform.platform-health.view', 'platform.tenants.view']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { tenantId } = req.params;
      if (!(await assertTenantAccess(req, res, tenantId))) return;
      const tenant = await db.get('SELECT id, code, name, status, plan_id FROM platform_tenants WHERE id = ?', [tenantId]);
      if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

      const [devices, users, invoices, payments, tickets, subscriptions, licenses, recentAudit] = await Promise.all([
        db.all(`SELECT status, COUNT(*) AS count FROM platform_devices WHERE tenant_id = ? GROUP BY status`, [tenantId]),
        db.all(`SELECT status, COUNT(*) AS count FROM platform_tenant_users WHERE tenant_id = ? GROUP BY status`, [tenantId]),
        db.get(`SELECT COUNT(*) AS count, COALESCE(SUM(total),0) AS total, COALESCE(SUM(paid_amount),0) AS paid FROM platform_invoices WHERE tenant_id = ?`, [tenantId]),
        db.get(`SELECT COUNT(*) AS count, COALESCE(SUM(amount),0) AS total FROM platform_payments WHERE tenant_id = ?`, [tenantId]),
        db.get(`SELECT COUNT(*) AS open_count FROM platform_support_tickets WHERE tenant_id = ? AND status IN ('OPEN','IN_PROGRESS')`, [tenantId]),
        db.all(`SELECT id, plan_id, status, start_date, end_date FROM platform_subscriptions WHERE tenant_id = ? ORDER BY created_at DESC`, [tenantId]),
        db.all(`SELECT status, COUNT(*) AS count FROM platform_licenses WHERE tenant_id = ? GROUP BY status`, [tenantId]),
        db.all(`SELECT action, resource_type, created_at FROM platform_audit_events WHERE tenant_id = ? ORDER BY sequence DESC LIMIT 20`, [tenantId]),
      ]);

      res.json({
        data: {
          tenant,
          devices: devices.map((r) => ({ status: r.status, count: r.count })),
          users: users.map((r) => ({ status: r.status, count: r.count })),
          invoices: { count: invoices?.count || 0, total: invoices?.total || 0, paid: invoices?.paid || 0 },
          payments: { count: payments?.count || 0, total: payments?.total || 0 },
          openTickets: tickets?.open_count || 0,
          subscriptions,
          licenses: licenses.map((r) => ({ status: r.status, count: r.count })),
          recentActivity: recentAudit,
        },
        requestId: req.requestId,
      });
    } catch (err) { next(err); }
  }
);

module.exports = router;
