'use strict';
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../lib/db');
const { recordAuditEvent } = require('../lib/audit');
const { authenticatePlatformUser, requirePlatformPermission } = require('../middleware/auth');

const router = express.Router();

router.get('/webhooks', authenticatePlatformUser, requirePlatformPermission(['platform.integrations.view']), async (req, res, next) => {
  try {
    const db = getDb();
    const rows = await db.all('SELECT * FROM platform_webhook_endpoints ORDER BY created_at DESC');
    res.json({ data: rows, meta: { total: rows.length } });
  } catch (e) { next(e); }
});

router.post('/webhooks', authenticatePlatformUser, requirePlatformPermission(['platform.integrations.create', 'platform.integrations.manage']), async (req, res, next) => {
  try {
    const db = getDb();
    const { name, url, events, secret, isActive } = req.body || {};
    if (!name || !url) {
      return res.status(400).json({ success: false, data: null, error: 'name and url are required', message: 'اسم نقطة الربك والرابط مطلوبان', code: 'VALIDATION_ERROR', requestId: req.requestId, meta: {} });
    }
    // Validate URL
    let parsedUrl;
    try { parsedUrl = new URL(url); } catch { return res.status(400).json({ success: false, data: null, error: 'invalid url', message: 'رابط غير صالح', code: 'VALIDATION_ERROR', requestId: req.requestId, meta: {} }); }
    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      return res.status(400).json({ success: false, data: null, error: 'url must be http or https', message: 'يجب أن يبدأ الرابط بـ http أو https', code: 'VALIDATION_ERROR', requestId: req.requestId, meta: {} });
    }

    const id = `wh_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = new Date().toISOString();
    const webhookSecret = secret || `whsec_${uuidv4().replace(/-/g, '').slice(0, 24)}`;
    const eventList = Array.isArray(events) ? events : [];

    await db.run(
      `INSERT INTO platform_webhook_endpoints (id, name, url, events, secret, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, String(name).trim(), url, JSON.stringify(eventList), webhookSecret, isActive === false ? 0 : 1, now, now]
    );

    await recordAuditEvent({
      actorId: req.platformUser?.id,
      actorName: req.platformUser?.full_name,
      action: 'WEBHOOK_CREATED',
      resourceType: 'platform_webhook_endpoints',
      resourceId: id,
      afterData: { name, url, events: eventList },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    const row = await db.get('SELECT * FROM platform_webhook_endpoints WHERE id = ?', [id]);
    res.status(201).json({ data: row, meta: {} });
  } catch (e) { next(e); }
});

router.put('/webhooks/:id', authenticatePlatformUser, requirePlatformPermission(['platform.integrations.update', 'platform.integrations.manage']), async (req, res, next) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { name, url, events, secret, isActive } = req.body || {};

    const existing = await db.get('SELECT * FROM platform_webhook_endpoints WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ success: false, data: null, error: 'webhook not found', message: 'نقطة الربك غير موجودة', code: 'NOT_FOUND', requestId: req.requestId, meta: {} });
    }

    const updates = [];
    const params = [];
    if (name !== undefined) { updates.push('name = ?'); params.push(String(name).trim()); }
    if (url !== undefined) {
      let parsedUrl;
      try { parsedUrl = new URL(url); } catch { return res.status(400).json({ success: false, data: null, error: 'invalid url', message: 'رابط غير صالح', code: 'VALIDATION_ERROR', requestId: req.requestId, meta: {} }); }
      if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
        return res.status(400).json({ success: false, data: null, error: 'url must be http or https', message: 'يجب أن يبدأ الرابط بـ http أو https', code: 'VALIDATION_ERROR', requestId: req.requestId, meta: {} });
      }
      updates.push('url = ?'); params.push(url);
    }
    if (events !== undefined) { updates.push('events = ?'); params.push(JSON.stringify(Array.isArray(events) ? events : [])); }
    if (secret !== undefined) { updates.push('secret = ?'); params.push(secret); }
    if (isActive !== undefined) { updates.push('is_active = ?'); params.push(isActive === false ? 0 : 1); }
    updates.push('updated_at = ?'); params.push(new Date().toISOString());
    params.push(id);

    await db.run(`UPDATE platform_webhook_endpoints SET ${updates.join(', ')} WHERE id = ?`, params);

    await recordAuditEvent({
      actorId: req.platformUser?.id,
      actorName: req.platformUser?.full_name,
      action: 'WEBHOOK_UPDATED',
      resourceType: 'platform_webhook_endpoints',
      resourceId: id,
      afterData: { name, url, events, isActive },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    const row = await db.get('SELECT * FROM platform_webhook_endpoints WHERE id = ?', [id]);
    res.json({ data: row, meta: {} });
  } catch (e) { next(e); }
});

router.delete('/webhooks/:id', authenticatePlatformUser, requirePlatformPermission(['platform.integrations.delete', 'platform.integrations.manage']), async (req, res, next) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const existing = await db.get('SELECT * FROM platform_webhook_endpoints WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ success: false, data: null, error: 'webhook not found', message: 'نقطة الربك غير موجودة', code: 'NOT_FOUND', requestId: req.requestId, meta: {} });
    }

    await db.run('DELETE FROM platform_webhook_endpoints WHERE id = ?', [id]);

    await recordAuditEvent({
      actorId: req.platformUser?.id,
      actorName: req.platformUser?.full_name,
      action: 'WEBHOOK_DELETED',
      resourceType: 'platform_webhook_endpoints',
      resourceId: id,
      beforeData: { name: existing.name, url: existing.url },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({ data: { id, deleted: true }, meta: {} });
  } catch (e) { next(e); }
});

router.post('/webhooks/:id/test', authenticatePlatformUser, requirePlatformPermission(['platform.integrations.update', 'platform.integrations.manage']), async (req, res, next) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const wh = await db.get('SELECT * FROM platform_webhook_endpoints WHERE id = ?', [id]);
    if (!wh) {
      return res.status(404).json({ success: false, data: null, error: 'webhook not found', message: 'نقطة الربك غير موجودة', code: 'NOT_FOUND', requestId: req.requestId, meta: {} });
    }

    const payload = {
      event: 'webhook.test',
      webhookId: wh.id,
      webhookName: wh.name,
      timestamp: new Date().toISOString(),
      message: 'اختبار اتصال نقطة الربط (Test Ping)',
    };

    const crypto = require('node:crypto');
    const signature = crypto.createHmac('sha256', wh.secret).update(JSON.stringify(payload)).digest('hex');

    let deliveryStatus = 'FAILED';
    let deliveryError = null;
    let httpStatus = null;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(wh.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Id': wh.id,
          'X-Webhook-Timestamp': payload.timestamp,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      httpStatus = response.status;
      await response.text();
      if (response.ok) {
        deliveryStatus = 'SENT';
      } else {
        deliveryError = `HTTP ${response.status}`;
      }
    } catch (err) {
      deliveryError = err instanceof Error ? err.message : String(err);
    }

    await recordAuditEvent({
      actorId: req.platformUser?.id,
      actorName: req.platformUser?.full_name,
      action: 'WEBHOOK_TEST',
      resourceType: 'platform_webhook_endpoints',
      resourceId: id,
      afterData: { status: deliveryStatus, httpStatus, error: deliveryError },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({
      data: {
        webhookId: wh.id,
        url: wh.url,
        status: deliveryStatus,
        httpStatus,
        error: deliveryError,
        sentAt: new Date().toISOString(),
      },
      meta: {},
    });
  } catch (e) { next(e); }
});

module.exports = router;
