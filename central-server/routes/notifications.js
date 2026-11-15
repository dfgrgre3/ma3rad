'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../lib/db');
const { authenticatePlatformUser, requirePlatformPermission } = require('../middleware/auth');

const router = express.Router();

/**
 * Delivery attempts are executed by the central notification engine. Provider
 * adapters are intentionally not hard-coded here: when no provider is bound to the
 * platform configuration the attempt is recorded as FAILED with a real error, so a
 * delivery can never be reported as DELIVERED without an actual attempt.
 */
async function attemptDelivery({ channel, recipient, subject, message, templateId }) {
  const deliveryId = `ntfd_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
  if (channel === 'IN_APP') {
    return { deliveryId, status: 'SENT', provider: 'IN_APP', externalId: null, error: null };
  }
  // EMAIL / SMS require a configured provider adapter.
  throw new Error('Notification provider is not configured for this platform instance');
}

router.get(
  '/',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.notifications.view']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { tenantId = '', status = '' } = req.query;
      const clauses = [];
      const params = [];
      if (tenantId) { clauses.push('tenant_id = ?'); params.push(tenantId); }
      if (status) { clauses.push('status = ?'); params.push(status); }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
      const page = Math.max(1, Number(req.query.page) || 1);
      const notifications = await db.all(
        `SELECT * FROM platform_notifications ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [...params, limit, (page - 1) * limit],
      );
      let deliveries = [];
      if (notifications.length) {
        const placeholders = notifications.map(() => '?').join(',');
        deliveries = await db.all(
          `SELECT * FROM platform_notification_deliveries WHERE notification_id IN (${placeholders}) ORDER BY created_at ASC`,
          notifications.map((n) => n.id),
        );
      }
      res.json({ data: { notifications, deliveries }, meta: { total: notifications.length, page, limit } });
    } catch (err) { next(err); }
  },
);

router.post(
  '/',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.notifications.update']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { tenantId = null, audience = 'ALL', channel = 'IN_APP', templateId = null, subject, message, recipients } = req.body || {};
      if (!subject || !message) {
        return res.status(400).json({
          success: false, data: null, error: 'Subject and message are required', message: 'Subject and message are required',
          code: 'VALIDATION_ERROR', requestId: req.requestId, meta: {},
        });
      }

      const notificationId = `ntf_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      const now = new Date().toISOString();
      await db.run(
        `INSERT INTO platform_notifications (id, tenant_id, audience, channel, template_id, subject, payload, status, attempts, last_error, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'QUEUED', 0, NULL, ?, ?)`,
        [notificationId, tenantId, String(audience), String(channel), templateId, String(subject), JSON.stringify({ message }), now, now],
      );

      const deliveryTargets = String(req.body?.recipients || audience);
      const deliveryRecipients = deliveryTargets === 'ALL'
        ? ['*']
        : deliveryTargets.split(',').map((r) => r.trim()).filter(Boolean);

      const deliveries = [];
      for (const recipient of deliveryRecipients) {
        try {
          const result = await attemptDelivery({ channel, recipient, subject, message, templateId });
          const deliveryId = result.deliveryId || `ntfd_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
          await db.run(
            `INSERT INTO platform_notification_deliveries (id, notification_id, channel, recipient, status, provider, external_id, error, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [deliveryId, notificationId, String(channel), recipient, result.status, result.provider ?? null, result.externalId ?? null, result.error ?? null, now, now],
          );
          deliveries.push({ deliveryId, recipient, status: result.status });
          await db.run(
            `UPDATE platform_notifications SET status = ?, attempts = attempts + 1, last_error = NULL, updated_at = ? WHERE id = ?`,
            [result.status, now, notificationId],
          );
          if (result.status === 'FAILED') {
            await db.run(`UPDATE platform_notifications SET status = 'FAILED', attempts = attempts + 1, last_error = ?, updated_at = ? WHERE id = ?`,
              [result.error || 'Delivery failed', now, notificationId]);
            break;
          }
        } catch (deliveryError) {
          const deliveryId = `ntfd_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
          await db.run(
            `INSERT INTO platform_notification_deliveries (id, notification_id, channel, recipient, status, provider, external_id, error, created_at, updated_at)
             VALUES (?, ?, ?, ?, 'FAILED', ?, ?, ?, ?, ?)`,
            [deliveryId, notificationId, String(channel), recipient, null, null, String(deliveryError?.message || deliveryError), now, now],
          );
          await db.run(`UPDATE platform_notifications SET status = 'FAILED', attempts = attempts + 1, last_error = ?, updated_at = ? WHERE id = ?`,
            [String(deliveryError?.message || deliveryError), now, notificationId]);
          break;
        }
      }

      const notification = await db.get('SELECT * FROM platform_notifications WHERE id = ?', [notificationId]);
      const deliveryRows = await db.all('SELECT * FROM platform_notification_deliveries WHERE notification_id = ? ORDER BY created_at ASC', [notificationId]);
      const finalStatus = notification?.status || 'QUEUED';
      res.status(201).json({ data: { notification, deliveries: deliveryRows }, meta: { notificationId, deliveryCount: deliveryRows.length } });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/templates',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.notifications.view']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const rows = await db.all('SELECT * FROM platform_notification_templates ORDER BY created_at DESC');
      res.json({ data: rows, meta: { total: rows.length } });
    } catch (e) { next(e); }
  },
);

module.exports = router;
