'use strict';

/**
 * Device-authenticated tenant notification feed.
 *
 * Tenant ERP devices poll GET /api/v1/device/notifications to pull the
 * platform notifications addressed to their tenant (plus broadcast rows with
 * tenant_id NULL) and mirror them into the local notifications table.
 *
 * Security notes:
 *  - Requires X-Device-Id + X-Device-Credential (authenticateDevice); the
 *    tenant is always derived from the registered device, never from input.
 *  - Read-only: devices cannot create or mutate platform notifications here.
 */

const express = require('express');
const { getDb } = require('../lib/db');
const { authenticateDevice } = require('../lib/deviceAuth');

const router = express.Router();

const MAX_LIMIT = 100;

function mapNotification(row) {
  if (!row) return null;
  let payload = null;
  try { payload = row.payload ? JSON.parse(row.payload) : null; } catch { payload = row.payload ?? null; }
  return {
    id: row.id,
    tenantId: row.tenant_id ?? null,
    audience: row.audience ?? 'ALL',
    channel: row.channel,
    subject: row.subject,
    payload,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? null,
  };
}

router.get(
  '/',
  authenticateDevice,
  async (req, res, next) => {
    try {
      const db = getDb();
      const tenantId = req.device.tenant_id;
      const clauses = [
        "(tenant_id = ? OR tenant_id IS NULL)",
        "status != 'CANCELLED'",
      ];
      const params = [tenantId];

      const since = String(req.query.since || '').trim();
      if (since && !Number.isNaN(Date.parse(since))) {
        clauses.push('created_at > ?');
        params.push(new Date(since).toISOString());
      }

      const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.query.limit) || MAX_LIMIT));
      const rows = await db.all(
        `SELECT * FROM platform_notifications
         WHERE ${clauses.join(' AND ')}
         ORDER BY created_at ASC LIMIT ?`,
        [...params, limit]
      );
      res.json({ data: rows.map(mapNotification), meta: { total: rows.length } });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
