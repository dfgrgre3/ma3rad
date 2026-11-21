'use strict';

/**
 * Reverse channel: tenant ERP devices report local `users` mutations back to
 * the platform directory (`platform_tenant_users`) so the super-admin console
 * reflects what actually exists inside each company's ERP.
 *
 *   POST /api/v1/device/tenant-users/report
 *   body: { reports: [{ event: 'UPSERT'|'DELETE', identityUserId, username,
 *                       fullName, role, phone, isActive }] }
 *
 * Rules:
 *  - Tenant is derived from the authenticated device, never from the payload.
 *  - Matching order: identity_user_id first, then (tenant_id, username).
 *  - Reports NEVER enqueue provisioning jobs — that would loop the channel.
 *  - Rows the device created itself (origin = 'DEVICE') are hard-deleted on a
 *    DELETE report; platform-managed rows are suspended instead so the admin
 *    directory entry and its audit trail survive.
 *  - A DELETE report also cancels any still-pending provisioning jobs for the
 *    user, otherwise a queued PROVISION would resurrect the account.
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../lib/db');
const { nowIso } = require('../lib/time');
const { recordAuditEvent } = require('../lib/audit');
const { authenticateDevice } = require('../lib/deviceAuth');

const router = express.Router();

const MAX_REPORTS_PER_CALL = 100;

function normalizeReport(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const event = String(raw.event || 'UPSERT').toUpperCase();
  if (!['UPSERT', 'DELETE'].includes(event)) return null;
  const username = String(raw.username || '').trim().toLowerCase();
  const identityUserId = raw.identityUserId ? String(raw.identityUserId) : null;
  if (!username && !identityUserId) return null;
  return {
    event,
    identityUserId,
    username: username || null,
    previousUsername: raw.previousUsername ? String(raw.previousUsername).trim().toLowerCase() : null,
    fullName: String(raw.fullName || '').trim() || null,
    role: raw.role ? String(raw.role).trim().toUpperCase() : null,
    phone: raw.phone ? String(raw.phone).trim() : null,
    isActive: raw.isActive === undefined ? true : Boolean(raw.isActive),
  };
}

async function findDirectoryUser(db, tenantId, report) {
  if (report.identityUserId) {
    const byIdentity = await db.get(
      'SELECT * FROM platform_tenant_users WHERE tenant_id = ? AND identity_user_id = ? LIMIT 1',
      [tenantId, report.identityUserId]
    );
    if (byIdentity) return byIdentity;
  }
  if (report.username) {
    return db.get(
      'SELECT * FROM platform_tenant_users WHERE tenant_id = ? AND username = ? LIMIT 1',
      [tenantId, report.username]
    );
  }
  if (report.previousUsername) {
    return db.get(
      'SELECT * FROM platform_tenant_users WHERE tenant_id = ? AND username = ? LIMIT 1',
      [tenantId, report.previousUsername]
    );
  }
  return null;
}

async function cancelPendingJobs(db, tenantUserId) {
  const now = nowIso();
  await db.run(
    `UPDATE platform_tenant_provisioning_jobs
        SET status = 'CANCELLED', completed_at = ?, updated_at = ?
      WHERE tenant_user_id = ? AND status IN ('PENDING', 'CLAIMED')`,
    [now, now, tenantUserId]
  );
}

async function applyReport(db, tenantId, deviceId, report) {
  const now = nowIso();
  const existing = await findDirectoryUser(db, tenantId, report);

  if (report.event === 'DELETE') {
    if (!existing) return { action: 'DELETE', matched: false };
    await cancelPendingJobs(db, existing.id);
    if (existing.origin === 'DEVICE') {
      await db.run('DELETE FROM platform_tenant_users WHERE id = ?', [existing.id]);
      return { action: 'DELETE', matched: true, removed: true };
    }
    await db.run(
      `UPDATE platform_tenant_users SET status = 'SUSPENDED', is_active = 0, updated_at = ? WHERE id = ?`,
      [now, existing.id]
    );
    return { action: 'DELETE', matched: true, suspended: true };
  }

  // UPSERT
  const status = report.isActive ? 'ACTIVE' : 'SUSPENDED';
  const isActive = report.isActive ? 1 : 0;
  if (existing) {
    await db.run(
      `UPDATE platform_tenant_users SET
         username = COALESCE(?, username),
         full_name = COALESCE(?, full_name),
         phone = COALESCE(?, phone),
         role = COALESCE(?, role),
         status = ?, is_active = ?,
         identity_user_id = COALESCE(?, identity_user_id),
         provisioning_status = 'PROVISIONED',
         provisioned_at = COALESCE(provisioned_at, ?),
         last_error = NULL,
         updated_at = ?
       WHERE id = ?`,
      [
        report.username, report.fullName, report.phone, report.role,
        status, isActive,
        report.identityUserId, now, now, existing.id,
      ]
    );
    return { action: 'UPSERT', matched: true, id: existing.id };
  }

  const id = `tuser_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
  await db.run(
    `INSERT INTO platform_tenant_users
       (id, tenant_id, username, full_name, email, phone, role, status, notes,
        provisioning_status, provisioning_mode, identity_user_id, origin,
        provisioned_at, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, NULL, 'PROVISIONED', 'DIRECT_CREATE', ?, 'DEVICE', ?, ?, ?, ?)`,
    [
      id, tenantId, report.username, report.fullName || report.username || 'User', report.phone,
      report.role || 'USER', status, report.identityUserId, now, isActive, now, now,
    ]
  );
  return { action: 'UPSERT', matched: false, id };
}

router.post(
  '/report',
  authenticateDevice,
  async (req, res, next) => {
    try {
      const db = getDb();
      const tenantId = req.device.tenant_id;
      const rawReports = Array.isArray(req.body?.reports) ? req.body.reports : [req.body];
      const reports = rawReports.map(normalizeReport).filter(Boolean).slice(0, MAX_REPORTS_PER_CALL);

      const results = [];
      for (const report of reports) {
        const outcome = await applyReport(db, tenantId, req.device.id, report);
        results.push({ ...report, ...outcome });
      }

      if (results.length) {
        await recordAuditEvent({
          actorType: 'SYSTEM',
          actorId: null,
          actorName: `Device ${req.device.id}`,
          tenantId,
          action: 'TENANT_USERS_REPORTED',
          resourceType: 'platform_tenant_users',
          resourceId: null,
          afterData: { count: results.length, events: results.map((r) => `${r.event}:${r.action}`) },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });
      }
      res.json({ data: { received: results.length, results } });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
